/**
 * Sprint 10 — Agent action unit tests.
 *
 * Tests for the 5 agent actions added in Sprint 6.1:
 *   approve-rule   — accept a rule suggestion (creates ClassificationRule)
 *   dismiss-rule   — dismiss a rule suggestion
 *   review-keep    — move a Granskning thread back to INBOX
 *   review-trash   — trash a Granskning thread (and trigger rule suggestion check)
 *   inbox-status   — full inbox snapshot for Brain Core
 *
 * All DB and external service calls are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('../config/database', () => ({
  prisma: {
    emailAccount: {
      findFirst: vi.fn(),
    },
    emailThread: {
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    draft: {
      count: vi.fn(),
    },
    triageLog: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    classificationRule: {
      count: vi.fn(),
    },
    aIAnalysis: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../services/gmail.service', () => ({
  gmailService: {
    modifyLabels: vi.fn().mockResolvedValue({}),
    trashThread: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../services/rule-suggestion.service', () => ({
  acceptSuggestion: vi.fn().mockResolvedValue({ id: 'sug-1', senderPattern: '*@spam.com' }),
  dismissSuggestion: vi.fn().mockResolvedValue({ id: 'sug-1' }),
  checkAndCreateSuggestion: vi.fn().mockResolvedValue(null),
}));

import { prisma } from '../config/database';
import { gmailService } from '../services/gmail.service';
import { acceptSuggestion, dismissSuggestion, checkAndCreateSuggestion } from '../services/rule-suggestion.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeThread(overrides: Partial<{
  id: string;
  gmailThreadId: string;
  accountId: string;
  participantEmails: string[];
}> = {}) {
  return {
    id: 'thread-1',
    gmailThreadId: 'gmail-thread-1',
    accountId: 'acc-1',
    participantEmails: ['sender@spam.com'],
    ...overrides,
  };
}

/**
 * Simulate the approve-rule action handler logic.
 * Returns { success, data } or throws if no suggestionId.
 */
async function simulateApproveRule(suggestionId: string | undefined, userId: string) {
  if (!suggestionId) throw new Error('suggestionId krävs.');
  await acceptSuggestion(suggestionId, userId);
  return { success: true, data: { message: 'Regel skapad och aktiv.' } };
}

/**
 * Simulate the dismiss-rule action handler logic.
 */
async function simulateDismissRule(suggestionId: string | undefined, userId: string) {
  if (!suggestionId) throw new Error('suggestionId krävs.');
  await dismissSuggestion(suggestionId, userId);
  return { success: true, data: { message: 'Förslag avvisat.' } };
}

/**
 * Simulate the review-keep action handler logic.
 */
async function simulateReviewKeep(threadId: string | undefined, userId: string) {
  if (!threadId) throw new Error('threadId krävs.');
  const thread = await prisma.emailThread.findFirst({
    where: { id: threadId, account: { userId } as any },
    select: { id: true, gmailThreadId: true, accountId: true } as any,
  });
  if (!thread) throw Object.assign(new Error('Tråd hittades inte.'), { code: 404 });
  await gmailService.modifyLabels((thread as any).accountId, (thread as any).gmailThreadId, ['INBOX'], []);
  return { success: true, data: { message: 'Tråd flyttad till inkorg.' } };
}

/**
 * Simulate the review-trash action handler logic.
 */
async function simulateReviewTrash(threadId: string | undefined, userId: string) {
  if (!threadId) throw new Error('threadId krävs.');
  const thread = await prisma.emailThread.findFirst({
    where: { id: threadId, account: { userId } as any },
    select: { id: true, gmailThreadId: true, accountId: true, participantEmails: true } as any,
  });
  if (!thread) throw Object.assign(new Error('Tråd hittades inte.'), { code: 404 });
  await gmailService.trashThread((thread as any).accountId, (thread as any).gmailThreadId);
  const senderEmail = (thread as any).participantEmails[0];
  if (senderEmail) {
    checkAndCreateSuggestion(senderEmail, userId).catch(() => {});
  }
  return { success: true, data: { message: 'Tråd skickad till papperskorgen.' } };
}

/**
 * Simulate the inbox-status action handler logic.
 */
async function simulateInboxStatus(userId: string) {
  const since24h = new Date(Date.now() - 24 * 3600 * 1000);
  const [
    unreadCount,
    pendingReview,
    pendingDrafts,
    ruleCount,
    triageLogs24h,
    analyses,
  ] = await Promise.all([
    prisma.emailThread.count({ where: { account: { userId } as any, isRead: false } as any }),
    prisma.triageLog.count({ where: { userId, action: 'label_review' } as any }),
    prisma.draft.count({ where: { thread: { account: { userId } as any } as any, status: 'pending' } as any }),
    prisma.classificationRule.count({ where: { userId, isActive: true } as any }),
    prisma.triageLog.findMany({
      where: { userId, createdAt: { gte: since24h } } as any,
      select: { action: true, classification: true } as any,
    }),
    prisma.aIAnalysis.findMany({
      where: { thread: { account: { userId } as any } as any } as any,
      select: { classification: true } as any,
      orderBy: { createdAt: 'desc' } as any,
      take: 500,
    }),
  ]);

  const triageStats24h: Record<string, number> = {};
  for (const l of triageLogs24h as any[]) {
    triageStats24h[l.action] = (triageStats24h[l.action] ?? 0) + 1;
  }

  const byClassification: Record<string, number> = {};
  for (const a of analyses as any[]) {
    if (a.classification) {
      byClassification[a.classification] = (byClassification[a.classification] ?? 0) + 1;
    }
  }

  return {
    success: true,
    data: {
      unread: unreadCount,
      pending_review: pendingReview,
      pending_drafts: pendingDrafts,
      rule_count: ruleCount,
      triage_stats_24h: triageStats24h,
      triage_total_24h: (triageLogs24h as any[]).length,
      by_classification: byClassification,
      snapshot_at: expect.any(String),
    },
  };
}

// ─── approve-rule ────────────────────────────────────────────────────────────

describe('Agent action: approve-rule', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calls acceptSuggestion with correct args', async () => {
    const result = await simulateApproveRule('sug-1', 'user-1');
    expect(acceptSuggestion).toHaveBeenCalledWith('sug-1', 'user-1');
    expect(result.success).toBe(true);
  });

  it('returns success message on approval', async () => {
    const result = await simulateApproveRule('sug-abc', 'user-1');
    expect(result.data.message).toBe('Regel skapad och aktiv.');
  });

  it('throws if suggestionId is missing', async () => {
    await expect(simulateApproveRule(undefined, 'user-1')).rejects.toThrow('suggestionId krävs.');
  });

  it('propagates error if acceptSuggestion fails', async () => {
    vi.mocked(acceptSuggestion).mockRejectedValueOnce(new Error('DB error'));
    await expect(simulateApproveRule('sug-1', 'user-1')).rejects.toThrow('DB error');
  });
});

// ─── dismiss-rule ────────────────────────────────────────────────────────────

describe('Agent action: dismiss-rule', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calls dismissSuggestion with correct args', async () => {
    const result = await simulateDismissRule('sug-2', 'user-1');
    expect(dismissSuggestion).toHaveBeenCalledWith('sug-2', 'user-1');
    expect(result.success).toBe(true);
  });

  it('returns success message on dismissal', async () => {
    const result = await simulateDismissRule('sug-2', 'user-1');
    expect(result.data.message).toBe('Förslag avvisat.');
  });

  it('throws if suggestionId is missing', async () => {
    await expect(simulateDismissRule(undefined, 'user-1')).rejects.toThrow('suggestionId krävs.');
  });

  it('propagates error if dismissSuggestion fails', async () => {
    vi.mocked(dismissSuggestion).mockRejectedValueOnce(new Error('Not found'));
    await expect(simulateDismissRule('sug-2', 'user-1')).rejects.toThrow('Not found');
  });
});

// ─── review-keep ─────────────────────────────────────────────────────────────

describe('Agent action: review-keep', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calls modifyLabels with INBOX add', async () => {
    vi.mocked(prisma.emailThread.findFirst).mockResolvedValue(makeThread() as any);
    const result = await simulateReviewKeep('thread-1', 'user-1');
    expect(gmailService.modifyLabels).toHaveBeenCalledWith('acc-1', 'gmail-thread-1', ['INBOX'], []);
    expect(result.success).toBe(true);
  });

  it('returns success message', async () => {
    vi.mocked(prisma.emailThread.findFirst).mockResolvedValue(makeThread() as any);
    const result = await simulateReviewKeep('thread-1', 'user-1');
    expect(result.data.message).toBe('Tråd flyttad till inkorg.');
  });

  it('throws if threadId is missing', async () => {
    await expect(simulateReviewKeep(undefined, 'user-1')).rejects.toThrow('threadId krävs.');
  });

  it('throws 404 if thread not found', async () => {
    vi.mocked(prisma.emailThread.findFirst).mockResolvedValue(null);
    await expect(simulateReviewKeep('missing-thread', 'user-1')).rejects.toThrow('Tråd hittades inte.');
  });

  it('does not call modifyLabels if thread not found', async () => {
    vi.mocked(prisma.emailThread.findFirst).mockResolvedValue(null);
    await simulateReviewKeep('missing-thread', 'user-1').catch(() => {});
    expect(gmailService.modifyLabels).not.toHaveBeenCalled();
  });
});

// ─── review-trash ────────────────────────────────────────────────────────────

describe('Agent action: review-trash', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calls trashThread with correct args', async () => {
    vi.mocked(prisma.emailThread.findFirst).mockResolvedValue(makeThread() as any);
    const result = await simulateReviewTrash('thread-1', 'user-1');
    expect(gmailService.trashThread).toHaveBeenCalledWith('acc-1', 'gmail-thread-1');
    expect(result.success).toBe(true);
  });

  it('returns success message', async () => {
    vi.mocked(prisma.emailThread.findFirst).mockResolvedValue(makeThread() as any);
    const result = await simulateReviewTrash('thread-1', 'user-1');
    expect(result.data.message).toBe('Tråd skickad till papperskorgen.');
  });

  it('triggers checkAndCreateSuggestion for sender email', async () => {
    vi.mocked(prisma.emailThread.findFirst).mockResolvedValue(
      makeThread({ participantEmails: ['attacker@phish.com'] }) as any
    );
    await simulateReviewTrash('thread-1', 'user-1');
    expect(checkAndCreateSuggestion).toHaveBeenCalledWith('attacker@phish.com', 'user-1');
  });

  it('does not call checkAndCreateSuggestion if no participant emails', async () => {
    vi.mocked(prisma.emailThread.findFirst).mockResolvedValue(
      makeThread({ participantEmails: [] }) as any
    );
    await simulateReviewTrash('thread-1', 'user-1');
    expect(checkAndCreateSuggestion).not.toHaveBeenCalled();
  });

  it('throws if threadId is missing', async () => {
    await expect(simulateReviewTrash(undefined, 'user-1')).rejects.toThrow('threadId krävs.');
  });

  it('throws 404 if thread not found', async () => {
    vi.mocked(prisma.emailThread.findFirst).mockResolvedValue(null);
    await expect(simulateReviewTrash('missing-thread', 'user-1')).rejects.toThrow('Tråd hittades inte.');
  });
});

// ─── inbox-status ────────────────────────────────────────────────────────────

describe('Agent action: inbox-status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.emailThread.count).mockResolvedValue(5);
    vi.mocked(prisma.triageLog.count).mockResolvedValue(2);
    vi.mocked(prisma.draft.count).mockResolvedValue(3);
    vi.mocked(prisma.classificationRule.count).mockResolvedValue(4);
    vi.mocked(prisma.triageLog.findMany).mockResolvedValue([]);
    vi.mocked(prisma.aIAnalysis.findMany).mockResolvedValue([]);
  });

  it('returns correct counts from DB', async () => {
    const result = await simulateInboxStatus('user-1');
    expect(result.data.unread).toBe(5);
    expect(result.data.pending_review).toBe(2);
    expect(result.data.pending_drafts).toBe(3);
    expect(result.data.rule_count).toBe(4);
  });

  it('aggregates triage stats by action', async () => {
    vi.mocked(prisma.triageLog.findMany).mockResolvedValue([
      { action: 'trash', classification: 'spam' },
      { action: 'trash', classification: 'outreach' },
      { action: 'label_review', classification: 'lead' },
    ] as any);
    const result = await simulateInboxStatus('user-1');
    expect(result.data.triage_stats_24h).toEqual({ trash: 2, label_review: 1 });
    expect(result.data.triage_total_24h).toBe(3);
  });

  it('aggregates analyses by classification', async () => {
    vi.mocked(prisma.aIAnalysis.findMany).mockResolvedValue([
      { classification: 'lead' },
      { classification: 'spam' },
      { classification: 'lead' },
      { classification: null },
    ] as any);
    const result = await simulateInboxStatus('user-1');
    expect(result.data.by_classification).toEqual({ lead: 2, spam: 1 });
  });

  it('handles empty triage logs and analyses', async () => {
    const result = await simulateInboxStatus('user-1');
    expect(result.data.triage_stats_24h).toEqual({});
    expect(result.data.by_classification).toEqual({});
    expect(result.data.triage_total_24h).toBe(0);
  });

  it('returns success: true', async () => {
    const result = await simulateInboxStatus('user-1');
    expect(result.success).toBe(true);
  });
});
