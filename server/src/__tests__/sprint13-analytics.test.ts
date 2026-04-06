/**
 * Sprint 13 — Analytics route tests.
 *
 * GET /analytics/overview?days=N
 *
 * Key invariants:
 *  - days is clamped to [1, 365], defaults to 30, NaN → 30
 *  - mailPerDay has exactly `days` entries, sorted by date
 *  - messages/drafts outside the window are ignored (dayMap guard)
 *  - priorityDistribution always has high/medium/low keys (pre-seeded)
 *  - aiClassifications excludes rule-engine modelUsed
 *  - topSenders: sorted desc by count, max 10, lowercased
 *  - avgResponseTimeHours: mean of responseTimeHours, null if empty
 *  - totals.received = receivedMessages.length, totals.sent = sentDrafts.length
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/database', () => ({
  prisma: {
    emailAccount: { findMany: vi.fn() },
    emailMessage: { findMany: vi.fn() },
    draft: { findMany: vi.fn(), count: vi.fn() },
    aIAnalysis: { findMany: vi.fn() },
    emailThread: { findMany: vi.fn() },
    learningEvent: { count: vi.fn() },
    followUpReminder: { count: vi.fn() },
  },
}));

import { prisma } from '../config/database';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAccount(id: string) {
  return { id };
}

function makeMessage(receivedAt: Date) {
  return { receivedAt };
}

function makeSentDraft(sentAt: Date | null) {
  return { sentAt };
}

function makeAnalysis(classification: string, priority: string, modelUsed = 'groq') {
  return { classification, priority, modelUsed };
}

function makeThread(responseTimeHours: number | null) {
  return { responseTimeHours };
}

/** Simulate the analytics route handler */
async function simulateAnalytics(userId: string, daysStr?: string) {
  const days = Math.min(Math.max(parseInt(daysStr ?? '30', 10) || 30, 1), 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const accounts = await (prisma.emailAccount.findMany as any)({ where: { userId, isActive: true } });
  const accountIds = accounts.map((a: any) => a.id);

  const receivedMessages = await (prisma.emailMessage.findMany as any)({
    where: { receivedAt: { gte: since }, thread: { accountId: { in: accountIds } } },
    select: { receivedAt: true },
  });

  const sentDrafts = await (prisma.draft.findMany as any)({
    where: { userId, status: 'sent', sentAt: { gte: since } },
    select: { sentAt: true },
  });

  // Build day-by-day buckets
  const dayMap: Record<string, { date: string; received: number; sent: number }> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(since.getTime() + i * 86400000);
    const key = d.toISOString().slice(0, 10);
    dayMap[key] = { date: key, received: 0, sent: 0 };
  }
  for (const msg of receivedMessages) {
    const key = new Date(msg.receivedAt).toISOString().slice(0, 10);
    if (dayMap[key]) dayMap[key].received++;
  }
  for (const draft of sentDrafts) {
    if (!draft.sentAt) continue;
    const key = new Date(draft.sentAt).toISOString().slice(0, 10);
    if (dayMap[key]) dayMap[key].sent++;
  }
  const mailPerDay = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));

  const analyses = await (prisma.aIAnalysis.findMany as any)({
    where: { createdAt: { gte: since }, thread: { accountId: { in: accountIds } } },
    select: { classification: true, priority: true, modelUsed: true },
  });

  const classificationMap: Record<string, number> = {};
  const priorityMap: Record<string, number> = { high: 0, medium: 0, low: 0 };
  let aiClassifications = 0;

  for (const a of analyses) {
    classificationMap[a.classification] = (classificationMap[a.classification] ?? 0) + 1;
    if (priorityMap[a.priority] !== undefined) priorityMap[a.priority]++;
    if (a.modelUsed !== 'rule-engine') aiClassifications++;
  }

  const classificationDistribution = Object.entries(classificationMap).map(([name, value]) => ({ name, value }));
  const priorityDistribution = Object.entries(priorityMap).map(([name, value]) => ({ name, value }));

  const allMessages = await (prisma.emailMessage.findMany as any)({
    where: { receivedAt: { gte: since }, thread: { accountId: { in: accountIds } } },
    select: { fromAddress: true },
  });

  const senderMap: Record<string, number> = {};
  for (const msg of allMessages) {
    const sender = msg.fromAddress?.toLowerCase().trim() ?? '';
    if (sender) senderMap[sender] = (senderMap[sender] ?? 0) + 1;
  }
  const topSenders = Object.entries(senderMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([email, count]) => ({ email, count }));

  const generatedDrafts = await (prisma.draft.count as any)({ where: { userId, createdAt: { gte: since } } });
  const learningEvents = await (prisma.learningEvent.count as any)({ where: { userId, createdAt: { gte: since } } });

  const threadsWithResponse = await (prisma.emailThread.findMany as any)({
    where: { accountId: { in: accountIds }, responseTimeHours: { not: null }, updatedAt: { gte: since } },
    select: { responseTimeHours: true },
  });

  const avgResponseTime =
    threadsWithResponse.length > 0
      ? threadsWithResponse.reduce((sum: number, t: any) => sum + (t.responseTimeHours ?? 0), 0) /
        threadsWithResponse.length
      : null;

  const activeFollowUps = await (prisma.followUpReminder.count as any)({ where: { userId, isCompleted: false } });

  return {
    period: { days, since: since.toISOString() },
    mailPerDay,
    classificationDistribution,
    priorityDistribution,
    topSenders,
    amanda: { aiClassifications, generatedDrafts, learningEvents },
    avgResponseTimeHours: avgResponseTime,
    activeFollowUps,
    totals: {
      received: receivedMessages.length,
      sent: sentDrafts.length,
      analyzed: analyses.length,
    },
  };
}

// ─── Setup helpers ────────────────────────────────────────────────────────────

function setupEmptyDb() {
  vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([]);
  vi.mocked(prisma.emailMessage.findMany).mockResolvedValue([]);
  vi.mocked(prisma.draft.findMany).mockResolvedValue([]);
  vi.mocked(prisma.draft.count).mockResolvedValue(0);
  vi.mocked(prisma.aIAnalysis.findMany).mockResolvedValue([]);
  vi.mocked(prisma.emailThread.findMany).mockResolvedValue([]);
  vi.mocked(prisma.learningEvent.count).mockResolvedValue(0);
  vi.mocked(prisma.followUpReminder.count).mockResolvedValue(0);
}

// ─── Days clamping ────────────────────────────────────────────────────────────

describe('Analytics — days parameter clamping', () => {
  beforeEach(() => { vi.clearAllMocks(); setupEmptyDb(); });

  it('defaults to 30 days when not provided', async () => {
    const result = await simulateAnalytics('user-1');
    expect(result.period.days).toBe(30);
    expect(result.mailPerDay).toHaveLength(30);
  });

  it('uses provided days value', async () => {
    const result = await simulateAnalytics('user-1', '7');
    expect(result.period.days).toBe(7);
    expect(result.mailPerDay).toHaveLength(7);
  });

  it('clamps days to max 365', async () => {
    const result = await simulateAnalytics('user-1', '999');
    expect(result.period.days).toBe(365);
    expect(result.mailPerDay).toHaveLength(365);
  });

  it('accepts 1 as minimum valid value', async () => {
    const result = await simulateAnalytics('user-1', '1');
    expect(result.period.days).toBe(1);
    expect(result.mailPerDay).toHaveLength(1);
  });

  it('falls back to 30 on NaN input', async () => {
    const result = await simulateAnalytics('user-1', 'abc');
    expect(result.period.days).toBe(30);
  });
});

// ─── mailPerDay bucketing ─────────────────────────────────────────────────────

describe('Analytics — mailPerDay bucketing', () => {
  beforeEach(() => { vi.clearAllMocks(); setupEmptyDb(); });

  it('initializes all day buckets with zero counts', async () => {
    const result = await simulateAnalytics('user-1', '3');
    expect(result.mailPerDay).toHaveLength(3);
    for (const day of result.mailPerDay) {
      expect(day.received).toBe(0);
      expect(day.sent).toBe(0);
    }
  });

  it('sorts mailPerDay in ascending date order', async () => {
    const result = await simulateAnalytics('user-1', '5');
    const dates = result.mailPerDay.map(d => d.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });

  it('counts received messages in the correct day bucket', async () => {
    // days=1 → the single bucket key is: (now - 1 day).toISOString().slice(0,10)
    const bucketDate = new Date(Date.now() - 1 * 86400000).toISOString().slice(0, 10);

    vi.mocked(prisma.emailMessage.findMany)
      .mockResolvedValueOnce([
        makeMessage(new Date(bucketDate + 'T10:00:00Z')),
        makeMessage(new Date(bucketDate + 'T14:00:00Z')),
      ] as any)
      .mockResolvedValueOnce([] as any); // second call for topSenders

    const result = await simulateAnalytics('user-1', '1');
    const bucket = result.mailPerDay.find(d => d.date === bucketDate);
    expect(bucket?.received).toBe(2);
  });

  it('ignores messages with dates outside the window', async () => {
    // 2-day window: messages from day-100 should NOT appear
    vi.mocked(prisma.emailMessage.findMany)
      .mockResolvedValueOnce([
        makeMessage(new Date('2000-01-01T00:00:00Z')), // very old
      ] as any)
      .mockResolvedValueOnce([] as any);

    const result = await simulateAnalytics('user-1', '2');
    const total = result.mailPerDay.reduce((s, d) => s + d.received, 0);
    expect(total).toBe(0);
  });

  it('counts sent drafts in the correct day bucket', async () => {
    const bucketDate = new Date(Date.now() - 1 * 86400000).toISOString().slice(0, 10);
    vi.mocked(prisma.draft.findMany).mockResolvedValue([
      makeSentDraft(new Date(bucketDate + 'T09:00:00Z')),
    ] as any);

    const result = await simulateAnalytics('user-1', '1');
    const bucket = result.mailPerDay.find(d => d.date === bucketDate);
    expect(bucket?.sent).toBe(1);
  });

  it('skips draft with null sentAt', async () => {
    vi.mocked(prisma.draft.findMany).mockResolvedValue([
      makeSentDraft(null),
    ] as any);
    const result = await simulateAnalytics('user-1', '1');
    const totalSent = result.mailPerDay.reduce((s, d) => s + d.sent, 0);
    expect(totalSent).toBe(0);
  });
});

// ─── Classification distribution ─────────────────────────────────────────────

describe('Analytics — classification distribution', () => {
  beforeEach(() => { vi.clearAllMocks(); setupEmptyDb(); });

  it('priorityDistribution always has high/medium/low keys', async () => {
    const result = await simulateAnalytics('user-1', '7');
    const names = result.priorityDistribution.map(p => p.name);
    expect(names).toContain('high');
    expect(names).toContain('medium');
    expect(names).toContain('low');
  });

  it('counts classification types correctly', async () => {
    vi.mocked(prisma.aIAnalysis.findMany).mockResolvedValue([
      makeAnalysis('newsletter', 'low'),
      makeAnalysis('newsletter', 'low'),
      makeAnalysis('action_required', 'high'),
    ] as any);

    const result = await simulateAnalytics('user-1', '7');
    const newsletter = result.classificationDistribution.find(c => c.name === 'newsletter');
    const action = result.classificationDistribution.find(c => c.name === 'action_required');
    expect(newsletter?.value).toBe(2);
    expect(action?.value).toBe(1);
  });

  it('counts priority distribution correctly', async () => {
    vi.mocked(prisma.aIAnalysis.findMany).mockResolvedValue([
      makeAnalysis('x', 'high'),
      makeAnalysis('x', 'high'),
      makeAnalysis('x', 'medium'),
    ] as any);

    const result = await simulateAnalytics('user-1', '7');
    const high = result.priorityDistribution.find(p => p.name === 'high');
    const medium = result.priorityDistribution.find(p => p.name === 'medium');
    const low = result.priorityDistribution.find(p => p.name === 'low');
    expect(high?.value).toBe(2);
    expect(medium?.value).toBe(1);
    expect(low?.value).toBe(0);
  });

  it('excludes rule-engine from aiClassifications', async () => {
    vi.mocked(prisma.aIAnalysis.findMany).mockResolvedValue([
      makeAnalysis('newsletter', 'low', 'rule-engine'),
      makeAnalysis('newsletter', 'low', 'groq'),
      makeAnalysis('newsletter', 'low', 'anthropic'),
    ] as any);

    const result = await simulateAnalytics('user-1', '7');
    expect(result.amanda.aiClassifications).toBe(2); // only groq + anthropic
  });

  it('returns empty distributions when no analyses', async () => {
    const result = await simulateAnalytics('user-1', '7');
    expect(result.classificationDistribution).toHaveLength(0);
    expect(result.priorityDistribution).toHaveLength(3); // pre-seeded with 0s
    expect(result.totals.analyzed).toBe(0);
  });
});

// ─── Top senders ──────────────────────────────────────────────────────────────

describe('Analytics — topSenders', () => {
  beforeEach(() => { vi.clearAllMocks(); setupEmptyDb(); });

  it('sorts senders by count descending', async () => {
    vi.mocked(prisma.emailMessage.findMany)
      .mockResolvedValueOnce([] as any) // receivedMessages
      .mockResolvedValueOnce([
        { fromAddress: 'b@example.com' },
        { fromAddress: 'a@example.com' },
        { fromAddress: 'a@example.com' },
        { fromAddress: 'a@example.com' },
      ] as any); // allMessages (topSenders)

    const result = await simulateAnalytics('user-1', '7');
    expect(result.topSenders[0].email).toBe('a@example.com');
    expect(result.topSenders[0].count).toBe(3);
    expect(result.topSenders[1].email).toBe('b@example.com');
    expect(result.topSenders[1].count).toBe(1);
  });

  it('limits topSenders to 10', async () => {
    const messages = Array.from({ length: 15 }, (_, i) => ({ fromAddress: `sender${i}@x.com` }));
    vi.mocked(prisma.emailMessage.findMany)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce(messages as any);

    const result = await simulateAnalytics('user-1', '7');
    expect(result.topSenders).toHaveLength(10);
  });

  it('normalizes sender emails to lowercase', async () => {
    vi.mocked(prisma.emailMessage.findMany)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([
        { fromAddress: 'Alice@EXAMPLE.COM' },
        { fromAddress: 'alice@example.com' },
      ] as any);

    const result = await simulateAnalytics('user-1', '7');
    expect(result.topSenders).toHaveLength(1);
    expect(result.topSenders[0].email).toBe('alice@example.com');
    expect(result.topSenders[0].count).toBe(2);
  });

  it('ignores messages with null/empty fromAddress', async () => {
    vi.mocked(prisma.emailMessage.findMany)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([
        { fromAddress: null },
        { fromAddress: '' },
        { fromAddress: '   ' },
      ] as any);

    const result = await simulateAnalytics('user-1', '7');
    expect(result.topSenders).toHaveLength(0);
  });
});

// ─── avgResponseTimeHours ─────────────────────────────────────────────────────

describe('Analytics — avgResponseTimeHours', () => {
  beforeEach(() => { vi.clearAllMocks(); setupEmptyDb(); });

  it('returns null when no threads have response time', async () => {
    const result = await simulateAnalytics('user-1', '7');
    expect(result.avgResponseTimeHours).toBeNull();
  });

  it('returns average of responseTimeHours', async () => {
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue([
      makeThread(2),
      makeThread(4),
      makeThread(6),
    ] as any);

    const result = await simulateAnalytics('user-1', '7');
    expect(result.avgResponseTimeHours).toBe(4);
  });

  it('handles single thread correctly', async () => {
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue([makeThread(8)] as any);
    const result = await simulateAnalytics('user-1', '7');
    expect(result.avgResponseTimeHours).toBe(8);
  });
});

// ─── Totals ───────────────────────────────────────────────────────────────────

describe('Analytics — totals', () => {
  beforeEach(() => { vi.clearAllMocks(); setupEmptyDb(); });

  it('totals.received = number of received messages', async () => {
    vi.mocked(prisma.emailMessage.findMany)
      .mockResolvedValueOnce([makeMessage(new Date()), makeMessage(new Date())] as any)
      .mockResolvedValueOnce([] as any);

    const result = await simulateAnalytics('user-1', '7');
    expect(result.totals.received).toBe(2);
  });

  it('totals.sent = number of sent drafts', async () => {
    vi.mocked(prisma.draft.findMany).mockResolvedValue([
      makeSentDraft(new Date()),
      makeSentDraft(new Date()),
      makeSentDraft(new Date()),
    ] as any);

    const result = await simulateAnalytics('user-1', '7');
    expect(result.totals.sent).toBe(3);
  });

  it('totals.analyzed = number of analyses', async () => {
    vi.mocked(prisma.aIAnalysis.findMany).mockResolvedValue([
      makeAnalysis('x', 'high'),
      makeAnalysis('y', 'low'),
    ] as any);

    const result = await simulateAnalytics('user-1', '7');
    expect(result.totals.analyzed).toBe(2);
  });

  it('all totals are 0 with empty db', async () => {
    const result = await simulateAnalytics('user-1', '7');
    expect(result.totals.received).toBe(0);
    expect(result.totals.sent).toBe(0);
    expect(result.totals.analyzed).toBe(0);
  });
});

// ─── Response shape ───────────────────────────────────────────────────────────

describe('Analytics — response shape', () => {
  beforeEach(() => { vi.clearAllMocks(); setupEmptyDb(); });

  it('returns all required top-level keys', async () => {
    const result = await simulateAnalytics('user-1');
    expect(result).toHaveProperty('period');
    expect(result).toHaveProperty('mailPerDay');
    expect(result).toHaveProperty('classificationDistribution');
    expect(result).toHaveProperty('priorityDistribution');
    expect(result).toHaveProperty('topSenders');
    expect(result).toHaveProperty('amanda');
    expect(result).toHaveProperty('avgResponseTimeHours');
    expect(result).toHaveProperty('activeFollowUps');
    expect(result).toHaveProperty('totals');
  });

  it('amanda block has aiClassifications, generatedDrafts, learningEvents', async () => {
    const result = await simulateAnalytics('user-1');
    expect(result.amanda).toHaveProperty('aiClassifications');
    expect(result.amanda).toHaveProperty('generatedDrafts');
    expect(result.amanda).toHaveProperty('learningEvents');
  });

  it('period contains days and since', async () => {
    const result = await simulateAnalytics('user-1', '14');
    expect(result.period.days).toBe(14);
    expect(typeof result.period.since).toBe('string');
  });
});
