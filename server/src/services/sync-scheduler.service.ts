/**
 * Sync Scheduler Service
 *
 * Automatically syncs emails every 5 minutes and runs AI classification
 * every 10 minutes for all active accounts. Uses exponential backoff after
 * 3 consecutive failures per account. No external npm packages — setInterval only.
 *
 * Pipeline per account:
 *   1. Fetch new threads from Gmail (max 20)
 *   2. Auto-triage new threads: Rule Engine → AI (max 5 AI calls per sync)
 *   3. Contact auto-learn: upsert ContactProfile for frequent senders
 *   4. Smart notification: record alert:high_priority for any high-prio new thread
 */

import { prisma } from '../config/database';
import { emailProviderFactory } from './email-provider.factory';
import { aiService } from './ai.service';
import { brainCoreService } from './brain-core.service';
import { matchClassificationRule } from './rule-engine.service';
import { sendPushToUser } from './push.service';

const SYNC_INTERVAL_MS = 5 * 60 * 1000;      // 5 minutes
const AI_INTERVAL_MS = 10 * 60 * 1000;        // 10 minutes
const SNOOZE_INTERVAL_MS = 60 * 1000;         // 1 minute
const MAX_THREADS_PER_SYNC = 20;
const MAX_THREADS_TO_CLASSIFY = 10;
const MAX_FAILURES_BEFORE_BACKOFF = 3;
const AI_BATCH_SIZE = 5;                       // Max concurrent AI calls (Groq: 30 req/min)
const AI_BATCH_DELAY_MS = 2000;                // 2s between batches

// Auto-triage constants
const TRIAGE_WINDOW_MS = 60 * 60 * 1000;      // look back 1 hour for new threads
const MAX_AI_TRIAGE_PER_SYNC = 5;             // max AI calls per sync round (save tokens)
const CONTACT_MIN_EMAILS = 1;                  // upsert contact after ≥ 1 email

// Track consecutive failures per account
const failureCounts = new Map<string, number>();

let syncInterval: ReturnType<typeof setInterval> | null = null;
let aiInterval: ReturnType<typeof setInterval> | null = null;
let snoozeInterval: ReturnType<typeof setInterval> | null = null;

// ──────────────────────────────────────────────
// Helper: extract display name from email address
// ──────────────────────────────────────────────

function extractName(email: string): string {
  const local = email.split('@')[0];
  return local
    .replace(/[._-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ──────────────────────────────────────────────
// Auto-triage — rule engine first, then AI
// ──────────────────────────────────────────────

async function autoTriageNewThreads(accountId: string, userId: string): Promise<void> {
  const since = new Date(Date.now() - TRIAGE_WINDOW_MS);

  const newThreads = await prisma.emailThread.findMany({
    where: {
      accountId,
      analyses: { none: {} },
      lastMessageAt: { gte: since },
    },
    orderBy: { lastMessageAt: 'desc' },
    take: MAX_AI_TRIAGE_PER_SYNC + 5, // take a few extra so rule matches don't burn AI quota
    include: {
      messages: {
        orderBy: { receivedAt: 'asc' },
        take: 3,
        select: { fromAddress: true, toAddresses: true, bodyText: true, receivedAt: true },
      },
    },
  });

  if (newThreads.length === 0) return;

  let aiCallsThisRound = 0;

  for (const thread of newThreads) {
    try {
      // ── Step 1: Try rule engine (zero AI cost) ──────────────────────────
      const ruleMatch = await matchClassificationRule(
        {
          subject: thread.subject,
          participantEmails: thread.participantEmails,
          messages: thread.messages.map((m) => ({ bodyText: m.bodyText })),
        },
        userId
      );

      if (ruleMatch) {
        await prisma.aIAnalysis.create({
          data: {
            threadId: thread.id,
            summary: `Matchad regel: ${ruleMatch.categoryName}`,
            classification: ruleMatch.categoryKey,
            priority: ruleMatch.priority,
            suggestedAction: ruleMatch.action,
            confidence: 1.0,
            modelUsed: 'rule-engine',
          },
        });

        // Record high-prio alert regardless of source
        if (ruleMatch.priority === 'high') {
          brainCoreService
            .recordLearning(
              userId,
              'alert:high_priority',
              {
                thread_id: thread.id,
                subject: thread.subject,
                sender: thread.participantEmails[0] ?? null,
                classification: ruleMatch.categoryKey,
                summary: `Matchad regel: ${ruleMatch.categoryName}`,
              },
              'auto_triage',
              thread.id
            )
            .catch(() => {});

          sendPushToUser(userId, {
            title: `⚡ ${thread.subject || 'Nytt viktigt mail'}`,
            body: `Från: ${thread.participantEmails[0] ?? 'okänd'}`,
            url: `/threads/${thread.id}`,
          }).catch(() => {});
        }

        console.log(`[Triage] Rule match for ${thread.id}: ${ruleMatch.categoryKey}/${ruleMatch.priority}`);
        continue;
      }

      // ── Step 2: AI classification (token budget) ────────────────────────
      if (aiCallsThisRound >= MAX_AI_TRIAGE_PER_SYNC) {
        console.log(`[Triage] AI budget reached (${MAX_AI_TRIAGE_PER_SYNC}), skipping remaining threads`);
        break;
      }

      const threadData = {
        subject: thread.subject || '(No Subject)',
        messages: thread.messages.map((m) => ({
          from: m.fromAddress,
          to: m.toAddresses,
          body: m.bodyText || '',
          date: m.receivedAt.toISOString(),
        })),
      };

      const analysis = await aiService.analyzeThread(threadData);
      aiCallsThisRound++;

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

      // High-prio: push notification + smart notification
      if (analysis.priority === 'high') {
        brainCoreService
          .recordLearning(
            userId,
            'alert:high_priority',
            {
              thread_id: thread.id,
              subject: thread.subject,
              sender: thread.participantEmails[0] ?? null,
              classification: analysis.classification,
              summary: analysis.summary,
            },
            'auto_triage',
            thread.id
          )
          .catch(() => {});

        sendPushToUser(userId, {
          title: `⚡ ${thread.subject || 'Nytt viktigt mail'}`,
          body: `Från: ${thread.participantEmails[0] ?? 'okänd'}`,
          url: `/threads/${thread.id}`,
        }).catch(() => {});
      }

      console.log(`[Triage] AI: ${thread.id} → ${analysis.classification}/${analysis.priority}`);
    } catch (err: any) {
      console.warn(`[Triage] Skip thread ${thread.id}: ${err?.message ?? err}`);
    }
  }
}

// ──────────────────────────────────────────────
// Contact auto-learn — build profiles from recent threads
// ──────────────────────────────────────────────

async function autoLearnContacts(
  accountId: string,
  accountEmail: string,
  userId: string
): Promise<void> {
  const since = new Date(Date.now() - TRIAGE_WINDOW_MS);

  const recentThreads = await prisma.emailThread.findMany({
    where: { accountId, lastMessageAt: { gte: since } },
    select: { participantEmails: true },
    take: 50,
  });

  if (recentThreads.length === 0) return;

  // Count how many threads each external sender appears in
  const senderCounts = new Map<string, number>();
  for (const thread of recentThreads) {
    for (const email of thread.participantEmails) {
      const normalized = email.toLowerCase().trim();
      if (normalized && normalized !== accountEmail.toLowerCase()) {
        senderCounts.set(normalized, (senderCounts.get(normalized) ?? 0) + 1);
      }
    }
  }

  for (const [email, count] of senderCounts) {
    if (count < CONTACT_MIN_EMAILS) continue;
    try {
      await prisma.contactProfile.upsert({
        where: { userId_emailAddress: { userId, emailAddress: email } },
        update: {
          totalEmails: { increment: count },
          lastContactAt: new Date(),
        },
        create: {
          userId,
          emailAddress: email,
          displayName: extractName(email),
          relationship: 'unknown',
          totalEmails: count,
          lastContactAt: new Date(),
        },
      });
    } catch {
      // Non-critical — contact upsert failure should not fail the sync
    }
  }

  if (senderCounts.size > 0) {
    console.log(`[Scheduler] Contact auto-learn: updated ${senderCounts.size} contact(s) for account ${accountEmail}`);
  }
}

// ──────────────────────────────────────────────
// Email sync
// ──────────────────────────────────────────────

async function syncAllAccounts(): Promise<void> {
  let accounts: Array<{ id: string; emailAddress: string; userId: string }> = [];

  try {
    accounts = await prisma.emailAccount.findMany({
      where: { isActive: true },
      select: { id: true, emailAddress: true, userId: true },
    });
  } catch (err: any) {
    console.warn('[Scheduler] Could not fetch accounts for sync:', err.message);
    return;
  }

  for (const account of accounts) {
    const failures = failureCounts.get(account.id) ?? 0;
    if (failures >= MAX_FAILURES_BEFORE_BACKOFF) {
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

      // ── Post-sync intelligence (fire-and-forget per account) ────────────
      autoTriageNewThreads(account.id, account.userId).catch((e) =>
        console.warn(`[Triage] Error for ${account.emailAddress}:`, e?.message)
      );
      autoLearnContacts(account.id, account.emailAddress, account.userId).catch((e) =>
        console.warn(`[Contacts] Error for ${account.emailAddress}:`, e?.message)
      );
    } catch (err: any) {
      const errMsg = err.message?.substring(0, 200) ?? 'Unknown error';

      // OAuth revocation — token is permanently invalid, disable the account
      if (errMsg.includes('invalid_grant') || errMsg.includes('Token has been expired or revoked')) {
        console.warn(`[Scheduler] OAuth token revoked for ${account.emailAddress} — disabling account`);
        try {
          await prisma.emailAccount.update({
            where: { id: account.id },
            data: { isActive: false, syncError: 'OAuth token revoked — please reconnect this account' },
          });
        } catch {
          // Best-effort
        }
        continue;
      }

      const newCount = failures + 1;
      failureCounts.set(account.id, newCount);
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
// AI classification (periodic background job)
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
// Snooze wake — run every minute
// ──────────────────────────────────────────────

async function wakeSnoozedThreads(): Promise<void> {
  const now = new Date();
  let snoozed: Array<{
    id: string;
    subject: string | null;
    snoozedUntil: Date | null;
    account: { userId: string };
  }> = [];

  try {
    snoozed = await prisma.emailThread.findMany({
      where: { snoozedUntil: { lte: now } },
      select: {
        id: true,
        subject: true,
        snoozedUntil: true,
        account: { select: { userId: true } },
      },
    });
  } catch {
    return; // DB unavailable — skip
  }

  if (snoozed.length === 0) return;

  for (const thread of snoozed) {
    try {
      await prisma.emailThread.update({
        where: { id: thread.id },
        data: { snoozedUntil: null, isRead: false },
      });

      sendPushToUser(thread.account.userId, {
        title: `⏰ ${thread.subject || 'Påminnelse'}`,
        body: 'Snoozad tråd är tillbaka',
        url: `/threads/${thread.id}`,
      }).catch(() => {});

      await prisma.actionLog.create({
        data: {
          userId: thread.account.userId,
          actionType: 'snooze_wake',
          targetType: 'thread',
          targetId: thread.id,
          metadata: {},
        },
      });

      console.log(`[Snooze] Woke thread ${thread.id} for user ${thread.account.userId}`);
    } catch (err: any) {
      console.warn(`[Snooze] Failed to wake thread ${thread.id}: ${err?.message}`);
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

  snoozeInterval = setInterval(() => {
    wakeSnoozedThreads().catch((e) => console.error('[Snooze] Wake error:', e));
  }, SNOOZE_INTERVAL_MS);
}

/**
 * One-shot sync — runs syncAllAccounts() immediately without touching intervals.
 * Called by the Agent API `sync` action so Amanda can trigger a manual refresh.
 */
export async function startSyncNow(): Promise<void> {
  console.log('[Scheduler] Manual sync triggered via Agent API');
  await syncAllAccounts();
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
  if (snoozeInterval) {
    clearInterval(snoozeInterval);
    snoozeInterval = null;
  }
  console.log('[Scheduler] Stopped');
}
