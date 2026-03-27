/**
 * Sync Scheduler Service
 *
 * Automatically syncs emails every 5 minutes and runs AI classification
 * every 10 minutes for all active accounts. Uses exponential backoff after
 * 3 consecutive failures per account. No external npm packages — setInterval only.
 */

import { prisma } from '../config/database';
import { emailProviderFactory } from './email-provider.factory';
import { aiService } from './ai.service';

const SYNC_INTERVAL_MS = 5 * 60 * 1000;      // 5 minutes
const AI_INTERVAL_MS = 10 * 60 * 1000;        // 10 minutes
const MAX_THREADS_PER_SYNC = 20;
const MAX_THREADS_TO_CLASSIFY = 10;
const MAX_FAILURES_BEFORE_BACKOFF = 3;
const AI_BATCH_SIZE = 5;                       // Max concurrent AI calls (Groq: 30 req/min)
const AI_BATCH_DELAY_MS = 2000;                // 2s between batches

// Track consecutive failures per account
const failureCounts = new Map<string, number>();

let syncInterval: ReturnType<typeof setInterval> | null = null;
let aiInterval: ReturnType<typeof setInterval> | null = null;

// ──────────────────────────────────────────────
// Email sync
// ──────────────────────────────────────────────

async function syncAllAccounts(): Promise<void> {
  let accounts: Array<{ id: string; emailAddress: string }> = [];

  try {
    accounts = await prisma.emailAccount.findMany({
      where: { isActive: true },
      select: { id: true, emailAddress: true },
    });
  } catch (err: any) {
    console.warn('[Scheduler] Could not fetch accounts for sync:', err.message);
    return;
  }

  for (const account of accounts) {
    const failures = failureCounts.get(account.id) ?? 0;
    if (failures >= MAX_FAILURES_BEFORE_BACKOFF) {
      // Back off: skip this cycle, reset counter so we retry next time
      console.log(`[Scheduler] Skipping ${account.emailAddress} after ${failures} failures (will retry next cycle)`);
      failureCounts.set(account.id, 0);
      continue;
    }

    try {
      await emailProviderFactory.fetchThreads(account.id, { maxResults: MAX_THREADS_PER_SYNC });

      // Update last sync time
      await prisma.emailAccount.update({
        where: { id: account.id },
        data: { lastSyncAt: new Date(), syncError: null },
      });

      failureCounts.set(account.id, 0);
      console.log(`[Scheduler] Synced ${account.emailAddress}`);
    } catch (err: any) {
      const newCount = failures + 1;
      failureCounts.set(account.id, newCount);

      const errMsg = err.message?.substring(0, 200) ?? 'Unknown error';
      console.warn(`[Scheduler] Sync failed for ${account.emailAddress} (failure ${newCount}/${MAX_FAILURES_BEFORE_BACKOFF}): ${errMsg}`);

      try {
        await prisma.emailAccount.update({
          where: { id: account.id },
          data: { syncError: errMsg },
        });
      } catch {
        // Best-effort: DB write failure is not fatal
      }
    }
  }
}

// ──────────────────────────────────────────────
// AI classification
// ──────────────────────────────────────────────

async function classifyUnanalyzedThreads(): Promise<void> {
  let threads: Array<{
    id: string;
    subject: string | null;
    snippet: string | null;
    messages: Array<{
      fromAddress: string;
      toAddresses: string[];
      bodyText: string | null;
      receivedAt: Date;
    }>;
  }> = [];

  try {
    threads = await prisma.emailThread.findMany({
      where: {
        analyses: { none: {} },
        messages: { some: {} },
        account: { isActive: true },
      },
      include: {
        messages: {
          orderBy: { receivedAt: 'asc' },
          take: 3,
          select: { fromAddress: true, toAddresses: true, bodyText: true, receivedAt: true },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: MAX_THREADS_TO_CLASSIFY,
    });
  } catch (err: any) {
    console.warn('[Scheduler] Could not fetch unanalyzed threads:', err.message);
    return;
  }

  if (threads.length === 0) return;

  console.log(`[Scheduler] Classifying ${threads.length} unanalyzed thread(s) in batches of ${AI_BATCH_SIZE}...`);

  // Process in batches to respect Groq rate limit (30 req/min)
  for (let i = 0; i < threads.length; i += AI_BATCH_SIZE) {
    const batch = threads.slice(i, i + AI_BATCH_SIZE);

    await Promise.all(
      batch.map(async (thread) => {
        try {
          const analysis = await aiService.analyzeThread({
            subject: thread.subject ?? '(No subject)',
            messages: thread.messages.map((m) => ({
              from: m.fromAddress,
              to: m.toAddresses,
              body: m.bodyText ?? '',
              date: m.receivedAt.toISOString(),
            })),
          });

          await prisma.aIAnalysis.create({
            data: {
              threadId: thread.id,
              summary: analysis.summary,
              classification: analysis.classification,
              priority: analysis.priority,
              suggestedAction: analysis.suggested_action,
              draftText: analysis.draft_text ?? null,
              confidence: analysis.confidence,
              modelUsed: analysis.model_used,
            },
          });

          console.log(`[Scheduler] Classified thread ${thread.id}: ${analysis.classification}/${analysis.priority}`);
        } catch (err: any) {
          console.warn(`[Scheduler] Classification failed for thread ${thread.id}: ${err.message}`);
        }
      })
    );

    // Wait between batches to avoid hitting Groq rate limit
    if (i + AI_BATCH_SIZE < threads.length) {
      await new Promise((r) => setTimeout(r, AI_BATCH_DELAY_MS));
    }
  }
}

// ──────────────────────────────────────────────
// Lifecycle
// ──────────────────────────────────────────────

export function startSyncScheduler(): void {
  if (syncInterval || aiInterval) {
    console.warn('[Scheduler] Already running, ignoring start()');
    return;
  }

  console.log(`[Scheduler] Starting — email sync every ${SYNC_INTERVAL_MS / 60000}m, AI classification every ${AI_INTERVAL_MS / 60000}m`);

  // Run immediately on start, then on interval
  syncAllAccounts().catch((e) => console.error('[Scheduler] Initial sync error:', e));
  classifyUnanalyzedThreads().catch((e) => console.error('[Scheduler] Initial classify error:', e));

  syncInterval = setInterval(() => {
    syncAllAccounts().catch((e) => console.error('[Scheduler] Sync error:', e));
  }, SYNC_INTERVAL_MS);

  aiInterval = setInterval(() => {
    classifyUnanalyzedThreads().catch((e) => console.error('[Scheduler] Classify error:', e));
  }, AI_INTERVAL_MS);
}

export function stopSyncScheduler(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  if (aiInterval) {
    clearInterval(aiInterval);
    aiInterval = null;
  }
  console.log('[Scheduler] Stopped');
}
