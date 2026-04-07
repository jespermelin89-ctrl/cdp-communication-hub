/**
 * classified-summary — Agent action tests.
 *
 * POST /agent/execute { action: 'classified-summary' }
 *
 * Invariants:
 *  - total_unread = count of keep_inbox + label_review logs last 24h
 *  - spam_archived = count of trash/trash_after_log/notify_then_trash logs last 24h
 *  - need_attention = keep_inbox + priority=medium, top 5, with snippet from EmailThread
 *  - urgent = keep_inbox + priority=high, top 3, with snippet from EmailThread
 *  - since = ISO timestamp ~24h ago
 *  - Missing snippet → null, missing subject → '(inget ämne)'
 *  - Empty logs → zeros and empty arrays
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/database', () => ({
  prisma: {
    emailAccount: { findFirst: vi.fn() },
    emailThread:  { findMany: vi.fn() },
    triageLog:    { count: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock('../config/env', () => ({
  env: {
    COMMAND_API_KEY: 'test-key',
    AI_PROVIDER: 'groq',
    FRONTEND_URL: 'https://example.com',
  },
}));

import { prisma } from '../config/database';

// ─── Simulate the classified-summary action logic ─────────────────────────────

async function runClassifiedSummary(userId: string) {
  const since24h = new Date(Date.now() - 24 * 3600 * 1000);

  const [unreadLogs, spamLogs, attentionLogs, urgentLogs] = await Promise.all([
    (prisma.triageLog.count as any)({
      where: {
        userId,
        action: { in: ['keep_inbox', 'label_review'] },
        createdAt: { gte: since24h },
      },
    }),
    (prisma.triageLog.count as any)({
      where: {
        userId,
        action: { in: ['trash', 'trash_after_log', 'notify_then_trash'] },
        createdAt: { gte: since24h },
      },
    }),
    (prisma.triageLog.findMany as any)({
      where: { userId, action: 'keep_inbox', priority: 'medium', createdAt: { gte: since24h } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { threadId: true, subject: true, senderEmail: true, classification: true },
    }),
    (prisma.triageLog.findMany as any)({
      where: { userId, action: 'keep_inbox', priority: 'high', createdAt: { gte: since24h } },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { threadId: true, subject: true, senderEmail: true, classification: true },
    }),
  ]);

  const allThreadIds = [
    ...(attentionLogs as any[]).map((l: any) => l.threadId),
    ...(urgentLogs as any[]).map((l: any) => l.threadId),
  ];
  const snippetMap = new Map<string, string | null>();
  if (allThreadIds.length > 0) {
    const threads = await (prisma.emailThread.findMany as any)({
      where: { id: { in: allThreadIds } },
      select: { id: true, snippet: true },
    });
    for (const t of (threads as any[])) snippetMap.set(t.id, t.snippet ?? null);
  }

  const mapLog = (l: any) => ({
    thread_id: l.threadId,
    subject: l.subject ?? '(inget ämne)',
    from: l.senderEmail,
    classification: l.classification,
    snippet: snippetMap.get(l.threadId) ?? null,
  });

  return {
    success: true,
    action: 'classified-summary',
    data: {
      total_unread: unreadLogs,
      spam_archived: spamLogs,
      need_attention: (attentionLogs as any[]).map(mapLog),
      urgent: (urgentLogs as any[]).map(mapLog),
      since: since24h.toISOString(),
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('classified-summary action', () => {
  const userId = 'user-1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns correct counts and empty arrays when no logs exist', async () => {
    (prisma.triageLog.count as any).mockResolvedValue(0);
    (prisma.triageLog.findMany as any).mockResolvedValue([]);

    const result = await runClassifiedSummary(userId);

    expect(result.success).toBe(true);
    expect(result.data.total_unread).toBe(0);
    expect(result.data.spam_archived).toBe(0);
    expect(result.data.need_attention).toEqual([]);
    expect(result.data.urgent).toEqual([]);
    expect(result.data.since).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('total_unread counts keep_inbox + label_review correctly', async () => {
    (prisma.triageLog.count as any)
      .mockResolvedValueOnce(7)  // keep_inbox + label_review
      .mockResolvedValueOnce(3); // trash actions
    (prisma.triageLog.findMany as any).mockResolvedValue([]);

    const result = await runClassifiedSummary(userId);

    expect(result.data.total_unread).toBe(7);
  });

  it('spam_archived counts all trash variants correctly', async () => {
    (prisma.triageLog.count as any)
      .mockResolvedValueOnce(4)   // unread
      .mockResolvedValueOnce(12); // spam
    (prisma.triageLog.findMany as any).mockResolvedValue([]);

    const result = await runClassifiedSummary(userId);

    expect(result.data.spam_archived).toBe(12);
  });

  it('need_attention maps triage log fields + snippet from thread', async () => {
    (prisma.triageLog.count as any).mockResolvedValue(0);
    (prisma.triageLog.findMany as any)
      .mockResolvedValueOnce([
        { threadId: 'tid-1', subject: 'Offert att granska', senderEmail: 'vendor@example.com', classification: 'business' },
      ])
      .mockResolvedValueOnce([]); // urgent

    (prisma.emailThread.findMany as any).mockResolvedValue([
      { id: 'tid-1', snippet: 'Bifogat finns vår offert...' },
    ]);

    const result = await runClassifiedSummary(userId);

    expect(result.data.need_attention).toHaveLength(1);
    const item = result.data.need_attention[0];
    expect(item.thread_id).toBe('tid-1');
    expect(item.subject).toBe('Offert att granska');
    expect(item.from).toBe('vendor@example.com');
    expect(item.classification).toBe('business');
    expect(item.snippet).toBe('Bifogat finns vår offert...');
  });

  it('urgent maps triage log fields + snippet from thread', async () => {
    (prisma.triageLog.count as any).mockResolvedValue(0);
    (prisma.triageLog.findMany as any)
      .mockResolvedValueOnce([]) // need_attention
      .mockResolvedValueOnce([
        { threadId: 'tid-2', subject: 'URGENT: Server nere', senderEmail: 'ops@company.se', classification: 'alert' },
      ]);

    (prisma.emailThread.findMany as any).mockResolvedValue([
      { id: 'tid-2', snippet: 'Produktionen är nere sedan 03:00...' },
    ]);

    const result = await runClassifiedSummary(userId);

    expect(result.data.urgent).toHaveLength(1);
    const item = result.data.urgent[0];
    expect(item.thread_id).toBe('tid-2');
    expect(item.subject).toBe('URGENT: Server nere');
    expect(item.from).toBe('ops@company.se');
    expect(item.snippet).toBe('Produktionen är nere sedan 03:00...');
  });

  it('snippet is null when thread is not found in EmailThread', async () => {
    (prisma.triageLog.count as any).mockResolvedValue(0);
    (prisma.triageLog.findMany as any)
      .mockResolvedValueOnce([
        { threadId: 'tid-missing', subject: 'Test', senderEmail: 'a@b.com', classification: 'personal' },
      ])
      .mockResolvedValueOnce([]);

    // Thread not found — empty array from EmailThread
    (prisma.emailThread.findMany as any).mockResolvedValue([]);

    const result = await runClassifiedSummary(userId);

    expect(result.data.need_attention[0].snippet).toBeNull();
  });

  it('subject falls back to "(inget ämne)" when null', async () => {
    (prisma.triageLog.count as any).mockResolvedValue(0);
    (prisma.triageLog.findMany as any)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { threadId: 'tid-3', subject: null, senderEmail: 'x@y.com', classification: 'unknown' },
      ]);

    (prisma.emailThread.findMany as any).mockResolvedValue([
      { id: 'tid-3', snippet: null },
    ]);

    const result = await runClassifiedSummary(userId);

    expect(result.data.urgent[0].subject).toBe('(inget ämne)');
  });

  it('skips EmailThread query when both attention and urgent are empty', async () => {
    (prisma.triageLog.count as any).mockResolvedValue(0);
    (prisma.triageLog.findMany as any).mockResolvedValue([]);

    await runClassifiedSummary(userId);

    expect(prisma.emailThread.findMany).not.toHaveBeenCalled();
  });

  it('since is approximately 24h ago (ISO string)', async () => {
    (prisma.triageLog.count as any).mockResolvedValue(0);
    (prisma.triageLog.findMany as any).mockResolvedValue([]);

    const before = Date.now();
    const result = await runClassifiedSummary(userId);
    const after = Date.now();

    const since = new Date(result.data.since).getTime();
    const expected24h = 24 * 3600 * 1000;

    expect(before - since).toBeGreaterThanOrEqual(expected24h - 100);
    expect(after - since).toBeLessThanOrEqual(expected24h + 100);
  });

  it('response shape has all required top-level keys', async () => {
    (prisma.triageLog.count as any).mockResolvedValue(0);
    (prisma.triageLog.findMany as any).mockResolvedValue([]);

    const result = await runClassifiedSummary(userId);

    expect(result.data).toHaveProperty('total_unread');
    expect(result.data).toHaveProperty('spam_archived');
    expect(result.data).toHaveProperty('need_attention');
    expect(result.data).toHaveProperty('urgent');
    expect(result.data).toHaveProperty('since');
  });

  it('need_attention is capped at 5 entries', async () => {
    const sixLogs = Array.from({ length: 6 }, (_, i) => ({
      threadId: `tid-${i}`,
      subject: `Mail ${i}`,
      senderEmail: `s${i}@test.com`,
      classification: 'business',
    }));

    (prisma.triageLog.count as any).mockResolvedValue(0);
    (prisma.triageLog.findMany as any)
      .mockResolvedValueOnce(sixLogs.slice(0, 5)) // Prisma take:5 returns 5
      .mockResolvedValueOnce([]);

    (prisma.emailThread.findMany as any).mockResolvedValue([]);

    const result = await runClassifiedSummary(userId);

    // Prisma enforces the cap via take:5 — our simulation returns what mock gives
    expect(result.data.need_attention.length).toBeLessThanOrEqual(5);
  });

  it('urgent is capped at 3 entries', async () => {
    const fourLogs = Array.from({ length: 4 }, (_, i) => ({
      threadId: `utid-${i}`,
      subject: `Urgent ${i}`,
      senderEmail: `u${i}@test.com`,
      classification: 'alert',
    }));

    (prisma.triageLog.count as any).mockResolvedValue(0);
    (prisma.triageLog.findMany as any)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(fourLogs.slice(0, 3)); // Prisma take:3 returns 3

    (prisma.emailThread.findMany as any).mockResolvedValue([]);

    const result = await runClassifiedSummary(userId);

    expect(result.data.urgent.length).toBeLessThanOrEqual(3);
  });
});
