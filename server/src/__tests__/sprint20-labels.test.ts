/**
 * Sprint 20 — Labels Route Tests
 *
 * Simulate-handler pattern: extract route logic into standalone async functions,
 * mock Prisma, test without spinning up Fastify.
 *
 * Covers labels.ts:
 *   GET    /labels                       — list (auto-seed defaults)
 *   POST   /labels                       — create
 *   PATCH  /labels/:id                   — update
 *   DELETE /labels/:id                   — delete
 *   POST   /threads/:id/labels           — set labels on thread (replace)
 *   DELETE /threads/:id/labels/:labelId  — remove single label from thread
 *   POST   /threads/bulk/label           — bulk assign label
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../config/database', () => ({
  prisma: {
    label: {
      count: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    emailThread: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    threadLabel: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { prisma } from '../config/database';

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockReply = () => {
  const reply = {
    _code: 200,
    _body: undefined as unknown,
    code(c: number) { this._code = c; return this; },
    send(b: unknown) { this._body = b; return this; },
  };
  return reply;
};

const USER_ID = 'user-label';
const mockRequest = (overrides: object = {}) => ({
  userId: USER_ID,
  params: {},
  body: {},
  ...overrides,
});

// ── Default labels (mirrored from labels.ts) ──────────────────────────────────

const DEFAULT_LABELS = [
  { name: 'CDP',        color: '#3B82F6', position: 0 },
  { name: 'Myndighet',  color: '#EF4444', position: 1 },
  { name: 'Ekonomi',    color: '#F59E0B', position: 2 },
  { name: 'Personligt', color: '#10B981', position: 3 },
  { name: 'Viktigt',    color: '#8B5CF6', position: 4 },
];

// ── Simulate functions ────────────────────────────────────────────────────────

async function simulateGetLabels(req: ReturnType<typeof mockRequest>) {
  const existing = await (prisma.label.count as ReturnType<typeof vi.fn>)({
    where: { userId: req.userId },
  });
  if (existing === 0) {
    await (prisma.label.createMany as ReturnType<typeof vi.fn>)({
      data: DEFAULT_LABELS.map((l) => ({ ...l, userId: req.userId })),
      skipDuplicates: true,
    });
  }
  const labels = await (prisma.label.findMany as ReturnType<typeof vi.fn>)({
    where: { userId: req.userId },
    orderBy: { position: 'asc' },
  });
  return { labels };
}

async function simulateCreateLabel(
  req: ReturnType<typeof mockRequest>,
  reply: ReturnType<typeof mockReply>
) {
  const { name, color, icon } = req.body as { name?: string; color?: string; icon?: string };
  if (!name?.trim()) return reply.code(400).send({ error: 'name is required' });

  const maxPos = await (prisma.label.aggregate as ReturnType<typeof vi.fn>)({
    where: { userId: req.userId },
    _max: { position: true },
  });

  try {
    const label = await (prisma.label.create as ReturnType<typeof vi.fn>)({
      data: {
        userId: req.userId,
        name: name.trim(),
        color: color ?? '#6B7280',
        icon: icon ?? null,
        position: (maxPos._max.position ?? -1) + 1,
      },
    });
    return reply.code(201).send({ label });
  } catch {
    return reply.code(409).send({ error: 'Label name already exists' });
  }
}

async function simulateUpdateLabel(
  req: ReturnType<typeof mockRequest>,
  reply: ReturnType<typeof mockReply>
) {
  const { id } = req.params as { id: string };
  const { name, color, icon, position } = req.body as {
    name?: string; color?: string; icon?: string; position?: number;
  };

  const label = await (prisma.label.findFirst as ReturnType<typeof vi.fn>)({
    where: { id, userId: req.userId },
  });
  if (!label) return reply.code(404).send({ error: 'Label not found' });

  const updated = await (prisma.label.update as ReturnType<typeof vi.fn>)({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(color !== undefined && { color }),
      ...(icon !== undefined && { icon }),
      ...(position !== undefined && { position }),
    },
  });
  return { label: updated };
}

async function simulateDeleteLabel(
  req: ReturnType<typeof mockRequest>,
  reply: ReturnType<typeof mockReply>
) {
  const { id } = req.params as { id: string };

  const label = await (prisma.label.findFirst as ReturnType<typeof vi.fn>)({
    where: { id, userId: req.userId },
  });
  if (!label) return reply.code(404).send({ error: 'Label not found' });

  await (prisma.label.delete as ReturnType<typeof vi.fn>)({ where: { id } });
  return { deleted: true };
}

async function simulateSetThreadLabels(
  req: ReturnType<typeof mockRequest>,
  reply: ReturnType<typeof mockReply>
) {
  const { id: threadId } = req.params as { id: string };
  const { labelIds } = req.body as { labelIds: string[] };

  const thread = await (prisma.emailThread.findFirst as ReturnType<typeof vi.fn>)({
    where: { id: threadId, account: { userId: req.userId } },
  });
  if (!thread) return reply.code(404).send({ error: 'Thread not found' });

  const validLabels = await (prisma.label.findMany as ReturnType<typeof vi.fn>)({
    where: { id: { in: labelIds }, userId: req.userId },
    select: { id: true },
  });
  const validIds = validLabels.map((l: any) => l.id);

  await (prisma.threadLabel.deleteMany as ReturnType<typeof vi.fn>)({ where: { threadId } });
  if (validIds.length > 0) {
    await (prisma.threadLabel.createMany as ReturnType<typeof vi.fn>)({
      data: validIds.map((labelId: string) => ({ threadId, labelId })),
      skipDuplicates: true,
    });
  }
  return { updated: validIds.length };
}

async function simulateRemoveThreadLabel(
  req: ReturnType<typeof mockRequest>,
  reply: ReturnType<typeof mockReply>
) {
  const { id: threadId, labelId } = req.params as { id: string; labelId: string };

  const thread = await (prisma.emailThread.findFirst as ReturnType<typeof vi.fn>)({
    where: { id: threadId, account: { userId: req.userId } },
  });
  if (!thread) return reply.code(404).send({ error: 'Thread not found' });

  await (prisma.threadLabel.deleteMany as ReturnType<typeof vi.fn>)({
    where: { threadId, labelId },
  });
  return { deleted: true };
}

async function simulateBulkLabel(
  req: ReturnType<typeof mockRequest>,
  reply: ReturnType<typeof mockReply>
) {
  const { threadIds, labelId } = req.body as { threadIds?: string[]; labelId?: string };

  if (!Array.isArray(threadIds) || threadIds.length === 0) {
    return reply.code(400).send({ error: 'threadIds must be a non-empty array' });
  }

  const label = await (prisma.label.findFirst as ReturnType<typeof vi.fn>)({
    where: { id: labelId, userId: req.userId },
  });
  if (!label) return reply.code(404).send({ error: 'Label not found' });

  const threads = await (prisma.emailThread.findMany as ReturnType<typeof vi.fn>)({
    where: { id: { in: threadIds }, account: { userId: req.userId } },
    select: { id: true },
  });
  const validThreadIds = threads.map((t: any) => t.id);

  await (prisma.threadLabel.createMany as ReturnType<typeof vi.fn>)({
    data: validThreadIds.map((tId: string) => ({ threadId: tId, labelId })),
    skipDuplicates: true,
  });

  return { updated: validThreadIds.length };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Sprint 20 — Labels Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  // ── GET /labels ──────────────────────────────────────────────────────────

  describe('GET /labels', () => {
    it('seeds defaults when user has no labels, then returns list', async () => {
      (prisma.label.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
      (prisma.label.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 5 });
      const seededLabels = DEFAULT_LABELS.map((l, i) => ({ id: `l${i}`, ...l, userId: USER_ID }));
      (prisma.label.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(seededLabels);

      const result = await simulateGetLabels(mockRequest());

      expect(prisma.label.createMany).toHaveBeenCalledOnce();
      expect(result.labels).toHaveLength(5);
    });

    it('seeds with all 5 default labels', async () => {
      (prisma.label.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
      (prisma.label.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 5 });
      (prisma.label.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await simulateGetLabels(mockRequest());

      const createCall = (prisma.label.createMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data).toHaveLength(5);
      expect(createCall.data.map((d: any) => d.name)).toEqual(
        DEFAULT_LABELS.map((l) => l.name)
      );
      expect(createCall.skipDuplicates).toBe(true);
    });

    it('does NOT seed when user already has labels', async () => {
      (prisma.label.count as ReturnType<typeof vi.fn>).mockResolvedValue(3);
      (prisma.label.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'l1', name: 'Work' },
      ]);

      const result = await simulateGetLabels(mockRequest());

      expect(prisma.label.createMany).not.toHaveBeenCalled();
      expect(result.labels).toHaveLength(1);
    });

    it('returns labels ordered by position asc', async () => {
      (prisma.label.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);
      (prisma.label.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await simulateGetLabels(mockRequest());

      expect(prisma.label.findMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        orderBy: { position: 'asc' },
      });
    });
  });

  // ── POST /labels ─────────────────────────────────────────────────────────

  describe('POST /labels', () => {
    it('returns 400 when name is missing', async () => {
      const req = mockRequest({ body: {} });
      const reply = mockReply();
      await simulateCreateLabel(req, reply);
      expect(reply._code).toBe(400);
    });

    it('returns 400 when name is empty string', async () => {
      const req = mockRequest({ body: { name: '' } });
      const reply = mockReply();
      await simulateCreateLabel(req, reply);
      expect(reply._code).toBe(400);
    });

    it('returns 400 when name is whitespace only', async () => {
      const req = mockRequest({ body: { name: '   ' } });
      const reply = mockReply();
      await simulateCreateLabel(req, reply);
      expect(reply._code).toBe(400);
    });

    it('returns 409 when prisma.create throws (duplicate name)', async () => {
      (prisma.label.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({ _max: { position: 2 } });
      (prisma.label.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Unique constraint'));

      const req = mockRequest({ body: { name: 'CDP' } });
      const reply = mockReply();

      await simulateCreateLabel(req, reply);

      expect(reply._code).toBe(409);
      expect(reply._body).toMatchObject({ error: 'Label name already exists' });
    });

    it('returns 201 with created label on success', async () => {
      (prisma.label.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({ _max: { position: 3 } });
      const fakeLabel = { id: 'l1', name: 'Finance', color: '#F59E0B', position: 4 };
      (prisma.label.create as ReturnType<typeof vi.fn>).mockResolvedValue(fakeLabel);

      const req = mockRequest({ body: { name: 'Finance', color: '#F59E0B' } });
      const reply = mockReply();

      await simulateCreateLabel(req, reply);

      expect(reply._code).toBe(201);
      expect(reply._body).toEqual({ label: fakeLabel });
    });

    it('defaults color to #6B7280 when not provided', async () => {
      (prisma.label.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({ _max: { position: null } });
      (prisma.label.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'l1' });

      const req = mockRequest({ body: { name: 'My Label' } });
      const reply = mockReply();

      await simulateCreateLabel(req, reply);

      const createCall = (prisma.label.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.color).toBe('#6B7280');
    });

    it('defaults icon to null when not provided', async () => {
      (prisma.label.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({ _max: { position: null } });
      (prisma.label.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'l1' });

      const req = mockRequest({ body: { name: 'My Label' } });
      const reply = mockReply();

      await simulateCreateLabel(req, reply);

      const createCall = (prisma.label.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.icon).toBeNull();
    });

    it('trims whitespace from name', async () => {
      (prisma.label.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({ _max: { position: null } });
      (prisma.label.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'l1' });

      const req = mockRequest({ body: { name: '  Finance  ' } });
      const reply = mockReply();

      await simulateCreateLabel(req, reply);

      const createCall = (prisma.label.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.name).toBe('Finance');
    });

    it('sets position to 0 when no labels exist yet', async () => {
      (prisma.label.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({ _max: { position: null } });
      (prisma.label.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'l1', position: 0 });

      const req = mockRequest({ body: { name: 'First' } });
      const reply = mockReply();

      await simulateCreateLabel(req, reply);

      const createCall = (prisma.label.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.position).toBe(0);
    });
  });

  // ── PATCH /labels/:id ────────────────────────────────────────────────────

  describe('PATCH /labels/:id', () => {
    it('returns 404 when label not found', async () => {
      (prisma.label.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const req = mockRequest({ params: { id: 'l1' }, body: { name: 'New' } });
      const reply = mockReply();
      await simulateUpdateLabel(req, reply);
      expect(reply._code).toBe(404);
    });

    it('updates only provided fields', async () => {
      (prisma.label.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'l1', name: 'Old' });
      (prisma.label.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'l1', name: 'New' });

      const req = mockRequest({ params: { id: 'l1' }, body: { name: 'New' } });
      const reply = mockReply();

      const result = await simulateUpdateLabel(req, reply) as any;

      expect(result.label).toEqual({ id: 'l1', name: 'New' });
      const updateCall = (prisma.label.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(Object.keys(updateCall.data)).toEqual(['name']);
    });

    it('trims name on update', async () => {
      (prisma.label.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'l1' });
      (prisma.label.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'l1', name: 'Trimmed' });

      const req = mockRequest({ params: { id: 'l1' }, body: { name: '  Trimmed  ' } });
      const reply = mockReply();

      await simulateUpdateLabel(req, reply);

      const updateCall = (prisma.label.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateCall.data.name).toBe('Trimmed');
    });

    it('can update position independently', async () => {
      (prisma.label.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'l1' });
      (prisma.label.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'l1', position: 3 });

      const req = mockRequest({ params: { id: 'l1' }, body: { position: 3 } });
      const reply = mockReply();

      await simulateUpdateLabel(req, reply);

      const updateCall = (prisma.label.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateCall.data).toEqual({ position: 3 });
    });
  });

  // ── DELETE /labels/:id ───────────────────────────────────────────────────

  describe('DELETE /labels/:id', () => {
    it('returns 404 when label not found', async () => {
      (prisma.label.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const req = mockRequest({ params: { id: 'l1' } });
      const reply = mockReply();
      await simulateDeleteLabel(req, reply);
      expect(reply._code).toBe(404);
    });

    it('deletes label and returns deleted: true', async () => {
      (prisma.label.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'l1' });
      (prisma.label.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'l1' });

      const req = mockRequest({ params: { id: 'l1' } });
      const reply = mockReply();

      const result = await simulateDeleteLabel(req, reply);
      expect(result).toEqual({ deleted: true });
      expect(prisma.label.delete).toHaveBeenCalledWith({ where: { id: 'l1' } });
    });
  });

  // ── POST /threads/:id/labels ─────────────────────────────────────────────

  describe('POST /threads/:id/labels', () => {
    it('returns 404 when thread not found', async () => {
      (prisma.emailThread.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const req = mockRequest({ params: { id: 't1' }, body: { labelIds: ['l1'] } });
      const reply = mockReply();

      await simulateSetThreadLabels(req, reply);
      expect(reply._code).toBe(404);
    });

    it('deletes all existing labels before creating new ones', async () => {
      (prisma.emailThread.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1' });
      (prisma.label.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'l1' }, { id: 'l2' }]);
      (prisma.threadLabel.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 3 });
      (prisma.threadLabel.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 2 });

      const req = mockRequest({ params: { id: 't1' }, body: { labelIds: ['l1', 'l2'] } });
      const reply = mockReply();

      await simulateSetThreadLabels(req, reply);

      expect(prisma.threadLabel.deleteMany).toHaveBeenCalledWith({ where: { threadId: 't1' } });
      expect(prisma.threadLabel.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [{ threadId: 't1', labelId: 'l1' }, { threadId: 't1', labelId: 'l2' }],
        })
      );
    });

    it('only assigns labels that belong to the user (validates labelIds)', async () => {
      (prisma.emailThread.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1' });
      // Only l1 is valid (l2 belongs to another user)
      (prisma.label.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'l1' }]);
      (prisma.threadLabel.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (prisma.threadLabel.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

      const req = mockRequest({ params: { id: 't1' }, body: { labelIds: ['l1', 'l2-other-user'] } });
      const reply = mockReply();

      const result = await simulateSetThreadLabels(req, reply) as any;

      expect(result.updated).toBe(1);
    });

    it('does not call createMany when no valid labels', async () => {
      (prisma.emailThread.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1' });
      (prisma.label.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (prisma.threadLabel.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const req = mockRequest({ params: { id: 't1' }, body: { labelIds: ['invalid'] } });
      const reply = mockReply();

      const result = await simulateSetThreadLabels(req, reply) as any;

      expect(prisma.threadLabel.createMany).not.toHaveBeenCalled();
      expect(result.updated).toBe(0);
    });

    it('returns updated count', async () => {
      (prisma.emailThread.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1' });
      (prisma.label.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'l1' }, { id: 'l2' }, { id: 'l3' },
      ]);
      (prisma.threadLabel.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (prisma.threadLabel.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const req = mockRequest({ params: { id: 't1' }, body: { labelIds: ['l1', 'l2', 'l3'] } });
      const reply = mockReply();

      const result = await simulateSetThreadLabels(req, reply) as any;
      expect(result.updated).toBe(3);
    });
  });

  // ── DELETE /threads/:id/labels/:labelId ──────────────────────────────────

  describe('DELETE /threads/:id/labels/:labelId', () => {
    it('returns 404 when thread not found', async () => {
      (prisma.emailThread.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const req = mockRequest({ params: { id: 't1', labelId: 'l1' } });
      const reply = mockReply();

      await simulateRemoveThreadLabel(req, reply);
      expect(reply._code).toBe(404);
    });

    it('removes the specific label from thread', async () => {
      (prisma.emailThread.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1' });
      (prisma.threadLabel.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

      const req = mockRequest({ params: { id: 't1', labelId: 'l1' } });
      const reply = mockReply();

      const result = await simulateRemoveThreadLabel(req, reply);

      expect(result).toEqual({ deleted: true });
      expect(prisma.threadLabel.deleteMany).toHaveBeenCalledWith({
        where: { threadId: 't1', labelId: 'l1' },
      });
    });
  });

  // ── POST /threads/bulk/label ─────────────────────────────────────────────

  describe('POST /threads/bulk/label', () => {
    it('returns 400 when threadIds is not an array', async () => {
      const req = mockRequest({ body: { threadIds: 'not-array', labelId: 'l1' } });
      const reply = mockReply();
      await simulateBulkLabel(req, reply);
      expect(reply._code).toBe(400);
    });

    it('returns 400 when threadIds is empty array', async () => {
      const req = mockRequest({ body: { threadIds: [], labelId: 'l1' } });
      const reply = mockReply();
      await simulateBulkLabel(req, reply);
      expect(reply._code).toBe(400);
      expect(reply._body).toMatchObject({ error: 'threadIds must be a non-empty array' });
    });

    it('returns 404 when label not found', async () => {
      (prisma.label.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const req = mockRequest({ body: { threadIds: ['t1', 't2'], labelId: 'l-missing' } });
      const reply = mockReply();

      await simulateBulkLabel(req, reply);
      expect(reply._code).toBe(404);
      expect(reply._body).toMatchObject({ error: 'Label not found' });
    });

    it('assigns label to valid threads and returns updated count', async () => {
      (prisma.label.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'l1' });
      (prisma.emailThread.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 't1' }, { id: 't2' },
      ]);
      (prisma.threadLabel.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 2 });

      const req = mockRequest({ body: { threadIds: ['t1', 't2'], labelId: 'l1' } });
      const reply = mockReply();

      const result = await simulateBulkLabel(req, reply) as any;
      expect(result.updated).toBe(2);
    });

    it('only assigns to threads that belong to user', async () => {
      (prisma.label.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'l1' });
      // Only t1 belongs to user (t2 filtered out)
      (prisma.emailThread.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 't1' }]);
      (prisma.threadLabel.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

      const req = mockRequest({ body: { threadIds: ['t1', 't2-other-user'], labelId: 'l1' } });
      const reply = mockReply();

      const result = await simulateBulkLabel(req, reply) as any;
      expect(result.updated).toBe(1);

      const createCall = (prisma.threadLabel.createMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data).toEqual([{ threadId: 't1', labelId: 'l1' }]);
    });

    it('verifies label ownership with userId', async () => {
      (prisma.label.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'l1' });
      (prisma.emailThread.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 't1' }]);
      (prisma.threadLabel.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const req = mockRequest({ body: { threadIds: ['t1'], labelId: 'l1' } });
      const reply = mockReply();

      await simulateBulkLabel(req, reply);

      expect(prisma.label.findFirst).toHaveBeenCalledWith({
        where: { id: 'l1', userId: USER_ID },
      });
    });
  });
});
