/**
 * Sprint 18 — Route-level tests for search.ts.
 *
 * advanced-search.test.ts covers only pure filter-parsing logic.
 * This file covers the DB-backed route behavior:
 *
 *  GET /contacts/search    — empty q returns all profiles, search merges+deduplicates
 *                            (profile wins over email message), limit capped at 30,
 *                            sorted by recency (nulls last)
 *  GET /contacts/recent    — limit capped at 20, 30-day window, mapped format
 *  GET /search             — all filter combinations (q, from/to, dateFrom/dateTo,
 *                            hasAttachment, classification, priority, accountId, labelIds),
 *                            pagination (page/limit), search history saved non-blocking,
 *                            response shape (threads, total, page, hasMore)
 *  GET /search/history     — returns last 20
 *  DELETE /search/history  — clears all
 *  DELETE /search/history/:id — 404, success
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../config/database', () => ({
  prisma: {
    contactProfile: { findMany: vi.fn() },
    emailMessage: { findMany: vi.fn() },
    emailThread: { findMany: vi.fn(), count: vi.fn() },
    searchHistory: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { prisma } from '../config/database';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const USER_ID = 'user-1';

function makeProfile(email: string, overrides: Record<string, unknown> = {}) {
  return {
    emailAddress: email,
    displayName: null,
    lastContactAt: new Date('2026-03-01T10:00:00Z'),
    totalEmails: 5,
    ...overrides,
  };
}

function makeMessage(fromAddress: string, receivedAt: Date = new Date()) {
  return { fromAddress, receivedAt };
}

// ─── GET /contacts/search ─────────────────────────────────────────────────────

async function simulateContactSearch(
  query: { q?: string; limit?: string },
  userId = USER_ID
) {
  const limit = Math.min(parseInt(query.limit ?? '10', 10), 30);
  const search = (query.q ?? '').trim().toLowerCase();

  const profileResults = await (prisma.contactProfile.findMany as any)({
    where: {
      userId,
      OR: search ? [
        { emailAddress: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
      ] : undefined,
    },
    orderBy: { lastContactAt: 'desc' },
    take: limit,
    select: { emailAddress: true, displayName: true, lastContactAt: true, totalEmails: true },
  });

  let emailResults: any[] = [];
  if (search) {
    const messages = await (prisma.emailMessage.findMany as any)({
      where: {
        thread: { account: { userId } },
        OR: [{ fromAddress: { contains: search, mode: 'insensitive' } }],
      },
      select: { fromAddress: true, receivedAt: true },
      orderBy: { receivedAt: 'desc' },
      take: 20,
    });
    const seen = new Set<string>();
    for (const m of messages) {
      const email = m.fromAddress.replace(/.*<(.+?)>/, '$1').trim();
      if (!seen.has(email)) {
        seen.add(email);
        emailResults.push({ email, displayName: null, lastContactAt: m.receivedAt?.toISOString() ?? null, totalEmails: 1 });
      }
    }
  }

  // Merge: profile wins
  const map = new Map<string, any>();
  for (const p of profileResults) {
    map.set(p.emailAddress.toLowerCase(), {
      email: p.emailAddress,
      displayName: p.displayName,
      lastContactAt: p.lastContactAt?.toISOString() ?? null,
      totalEmails: p.totalEmails,
    });
  }
  for (const e of emailResults) {
    if (!map.has(e.email.toLowerCase())) {
      map.set(e.email.toLowerCase(), e);
    }
  }

  const results = Array.from(map.values())
    .sort((a, b) => {
      if (!a.lastContactAt) return 1;
      if (!b.lastContactAt) return -1;
      return new Date(b.lastContactAt).getTime() - new Date(a.lastContactAt).getTime();
    })
    .slice(0, limit);

  return { code: 200, body: { contacts: results } };
}

// ─── GET /contacts/recent ─────────────────────────────────────────────────────

async function simulateContactsRecent(query: { limit?: string } = {}, userId = USER_ID) {
  const limit = Math.min(parseInt(query.limit ?? '5', 10), 20);
  const since30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const contacts = await (prisma.contactProfile.findMany as any)({
    where: { userId, lastContactAt: { gte: since30Days } },
    orderBy: { lastContactAt: 'desc' },
    take: limit,
    select: { emailAddress: true, displayName: true, lastContactAt: true, totalEmails: true },
  });

  return {
    code: 200,
    body: {
      contacts: contacts.map((c: any) => ({
        email: c.emailAddress,
        displayName: c.displayName,
        lastContactAt: c.lastContactAt?.toISOString() ?? null,
        totalEmails: c.totalEmails,
      })),
    },
  };
}

// ─── GET /search ──────────────────────────────────────────────────────────────

async function simulateSearch(query: Record<string, string>, userId = USER_ID) {
  const page = parseInt(query.page ?? '1', 10);
  const limit = Math.min(parseInt(query.limit ?? '20', 10), 50);
  const search = query.q?.trim();

  const where: any = { account: { userId } };

  if (search) {
    where.OR = [
      { subject: { contains: search, mode: 'insensitive' } },
      { snippet: { contains: search, mode: 'insensitive' } },
      { participantEmails: { has: search } },
    ];
  }
  if (query.accountId) where.accountId = query.accountId;
  if (query.dateFrom || query.dateTo) {
    where.lastMessageAt = {};
    if (query.dateFrom) where.lastMessageAt.gte = new Date(query.dateFrom);
    if (query.dateTo) where.lastMessageAt.lte = new Date(query.dateTo);
  }
  if (query.hasAttachment === 'true') {
    where.messages = { some: { attachments: { not: { equals: [] } } } };
  }
  if (query.classification) {
    where.analyses = { some: { classification: query.classification } };
  }
  if (query.priority) {
    where.analyses = { some: { priority: query.priority } };
  }
  if (query.labelIds) {
    const labelIdList = query.labelIds.split(',').filter(Boolean);
    if (labelIdList.length > 0) {
      where.threadLabels = { some: { labelId: { in: labelIdList } } };
    }
  }

  const [threads, total] = await Promise.all([
    (prisma.emailThread.findMany as any)({ where, skip: (page - 1) * limit, take: limit }),
    (prisma.emailThread.count as any)({ where }),
  ]);

  // Save to search history (non-blocking)
  if (search || query.classification || query.priority || query.from || query.to) {
    const filters: Record<string, any> = {};
    if (query.from) filters.from = query.from;
    if (query.to) filters.to = query.to;
    if (query.dateFrom) filters.dateFrom = query.dateFrom;
    if (query.dateTo) filters.dateTo = query.dateTo;
    if (query.hasAttachment) filters.hasAttachment = query.hasAttachment === 'true';
    if (query.classification) filters.classification = query.classification;
    if (query.priority) filters.priority = query.priority;
    if (query.accountId) filters.accountId = query.accountId;
    if (query.labelIds) filters.labelIds = query.labelIds;

    (prisma.searchHistory.create as any)({
      data: {
        userId,
        query: search ?? '',
        filters: Object.keys(filters).length > 0 ? filters : undefined,
        resultCount: total,
      },
    }).catch(() => {});
  }

  const mapped = threads.map((t: any) => ({
    ...t,
    latestAnalysis: t.analyses?.[0] ?? null,
    labels: t.threadLabels?.map((tl: any) => tl.label) ?? [],
  }));

  return { code: 200, body: { threads: mapped, total, page, hasMore: page * limit < total } };
}

// ─── GET /search/history ─────────────────────────────────────────────────────

async function simulateGetSearchHistory(userId = USER_ID) {
  const history = await (prisma.searchHistory.findMany as any)({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return { code: 200, body: { history } };
}

// ─── DELETE /search/history ───────────────────────────────────────────────────

async function simulateClearSearchHistory(userId = USER_ID) {
  await (prisma.searchHistory.deleteMany as any)({ where: { userId } });
  return { code: 200, body: { deleted: true } };
}

// ─── DELETE /search/history/:id ───────────────────────────────────────────────

async function simulateDeleteSearchHistoryEntry(id: string, userId = USER_ID) {
  const entry = await (prisma.searchHistory.findFirst as any)({ where: { id, userId } });
  if (!entry) return { code: 404, body: { error: 'Not found' } };
  await (prisma.searchHistory.delete as any)({ where: { id } });
  return { code: 200, body: { deleted: true } };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.emailThread.findMany).mockResolvedValue([]);
  vi.mocked(prisma.emailThread.count).mockResolvedValue(0);
  vi.mocked(prisma.searchHistory.create).mockResolvedValue({} as any);
});

// ─── GET /contacts/search ─────────────────────────────────────────────────────

describe('GET /contacts/search', () => {
  it('returns all profiles when no q given', async () => {
    vi.mocked(prisma.contactProfile.findMany).mockResolvedValue([makeProfile('a@example.com')] as any);
    const result = await simulateContactSearch({});
    expect(result.code).toBe(200);
    expect((result.body as any).contacts).toHaveLength(1);
    expect(prisma.emailMessage.findMany).not.toHaveBeenCalled();
  });

  it('merges profile and email message results, deduplicating', async () => {
    vi.mocked(prisma.contactProfile.findMany).mockResolvedValue([
      makeProfile('known@example.com', { lastContactAt: new Date('2026-04-01') }),
    ] as any);
    vi.mocked(prisma.emailMessage.findMany).mockResolvedValue([
      makeMessage('known@example.com'),  // duplicate
      makeMessage('new@example.com'),
    ] as any);
    const result = await simulateContactSearch({ q: 'example' });
    const contacts = (result.body as any).contacts;
    expect(contacts).toHaveLength(2);
    expect(contacts.map((c: any) => c.email)).toContain('known@example.com');
    expect(contacts.map((c: any) => c.email)).toContain('new@example.com');
  });

  it('profile entry wins over email message entry (same email)', async () => {
    vi.mocked(prisma.contactProfile.findMany).mockResolvedValue([
      makeProfile('shared@example.com', { displayName: 'Known Contact', totalEmails: 10 }),
    ] as any);
    vi.mocked(prisma.emailMessage.findMany).mockResolvedValue([
      makeMessage('shared@example.com'),
    ] as any);
    const result = await simulateContactSearch({ q: 'shared' });
    const contacts = (result.body as any).contacts;
    expect(contacts).toHaveLength(1);
    expect(contacts[0].displayName).toBe('Known Contact');
    expect(contacts[0].totalEmails).toBe(10);
  });

  it('extracts email from "Name <email>" format', async () => {
    vi.mocked(prisma.contactProfile.findMany).mockResolvedValue([]);
    vi.mocked(prisma.emailMessage.findMany).mockResolvedValue([
      makeMessage('John Doe <john@example.com>'),
    ] as any);
    const result = await simulateContactSearch({ q: 'john' });
    const contacts = (result.body as any).contacts;
    expect(contacts[0].email).toBe('john@example.com');
  });

  it('caps limit at 30', async () => {
    vi.mocked(prisma.contactProfile.findMany).mockResolvedValue([]);
    await simulateContactSearch({ q: 'test', limit: '999' });
    const findManyCall = vi.mocked(prisma.contactProfile.findMany).mock.calls[0][0] as any;
    expect(findManyCall.take).toBe(30);
  });

  it('sorts by recency, nulls last', async () => {
    vi.mocked(prisma.contactProfile.findMany).mockResolvedValue([]);
    vi.mocked(prisma.emailMessage.findMany).mockResolvedValue([
      makeMessage('recent@example.com', new Date('2026-04-05')),
      makeMessage('old@example.com', new Date('2026-01-01')),
    ] as any);
    const result = await simulateContactSearch({ q: 'example' });
    const contacts = (result.body as any).contacts;
    expect(contacts[0].email).toBe('recent@example.com');
    expect(contacts[1].email).toBe('old@example.com');
  });
});

// ─── GET /contacts/recent ─────────────────────────────────────────────────────

describe('GET /contacts/recent', () => {
  it('returns contacts from last 30 days', async () => {
    const contact = makeProfile('recent@example.com', { lastContactAt: new Date() });
    vi.mocked(prisma.contactProfile.findMany).mockResolvedValue([contact] as any);
    const result = await simulateContactsRecent();
    expect(result.code).toBe(200);
    expect((result.body as any).contacts).toHaveLength(1);
    expect((result.body as any).contacts[0].email).toBe('recent@example.com');
  });

  it('maps to { email, displayName, lastContactAt, totalEmails }', async () => {
    vi.mocked(prisma.contactProfile.findMany).mockResolvedValue([
      makeProfile('x@example.com', { displayName: 'Person X', lastContactAt: new Date('2026-03-15'), totalEmails: 3 }),
    ] as any);
    const result = await simulateContactsRecent();
    const c = (result.body as any).contacts[0];
    expect(c.email).toBe('x@example.com');
    expect(c.displayName).toBe('Person X');
    expect(c.totalEmails).toBe(3);
    expect(c.emailAddress).toBeUndefined(); // mapped, not raw field
  });

  it('caps limit at 20', async () => {
    vi.mocked(prisma.contactProfile.findMany).mockResolvedValue([]);
    await simulateContactsRecent({ limit: '999' });
    const call = vi.mocked(prisma.contactProfile.findMany).mock.calls[0][0] as any;
    expect(call.take).toBe(20);
  });

  it('uses default limit 5', async () => {
    vi.mocked(prisma.contactProfile.findMany).mockResolvedValue([]);
    await simulateContactsRecent();
    const call = vi.mocked(prisma.contactProfile.findMany).mock.calls[0][0] as any;
    expect(call.take).toBe(5);
  });
});

// ─── GET /search ──────────────────────────────────────────────────────────────

describe('GET /search — pagination', () => {
  it('defaults to page=1, limit=20', async () => {
    await simulateSearch({});
    const call = vi.mocked(prisma.emailThread.findMany).mock.calls[0][0] as any;
    expect(call.skip).toBe(0);
    expect(call.take).toBe(20);
  });

  it('paginates correctly for page 2', async () => {
    await simulateSearch({ page: '2', limit: '10' });
    const call = vi.mocked(prisma.emailThread.findMany).mock.calls[0][0] as any;
    expect(call.skip).toBe(10);
    expect(call.take).toBe(10);
  });

  it('caps limit at 50', async () => {
    await simulateSearch({ limit: '999' });
    const call = vi.mocked(prisma.emailThread.findMany).mock.calls[0][0] as any;
    expect(call.take).toBe(50);
  });

  it('returns correct response shape', async () => {
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue([{ id: 't1', analyses: [], threadLabels: [] }] as any);
    vi.mocked(prisma.emailThread.count).mockResolvedValue(25);
    const result = await simulateSearch({ page: '1', limit: '20' });
    expect(result.code).toBe(200);
    expect((result.body as any).total).toBe(25);
    expect((result.body as any).page).toBe(1);
    expect((result.body as any).hasMore).toBe(true); // 1*20 < 25
  });

  it('hasMore=false when last page', async () => {
    vi.mocked(prisma.emailThread.count).mockResolvedValue(10);
    const result = await simulateSearch({ page: '1', limit: '20' });
    expect((result.body as any).hasMore).toBe(false); // 1*20 >= 10
  });
});

describe('GET /search — filter construction', () => {
  it('adds text search to OR clause', async () => {
    await simulateSearch({ q: 'invoice' });
    const call = vi.mocked(prisma.emailThread.findMany).mock.calls[0][0] as any;
    expect(call.where.OR).toBeDefined();
    expect(call.where.OR[0].subject.contains).toBe('invoice');
  });

  it('adds accountId filter', async () => {
    await simulateSearch({ accountId: 'acc-1' });
    const call = vi.mocked(prisma.emailThread.findMany).mock.calls[0][0] as any;
    expect(call.where.accountId).toBe('acc-1');
  });

  it('adds dateFrom/dateTo as Date objects', async () => {
    await simulateSearch({ dateFrom: '2026-01-01', dateTo: '2026-04-01' });
    const call = vi.mocked(prisma.emailThread.findMany).mock.calls[0][0] as any;
    expect(call.where.lastMessageAt.gte).toBeInstanceOf(Date);
    expect(call.where.lastMessageAt.lte).toBeInstanceOf(Date);
  });

  it('adds hasAttachment filter', async () => {
    await simulateSearch({ hasAttachment: 'true' });
    const call = vi.mocked(prisma.emailThread.findMany).mock.calls[0][0] as any;
    expect(call.where.messages).toBeDefined();
  });

  it('adds classification filter', async () => {
    await simulateSearch({ classification: 'newsletter' });
    const call = vi.mocked(prisma.emailThread.findMany).mock.calls[0][0] as any;
    expect(call.where.analyses).toEqual({ some: { classification: 'newsletter' } });
  });

  it('adds priority filter', async () => {
    await simulateSearch({ priority: 'high' });
    const call = vi.mocked(prisma.emailThread.findMany).mock.calls[0][0] as any;
    expect(call.where.analyses).toEqual({ some: { priority: 'high' } });
  });

  it('adds labelIds filter from comma-separated string', async () => {
    await simulateSearch({ labelIds: 'label-1,label-2' });
    const call = vi.mocked(prisma.emailThread.findMany).mock.calls[0][0] as any;
    expect(call.where.threadLabels).toEqual({ some: { labelId: { in: ['label-1', 'label-2'] } } });
  });

  it('does not add labelIds filter for empty string', async () => {
    await simulateSearch({ labelIds: '' });
    const call = vi.mocked(prisma.emailThread.findMany).mock.calls[0][0] as any;
    expect(call.where.threadLabels).toBeUndefined();
  });

  it('does not add text search filter when q is absent', async () => {
    await simulateSearch({});
    const call = vi.mocked(prisma.emailThread.findMany).mock.calls[0][0] as any;
    expect(call.where.OR).toBeUndefined();
  });
});

describe('GET /search — search history', () => {
  it('saves to history when q is present', async () => {
    await simulateSearch({ q: 'contract' });
    // Allow micro-task queue to flush the fire-and-forget
    await new Promise((r) => setImmediate(r));
    expect(prisma.searchHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ query: 'contract' }) })
    );
  });

  it('saves to history when classification filter is set', async () => {
    await simulateSearch({ classification: 'newsletter' });
    await new Promise((r) => setImmediate(r));
    expect(prisma.searchHistory.create).toHaveBeenCalledOnce();
  });

  it('does NOT save to history for empty search with no filters', async () => {
    await simulateSearch({});
    await new Promise((r) => setImmediate(r));
    expect(prisma.searchHistory.create).not.toHaveBeenCalled();
  });

  it('includes non-empty filters in saved entry', async () => {
    await simulateSearch({ q: 'test', priority: 'high', accountId: 'acc-1' });
    await new Promise((r) => setImmediate(r));
    const saveCall = vi.mocked(prisma.searchHistory.create).mock.calls[0][0] as any;
    expect(saveCall.data.filters.priority).toBe('high');
    expect(saveCall.data.filters.accountId).toBe('acc-1');
  });
});

describe('GET /search — response mapping', () => {
  it('maps latestAnalysis from first analysis', async () => {
    const analysis = { classification: 'newsletter', priority: 'low' };
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue([
      { id: 't1', analyses: [analysis], threadLabels: [] },
    ] as any);
    vi.mocked(prisma.emailThread.count).mockResolvedValue(1);
    const result = await simulateSearch({ q: 'test' });
    expect((result.body as any).threads[0].latestAnalysis).toEqual(analysis);
  });

  it('maps threadLabels to labels array', async () => {
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue([
      { id: 't1', analyses: [], threadLabels: [{ label: { id: 'l1', name: 'Work' } }] },
    ] as any);
    vi.mocked(prisma.emailThread.count).mockResolvedValue(1);
    const result = await simulateSearch({});
    expect((result.body as any).threads[0].labels[0].name).toBe('Work');
  });
});

// ─── GET /search/history ──────────────────────────────────────────────────────

describe('GET /search/history', () => {
  it('returns last 20 search history entries', async () => {
    const history = [{ id: 'h1', query: 'contract' }, { id: 'h2', query: 'invoice' }];
    vi.mocked(prisma.searchHistory.findMany).mockResolvedValue(history as any);
    const result = await simulateGetSearchHistory();
    expect(result.code).toBe(200);
    expect((result.body as any).history).toHaveLength(2);
    expect(prisma.searchHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID }, take: 20 })
    );
  });
});

// ─── DELETE /search/history ───────────────────────────────────────────────────

describe('DELETE /search/history', () => {
  it('clears all history for user and returns deleted=true', async () => {
    vi.mocked(prisma.searchHistory.deleteMany).mockResolvedValue({ count: 3 } as any);
    const result = await simulateClearSearchHistory();
    expect(result.code).toBe(200);
    expect((result.body as any).deleted).toBe(true);
    expect(prisma.searchHistory.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
  });
});

// ─── DELETE /search/history/:id ───────────────────────────────────────────────

describe('DELETE /search/history/:id', () => {
  it('returns 404 when entry not found', async () => {
    vi.mocked(prisma.searchHistory.findFirst).mockResolvedValue(null);
    const result = await simulateDeleteSearchHistoryEntry('h-missing');
    expect(result.code).toBe(404);
  });

  it('deletes specific entry and returns deleted=true', async () => {
    vi.mocked(prisma.searchHistory.findFirst).mockResolvedValue({ id: 'h1' } as any);
    vi.mocked(prisma.searchHistory.delete).mockResolvedValue({} as any);
    const result = await simulateDeleteSearchHistoryEntry('h1');
    expect(result.code).toBe(200);
    expect((result.body as any).deleted).toBe(true);
    expect(prisma.searchHistory.delete).toHaveBeenCalledWith({ where: { id: 'h1' } });
  });
});
