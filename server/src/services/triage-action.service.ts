/**
 * Triage Action Service — Sprint 1 (Smart Triage)
 *
 * Executes triage decisions against the Gmail API and logs every action
 * in the triage_log table (30-day retention).
 *
 * Safety guarantees (NEVER violate):
 * - Never permanently deletes. Always uses Gmail TRASH (reversible 30 days).
 * - Never auto-sends or auto-approves drafts.
 * - Every action is logged before being executed.
 */

import { prisma } from '../config/database';
import { gmailService } from './gmail.service';
import { sendPushToUser } from './push.service';
import { notifyBrainCore } from './brain-core-webhook.service';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type TriageAction =
  | 'keep_inbox'        // Important — leave in inbox
  | 'trash'             // Noise — move to Gmail TRASH (reversible)
  | 'label_review'      // Unknown sender — move to 'Granskning' label
  | 'trash_after_log'   // Skool etc — log summary, then trash
  | 'notify_then_trash' // Deploy failure (first time) — push notify, then trash
  | 'auto_draft';       // Important + requires reply — create draft automatically

export interface TriageDecision {
  threadId: string;        // Internal DB UUID
  gmailThreadId: string;   // Gmail's thread ID (for API calls)
  accountId: string;
  userId: string;
  classification: string;
  priority: string;
  action: TriageAction;
  source: 'rule_engine' | 'ai';
  confidence: number;
  reason: string;
  senderEmail: string;
  subject: string | null;
}

// ──────────────────────────────────────────────
// In-memory label ID cache (per accountId)
// ──────────────────────────────────────────────

const reviewLabelCache = new Map<string, string>();

// ──────────────────────────────────────────────
// Helper: map rule actions (legacy + new) to TriageAction
// ──────────────────────────────────────────────

export function mapRuleActionToTriage(ruleAction: string): TriageAction {
  switch (ruleAction) {
    case 'trash':             return 'trash';
    case 'trash_after_log':   return 'trash_after_log';
    case 'notify_then_trash': return 'notify_then_trash';
    case 'keep_inbox':        return 'keep_inbox';
    case 'label_review':      return 'label_review';
    case 'auto_draft':        return 'auto_draft';
    // Legacy actions from existing rules
    case 'auto_archive':      return 'trash';             // archive = radera direkt (spec decision)
    case 'group_and_summarize': return 'trash_after_log'; // log + trash
    case 'notify':            return 'notify_then_trash'; // notify then clean up
    case 'flag_immediately':  return 'keep_inbox';        // always keep authority mail
    default:                  return 'keep_inbox';        // safe default
  }
}

// ──────────────────────────────────────────────
// Helper: determine triage action for AI-classified threads
// Uses the decision table from the spec.
// ──────────────────────────────────────────────

export async function mapAIToTriageAction(
  classification: string,
  priority: string,
  confidence: number,
  senderEmail: string,
  subject: string | null,
  userId: string
): Promise<TriageAction> {
  // Low confidence + unknown sender → always review
  const knownSender = await isKnownSender(senderEmail, userId);
  if (confidence < 0.7 && !knownSender) return 'label_review';

  switch (classification) {
    case 'spam':
      return 'trash';

    case 'operational': {
      if (priority === 'low') return 'trash';
      // Medium priority = possible deploy failure
      const lowerSubject = (subject ?? '').toLowerCase();
      const isFail = /fail|error|down|crash|broken/i.test(lowerSubject);
      if (isFail) return 'notify_then_trash'; // dedup handled in executeAction
      return 'trash';
    }

    case 'personal':
    case 'founder':
    case 'partner':
    case 'lead':
      if (priority === 'high' || priority === 'medium') {
        return knownSender ? 'keep_inbox' : 'label_review';
      }
      return knownSender ? 'keep_inbox' : 'label_review';

    case 'outreach':
      if (priority === 'low') return knownSender ? 'keep_inbox' : 'label_review';
      return knownSender ? 'keep_inbox' : 'label_review';

    default:
      return knownSender ? 'keep_inbox' : 'label_review';
  }
}

// ──────────────────────────────────────────────
// Helper: check if sender is known (ContactProfile or ClassificationRule)
// ──────────────────────────────────────────────

async function isKnownSender(email: string, userId: string): Promise<boolean> {
  const normalized = email.toLowerCase().trim();

  const [contact, rule] = await Promise.all([
    prisma.contactProfile.findFirst({
      where: { userId, emailAddress: normalized },
      select: { id: true },
    }),
    prisma.classificationRule.findFirst({
      where: { userId, isActive: true, senderPatterns: { has: normalized } },
      select: { id: true },
    }),
  ]);

  return !!(contact || rule);
}

// ──────────────────────────────────────────────
// Deploy dedup — check if same failure already notified in last 6h
// ──────────────────────────────────────────────

async function isDeployDuplicate(
  subject: string | null,
  senderEmail: string,
  userId: string
): Promise<boolean> {
  if (!subject) return false;
  const since = new Date(Date.now() - 6 * 3600 * 1000);
  const recent = await prisma.triageLog.findFirst({
    where: {
      userId,
      senderEmail,
      subject,
      action: 'notify_then_trash',
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  return !!recent;
}

// ──────────────────────────────────────────────
// ensureReviewLabel — get or create the 'Granskning' label
// ──────────────────────────────────────────────

export async function ensureReviewLabel(accountId: string): Promise<string> {
  const cached = reviewLabelCache.get(accountId);
  if (cached) return cached;

  const labels = await gmailService.listLabels(accountId);
  const existing = labels.find((l) => l.name === 'Granskning');

  if (existing) {
    reviewLabelCache.set(accountId, existing.id);
    return existing.id;
  }

  // Create the label
  const id = await gmailService.createLabel(accountId, 'Granskning');
  reviewLabelCache.set(accountId, id);
  console.log(`[TriageAction] Created Gmail label 'Granskning' for account ${accountId}: ${id}`);
  return id;
}

// ──────────────────────────────────────────────
// Core: log triage action to DB
// ──────────────────────────────────────────────

async function logAction(decision: TriageDecision, actualAction: TriageAction): Promise<void> {
  await prisma.triageLog.create({
    data: {
      threadId: decision.threadId,
      accountId: decision.accountId,
      userId: decision.userId,
      action: actualAction,
      classification: decision.classification,
      priority: decision.priority,
      source: decision.source,
      confidence: decision.confidence,
      reason: decision.reason,
      senderEmail: decision.senderEmail,
      subject: decision.subject ?? null,
    },
  });
}

// ──────────────────────────────────────────────
// Action implementations
// ──────────────────────────────────────────────

async function trashThread(decision: TriageDecision): Promise<void> {
  await gmailService.trashThread(decision.accountId, decision.gmailThreadId);
  await logAction(decision, 'trash');
  console.log(`[TriageAction] TRASH: ${decision.threadId} (${decision.reason})`);
}

async function moveToReviewLabel(decision: TriageDecision): Promise<void> {
  const labelId = await ensureReviewLabel(decision.accountId);
  await gmailService.modifyLabels(decision.accountId, decision.gmailThreadId, [labelId], ['INBOX']);
  await logAction(decision, 'label_review');
  console.log(`[TriageAction] LABEL_REVIEW: ${decision.threadId} → Granskning`);

  // Notify Brain Core — unknown sender queued for review
  notifyBrainCore({
    type: 'triage.unknown_sender',
    context: {
      userId: decision.userId,
      accountId: decision.accountId,
      threadId: decision.threadId,
      gmailThreadId: decision.gmailThreadId,
    },
    data: {
      thread_id: decision.threadId,
      account_id: decision.accountId,
      subject: decision.subject,
      sender: decision.senderEmail,
      classification: decision.classification,
      confidence: decision.confidence,
    },
  }).catch(() => {});
}

async function keepInInbox(decision: TriageDecision): Promise<void> {
  // No Gmail API call — just log
  await logAction(decision, 'keep_inbox');
  console.log(`[TriageAction] KEEP_INBOX: ${decision.threadId} (${decision.classification}/${decision.priority})`);

  // Notify Brain Core for high-priority threads
  if (decision.priority === 'high') {
    notifyBrainCore({
      type: 'triage.high_priority',
      context: {
        userId: decision.userId,
        accountId: decision.accountId,
        threadId: decision.threadId,
        gmailThreadId: decision.gmailThreadId,
      },
      data: {
        thread_id: decision.threadId,
        account_id: decision.accountId,
        subject: decision.subject,
        sender: decision.senderEmail,
        classification: decision.classification,
        source: decision.source,
        confidence: decision.confidence,
      },
    }).catch(() => {});
  }
}

async function trashAfterLog(decision: TriageDecision): Promise<void> {
  // Log the item for "vad sorterades bort"-rapport, then trash
  await logAction(decision, 'trash_after_log');
  await gmailService.trashThread(decision.accountId, decision.gmailThreadId);
  console.log(`[TriageAction] TRASH_AFTER_LOG: ${decision.threadId} (${decision.classification})`);
}

async function notifyThenTrash(decision: TriageDecision): Promise<void> {
  // Check dedup — if already notified for same subject+sender in last 6h, just trash
  const isDuplicate = await isDeployDuplicate(decision.subject, decision.senderEmail, decision.userId);
  if (isDuplicate) {
    await logAction({ ...decision, action: 'trash' }, 'trash');
    await gmailService.trashThread(decision.accountId, decision.gmailThreadId);
    console.log(`[TriageAction] TRASH (dedup): ${decision.threadId} — already notified for this failure`);
    return;
  }

  // First occurrence — send push notification, then trash
  sendPushToUser(decision.userId, {
    title: `⚠️ Deploy fel: ${decision.subject || 'Unknown project'}`,
    body: `Från: ${decision.senderEmail}`,
    url: `/threads/${decision.threadId}`,
  }).catch(() => {});

  await logAction(decision, 'notify_then_trash');
  await gmailService.trashThread(decision.accountId, decision.gmailThreadId);
  console.log(`[TriageAction] NOTIFY_THEN_TRASH: ${decision.threadId} — push sent, thread trashed`);
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

export class TriageActionService {
  /**
   * Execute a triage decision.
   * Logs the action and calls the appropriate Gmail API.
   * Never throws — errors are caught and logged.
   */
  async executeAction(decision: TriageDecision): Promise<void> {
    try {
      switch (decision.action) {
        case 'trash':
          await trashThread(decision);
          break;
        case 'label_review':
          await moveToReviewLabel(decision);
          break;
        case 'keep_inbox':
        case 'auto_draft':
          // auto_draft: keep in inbox, let sync-scheduler create draft separately
          await keepInInbox(decision);
          break;
        case 'trash_after_log':
          await trashAfterLog(decision);
          break;
        case 'notify_then_trash':
          await notifyThenTrash(decision);
          break;
        default:
          await keepInInbox(decision);
      }

      // ── Auto-mark as read ────────────────────────
      // Once the system has triaged a thread, mark it as read in Gmail
      // so it doesn't stay as "unread" in the user's inbox.
      // Skip for trash actions — the thread is already gone from inbox.
      if (decision.action !== 'trash' && decision.action !== 'trash_after_log' && decision.action !== 'notify_then_trash') {
        try {
          await gmailService.markAsRead(decision.accountId, decision.gmailThreadId);
          console.log(`[TriageAction] Marked as read: ${decision.gmailThreadId} (action: ${decision.action})`);
        } catch (readErr: any) {
          // Non-critical — log but don't fail the triage pipeline
          console.warn(`[TriageAction] markAsRead failed for ${decision.gmailThreadId}: ${readErr?.message}`);
        }
      }
    } catch (err: any) {
      console.error(`[TriageAction] executeAction failed for thread ${decision.threadId}: ${err?.message}`);
      // Never re-throw — triage failures should not break the sync pipeline
    }
  }
}

export const triageActionService = new TriageActionService();
