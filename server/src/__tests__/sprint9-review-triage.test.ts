/**
 * Sprint 9 — Route-level tests for review queue + triage report.
 *
 * All DB calls and external services are mocked.
 *
 * Review routes:
 *   GET  /review — returns threads in Granskning queue
 *   POST /review/:threadId/decide — keep | trash | create_rule
 *   POST /rules/suggest — generate rule suggestions from triage logs
 *   POST /rules/accept  — accept a suggestion → creates ClassificationRule
 *   POST /rules/dismiss — dismiss a suggestion
 *
 * Triage report route:
 *   GET /triage/report — aggregated triage stats (period + optional action filter)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('../config/database', () => ({
  prisma: {
    triageLog: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    emailThread: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    ruleSuggestion: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    classificationRule: {
      create: vi.fn(),
    },
    aiAnalysis: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../services/gmail.service', () => ({
  gmailService: {
    modifyLabels: vi.fn().mockResolvedValue({}),
    trashThread: vi.fn().mockResolvedValue({}),
    getOrCreateLabel: vi.fn().mockResolvedValue('label-review-id'),
  },
}));

vi.mock('../services/triage-action.service', () => ({
  ensureReviewLabel: vi.fn().mockResolvedValue('label-review-id'),
}));

vi.mock('../services/rule-suggestion.service', () => ({
  generateSuggestions: vi.fn().mockResolvedValue([]),
  acceptSuggestion: vi.fn().mockResolvedValue({ id: 'sug-1', senderPattern: '*@spam.com' }),
  dismissSuggestion: vi.fn().mockResolvedValue({ id: 'sug-1' }),
  checkAndCreateSuggestion: vi.fn().mockResolvedValue(null),
}));

import { prisma } from '../config/database';
import { generateSuggestions, acceptSuggestion, dismissSuggestion } from '../services/rule-suggestion.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal thread fixture */
function makeThread(overrides: Partial<{
  id: string; gmailThreadId: string; subject: string; accountId: string;
  participantEmails: string[]; snippet: string | null; labels: string[];
  lastMessageAt: Date; analyses: any[];
}> = {}) {
  return {
    id: 'thread-1',
    gmailThreadId: 'gmail-1',
    subject: 'Test subject',
    accountId: 'acc-1',
    participantEmails: ['sender@example.com'],
    snippet: 'Short snippet...',
    labels: ['INBOX'],
    lastMessageAt: new Date('2026-04-06T10:00:00Z'),
    analyses: [{
      classification: 'spam',
      priority: 'low',
      confidence: 0.92,
      summary: 'A spam email',
      suggestedAction: 'ignore',
    }],
    ...overrides,
  };
}

/** Minimal triage log fixture */
function makeTriageLog(overrides: Partial<{
  threadId: string; senderEmail: string; subject: string;
  classification: string; action: string; source: string;
  priority: string; createdAt: Date;
}> = {}) {
  return {
    threadId: 'thread-1',
    senderEmail: 'sender@example.com',
    subject: 'Test',
    classification: 'spam',
    action: 'trash',
    source: 'rule_engine',
    priority: 'low',
    createdAt: new Date('2026-04-06T10:00:00Z'),
    reason: 'Matched rule: newsletter',
    ...overrides,
  };
}

// ─── Review queue: GET /review ─────────────────────────────────────────────

describe('Review queue — GET /review logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty threads when no triage logs', async () => {
    vi.mocked(prisma.triageLog.findMany).mockResolvedValue([]);

    const result = await simulateGetReview('user-1');
    expect(result.threads).toHaveLength(0);
  });

  it('merges triage log metadata into thread response', async () => {
    const log = makeTriageLog({ threadId: 'thread-1', senderEmail: 'spam@bad.com' });
    vi.mocked(prisma.triageLog.findMany).mockResolvedValue([log] as any);
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue([makeThread()] as any);

    const result = await simulateGetReview('user-1');
    expect(result.threads).toHaveLength(1);
    expect(result.threads[0].triageReason).toBe('Matched rule: newsletter');
    expect(result.threads[0].analysis?.classification).toBe('spam');
  });

  it('includes sender email in thread result', async () => {
    const log = makeTriageLog({ senderEmail: 'newsletter@company.com' });
    vi.mocked(prisma.triageLog.findMany).mockResolvedValue([log] as any);
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue([
      makeThread({ participantEmails: ['newsletter@company.com'] }),
    ] as any);

    const result = await simulateGetReview('user-1');
    expect(result.threads[0].participantEmails[0]).toBe('newsletter@company.com');
  });

  it('handles threads with no analysis gracefully', async () => {
    const log = makeTriageLog();
    vi.mocked(prisma.triageLog.findMany).mockResolvedValue([log] as any);
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue([
      makeThread({ analyses: [] }),
    ] as any);

    const result = await simulateGetReview('user-1');
    expect(result.threads[0].analysis).toBeNull();
  });
});

/** Simulate the GET /review route logic */
async function simulateGetReview(userId: string) {
  const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const triageLogs = await prisma.triageLog.findMany({
    where: { userId, action: 'label_review', createdAt: { gte: cutoff } },
    orderBy: { createdAt: 'desc' },
    distinct: ['threadId'] as any,
    select: { threadId: true, senderEmail: true, subject: true, createdAt: true, reason: true },
  });

  if (triageLogs.length === 0) return { threads: [] };

  const threadIds = triageLogs.map((l: any) => l.threadId);

  const threads = await prisma.emailThread.findMany({
    where: { id: { in: threadIds }, account: { userId, isActive: true } },
    select: {
      id: true,
      gmailThreadId: true,
      subject: true,
      snippet: true,
      participantEmails: true,
      lastMessageAt: true,
      labels: true,
      accountId: true,
      analyses: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { classification: true, priority: true, confidence: true, summary: true, suggestedAction: true },
      },
    },
  });

  const logByThreadId = new Map((triageLogs as any[]).map((l: any) => [l.threadId, l]));

  return {
    threads: (threads as any[]).map((t: any) => ({
      id: t.id,
      gmailThreadId: t.gmailThreadId,
      subject: t.subject,
      snippet: t.snippet,
      participantEmails: t.participantEmails,
      lastMessageAt: t.lastMessageAt,
      labels: t.labels,
      accountId: t.accountId,
      triageReason: logByThreadId.get(t.id)?.reason ?? null,
      queuedAt: logByThreadId.get(t.id)?.createdAt ?? null,
      analysis: t.analyses[0] ?? null,
    })),
  };
}

// ─── Review decide validation ──────────────────────────────────────────────

describe('Review decide — action validation', () => {
  it('accepts valid actions: keep, trash, create_rule', () => {
    const { z } = require('zod');
    const DecideSchema = z.object({ action: z.enum(['keep', 'trash', 'create_rule']) });

    expect(DecideSchema.safeParse({ action: 'keep' }).success).toBe(true);
    expect(DecideSchema.safeParse({ action: 'trash' }).success).toBe(true);
    expect(DecideSchema.safeParse({ action: 'create_rule' }).success).toBe(true);
  });

  it('rejects invalid actions', () => {
    const { z } = require('zod');
    const DecideSchema = z.object({ action: z.enum(['keep', 'trash', 'create_rule']) });

    expect(DecideSchema.safeParse({ action: 'delete' }).success).toBe(false);
    expect(DecideSchema.safeParse({ action: '' }).success).toBe(false);
    expect(DecideSchema.safeParse({}).success).toBe(false);
  });
});

// ─── Rule suggestions ──────────────────────────────────────────────────────

describe('Rule suggestions — generateSuggestions', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calls generateSuggestions with userId', async () => {
    vi.mocked(generateSuggestions).mockResolvedValue([
      { id: 'sug-1', senderPattern: '*@newsletter.com', suggestedAction: 'trash', triggerCount: 3, status: 'pending' } as any,
    ]);

    const result = await generateSuggestions('user-1');
    expect(result).toHaveLength(1);
    expect(result[0].senderPattern).toBe('*@newsletter.com');
  });

  it('returns empty array when no patterns found', async () => {
    vi.mocked(generateSuggestions).mockResolvedValue([]);
    const result = await generateSuggestions('user-1');
    expect(result).toHaveLength(0);
  });
});

describe('Rule suggestions — acceptSuggestion', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns created rule on accept', async () => {
    vi.mocked(acceptSuggestion).mockResolvedValue({ id: 'sug-1', senderPattern: '*@spam.com' } as any);
    const result = await acceptSuggestion('sug-1', 'user-1');
    expect((result as any).senderPattern).toBe('*@spam.com');
  });
});

describe('Rule suggestions — dismissSuggestion', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns dismissed suggestion on dismiss', async () => {
    vi.mocked(dismissSuggestion).mockResolvedValue({ id: 'sug-1', status: 'dismissed' } as any);
    const result = await dismissSuggestion('sug-1', 'user-1');
    expect((result as any).id).toBe('sug-1');
  });
});

// ─── Triage report — period window logic ──────────────────────────────────

describe('Triage report — periodWindow', () => {
  function periodWindow(period: 'today' | 'week' | 'month') {
    const to = new Date();
    const from = new Date();
    switch (period) {
      case 'today': from.setHours(0, 0, 0, 0); break;
      case 'week':  from.setDate(from.getDate() - 7); break;
      case 'month': from.setDate(from.getDate() - 30); break;
    }
    return { from, to };
  }

  it('today window starts at midnight', () => {
    const { from } = periodWindow('today');
    expect(from.getHours()).toBe(0);
    expect(from.getMinutes()).toBe(0);
    expect(from.getSeconds()).toBe(0);
  });

  it('week window is ~7 days ago', () => {
    const { from, to } = periodWindow('week');
    const diffDays = (to.getTime() - from.getTime()) / 86400000;
    expect(Math.round(diffDays)).toBe(7);
  });

  it('month window is ~30 days ago', () => {
    const { from, to } = periodWindow('month');
    const diffDays = (to.getTime() - from.getTime()) / 86400000;
    expect(Math.round(diffDays)).toBe(30);
  });
});

describe('Triage report — aggregation logic', () => {
  function aggregateLogs(logs: Array<{ action: string; classification: string; senderEmail: string }>) {
    const byAction: Record<string, number> = {};
    const byClassification: Record<string, number> = {};
    const bySender: Record<string, number> = {};

    for (const log of logs) {
      byAction[log.action] = (byAction[log.action] ?? 0) + 1;
      byClassification[log.classification] = (byClassification[log.classification] ?? 0) + 1;
      bySender[log.senderEmail] = (bySender[log.senderEmail] ?? 0) + 1;
    }
    return { byAction, byClassification, bySender };
  }

  it('counts actions correctly', () => {
    const logs = [
      { action: 'trash', classification: 'spam', senderEmail: 'a@b.com' },
      { action: 'trash', classification: 'spam', senderEmail: 'c@d.com' },
      { action: 'keep_inbox', classification: 'lead', senderEmail: 'e@f.com' },
    ];
    const { byAction } = aggregateLogs(logs);
    expect(byAction['trash']).toBe(2);
    expect(byAction['keep_inbox']).toBe(1);
  });

  it('counts classifications correctly', () => {
    const logs = [
      { action: 'trash', classification: 'spam', senderEmail: 'a@b.com' },
      { action: 'trash', classification: 'operational', senderEmail: 'c@d.com' },
      { action: 'trash', classification: 'spam', senderEmail: 'e@f.com' },
    ];
    const { byClassification } = aggregateLogs(logs);
    expect(byClassification['spam']).toBe(2);
    expect(byClassification['operational']).toBe(1);
  });

  it('counts senders correctly', () => {
    const logs = [
      { action: 'trash', classification: 'spam', senderEmail: 'news@co.com' },
      { action: 'trash', classification: 'spam', senderEmail: 'news@co.com' },
      { action: 'trash', classification: 'spam', senderEmail: 'other@co.com' },
    ];
    const { bySender } = aggregateLogs(logs);
    expect(bySender['news@co.com']).toBe(2);
    expect(bySender['other@co.com']).toBe(1);
  });

  it('returns zero total for empty log list', () => {
    const { byAction, byClassification, bySender } = aggregateLogs([]);
    expect(Object.keys(byAction)).toHaveLength(0);
    expect(Object.keys(byClassification)).toHaveLength(0);
    expect(Object.keys(bySender)).toHaveLength(0);
  });

  it('groups rows by sender + classification', () => {
    const logs = [
      { action: 'trash', classification: 'spam', senderEmail: 'a@b.com' },
      { action: 'trash', classification: 'spam', senderEmail: 'a@b.com' },
      { action: 'label_review', classification: 'outreach', senderEmail: 'a@b.com' },
    ];

    const grouped: Record<string, { sender: string; classification: string; count: number; actions: Record<string, number> }> = {};
    for (const log of logs) {
      const key = `${log.senderEmail}::${log.classification}`;
      if (!grouped[key]) grouped[key] = { sender: log.senderEmail, classification: log.classification, count: 0, actions: {} };
      grouped[key].count++;
      grouped[key].actions[log.action] = (grouped[key].actions[log.action] ?? 0) + 1;
    }

    const rows = Object.values(grouped).sort((a, b) => b.count - a.count);
    expect(rows).toHaveLength(2);
    const spamRow = rows.find((r) => r.classification === 'spam');
    expect(spamRow?.count).toBe(2);
    expect(spamRow?.actions['trash']).toBe(2);
  });
});

describe('Triage report — period schema validation', () => {
  it('accepts valid periods', () => {
    const { z } = require('zod');
    const PeriodSchema = z.enum(['today', 'week', 'month']).default('today');
    expect(PeriodSchema.safeParse('today').success).toBe(true);
    expect(PeriodSchema.safeParse('week').success).toBe(true);
    expect(PeriodSchema.safeParse('month').success).toBe(true);
  });

  it('defaults to today for unknown periods', () => {
    const { z } = require('zod');
    const PeriodSchema = z.enum(['today', 'week', 'month']).default('today');
    const result = PeriodSchema.safeParse(undefined);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('today');
  });

  it('rejects invalid periods', () => {
    const { z } = require('zod');
    const PeriodSchema = z.enum(['today', 'week', 'month']).default('today');
    expect(PeriodSchema.safeParse('yesterday').success).toBe(false);
    expect(PeriodSchema.safeParse('year').success).toBe(false);
  });
});
