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
import { aiService, type RecipientType } from './ai.service';
import { notifyBrainCore } from './brain-core-webhook.service';
import { brainCoreService } from './brain-core.service';
import { matchClassificationRule } from './rule-engine.service';
import { sendPushToUser, sendDigest } from './push.service';
import { draftService } from './draft.service';
import { gmailPushService } from './gmail-push.service';
import { emitToUser } from '../routes/events';
import {
  triageActionService,
  mapRuleActionToTriage,
  mapAIToTriageAction,
  type TriageDecision,
} from './triage-action.service';

const SYNC_INTERVAL_MS = 30 * 60 * 1000;           // 30 minutes (push is primary; polling is fallback)
const AI_INTERVAL_MS = 10 * 60 * 1000;             // 10 minutes
const SNOOZE_INTERVAL_MS = 60 * 1000;              // 1 minute
const SCHEDULED_SEND_INTERVAL_MS = 60 * 1000;      // 1 minute
const BRIEFING_CHECK_INTERVAL_MS = 60 * 1000;      // 1 minute (checks if it's 07:00)
const WATCH_RENEWAL_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_THREADS_PER_SYNC = 20;
const MAX_THREADS_TO_CLASSIFY = 10;
const MAX_FAILURES_BEFORE_BACKOFF = 5;
const BACKOFF_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const AI_BATCH_SIZE = 5;                       // Max concurrent AI calls (Groq: 30 req/min)
const AI_BATCH_DELAY_MS = 2000;                // 2s between batches

// Auto-triage constants
const TRIAGE_WINDOW_MS = 60 * 60 * 1000;      // look back 1 hour for new threads
const MAX_AI_TRIAGE_PER_SYNC = 5;             // max AI calls per sync round (save tokens)
const CONTACT_MIN_EMAILS = 1;                  // upsert contact after ≥ 1 email

// Track consecutive failures per account
const failureCounts = new Map<string, number>();
// Backoff: accountId → timestamp when backoff expires
const accountBackoff = new Map<string, number>();

let syncInterval: ReturnType<typeof setInterval> | null = null;
let aiInterval: ReturnType<typeof setInterval> | null = null;
let snoozeInterval: ReturnType<typeof setInterval> | null = null;
let scheduledSendInterval: ReturnType<typeof setInterval> | null = null;
let briefingInterval: ReturnType<typeof setInterval> | null = null;
let watchRenewalInterval: ReturnType<typeof setInterval> | null = null;
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

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
// Auto-draft helpers (Sprint 5)
// ──────────────────────────────────────────────

/** Authority domain suffixes that trigger formal tone */
const AUTHORITY_DOMAINS = [
  'skatteverket.se', 'kronofogden.se', 'forsakringskassan.se',
  'arbetsformedlingen.se', 'lansstyrelsen.se', 'domstol.se',
  'migrationsverket.se', 'polisen.se', 'transportstyrelsen.se',
];

/**
 * Determine the recipient type for tone-adapted draft generation.
 * Priority: authority domain > contact profile relationship > AI classification > unknown
 */
async function resolveRecipientType(
  senderEmail: string,
  classification: string,
  userId: string
): Promise<RecipientType> {
  const domain = senderEmail.split('@')[1]?.toLowerCase() ?? '';

  // 1. Known authority domains → always formal
  if (AUTHORITY_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    return 'authority';
  }

  // 2. Contact profile relationship
  try {
    const contact = await prisma.contactProfile.findFirst({
      where: { userId, emailAddress: senderEmail.toLowerCase() },
      select: { relationship: true },
    });
    if (contact?.relationship) {
      const rel = contact.relationship.toLowerCase();
      if (['authority', 'government', 'official', 'agency'].includes(rel)) return 'authority';
      if (['colleague', 'friend', 'family', 'personal'].includes(rel)) return 'personal';
      if (['client', 'lead', 'partner', 'business', 'customer', 'vendor'].includes(rel)) return 'business';
    }
  } catch {
    // Non-critical
  }

  // 3. AI classification
  switch (classification) {
    case 'personal':
    case 'founder':
      return 'personal';
    case 'lead':
    case 'partner':
    case 'outreach':
      return 'business';
    case 'operational':
      return 'business';
    default:
      return 'unknown';
  }
}

/**
 * Generate and persist an AI draft for a thread.
 * Called fire-and-forget after an auto_draft triage decision.
 * SAFETY: Draft is always created as status='pending'. Never approved or sent automatically.
 */
async function generateAutoDraft(options: {
  thread: {
    id: string;
    subject: string | null;
    participantEmails: string[];
    gmailThreadId: string;
    messages: Array<{ fromAddress: string; toAddresses: string[]; bodyText: string | null; receivedAt: Date }>;
  };
  accountId: string;
  userId: string;
  classification: string;
}): Promise<void> {
  const { thread, accountId, userId, classification } = options;
  const senderEmail = thread.participantEmails[0] ?? '';

  const recipientType = await resolveRecipientType(senderEmail, classification, userId);

  const threadData = {
    subject: thread.subject || '(Inget ämne)',
    messages: thread.messages.map((m) => ({
      from: m.fromAddress,
      to: m.toAddresses,
      body: m.bodyText || '',
      date: m.receivedAt.toISOString(),
    })),
  };

  const draftText = await aiService.generateDraftWithTone({ threadData, recipientType, userId });

  // Get account email for toAddresses
  const account = await prisma.emailAccount.findUnique({
    where: { id: accountId },
    select: { emailAddress: true },
  });

  const createdDraft = await prisma.draft.create({
    data: {
      userId,
      accountId,
      threadId: thread.id,
      toAddresses: [senderEmail],
      ccAddresses: [],
      bccAddresses: [],
      subject: `Re: ${thread.subject || ''}`.trim(),
      bodyText: draftText,
      status: 'pending', // NEVER change — approval gate
      source: 'auto_triage',
    },
  });

  console.log(`[AutoDraft] Created pending draft for thread ${thread.id} (tone: ${recipientType})`);

  // Notify Brain Core — AI draft ready for human approval
  notifyBrainCore({
    type: 'draft.ready',
    context: {
      userId,
      accountId,
      threadId: thread.id,
      gmailThreadId: thread.gmailThreadId,
      draftId: createdDraft.id,
    },
    data: {
      draft_id: createdDraft.id,
      thread_id: thread.id,
      account_id: accountId,
      subject: thread.subject,
      sender: senderEmail,
      recipient_type: recipientType,
      classification: options.classification,
    },
  }).catch(() => {});
}

// ──────────────────────────────────────────────
// Auto-triage — rule engine first, then AI
// ──────────────────────────────────────────────

export async function autoTriageNewThreads(accountId: string, userId: string): Promise<void> {
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

        // ── Execute the triage action (Sprint 1) ──────────────────────────
        const ruleDecision: TriageDecision = {
          threadId: thread.id,
          gmailThreadId: thread.gmailThreadId,
          accountId,
          userId,
          classification: ruleMatch.categoryKey,
          priority: ruleMatch.priority,
          action: mapRuleActionToTriage(ruleMatch.action),
          source: 'rule_engine',
          confidence: 1.0,
          reason: `Matchad regel: ${ruleMatch.categoryName}`,
          senderEmail: thread.participantEmails[0] ?? '',
          subject: thread.subject,
        };
        triageActionService.executeAction(ruleDecision).catch((e) =>
          console.warn(`[Triage] Action executor error for ${thread.id}:`, e?.message)
        );

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

      // ── Execute the triage action (Sprint 1) ──────────────────────────
      const senderEmail = thread.participantEmails[0] ?? '';
      const aiAction = await mapAIToTriageAction(
        analysis.classification,
        analysis.priority,
        analysis.confidence,
        senderEmail,
        thread.subject,
        userId
      );
      const aiDecision: TriageDecision = {
        threadId: thread.id,
        gmailThreadId: thread.gmailThreadId,
        accountId,
        userId,
        classification: analysis.classification,
        priority: analysis.priority,
        action: aiAction,
        source: 'ai',
        confidence: analysis.confidence,
        reason: `AI: ${analysis.classification}/${analysis.priority} (${Math.round(analysis.confidence * 100)}%)`,
        senderEmail,
        subject: thread.subject,
      };
      triageActionService.executeAction(aiDecision).catch((e) =>
        console.warn(`[Triage] Action executor error for ${thread.id}:`, e?.message)
      );

      // ── Auto-draft: generate pending draft for threads requiring reply ──
      if (aiAction === 'auto_draft' && analysis.suggested_action === 'reply') {
        generateAutoDraft({
          thread,
          accountId,
          userId,
          classification: analysis.classification,
        }).catch((e) =>
          console.warn(`[AutoDraft] Error for thread ${thread.id}:`, e?.message)
        );
      }
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
// Auto-detect follow-up reminders — threads awaiting reply > 48h
// ──────────────────────────────────────────────

const AWAITING_REPLY_HOURS = 48;

async function autoDetectFollowUpReminders(userId: string): Promise<void> {
  const cutoff = new Date(Date.now() - AWAITING_REPLY_HOURS * 60 * 60 * 1000);

  // Find threads where isSentByUser=true AND lastMessageAt is older than 48h
  const candidateThreads = await prisma.emailThread.findMany({
    where: {
      account: { userId, isActive: true },
      isSentByUser: true,
      lastMessageAt: { lte: cutoff },
      followUpReminders: { none: { isCompleted: false } },
    },
    select: { id: true, subject: true },
    take: 20,
  });

  if (candidateThreads.length === 0) return;

  for (const thread of candidateThreads) {
    try {
      await prisma.followUpReminder.create({
        data: {
          userId,
          threadId: thread.id,
          remindAt: new Date(),
          reason: 'awaiting_reply',
        },
      });
      console.log(`[FollowUp] Auto-created reminder for thread ${thread.id}: ${thread.subject ?? '(no subject)'}`);
    } catch {
      // May already exist — skip silently
    }
  }

  // Push notification for due reminders
  try {
    const dueReminders = await prisma.followUpReminder.findMany({
      where: {
        userId,
        isCompleted: false,
        remindAt: { lte: new Date() },
      },
      include: { thread: { select: { subject: true, id: true } } },
      take: 5,
    });

    for (const reminder of dueReminders) {
      sendPushToUser(userId, {
        title: `⏰ Inget svar på: ${reminder.thread.subject || '(inget ämne)'}`,
        body: reminder.note ?? 'Du väntar fortfarande på svar',
        url: `/threads/${reminder.thread.id}`,
      }).catch(() => {});

      await prisma.followUpReminder.update({
        where: { id: reminder.id },
        data: { isCompleted: true },
      });
    }
  } catch {
    // Non-critical
  }
}

// ──────────────────────────────────────────────
// Morning briefing — generate at 07:00 for each user
// ──────────────────────────────────────────────

async function generateMorningBriefing(userId: string): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Skip if already generated today
  const existing = await prisma.dailySummary.findFirst({
    where: { userId, createdAt: { gte: today } },
  }).catch(() => null);
  if (existing) return;

  // Urgent unread high-priority threads
  const urgent = await prisma.emailThread.findMany({
    where: {
      account: { userId, isActive: true },
      isRead: false,
      NOT: { labels: { has: 'TRASH' } },
      analyses: { some: { priority: 'high' } },
    },
    take: 10,
    orderBy: { lastMessageAt: 'desc' },
    select: {
      subject: true,
      snippet: true,
      participantEmails: true,
    },
  }).catch(() => []);

  // Yesterday's stats
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const [received, sent, classified] = await Promise.all([
    prisma.emailMessage.count({
      where: { thread: { account: { userId } }, receivedAt: { gte: yesterday, lt: today } },
    }).catch(() => 0),
    prisma.draft.count({
      where: { account: { userId }, status: 'sent', updatedAt: { gte: yesterday, lt: today } },
    }).catch(() => 0),
    prisma.aIAnalysis.count({
      where: { thread: { account: { userId } }, createdAt: { gte: yesterday, lt: today } },
    }).catch(() => 0),
  ]);

  const summary = await aiService.generateBriefing(userId, urgent, { received, sent, classified });

  await prisma.dailySummary.create({
    data: {
      userId,
      date: today,
      needsReply: summary.needsReply,
      goodToKnow: summary.goodToKnow,
      autoArchived: summary.autoArchived,
      awaitingReply: summary.awaitingReply,
      recommendation: summary.recommendation,
      totalNew: summary.totalNew,
      totalUnread: summary.totalUnread,
      totalAutoSorted: summary.totalAutoSorted,
      modelUsed: summary.modelUsed,
    },
  }).catch((e: any) => {
    // Unique constraint — already created by concurrent run
    if (!e?.message?.includes('Unique constraint')) throw e;
  });

  sendPushToUser(userId, {
    title: '☀️ God morgon — din briefing är klar',
    body: `${received} nya mail igår, ${urgent.length} kräver uppmärksamhet`,
    url: '/',
  }).catch(() => {});

  console.log(`[Briefing] Morning briefing generated for user ${userId}`);
}

async function runMorningBriefings(): Promise<void> {
  const now = new Date();
  const hour = now.getHours();

  // Run morning briefing at 07:00
  if (hour === 7) {
    let users: Array<{ id: string }> = [];
    try {
      users = await prisma.user.findMany({ select: { id: true } });
    } catch {
      return;
    }
    for (const user of users) {
      generateMorningBriefing(user.id).catch((e: any) =>
        console.warn(`[Briefing] Error for user ${user.id}:`, e?.message)
      );
    }
  }

  // Run digest for each user whose digestTime matches current hour
  try {
    const settings = await prisma.userSettings.findMany({
      where: { digestEnabled: true, digestTime: hour },
      select: { userId: true },
    });
    for (const s of settings) {
      sendDigest(s.userId).catch((e: any) =>
        console.warn(`[Digest] Error for user ${s.userId}:`, e?.message)
      );
    }
  } catch {
    // Non-fatal
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
    // Check 30-min backoff
    const backoffUntil = accountBackoff.get(account.id) ?? 0;
    if (backoffUntil > Date.now()) {
      const minutesLeft = Math.ceil((backoffUntil - Date.now()) / 60000);
      console.log(`[Scheduler] ${account.emailAddress} in backoff — ${minutesLeft}m remaining`);
      continue;
    }

    const failures = failureCounts.get(account.id) ?? 0;
    if (failures >= MAX_FAILURES_BEFORE_BACKOFF) {
      const backoffExpiry = Date.now() + BACKOFF_DURATION_MS;
      accountBackoff.set(account.id, backoffExpiry);
      failureCounts.set(account.id, 0);
      console.log(`[Scheduler] ${account.emailAddress} hit ${failures} failures — backing off 30 min`);
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
      accountBackoff.delete(account.id);
      console.log(`[Scheduler] Synced ${account.emailAddress}`);

      // Emit SSE sync:complete to connected clients
      emitToUser(account.userId, 'sync:complete', {
        accountId: account.id,
        email: account.emailAddress,
        timestamp: new Date().toISOString(),
      });

      // ── Post-sync intelligence (fire-and-forget per account) ────────────
      autoTriageNewThreads(account.id, account.userId).catch((e) =>
        console.warn(`[Triage] Error for ${account.emailAddress}:`, e?.message)
      );
      autoLearnContacts(account.id, account.emailAddress, account.userId).catch((e) =>
        console.warn(`[Contacts] Error for ${account.emailAddress}:`, e?.message)
      );
      autoDetectFollowUpReminders(account.userId).catch((e) =>
        console.warn(`[FollowUp] Error for ${account.emailAddress}:`, e?.message)
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

      // Emit SSE thread:unsnoozed
      emitToUser(thread.account.userId, 'thread:unsnoozed', {
        threadId: thread.id,
        subject: thread.subject,
        timestamp: new Date().toISOString(),
      });

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
// Scheduled send — run every minute
// ──────────────────────────────────────────────

async function sendScheduledDrafts(): Promise<void> {
  const now = new Date();
  let ready: Array<{ id: string; subject: string; status: string; account: { userId: string } }> = [];

  try {
    ready = await prisma.draft.findMany({
      where: {
        scheduledAt: { lte: now },
        status: { in: ['approved', 'sending'] },
      },
      select: { id: true, subject: true, status: true, account: { select: { userId: true } } },
    });
  } catch {
    return; // DB unavailable — skip
  }

  if (ready.length === 0) return;

  for (const draft of ready) {
    try {
      // Normalize legacy undo-send drafts that were stored as "sending".
      if (draft.status === 'sending') {
        await prisma.draft.update({
          where: { id: draft.id },
          data: { status: 'approved' },
        });
      }

      await draftService.send(draft.id, draft.account.userId);

      await prisma.actionLog.create({
        data: {
          userId: draft.account.userId,
          actionType: 'scheduled_send',
          targetType: 'draft',
          targetId: draft.id,
          metadata: { subject: draft.subject },
        },
      });

      console.log(`[ScheduledSend] Sent draft ${draft.id}: ${draft.subject}`);
    } catch (err: any) {
      // Mark as failed — do not auto-retry
      try {
        await prisma.draft.update({
          where: { id: draft.id },
          data: {
            status: 'failed',
            errorMessage: err?.message ?? 'Scheduled send failed',
            scheduledAt: null,
          },
        });
      } catch {
        // best-effort
      }
      console.warn(`[ScheduledSend] Failed draft ${draft.id}: ${err?.message}`);
    }
  }
}

// ──────────────────────────────────────────────
// Triage log cleanup — Sprint 7
// Runs once per day at 02:00. Deletes entries older than 30 days.
// Logs a summary before deletion so nothing is silently lost.
// ──────────────────────────────────────────────

// Dedup guard — prevents multiple runs within the same day
let lastCleanupDate = '';

async function cleanupTriageLogs(): Promise<void> {
  const now = new Date();
  if (now.getHours() !== 2) return;

  const today = now.toISOString().slice(0, 10); // "YYYY-MM-DD"
  if (lastCleanupDate === today) return;         // already ran today

  const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  try {
    // Summarise what's about to be deleted (for the log)
    const expiring = await prisma.triageLog.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { action: true },
    });

    if (expiring.length === 0) {
      lastCleanupDate = today;
      return;
    }

    const byAction: Record<string, number> = {};
    for (const row of expiring) {
      byAction[row.action] = (byAction[row.action] ?? 0) + 1;
    }
    const summary = Object.entries(byAction)
      .map(([a, n]) => `${n} ${a}`)
      .join(', ');

    await prisma.triageLog.deleteMany({ where: { createdAt: { lt: cutoff } } });

    lastCleanupDate = today;
    console.log(
      `[TriageCleanup] Deleted ${expiring.length} entries older than 30 days: ${summary}`
    );
  } catch (err: any) {
    console.warn('[TriageCleanup] Cleanup failed:', err?.message);
  }
}

/**
 * Exported for tests and manual triggers (e.g. agent API).
 */
export async function runTriageCleanupNow(): Promise<{ deleted: number; summary: string }> {
  const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const expiring = await prisma.triageLog.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { action: true },
  });

  if (expiring.length === 0) {
    return { deleted: 0, summary: 'Inga poster att rensa.' };
  }

  const byAction: Record<string, number> = {};
  for (const row of expiring) {
    byAction[row.action] = (byAction[row.action] ?? 0) + 1;
  }

  await prisma.triageLog.deleteMany({ where: { createdAt: { lt: cutoff } } });

  const summary = Object.entries(byAction)
    .map(([a, n]) => `${n} ${a}`)
    .join(', ');

  console.log(`[TriageCleanup] Manual cleanup: deleted ${expiring.length} entries (${summary})`);
  return { deleted: expiring.length, summary };
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

  scheduledSendInterval = setInterval(() => {
    sendScheduledDrafts().catch((e) => console.error('[ScheduledSend] Error:', e));
  }, SCHEDULED_SEND_INTERVAL_MS);

  briefingInterval = setInterval(() => {
    runMorningBriefings().catch((e) => console.error('[Briefing] Error:', e));
  }, BRIEFING_CHECK_INTERVAL_MS);

  // Cleanup: remove triage logs older than 30 days (runs daily, actual delete at 02:00)
  cleanupInterval = setInterval(() => {
    cleanupTriageLogs().catch((e) => console.error('[Cleanup] Error:', e));
  }, BRIEFING_CHECK_INTERVAL_MS);

  // Gmail Push: renew watches every 24 hours (watches expire after 7 days)
  if (gmailPushService.isEnabled) {
    console.log('[Scheduler] Gmail Push: enabled — starting watch renewal every 24h');
    // Register watches on startup
    gmailPushService.renewAllWatches().catch((e) => console.error('[GmailPush] Initial watch setup error:', e));
    watchRenewalInterval = setInterval(() => {
      gmailPushService.renewAllWatches().catch((e) => console.error('[GmailPush] Watch renewal error:', e));
    }, WATCH_RENEWAL_INTERVAL_MS);
  } else {
    console.log('[Scheduler] Gmail Push: disabled (no GOOGLE_CLOUD_PROJECT_ID), using polling fallback');
  }
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
  if (scheduledSendInterval) {
    clearInterval(scheduledSendInterval);
    scheduledSendInterval = null;
  }
  if (briefingInterval) {
    clearInterval(briefingInterval);
    briefingInterval = null;
  }
  if (watchRenewalInterval) {
    clearInterval(watchRenewalInterval);
    watchRenewalInterval = null;
  }
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  console.log('[Scheduler] Stopped');
}
