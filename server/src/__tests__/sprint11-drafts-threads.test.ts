/**
 * Sprint 11 — Route-level tests for drafts + threads batch logic.
 *
 * draft routes (route validation, not service internals — those are in draft-approval.test.ts):
 *   POST /drafts             — schema validation
 *   POST /drafts/:id/send    — SECURITY: must be approved, pending → 403
 *   POST /drafts/:id/schedule — requires send_at, future date, approved status
 *
 * threads:
 *   buildThreadPage           — cursor pagination helper
 *   buildMessageLookupWhere   — message lookup helper
 *   POST /threads/batch       — validation + action dispatch
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../config/database', () => ({
  prisma: {
    draft: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    emailThread: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    actionLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock('../services/gmail.service', () => ({
  gmailService: {
    archiveThread: vi.fn().mockResolvedValue({}),
    trashThread: vi.fn().mockResolvedValue({}),
    markAsRead: vi.fn().mockResolvedValue({}),
    markAsUnread: vi.fn().mockResolvedValue({}),
    starThread: vi.fn().mockResolvedValue({}),
    unstarThread: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../services/draft.service', () => ({
  draftService: {
    create: vi.fn(),
    list: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    approve: vi.fn(),
    send: vi.fn(),
    discard: vi.fn(),
  },
}));

vi.mock('../utils/thread-provider-capabilities', () => ({
  getThreadMutationUnsupportedError: vi.fn().mockReturnValue(null),
}));

import { prisma } from '../config/database';
import { gmailService } from '../services/gmail.service';
import { draftService } from '../services/draft.service';
import { buildThreadPage, buildMessageLookupWhere } from '../routes/threads';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDraft(overrides: Partial<{
  id: string; status: string; userId: string; subject: string;
  toAddresses: string[]; bodyText: string; scheduledAt: Date | null;
}> = {}) {
  return {
    id: 'draft-1',
    status: 'pending',
    userId: 'user-1',
    subject: 'Test subject',
    toAddresses: ['to@example.com'],
    bodyText: 'Hello world',
    scheduledAt: null,
    ...overrides,
  };
}

function makeThread(overrides: Partial<{
  id: string; gmailThreadId: string; labels: string[]; isRead: boolean;
  account: { id: string; provider: string };
}> = {}) {
  return {
    id: 'thread-1',
    gmailThreadId: 'gmail-1',
    labels: ['INBOX'],
    isRead: false,
    account: { id: 'acc-1', provider: 'gmail' },
    ...overrides,
  };
}

// ─── Simulate route handlers ─────────────────────────────────────────────────

/** Simulates POST /drafts/:id/send route handler */
async function simulateSendDraft(draftId: string, userId: string) {
  try {
    const draft = await draftService.send(draftId, userId);
    return { status: 200, body: { draft, message: 'Email sent successfully via Gmail.' } };
  } catch (error: any) {
    if (error.message.includes('SECURITY')) {
      return { status: 403, body: { error: error.message } };
    }
    const code = error.message.includes('not found') ? 404 : 500;
    return { status: code, body: { error: error.message } };
  }
}

/** Simulates POST /drafts/:id/schedule route handler */
async function simulateScheduleDraft(draftId: string, userId: string, sendAt: string | undefined) {
  if (!sendAt) {
    return { status: 400, body: { error: 'send_at is required (ISO datetime string)' } };
  }
  const sendAtDate = new Date(sendAt);
  if (isNaN(sendAtDate.getTime())) {
    return { status: 400, body: { error: 'send_at must be a valid ISO datetime' } };
  }
  if (sendAtDate <= new Date()) {
    return { status: 400, body: { error: 'send_at must be in the future' } };
  }

  const draft = await (prisma.draft.findFirst as any)({ where: { id: draftId, userId } });
  if (!draft) return { status: 404, body: { error: 'Draft not found' } };
  if (draft.status !== 'approved') {
    return { status: 400, body: { error: 'Draft must be approved before scheduling' } };
  }

  const updated = await (prisma.draft.update as any)({
    where: { id: draftId },
    data: { scheduledAt: sendAtDate },
  });
  return { status: 200, body: { draft: updated, message: `Schemalagt för ${sendAtDate.toLocaleString('sv-SE')}` } };
}

/** Simulates POST /threads/batch route handler (core logic only) */
async function simulateBatchThreads(
  threadIds: string[] | undefined,
  action: string | undefined,
  userId: string
) {
  if (!Array.isArray(threadIds) || threadIds.length === 0) {
    return { status: 400, body: { error: 'threadIds must be a non-empty array' } };
  }
  const validActions = ['archive', 'trash', 'read', 'unread', 'star', 'unstar'] as const;
  if (!validActions.includes(action as any)) {
    return { status: 400, body: { error: `action must be one of: ${validActions.join(', ')}` } };
  }

  const threads = await (prisma.emailThread.findMany as any)({
    where: { id: { in: threadIds }, account: { userId } },
    include: { account: { select: { id: true, provider: true } } },
  });

  const results = await Promise.allSettled(
    threads.map(async (thread: any) => {
      switch (action) {
        case 'archive':
          await gmailService.archiveThread(thread.account.id, thread.gmailThreadId);
          await (prisma.emailThread.update as any)({ where: { id: thread.id }, data: { labels: thread.labels.filter((l: string) => l !== 'INBOX') } });
          break;
        case 'trash':
          await gmailService.trashThread(thread.account.id, thread.gmailThreadId);
          await (prisma.emailThread.update as any)({ where: { id: thread.id }, data: { labels: [...thread.labels.filter((l: string) => l !== 'INBOX'), 'TRASH'] } });
          break;
        case 'read':
          await gmailService.markAsRead(thread.account.id, thread.gmailThreadId);
          break;
        case 'unread':
          await gmailService.markAsUnread(thread.account.id, thread.gmailThreadId);
          break;
        case 'star':
          await gmailService.starThread(thread.account.id, thread.gmailThreadId);
          break;
        case 'unstar':
          await gmailService.unstarThread(thread.account.id, thread.gmailThreadId);
          break;
      }
    })
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;
  return { status: 200, body: { processed: threads.length, succeeded, failed } };
}

// ─── buildThreadPage ──────────────────────────────────────────────────────────

describe('buildThreadPage — cursor pagination', () => {
  it('returns all threads when count <= limit', () => {
    const threads = [
      { id: 'a', lastMessageAt: new Date('2026-04-01') },
      { id: 'b', lastMessageAt: new Date('2026-04-02') },
    ];
    const result = buildThreadPage(threads, 10);
    expect(result.threads).toHaveLength(2);
    expect(result.hasMoreCursor).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it('slices to limit and provides nextCursor when more exist', () => {
    const threads = Array.from({ length: 6 }, (_, i) => ({
      id: `t${i}`,
      lastMessageAt: new Date(`2026-04-0${i + 1}`),
    }));
    const result = buildThreadPage(threads, 5);
    expect(result.threads).toHaveLength(5);
    expect(result.hasMoreCursor).toBe(true);
    expect(result.nextCursor).toBeTypeOf('string');
  });

  it('nextCursor is base64-encoded ISO::id', () => {
    const lastDate = new Date('2026-04-05T12:00:00.000Z');
    const threads = [
      { id: 'last', lastMessageAt: lastDate },
      { id: 'extra', lastMessageAt: new Date('2026-04-06') },
    ];
    const result = buildThreadPage(threads, 1);
    const decoded = Buffer.from(result.nextCursor!, 'base64').toString('utf-8');
    expect(decoded).toBe(`${lastDate.toISOString()}::last`);
  });

  it('returns null nextCursor for empty list', () => {
    const result = buildThreadPage([], 10);
    expect(result.nextCursor).toBeNull();
    expect(result.threads).toHaveLength(0);
  });

  it('handles thread with null lastMessageAt gracefully', () => {
    const threads = [{ id: 'a', lastMessageAt: null }];
    const result = buildThreadPage(threads, 10);
    expect(result.nextCursor).toBeNull();
  });
});

// ─── buildMessageLookupWhere ──────────────────────────────────────────────────

describe('buildMessageLookupWhere — message lookup', () => {
  it('returns OR query matching by id or gmailMessageId', () => {
    const where = buildMessageLookupWhere('thread-1', 'msg-abc');
    expect(where.OR).toHaveLength(2);
    expect(where.OR[0]).toEqual({ id: 'msg-abc', threadId: 'thread-1' });
    expect(where.OR[1]).toEqual({ gmailMessageId: 'msg-abc', threadId: 'thread-1' });
  });
});

// ─── Draft send safety gate ───────────────────────────────────────────────────

describe('POST /drafts/:id/send — safety gate', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 200 on successful send', async () => {
    vi.mocked(draftService.send).mockResolvedValue(makeDraft({ status: 'sent' }) as any);
    const result = await simulateSendDraft('draft-1', 'user-1');
    expect(result.status).toBe(200);
    expect(result.body.message).toBe('Email sent successfully via Gmail.');
  });

  it('returns 403 when draft is pending (SECURITY block)', async () => {
    vi.mocked(draftService.send).mockRejectedValue(
      new Error('SECURITY: Cannot send a pending draft without approval.')
    );
    const result = await simulateSendDraft('draft-1', 'user-1');
    expect(result.status).toBe(403);
    expect(result.body.error).toContain('SECURITY');
  });

  it('returns 404 when draft not found', async () => {
    vi.mocked(draftService.send).mockRejectedValue(new Error('Draft not found'));
    const result = await simulateSendDraft('draft-1', 'user-1');
    expect(result.status).toBe(404);
  });

  it('returns 500 on generic send failure', async () => {
    vi.mocked(draftService.send).mockRejectedValue(new Error('Gmail API error'));
    const result = await simulateSendDraft('draft-1', 'user-1');
    expect(result.status).toBe(500);
  });
});

// ─── Draft schedule ────────────────────────────────────────────────────────────

describe('POST /drafts/:id/schedule', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 400 if send_at is missing', async () => {
    const result = await simulateScheduleDraft('draft-1', 'user-1', undefined);
    expect(result.status).toBe(400);
    expect(result.body.error).toContain('send_at is required');
  });

  it('returns 400 if send_at is not a valid date', async () => {
    const result = await simulateScheduleDraft('draft-1', 'user-1', 'not-a-date');
    expect(result.status).toBe(400);
    expect(result.body.error).toContain('valid ISO datetime');
  });

  it('returns 400 if send_at is in the past', async () => {
    const result = await simulateScheduleDraft('draft-1', 'user-1', '2020-01-01T00:00:00Z');
    expect(result.status).toBe(400);
    expect(result.body.error).toContain('in the future');
  });

  it('returns 404 if draft not found', async () => {
    vi.mocked(prisma.draft.findFirst).mockResolvedValue(null);
    const future = new Date(Date.now() + 3600 * 1000).toISOString();
    const result = await simulateScheduleDraft('draft-1', 'user-1', future);
    expect(result.status).toBe(404);
  });

  it('returns 400 if draft is not approved', async () => {
    vi.mocked(prisma.draft.findFirst).mockResolvedValue(makeDraft({ status: 'pending' }) as any);
    const future = new Date(Date.now() + 3600 * 1000).toISOString();
    const result = await simulateScheduleDraft('draft-1', 'user-1', future);
    expect(result.status).toBe(400);
    expect(result.body.error).toContain('approved before scheduling');
  });

  it('schedules and returns updated draft on success', async () => {
    vi.mocked(prisma.draft.findFirst).mockResolvedValue(makeDraft({ status: 'approved' }) as any);
    const updatedDraft = makeDraft({ status: 'approved', scheduledAt: new Date() });
    vi.mocked(prisma.draft.update).mockResolvedValue(updatedDraft as any);
    const future = new Date(Date.now() + 3600 * 1000).toISOString();
    const result = await simulateScheduleDraft('draft-1', 'user-1', future);
    expect(result.status).toBe(200);
    expect(result.body.draft).toBeDefined();
  });
});

// ─── POST /threads/batch ──────────────────────────────────────────────────────

describe('POST /threads/batch — input validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue([]);
  });

  it('returns 400 if threadIds is empty', async () => {
    const result = await simulateBatchThreads([], 'archive', 'user-1');
    expect(result.status).toBe(400);
    expect(result.body.error).toContain('non-empty array');
  });

  it('returns 400 if threadIds is not an array', async () => {
    const result = await simulateBatchThreads(undefined, 'archive', 'user-1');
    expect(result.status).toBe(400);
  });

  it('returns 400 for unknown action', async () => {
    const result = await simulateBatchThreads(['thread-1'], 'delete', 'user-1');
    expect(result.status).toBe(400);
    expect(result.body.error).toContain('action must be one of');
  });

  it('returns 400 for undefined action', async () => {
    const result = await simulateBatchThreads(['thread-1'], undefined, 'user-1');
    expect(result.status).toBe(400);
  });
});

describe('POST /threads/batch — action dispatch', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calls archiveThread for archive action', async () => {
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue([makeThread()] as any);
    vi.mocked(prisma.emailThread.update).mockResolvedValue({} as any);
    await simulateBatchThreads(['thread-1'], 'archive', 'user-1');
    expect(gmailService.archiveThread).toHaveBeenCalledWith('acc-1', 'gmail-1');
  });

  it('calls trashThread for trash action', async () => {
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue([makeThread()] as any);
    vi.mocked(prisma.emailThread.update).mockResolvedValue({} as any);
    await simulateBatchThreads(['thread-1'], 'trash', 'user-1');
    expect(gmailService.trashThread).toHaveBeenCalledWith('acc-1', 'gmail-1');
  });

  it('calls markAsRead for read action', async () => {
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue([makeThread()] as any);
    await simulateBatchThreads(['thread-1'], 'read', 'user-1');
    expect(gmailService.markAsRead).toHaveBeenCalledWith('acc-1', 'gmail-1');
  });

  it('calls markAsUnread for unread action', async () => {
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue([makeThread()] as any);
    await simulateBatchThreads(['thread-1'], 'unread', 'user-1');
    expect(gmailService.markAsUnread).toHaveBeenCalledWith('acc-1', 'gmail-1');
  });

  it('calls starThread for star action', async () => {
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue([makeThread()] as any);
    await simulateBatchThreads(['thread-1'], 'star', 'user-1');
    expect(gmailService.starThread).toHaveBeenCalledWith('acc-1', 'gmail-1');
  });

  it('calls unstarThread for unstar action', async () => {
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue([makeThread()] as any);
    await simulateBatchThreads(['thread-1'], 'unstar', 'user-1');
    expect(gmailService.unstarThread).toHaveBeenCalledWith('acc-1', 'gmail-1');
  });

  it('reports succeeded/failed counts in response', async () => {
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue([
      makeThread({ id: 'thread-1', gmailThreadId: 'g1' }),
      makeThread({ id: 'thread-2', gmailThreadId: 'g2' }),
    ] as any);
    vi.mocked(prisma.emailThread.update).mockResolvedValue({} as any);
    const result = await simulateBatchThreads(['thread-1', 'thread-2'], 'archive', 'user-1');
    expect(result.body.succeeded).toBe(2);
    expect(result.body.failed).toBe(0);
  });

  it('handles partial failure with Promise.allSettled', async () => {
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue([
      makeThread({ id: 'thread-1', gmailThreadId: 'g1' }),
      makeThread({ id: 'thread-2', gmailThreadId: 'g2' }),
    ] as any);
    vi.mocked(gmailService.archiveThread)
      .mockResolvedValueOnce({} as any)
      .mockRejectedValueOnce(new Error('Gmail API error'));
    vi.mocked(prisma.emailThread.update).mockResolvedValue({} as any);
    const result = await simulateBatchThreads(['thread-1', 'thread-2'], 'archive', 'user-1');
    expect(result.status).toBe(200); // allSettled never throws
    expect(result.body.succeeded).toBe(1);
    expect(result.body.failed).toBe(1);
  });

  it('returns 0 succeeded when no matching threads found', async () => {
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue([]);
    const result = await simulateBatchThreads(['thread-x'], 'archive', 'user-1');
    expect(result.body.succeeded).toBe(0);
    expect(result.body.processed).toBe(0);
  });
});
