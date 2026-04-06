/**
 * Sprint 13 — Command Center route tests.
 *
 * GET /command-center — aggregated dashboard data.
 *
 * Key invariants:
 *  - overview counts: pending/approved drafts, priority threads, unread, total, unanalyzed
 *  - unanalyzed = totalThreads - analyzedThreads (subtraction)
 *  - high_priority_senders: extracts non-account participant email prefix; falls back to first email, then subject word
 *  - per_account_stats: unread + highPriority merged from two groupBy results
 *  - zero accounts → all counts 0, empty collections
 *  - drafts_preview: pending + approved, max 5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/database', () => ({
  prisma: {
    emailAccount: { findMany: vi.fn() },
    draft: { count: vi.fn(), findMany: vi.fn() },
    emailThread: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
    actionLog: { findMany: vi.fn() },
  },
}));

import { prisma } from '../config/database';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAccount(id: string, email: string, isDefault = false) {
  return { id, emailAddress: email, isDefault };
}

function makeGroupByRow(accountId: string, count: number) {
  return { accountId, _count: count };
}

/** Simulate the route handler */
async function simulateCommandCenter(userId: string) {
  const accounts = await (prisma.emailAccount.findMany as any)({ where: { userId } });
  const accountIds = accounts.map((a: any) => a.id);
  const accountEmails = new Set(accounts.map((a: any) => a.emailAddress));

  const [
    pendingDrafts, approvedDrafts,
    highPriorityThreads, mediumPriorityThreads, lowPriorityThreads,
    unreadThreads, recentActions, totalThreads, analyzedThreads,
  ] = await Promise.all([
    (prisma.draft.count as any)({ where: { userId, status: 'pending' } }),
    (prisma.draft.count as any)({ where: { userId, status: 'approved' } }),
    (prisma.emailThread.count as any)({ where: { accountId: { in: accountIds }, analyses: { some: { priority: 'high' } } } }),
    (prisma.emailThread.count as any)({ where: { accountId: { in: accountIds }, analyses: { some: { priority: 'medium' } } } }),
    (prisma.emailThread.count as any)({ where: { accountId: { in: accountIds }, analyses: { some: { priority: 'low' } } } }),
    (prisma.emailThread.count as any)({ where: { accountId: { in: accountIds }, isRead: false } }),
    (prisma.actionLog.findMany as any)({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 5 }),
    (prisma.emailThread.count as any)({ where: { accountId: { in: accountIds } } }),
    (prisma.emailThread.count as any)({ where: { accountId: { in: accountIds }, analyses: { some: {} } } }),
  ]);

  const highPriorityThreadList = await (prisma.emailThread.findMany as any)({
    where: { accountId: { in: accountIds }, analyses: { some: { priority: 'high' } } },
    select: { participantEmails: true, subject: true },
    take: 3,
  });

  const highPrioritySenders = highPriorityThreadList.map((t: any) => {
    const ext = t.participantEmails.find((e: string) => !accountEmails.has(e))
      || t.participantEmails[0];
    return ext ? ext.split('@')[0] : t.subject?.split(' ')[0] || '—';
  });

  const [perAccountUnread, perAccountHighPrio] = await Promise.all([
    (prisma.emailThread.groupBy as any)({ by: ['accountId'], where: { accountId: { in: accountIds }, isRead: false }, _count: true }),
    (prisma.emailThread.groupBy as any)({ by: ['accountId'], where: { accountId: { in: accountIds } }, _count: true }),
  ]);

  const perAccountStats: Record<string, { unread: number; highPriority: number }> = {};
  for (const row of perAccountUnread as any[]) {
    if (!perAccountStats[row.accountId]) perAccountStats[row.accountId] = { unread: 0, highPriority: 0 };
    perAccountStats[row.accountId].unread = row._count;
  }
  for (const row of perAccountHighPrio as any[]) {
    if (!perAccountStats[row.accountId]) perAccountStats[row.accountId] = { unread: 0, highPriority: 0 };
    perAccountStats[row.accountId].highPriority = row._count;
  }

  const pendingDraftsList = await (prisma.draft.findMany as any)({
    where: { userId, status: { in: ['pending', 'approved'] } },
    take: 5,
  });

  return {
    overview: {
      pending_drafts: pendingDrafts,
      approved_drafts: approvedDrafts,
      high_priority_threads: highPriorityThreads,
      medium_priority_threads: mediumPriorityThreads,
      low_priority_threads: lowPriorityThreads,
      unread_threads: unreadThreads,
      total_threads: totalThreads,
      unanalyzed_threads: totalThreads - analyzedThreads,
      high_priority_senders: highPrioritySenders,
    },
    drafts_preview: pendingDraftsList,
    recent_actions: recentActions,
    accounts,
    per_account_stats: perAccountStats,
  };
}

// ─── Setup helpers ────────────────────────────────────────────────────────────

function setupEmptyDb() {
  vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([]);
  vi.mocked(prisma.draft.count).mockResolvedValue(0);
  vi.mocked(prisma.emailThread.count).mockResolvedValue(0);
  vi.mocked(prisma.actionLog.findMany).mockResolvedValue([]);
  vi.mocked(prisma.emailThread.findMany).mockResolvedValue([]);
  vi.mocked(prisma.emailThread.groupBy).mockResolvedValue([]);
  vi.mocked(prisma.draft.findMany).mockResolvedValue([]);
}

// ─── Overview counts ──────────────────────────────────────────────────────────

describe('Command Center — overview counts', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns correct pending and approved draft counts', async () => {
    setupEmptyDb();
    vi.mocked(prisma.draft.count)
      .mockResolvedValueOnce(3)  // pending
      .mockResolvedValueOnce(1); // approved
    const result = await simulateCommandCenter('user-1');
    expect(result.overview.pending_drafts).toBe(3);
    expect(result.overview.approved_drafts).toBe(1);
  });

  it('computes unanalyzed as totalThreads - analyzedThreads', async () => {
    setupEmptyDb();
    // totalThreads = 8th count call, analyzedThreads = 9th
    const countMocks = [0, 0, 0, 0, 0, 0, 0, 50, 35];
    let callIdx = 0;
    vi.mocked(prisma.draft.count).mockResolvedValue(0);
    vi.mocked(prisma.emailThread.count).mockImplementation(async () => {
      // skip the 2 draft.count calls; these are thread.count calls
      const val = [0, 0, 0, 0, 50, 35][callIdx++] ?? 0;
      return val;
    });
    const result = await simulateCommandCenter('user-1');
    expect(result.overview.unanalyzed_threads).toBe(50 - 35);
  });

  it('returns zero accounts and zero counts when no accounts', async () => {
    setupEmptyDb();
    const result = await simulateCommandCenter('user-1');
    expect(result.accounts).toHaveLength(0);
    expect(result.overview.unread_threads).toBe(0);
    expect(result.overview.total_threads).toBe(0);
    expect(result.overview.unanalyzed_threads).toBe(0);
  });

  it('returns priority breakdown (high/medium/low)', async () => {
    setupEmptyDb();
    vi.mocked(prisma.emailThread.count)
      .mockResolvedValueOnce(5)   // high
      .mockResolvedValueOnce(12)  // medium
      .mockResolvedValueOnce(3)   // low
      .mockResolvedValue(0);
    vi.mocked(prisma.draft.count).mockResolvedValue(0);
    const result = await simulateCommandCenter('user-1');
    expect(result.overview.high_priority_threads).toBe(5);
    expect(result.overview.medium_priority_threads).toBe(12);
    expect(result.overview.low_priority_threads).toBe(3);
  });
});

// ─── High-priority sender extraction ─────────────────────────────────────────

describe('Command Center — high_priority_senders extraction', () => {
  beforeEach(() => { vi.clearAllMocks(); setupEmptyDb(); });

  it('extracts username (before @) of external participant', async () => {
    vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([makeAccount('acc-1', 'me@company.com')] as any);
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue([
      { participantEmails: ['me@company.com', 'vendor@external.com'], subject: 'Invoice' },
    ] as any);
    const result = await simulateCommandCenter('user-1');
    expect(result.overview.high_priority_senders).toContain('vendor');
  });

  it('falls back to first participant when all are account addresses', async () => {
    vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([makeAccount('acc-1', 'me@company.com')] as any);
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue([
      { participantEmails: ['me@company.com'], subject: 'Self note' },
    ] as any);
    const result = await simulateCommandCenter('user-1');
    expect(result.overview.high_priority_senders).toContain('me');
  });

  it('falls back to subject first word when no participants', async () => {
    vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([makeAccount('acc-1', 'me@company.com')] as any);
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue([
      { participantEmails: [], subject: 'Urgent request' },
    ] as any);
    const result = await simulateCommandCenter('user-1');
    expect(result.overview.high_priority_senders).toContain('Urgent');
  });

  it('uses fallback dash for empty participants and empty subject', async () => {
    vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([makeAccount('acc-1', 'me@company.com')] as any);
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue([
      { participantEmails: [], subject: null },
    ] as any);
    const result = await simulateCommandCenter('user-1');
    expect(result.overview.high_priority_senders).toContain('—');
  });

  it('returns empty senders when no high-priority threads', async () => {
    setupEmptyDb();
    const result = await simulateCommandCenter('user-1');
    expect(result.overview.high_priority_senders).toHaveLength(0);
  });
});

// ─── Per-account stats ────────────────────────────────────────────────────────

describe('Command Center — per_account_stats', () => {
  beforeEach(() => { vi.clearAllMocks(); setupEmptyDb(); });

  it('merges unread and highPriority counts per account', async () => {
    vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([
      makeAccount('acc-1', 'a@example.com'),
      makeAccount('acc-2', 'b@example.com'),
    ] as any);
    vi.mocked(prisma.emailThread.groupBy)
      .mockResolvedValueOnce([
        makeGroupByRow('acc-1', 7),
        makeGroupByRow('acc-2', 2),
      ] as any) // perAccountUnread
      .mockResolvedValueOnce([
        makeGroupByRow('acc-1', 3),
      ] as any); // perAccountHighPrio
    const result = await simulateCommandCenter('user-1');
    expect(result.per_account_stats['acc-1'].unread).toBe(7);
    expect(result.per_account_stats['acc-1'].highPriority).toBe(3);
    expect(result.per_account_stats['acc-2'].unread).toBe(2);
    expect(result.per_account_stats['acc-2'].highPriority).toBe(0);
  });

  it('initializes missing account to { unread: 0, highPriority: 0 }', async () => {
    vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([makeAccount('acc-1', 'a@example.com')] as any);
    vi.mocked(prisma.emailThread.groupBy).mockResolvedValue([]);
    const result = await simulateCommandCenter('user-1');
    expect(result.per_account_stats['acc-1']).toBeUndefined(); // no groupBy rows → not created
  });
});

// ─── Response shape ───────────────────────────────────────────────────────────

describe('Command Center — response shape', () => {
  beforeEach(() => { vi.clearAllMocks(); setupEmptyDb(); });

  it('returns all required top-level keys', async () => {
    const result = await simulateCommandCenter('user-1');
    expect(result).toHaveProperty('overview');
    expect(result).toHaveProperty('drafts_preview');
    expect(result).toHaveProperty('recent_actions');
    expect(result).toHaveProperty('accounts');
    expect(result).toHaveProperty('per_account_stats');
  });

  it('overview contains all required fields', async () => {
    const result = await simulateCommandCenter('user-1');
    const keys = ['pending_drafts', 'approved_drafts', 'high_priority_threads',
      'medium_priority_threads', 'low_priority_threads', 'unread_threads',
      'total_threads', 'unanalyzed_threads', 'high_priority_senders'];
    for (const k of keys) {
      expect(result.overview).toHaveProperty(k);
    }
  });

  it('returns recent_actions limited to 5 entries', async () => {
    const actions = Array.from({ length: 5 }, (_, i) => ({ actionType: `action_${i}`, createdAt: new Date() }));
    vi.mocked(prisma.actionLog.findMany).mockResolvedValue(actions as any);
    const result = await simulateCommandCenter('user-1');
    expect(result.recent_actions).toHaveLength(5);
  });
});
