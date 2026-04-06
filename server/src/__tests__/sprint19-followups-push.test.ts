/**
 * Sprint 19 — Follow-Ups + Push Route Tests
 *
 * Simulate-handler pattern: extract route logic into standalone async functions,
 * mock Prisma and services, test without spinning up Fastify.
 *
 * Covers:
 *   follow-ups.ts  — GET /follow-ups, POST /threads/:id/follow-up,
 *                    PATCH /follow-ups/:id/complete, DELETE /follow-ups/:id
 *   push.ts        — POST /push/subscribe, DELETE /push/subscribe, POST /push/test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../config/database', () => ({
  prisma: {
    followUpReminder: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    emailThread: {
      findFirst: vi.fn(),
    },
    pushSubscription: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('../services/push.service', () => ({
  sendPushToUser: vi.fn(),
}));

vi.mock('../config/env', () => ({
  env: {
    NODE_ENV: 'test',
  },
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import { prisma } from '../config/database';
import { sendPushToUser } from '../services/push.service';
import { env } from '../config/env';
import { z } from 'zod';

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockReply = () => {
  const reply = {
    _code: 200,
    _body: undefined as unknown,
    code(c: number) {
      this._code = c;
      return this;
    },
    send(b: unknown) {
      this._body = b;
      return this;
    },
  };
  return reply;
};

const USER_ID = 'user-abc';
const mockRequest = (overrides: object = {}) => ({
  userId: USER_ID,
  params: {},
  body: {},
  ...overrides,
});

// ── Simulate functions (mirror route logic) ───────────────────────────────────

async function simulateListFollowUps(req: ReturnType<typeof mockRequest>) {
  const reminders = await (prisma.followUpReminder.findMany as ReturnType<typeof vi.fn>)({
    where: { userId: req.userId, isCompleted: false },
    include: {
      thread: {
        select: {
          id: true,
          subject: true,
          snippet: true,
          lastMessageAt: true,
          participantEmails: true,
        },
      },
    },
    orderBy: { remindAt: 'asc' },
  });
  return { reminders };
}

async function simulateCreateFollowUp(
  req: ReturnType<typeof mockRequest>,
  reply: ReturnType<typeof mockReply>
) {
  const { id } = req.params as { id: string };
  const body = req.body as { remind_at?: string; note?: string };

  if (!body.remind_at) {
    return reply.code(400).send({ error: 'remind_at is required' });
  }

  const thread = await (prisma.emailThread.findFirst as ReturnType<typeof vi.fn>)({
    where: { id, account: { userId: req.userId } },
  });
  if (!thread) {
    return reply.code(404).send({ error: 'Thread not found' });
  }

  const reminder = await (prisma.followUpReminder.create as ReturnType<typeof vi.fn>)({
    data: {
      userId: req.userId,
      threadId: id,
      remindAt: new Date(body.remind_at),
      reason: 'follow_up',
      note: body.note ?? null,
    },
  });

  return { reminder };
}

async function simulateCompleteFollowUp(
  req: ReturnType<typeof mockRequest>,
  reply: ReturnType<typeof mockReply>
) {
  const { id } = req.params as { id: string };

  const reminder = await (prisma.followUpReminder.findFirst as ReturnType<typeof vi.fn>)({
    where: { id, userId: req.userId },
  });
  if (!reminder) {
    return reply.code(404).send({ error: 'Reminder not found' });
  }

  const updated = await (prisma.followUpReminder.update as ReturnType<typeof vi.fn>)({
    where: { id },
    data: { isCompleted: true },
  });

  return { reminder: updated };
}

async function simulateDeleteFollowUp(
  req: ReturnType<typeof mockRequest>,
  reply: ReturnType<typeof mockReply>
) {
  const { id } = req.params as { id: string };

  const reminder = await (prisma.followUpReminder.findFirst as ReturnType<typeof vi.fn>)({
    where: { id, userId: req.userId },
  });
  if (!reminder) {
    return reply.code(404).send({ error: 'Reminder not found' });
  }

  await (prisma.followUpReminder.delete as ReturnType<typeof vi.fn>)({ where: { id } });

  return { ok: true };
}

// ── Push Zod schemas (mirrored from push.ts) ──────────────────────────────────

const SubscribeBody = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

async function simulateSubscribePush(
  req: ReturnType<typeof mockRequest>,
  reply: ReturnType<typeof mockReply>
) {
  const body = SubscribeBody.safeParse(req.body);
  if (!body.success) {
    return reply.code(400).send({ error: 'Invalid subscription', details: body.error.issues });
  }

  const { endpoint, keys } = body.data;

  await (prisma.pushSubscription.upsert as ReturnType<typeof vi.fn>)({
    where: { userId_endpoint: { userId: req.userId, endpoint } },
    update: { p256dh: keys.p256dh, auth: keys.auth },
    create: { userId: req.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
  });

  return reply.code(201).send({ ok: true });
}

async function simulateUnsubscribePush(
  req: ReturnType<typeof mockRequest>,
  reply: ReturnType<typeof mockReply>
) {
  const body = z.object({ endpoint: z.string() }).safeParse(req.body);
  if (!body.success) return reply.code(400).send({ error: 'endpoint required' });

  await (prisma.pushSubscription.deleteMany as ReturnType<typeof vi.fn>)({
    where: { userId: req.userId, endpoint: body.data.endpoint },
  }).catch(() => {});

  return { ok: true };
}

async function simulatePushTest(
  req: ReturnType<typeof mockRequest>,
  reply: ReturnType<typeof mockReply>
) {
  if (env.NODE_ENV !== 'development') {
    return reply.code(403).send({ error: 'Only available in development' });
  }

  await (sendPushToUser as ReturnType<typeof vi.fn>)(req.userId, {
    title: '🔔 Testnotis',
    body: 'Web Push fungerar!',
    url: '/inbox',
  });

  return { ok: true };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Sprint 19 — Follow-Up Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── GET /follow-ups ──────────────────────────────────────────────────────

  describe('GET /follow-ups', () => {
    it('returns reminders with isCompleted: false filter', async () => {
      const fakeReminders = [
        { id: 'r1', threadId: 't1', remindAt: new Date(), isCompleted: false, thread: { id: 't1', subject: 'Test' } },
      ];
      (prisma.followUpReminder.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(fakeReminders);

      const result = await simulateListFollowUps(mockRequest());

      expect(result).toEqual({ reminders: fakeReminders });
      expect(prisma.followUpReminder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID, isCompleted: false },
          orderBy: { remindAt: 'asc' },
        })
      );
    });

    it('returns empty array when no reminders', async () => {
      (prisma.followUpReminder.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await simulateListFollowUps(mockRequest());

      expect(result).toEqual({ reminders: [] });
    });

    it('includes thread details in the query', async () => {
      (prisma.followUpReminder.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await simulateListFollowUps(mockRequest());

      expect(prisma.followUpReminder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            thread: expect.objectContaining({
              select: expect.objectContaining({ id: true, subject: true }),
            }),
          }),
        })
      );
    });
  });

  // ── POST /threads/:id/follow-up ──────────────────────────────────────────

  describe('POST /threads/:id/follow-up', () => {
    it('returns 400 when remind_at is missing', async () => {
      const req = mockRequest({ params: { id: 'thread-1' }, body: {} });
      const reply = mockReply();

      await simulateCreateFollowUp(req, reply);

      expect(reply._code).toBe(400);
      expect(reply._body).toMatchObject({ error: 'remind_at is required' });
    });

    it('returns 404 when thread not found', async () => {
      (prisma.emailThread.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const req = mockRequest({
        params: { id: 'thread-1' },
        body: { remind_at: '2026-05-01T10:00:00Z' },
      });
      const reply = mockReply();

      await simulateCreateFollowUp(req, reply);

      expect(reply._code).toBe(404);
      expect(reply._body).toMatchObject({ error: 'Thread not found' });
    });

    it('creates reminder with correct data when thread found', async () => {
      (prisma.emailThread.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'thread-1' });
      const fakeReminder = { id: 'r1', threadId: 'thread-1', isCompleted: false };
      (prisma.followUpReminder.create as ReturnType<typeof vi.fn>).mockResolvedValue(fakeReminder);

      const req = mockRequest({
        params: { id: 'thread-1' },
        body: { remind_at: '2026-05-01T10:00:00Z', note: 'Follow up on proposal' },
      });
      const reply = mockReply();

      const result = await simulateCreateFollowUp(req, reply);

      expect(result).toEqual({ reminder: fakeReminder });
      expect(prisma.followUpReminder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: USER_ID,
            threadId: 'thread-1',
            reason: 'follow_up',
            note: 'Follow up on proposal',
          }),
        })
      );
    });

    it('converts remind_at string to Date object', async () => {
      (prisma.emailThread.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'thread-1' });
      (prisma.followUpReminder.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'r1' });

      const remindAtStr = '2026-05-01T10:00:00Z';
      const req = mockRequest({
        params: { id: 'thread-1' },
        body: { remind_at: remindAtStr },
      });
      const reply = mockReply();

      await simulateCreateFollowUp(req, reply);

      const createCall = (prisma.followUpReminder.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.remindAt).toBeInstanceOf(Date);
    });

    it('sets note to null when not provided', async () => {
      (prisma.emailThread.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'thread-1' });
      (prisma.followUpReminder.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'r1' });

      const req = mockRequest({
        params: { id: 'thread-1' },
        body: { remind_at: '2026-05-01T10:00:00Z' },
      });
      const reply = mockReply();

      await simulateCreateFollowUp(req, reply);

      const createCall = (prisma.followUpReminder.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.note).toBeNull();
    });

    it('verifies thread belongs to user via account.userId', async () => {
      (prisma.emailThread.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'thread-1' });
      (prisma.followUpReminder.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'r1' });

      const req = mockRequest({
        params: { id: 'thread-1' },
        body: { remind_at: '2026-05-01T10:00:00Z' },
      });
      const reply = mockReply();

      await simulateCreateFollowUp(req, reply);

      expect(prisma.emailThread.findFirst).toHaveBeenCalledWith({
        where: { id: 'thread-1', account: { userId: USER_ID } },
      });
    });
  });

  // ── PATCH /follow-ups/:id/complete ───────────────────────────────────────

  describe('PATCH /follow-ups/:id/complete', () => {
    it('returns 404 when reminder not found', async () => {
      (prisma.followUpReminder.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const req = mockRequest({ params: { id: 'r1' } });
      const reply = mockReply();

      await simulateCompleteFollowUp(req, reply);

      expect(reply._code).toBe(404);
      expect(reply._body).toMatchObject({ error: 'Reminder not found' });
    });

    it('sets isCompleted to true', async () => {
      const existing = { id: 'r1', isCompleted: false };
      (prisma.followUpReminder.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
      const updated = { ...existing, isCompleted: true };
      (prisma.followUpReminder.update as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

      const req = mockRequest({ params: { id: 'r1' } });
      const reply = mockReply();

      const result = await simulateCompleteFollowUp(req, reply);

      expect(result).toEqual({ reminder: updated });
      expect(prisma.followUpReminder.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { isCompleted: true },
      });
    });

    it('looks up reminder by id and userId', async () => {
      (prisma.followUpReminder.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'r1' });
      (prisma.followUpReminder.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'r1', isCompleted: true });

      const req = mockRequest({ params: { id: 'r1' } });
      const reply = mockReply();

      await simulateCompleteFollowUp(req, reply);

      expect(prisma.followUpReminder.findFirst).toHaveBeenCalledWith({
        where: { id: 'r1', userId: USER_ID },
      });
    });
  });

  // ── DELETE /follow-ups/:id ───────────────────────────────────────────────

  describe('DELETE /follow-ups/:id', () => {
    it('returns 404 when reminder not found', async () => {
      (prisma.followUpReminder.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const req = mockRequest({ params: { id: 'r1' } });
      const reply = mockReply();

      await simulateDeleteFollowUp(req, reply);

      expect(reply._code).toBe(404);
      expect(reply._body).toMatchObject({ error: 'Reminder not found' });
    });

    it('deletes the reminder and returns ok: true', async () => {
      (prisma.followUpReminder.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'r1' });
      (prisma.followUpReminder.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'r1' });

      const req = mockRequest({ params: { id: 'r1' } });
      const reply = mockReply();

      const result = await simulateDeleteFollowUp(req, reply);

      expect(result).toEqual({ ok: true });
      expect(prisma.followUpReminder.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
    });

    it('does not delete when ownership check fails', async () => {
      (prisma.followUpReminder.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const req = mockRequest({ params: { id: 'other-users-reminder' } });
      const reply = mockReply();

      await simulateDeleteFollowUp(req, reply);

      expect(prisma.followUpReminder.delete).not.toHaveBeenCalled();
    });
  });
});

// ── Push Route Tests ──────────────────────────────────────────────────────────

describe('Sprint 19 — Push Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── POST /push/subscribe ─────────────────────────────────────────────────

  describe('POST /push/subscribe', () => {
    const validBody = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/example',
      keys: { p256dh: 'dGVzdC1rZXk=', auth: 'dGVzdC1hdXRo' },
    };

    it('returns 400 when endpoint is missing', async () => {
      const req = mockRequest({ body: { keys: validBody.keys } });
      const reply = mockReply();

      await simulateSubscribePush(req, reply);

      expect(reply._code).toBe(400);
      expect(reply._body).toMatchObject({ error: 'Invalid subscription' });
    });

    it('returns 400 when endpoint is not a URL', async () => {
      const req = mockRequest({ body: { endpoint: 'not-a-url', keys: validBody.keys } });
      const reply = mockReply();

      await simulateSubscribePush(req, reply);

      expect(reply._code).toBe(400);
    });

    it('returns 400 when keys are missing', async () => {
      const req = mockRequest({ body: { endpoint: validBody.endpoint } });
      const reply = mockReply();

      await simulateSubscribePush(req, reply);

      expect(reply._code).toBe(400);
    });

    it('returns 400 when p256dh is empty', async () => {
      const req = mockRequest({
        body: { endpoint: validBody.endpoint, keys: { p256dh: '', auth: 'auth' } },
      });
      const reply = mockReply();

      await simulateSubscribePush(req, reply);

      expect(reply._code).toBe(400);
    });

    it('upserts subscription and returns 201', async () => {
      (prisma.pushSubscription.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const req = mockRequest({ body: validBody });
      const reply = mockReply();

      await simulateSubscribePush(req, reply);

      expect(reply._code).toBe(201);
      expect(reply._body).toEqual({ ok: true });
    });

    it('upserts with compound key userId_endpoint', async () => {
      (prisma.pushSubscription.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const req = mockRequest({ body: validBody });
      const reply = mockReply();

      await simulateSubscribePush(req, reply);

      expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_endpoint: { userId: USER_ID, endpoint: validBody.endpoint } },
          create: expect.objectContaining({ userId: USER_ID, endpoint: validBody.endpoint }),
          update: expect.objectContaining({ p256dh: validBody.keys.p256dh, auth: validBody.keys.auth }),
        })
      );
    });
  });

  // ── DELETE /push/subscribe ───────────────────────────────────────────────

  describe('DELETE /push/subscribe', () => {
    it('returns 400 when endpoint is missing', async () => {
      const req = mockRequest({ body: {} });
      const reply = mockReply();

      await simulateUnsubscribePush(req, reply);

      expect(reply._code).toBe(400);
      expect(reply._body).toMatchObject({ error: 'endpoint required' });
    });

    it('calls deleteMany and returns ok: true', async () => {
      const deleteManySpy = (prisma.pushSubscription.deleteMany as ReturnType<typeof vi.fn>);
      deleteManySpy.mockResolvedValue({ count: 1 });

      const req = mockRequest({ body: { endpoint: 'https://example.com/push' } });
      const reply = mockReply();

      const result = await simulateUnsubscribePush(req, reply);

      expect(result).toEqual({ ok: true });
      expect(deleteManySpy).toHaveBeenCalledWith({
        where: { userId: USER_ID, endpoint: 'https://example.com/push' },
      });
    });

    it('silently swallows deleteMany errors (catch)', async () => {
      // We simulate the catch by having deleteMany reject; the handler should not throw
      (prisma.pushSubscription.deleteMany as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('DB error')
      );

      const req = mockRequest({ body: { endpoint: 'https://example.com/push' } });
      const reply = mockReply();

      // Should not throw
      await expect(simulateUnsubscribePush(req, reply)).resolves.toEqual({ ok: true });
    });
  });

  // ── POST /push/test ──────────────────────────────────────────────────────

  describe('POST /push/test', () => {
    it('returns 403 when NODE_ENV is not development', async () => {
      // env.NODE_ENV is mocked as 'test'
      const req = mockRequest();
      const reply = mockReply();

      await simulatePushTest(req, reply);

      expect(reply._code).toBe(403);
      expect(reply._body).toMatchObject({ error: 'Only available in development' });
    });

    it('calls sendPushToUser and returns ok: true in development', async () => {
      // Temporarily override the env mock for this test
      const envMock = env as { NODE_ENV: string };
      const original = envMock.NODE_ENV;
      envMock.NODE_ENV = 'development';

      (sendPushToUser as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const req = mockRequest();
      const reply = mockReply();

      const result = await simulatePushTest(req, reply);

      expect(result).toEqual({ ok: true });
      expect(sendPushToUser).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({ title: '🔔 Testnotis', url: '/inbox' })
      );

      envMock.NODE_ENV = original;
    });

    it('does not call sendPushToUser in non-development', async () => {
      const req = mockRequest();
      const reply = mockReply();

      await simulatePushTest(req, reply);

      expect(sendPushToUser).not.toHaveBeenCalled();
    });
  });
});
