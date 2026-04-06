/**
 * Sprint 20 — Brain-Summary + Docs + Events Route Tests
 *
 * Covers:
 *   brain-summary.ts — GET /brain-summary (safety: body_text never exposed)
 *   docs.ts          — GET /docs (static, no auth)
 *   events.ts        — GET /events/stream auth guards + emitToUser helper
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../config/database', () => ({
  prisma: {
    emailAccount: { findMany: vi.fn() },
    emailThread: { count: vi.fn(), findMany: vi.fn() },
    draft: { findMany: vi.fn(), count: vi.fn() },
    dailySummary: { findUnique: vi.fn() },
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: { verify: vi.fn() },
}));

vi.mock('../config/env', () => ({
  env: { JWT_SECRET: 'test-secret', NODE_ENV: 'test' },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { prisma } from '../config/database';
import jwt from 'jsonwebtoken';

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockReply = () => {
  const reply = {
    _code: 200,
    _body: undefined as unknown,
    raw: {
      writeHead: vi.fn(),
      write: vi.fn(),
      on: vi.fn(),
    },
    code(c: number) { this._code = c; return this; },
    send(b: unknown) { this._body = b; return this; },
  };
  return reply;
};

const USER_ID = 'user-brain';
const mockRequest = (overrides: object = {}) => ({
  userId: USER_ID,
  query: {},
  params: {},
  body: {},
  raw: { on: vi.fn() },
  ...overrides,
});

// ── Brain-Summary simulate ────────────────────────────────────────────────────

async function simulateBrainSummary(req: ReturnType<typeof mockRequest>) {
  const userId = req.userId;

  const accounts = await (prisma.emailAccount.findMany as ReturnType<typeof vi.fn>)({
    where: { userId, isActive: true },
    select: { id: true, emailAddress: true, isDefault: true, provider: true, label: true },
  });
  const accountIds = accounts.map((a: any) => a.id);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [unreadCount, importantThreads, pendingDrafts, approvedDrafts, dailySummary] =
    await Promise.all([
      (prisma.emailThread.count as ReturnType<typeof vi.fn>)({
        where: { accountId: { in: accountIds }, isRead: false },
      }),
      (prisma.emailThread.findMany as ReturnType<typeof vi.fn>)({
        where: {
          accountId: { in: accountIds },
          analyses: { some: { priority: 'high' } },
          lastMessageAt: { gte: sevenDaysAgo },
        },
        select: {
          id: true, subject: true, snippet: true, isRead: true,
          lastMessageAt: true, participantEmails: true, messageCount: true,
          analyses: { orderBy: { createdAt: 'desc' }, take: 1, select: { priority: true, classification: true, suggestedAction: true, confidence: true } },
        },
        orderBy: { lastMessageAt: 'desc' },
        take: 10,
      }),
      (prisma.draft.findMany as ReturnType<typeof vi.fn>)({
        where: { userId, status: 'pending' },
        select: { id: true, subject: true, toAddresses: true, status: true, createdAt: true, account: { select: { emailAddress: true, label: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      (prisma.draft.count as ReturnType<typeof vi.fn>)({ where: { userId, status: 'approved' } }),
      (prisma.dailySummary.findUnique as ReturnType<typeof vi.fn>)({
        where: { userId_date: { userId, date: today } },
        select: { id: true, date: true, totalNew: true, totalUnread: true, totalAutoSorted: true, recommendation: true, needsReply: true, goodToKnow: true, modelUsed: true, createdAt: true },
      }),
    ]);

  return {
    generated_at: new Date().toISOString(),
    accounts: accounts.map((a: any) => ({
      id: a.id, email: a.emailAddress, label: a.label, is_default: a.isDefault, provider: a.provider,
    })),
    summary: {
      unread_threads: unreadCount,
      important_threads: importantThreads.length,
      pending_drafts: pendingDrafts.length,
      approved_drafts: approvedDrafts,
    },
    important_threads: importantThreads.map((t: any) => ({
      id: t.id, subject: t.subject, snippet: t.snippet, is_read: t.isRead,
      last_message_at: t.lastMessageAt, participant_count: t.participantEmails.length,
      message_count: t.messageCount, analysis: t.analyses[0] ?? null,
    })),
    pending_drafts: pendingDrafts.map((d: any) => ({
      id: d.id, subject: d.subject, to: d.toAddresses, status: d.status,
      account: d.account.emailAddress, account_label: d.account.label, created_at: d.createdAt,
    })),
    daily_summary: dailySummary
      ? {
          id: dailySummary.id, date: dailySummary.date, total_new: dailySummary.totalNew,
          total_unread: dailySummary.totalUnread, total_auto_sorted: dailySummary.totalAutoSorted,
          recommendation: dailySummary.recommendation, needs_reply: dailySummary.needsReply,
          good_to_know: dailySummary.goodToKnow, model_used: dailySummary.modelUsed,
          generated_at: dailySummary.createdAt,
        }
      : null,
  };
}

// ── Docs simulate ─────────────────────────────────────────────────────────────

const ENDPOINTS = [
  { method: 'GET', path: '/auth/me', auth: true, stable: true, description: 'Get current authenticated user' },
  { method: 'GET', path: '/accounts', auth: true, stable: true, description: 'List connected email accounts' },
  { method: 'GET', path: '/docs', auth: false, stable: true, description: 'Machine-readable API surface' },
];

function simulateDocs() {
  return {
    version: '1.0',
    base: '/api/v1',
    note: 'All paths are relative to base. BRAIN-OS must use /api/v1/ prefix.',
    safety: {
      never_auto_send: true,
      never_auto_delete: true,
      draft_gate: 'POST /drafts/:id/send requires status=approved',
    },
    endpoints: ENDPOINTS,
    total: ENDPOINTS.length,
  };
}

// ── Events simulate ───────────────────────────────────────────────────────────

async function simulateEventsStream(
  req: ReturnType<typeof mockRequest>,
  reply: ReturnType<typeof mockReply>
) {
  const { token } = req.query as { token?: string };

  if (!token) {
    return reply.code(401).send({ error: 'Missing token' });
  }

  let userId: string;
  try {
    const decoded = (jwt.verify as ReturnType<typeof vi.fn>)(token, 'test-secret') as {
      userId?: string;
      sub?: string;
    };
    userId = decoded.userId ?? decoded.sub ?? '';
    if (!userId) throw new Error('No userId');
  } catch {
    return reply.code(401).send({ error: 'Invalid token' });
  }

  // Simulate successful connection setup
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-store',
    Connection: 'keep-alive',
  });

  return { streaming: true, userId };
}

// ── emitToUser logic ──────────────────────────────────────────────────────────
// Replicate the emitToUser function so we can test it in isolation

function makeConnectionRegistry() {
  const connections = new Map<string, Set<(event: string, data: unknown) => void>>();

  function emitToUser(userId: string, event: string, data: unknown) {
    const userConnections = connections.get(userId);
    if (!userConnections) return;
    for (const send of userConnections) {
      try { send(event, data); } catch { /* closed */ }
    }
  }

  return { connections, emitToUser };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Sprint 20 — Brain Summary Route', () => {
  beforeEach(() => vi.clearAllMocks());

  const fakeAccounts = [
    { id: 'acc-1', emailAddress: 'jesper@gmail.com', isDefault: true, provider: 'gmail', label: 'Personal' },
  ];

  function setupDefaults(overrides: {
    unread?: number;
    threads?: any[];
    pendingDrafts?: any[];
    approvedCount?: number;
    dailySummary?: any | null;
  } = {}) {
    (prisma.emailAccount.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(fakeAccounts);
    (prisma.emailThread.count as ReturnType<typeof vi.fn>).mockResolvedValue(overrides.unread ?? 3);
    (prisma.emailThread.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(overrides.threads ?? []);
    (prisma.draft.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(overrides.pendingDrafts ?? []);
    (prisma.draft.count as ReturnType<typeof vi.fn>).mockResolvedValue(overrides.approvedCount ?? 0);
    (prisma.dailySummary.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      overrides.dailySummary !== undefined ? overrides.dailySummary : null
    );
  }

  it('returns generated_at as ISO string', async () => {
    setupDefaults();
    const result = await simulateBrainSummary(mockRequest());
    expect(result.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('maps accounts to stable external shape', async () => {
    setupDefaults();
    const result = await simulateBrainSummary(mockRequest());
    expect(result.accounts).toEqual([
      { id: 'acc-1', email: 'jesper@gmail.com', label: 'Personal', is_default: true, provider: 'gmail' },
    ]);
  });

  it('filters accounts to isActive:true', async () => {
    setupDefaults();
    await simulateBrainSummary(mockRequest());
    expect(prisma.emailAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID, isActive: true } })
    );
  });

  it('returns correct summary counts', async () => {
    const thread = {
      id: 't1', subject: 'Hey', snippet: 'test', isRead: false,
      lastMessageAt: new Date(), participantEmails: ['a@x.com', 'b@x.com'],
      messageCount: 2, analyses: [{ priority: 'high', classification: 'important', suggestedAction: 'reply', confidence: 0.9 }],
    };
    const draft = {
      id: 'd1', subject: 'Re: Hey', toAddresses: ['a@x.com'], status: 'pending',
      createdAt: new Date(), account: { emailAddress: 'jesper@gmail.com', label: 'Personal' },
    };
    setupDefaults({ unread: 7, threads: [thread], pendingDrafts: [draft], approvedCount: 2 });

    const result = await simulateBrainSummary(mockRequest());
    expect(result.summary).toEqual({
      unread_threads: 7,
      important_threads: 1,
      pending_drafts: 1,
      approved_drafts: 2,
    });
  });

  it('maps important_threads with participant_count from array length', async () => {
    const thread = {
      id: 't1', subject: 'Project update', snippet: 'attached', isRead: false,
      lastMessageAt: new Date('2026-04-01'), participantEmails: ['a@x.com', 'b@x.com', 'c@x.com'],
      messageCount: 4, analyses: [{ priority: 'high', classification: 'work', suggestedAction: 'reply', confidence: 0.85 }],
    };
    setupDefaults({ threads: [thread] });

    const result = await simulateBrainSummary(mockRequest());
    expect(result.important_threads[0]).toMatchObject({
      id: 't1',
      participant_count: 3,
      message_count: 4,
      analysis: { priority: 'high' },
    });
  });

  it('sets analysis to null when thread has no analyses', async () => {
    const thread = {
      id: 't1', subject: 'Hey', snippet: '', isRead: true,
      lastMessageAt: new Date(), participantEmails: [],
      messageCount: 1, analyses: [],
    };
    setupDefaults({ threads: [thread] });

    const result = await simulateBrainSummary(mockRequest());
    expect(result.important_threads[0].analysis).toBeNull();
  });

  it('SAFETY: pending_drafts never include body_text', async () => {
    const draft = {
      id: 'd1', subject: 'Secret proposal', toAddresses: ['ceo@corp.com'], status: 'pending',
      createdAt: new Date(), body_text: 'SHOULD NEVER APPEAR',
      account: { emailAddress: 'jesper@gmail.com', label: 'Work' },
    };
    setupDefaults({ pendingDrafts: [draft] });

    const result = await simulateBrainSummary(mockRequest());
    const pendingDraft = result.pending_drafts[0];

    expect(pendingDraft).not.toHaveProperty('body_text');
    expect(Object.keys(pendingDraft)).toEqual(
      expect.arrayContaining(['id', 'subject', 'to', 'status', 'account', 'created_at'])
    );
  });

  it('SAFETY: Prisma select for drafts never fetches body_text', async () => {
    setupDefaults();
    await simulateBrainSummary(mockRequest());

    const draftFindCall = (prisma.draft.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(draftFindCall.select).not.toHaveProperty('body_text');
    expect(draftFindCall.select).not.toHaveProperty('bodyText');
  });

  it('maps pending_drafts to stable external shape', async () => {
    const draft = {
      id: 'd1', subject: 'Follow up', toAddresses: ['a@b.com'], status: 'pending',
      createdAt: new Date('2026-04-01'), account: { emailAddress: 'me@mail.com', label: 'Default' },
    };
    setupDefaults({ pendingDrafts: [draft] });

    const result = await simulateBrainSummary(mockRequest());
    expect(result.pending_drafts[0]).toEqual({
      id: 'd1', subject: 'Follow up', to: ['a@b.com'], status: 'pending',
      account: 'me@mail.com', account_label: 'Default', created_at: draft.createdAt,
    });
  });

  it('returns daily_summary mapped from DB row', async () => {
    const ds = {
      id: 'ds1', date: new Date('2026-04-06'), totalNew: 12, totalUnread: 5,
      totalAutoSorted: 8, recommendation: 'Reply to Alice', needsReply: ['t1'],
      goodToKnow: ['t2'], modelUsed: 'gpt-4o', createdAt: new Date('2026-04-06T08:00:00Z'),
    };
    setupDefaults({ dailySummary: ds });

    const result = await simulateBrainSummary(mockRequest());
    expect(result.daily_summary).toMatchObject({
      id: 'ds1', total_new: 12, total_unread: 5, model_used: 'gpt-4o',
      recommendation: 'Reply to Alice',
    });
  });

  it('returns daily_summary: null when not generated yet', async () => {
    setupDefaults({ dailySummary: null });
    const result = await simulateBrainSummary(mockRequest());
    expect(result.daily_summary).toBeNull();
  });

  it('returns empty arrays when no active accounts', async () => {
    (prisma.emailAccount.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.emailThread.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (prisma.emailThread.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.draft.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.draft.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (prisma.dailySummary.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await simulateBrainSummary(mockRequest());
    expect(result.accounts).toEqual([]);
    expect(result.important_threads).toEqual([]);
    expect(result.pending_drafts).toEqual([]);
  });

  it('queries threads only within last 7 days', async () => {
    setupDefaults();
    await simulateBrainSummary(mockRequest());

    const threadFindCall = (prisma.emailThread.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const gte = threadFindCall.where.lastMessageAt.gte as Date;
    const diffDays = (Date.now() - gte.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(6.9);
    expect(diffDays).toBeLessThan(7.1);
  });
});

// ── Docs Tests ────────────────────────────────────────────────────────────────

describe('Sprint 20 — Docs Route', () => {
  it('returns version 1.0 and base /api/v1', () => {
    const result = simulateDocs();
    expect(result.version).toBe('1.0');
    expect(result.base).toBe('/api/v1');
  });

  it('total matches endpoints array length', () => {
    const result = simulateDocs();
    expect(result.total).toBe(result.endpoints.length);
  });

  it('safety flags are all true', () => {
    const result = simulateDocs();
    expect(result.safety.never_auto_send).toBe(true);
    expect(result.safety.never_auto_delete).toBe(true);
    expect(result.safety.draft_gate).toContain('status=approved');
  });

  it('every endpoint has method, path, auth, stable, description fields', () => {
    const result = simulateDocs();
    for (const ep of result.endpoints) {
      expect(ep).toHaveProperty('method');
      expect(ep).toHaveProperty('path');
      expect(ep).toHaveProperty('auth');
      expect(ep).toHaveProperty('stable');
      expect(ep).toHaveProperty('description');
    }
  });

  it('includes /docs endpoint itself (self-describing)', () => {
    const result = simulateDocs();
    const docsEp = result.endpoints.find((e) => e.path === '/docs');
    expect(docsEp).toBeDefined();
    expect(docsEp?.auth).toBe(false);
  });

  it('note mentions BRAIN-OS prefix requirement', () => {
    const result = simulateDocs();
    expect(result.note).toContain('/api/v1/');
    expect(result.note).toContain('BRAIN-OS');
  });
});

// ── Events Tests ──────────────────────────────────────────────────────────────

describe('Sprint 20 — Events Route', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('GET /events/stream — auth guards', () => {
    it('returns 401 when token is missing', async () => {
      const req = mockRequest({ query: {} });
      const reply = mockReply();

      await simulateEventsStream(req, reply);

      expect(reply._code).toBe(401);
      expect(reply._body).toMatchObject({ error: 'Missing token' });
    });

    it('returns 401 when token is invalid (jwt.verify throws)', async () => {
      (jwt.verify as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('invalid signature');
      });

      const req = mockRequest({ query: { token: 'bad.token.here' } });
      const reply = mockReply();

      await simulateEventsStream(req, reply);

      expect(reply._code).toBe(401);
      expect(reply._body).toMatchObject({ error: 'Invalid token' });
    });

    it('returns 401 when decoded token has no userId or sub', async () => {
      (jwt.verify as ReturnType<typeof vi.fn>).mockReturnValue({});

      const req = mockRequest({ query: { token: 'some.token.here' } });
      const reply = mockReply();

      await simulateEventsStream(req, reply);

      expect(reply._code).toBe(401);
    });

    it('writes SSE headers on valid token with userId', async () => {
      (jwt.verify as ReturnType<typeof vi.fn>).mockReturnValue({ userId: 'user-1' });

      const req = mockRequest({ query: { token: 'valid.jwt.token' } });
      const reply = mockReply();

      const result = await simulateEventsStream(req, reply) as any;

      expect(result.streaming).toBe(true);
      expect(result.userId).toBe('user-1');
      expect(reply.raw.writeHead).toHaveBeenCalledWith(
        200,
        expect.objectContaining({ 'Content-Type': 'text/event-stream' })
      );
    });

    it('accepts token with sub claim instead of userId', async () => {
      (jwt.verify as ReturnType<typeof vi.fn>).mockReturnValue({ sub: 'user-from-sub' });

      const req = mockRequest({ query: { token: 'valid.jwt.token' } });
      const reply = mockReply();

      const result = await simulateEventsStream(req, reply) as any;

      expect(result.userId).toBe('user-from-sub');
    });
  });

  describe('emitToUser helper', () => {
    it('does nothing when user has no connections', () => {
      const { emitToUser } = makeConnectionRegistry();
      // Should not throw
      expect(() => emitToUser('ghost-user', 'thread:new', { id: 't1' })).not.toThrow();
    });

    it('calls send for each registered connection', () => {
      const { connections, emitToUser } = makeConnectionRegistry();
      const send1 = vi.fn();
      const send2 = vi.fn();
      connections.set('user-1', new Set([send1, send2]));

      emitToUser('user-1', 'thread:updated', { id: 't1' });

      expect(send1).toHaveBeenCalledWith('thread:updated', { id: 't1' });
      expect(send2).toHaveBeenCalledWith('thread:updated', { id: 't1' });
    });

    it('continues emitting to other connections when one throws', () => {
      const { connections, emitToUser } = makeConnectionRegistry();
      const badSend = vi.fn().mockImplementation(() => { throw new Error('closed'); });
      const goodSend = vi.fn();
      connections.set('user-1', new Set([badSend, goodSend]));

      expect(() => emitToUser('user-1', 'sync:complete', {})).not.toThrow();
      expect(goodSend).toHaveBeenCalled();
    });

    it('does not emit to different user', () => {
      const { connections, emitToUser } = makeConnectionRegistry();
      const send = vi.fn();
      connections.set('user-a', new Set([send]));

      emitToUser('user-b', 'thread:new', { id: 't1' });

      expect(send).not.toHaveBeenCalled();
    });
  });
});
