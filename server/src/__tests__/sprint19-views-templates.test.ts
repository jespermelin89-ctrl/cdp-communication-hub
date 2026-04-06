/**
 * Sprint 19 — Saved Views + Templates Route Tests
 *
 * Simulate-handler pattern: extract route logic into standalone async functions,
 * mock Prisma and services, test without spinning up Fastify.
 *
 * Covers:
 *   views.ts     — GET /views, POST /views, PATCH /views/reorder,
 *                  PATCH /views/:id, DELETE /views/:id
 *   templates.ts — GET /templates, POST /templates, PATCH /templates/:id,
 *                  DELETE /templates/:id, POST /templates/:id/use,
 *                  POST /templates/generate
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../config/database', () => ({
  prisma: {
    savedView: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    emailTemplate: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('../services/ai.service', () => ({
  aiService: {
    chat: vi.fn(),
  },
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import { prisma } from '../config/database';
import { aiService } from '../services/ai.service';
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

// ── Views simulate functions ──────────────────────────────────────────────────

async function simulateGetViews(req: ReturnType<typeof mockRequest>) {
  const views = await (prisma.savedView.findMany as ReturnType<typeof vi.fn>)({
    where: { userId: req.userId },
    orderBy: { position: 'asc' },
  });
  return { views };
}

async function simulateCreateView(
  req: ReturnType<typeof mockRequest>,
  reply: ReturnType<typeof mockReply>
) {
  const body = req.body as { name?: string; icon?: string; filters?: Record<string, unknown>; sort_key?: string };

  if (!body.name || !body.filters) {
    return reply.code(400).send({ error: 'name and filters are required' });
  }

  const maxPos = await (prisma.savedView.aggregate as ReturnType<typeof vi.fn>)({
    where: { userId: req.userId },
    _max: { position: true },
  });

  const view = await (prisma.savedView.create as ReturnType<typeof vi.fn>)({
    data: {
      userId: req.userId,
      name: body.name,
      icon: body.icon ?? null,
      filters: body.filters,
      sortKey: body.sort_key ?? null,
      position: (maxPos._max.position ?? -1) + 1,
    },
  });

  return { view };
}

async function simulateReorderViews(
  req: ReturnType<typeof mockRequest>,
  reply: ReturnType<typeof mockReply>
) {
  const body = req.body as { ids?: string[] };

  if (!Array.isArray(body.ids)) {
    return reply.code(400).send({ error: 'ids array is required' });
  }

  await Promise.all(
    body.ids.map((id, index) =>
      (prisma.savedView.updateMany as ReturnType<typeof vi.fn>)({
        where: { id, userId: req.userId },
        data: { position: index },
      })
    )
  );

  const views = await (prisma.savedView.findMany as ReturnType<typeof vi.fn>)({
    where: { userId: req.userId },
    orderBy: { position: 'asc' },
  });

  return { views };
}

async function simulateUpdateView(
  req: ReturnType<typeof mockRequest>,
  reply: ReturnType<typeof mockReply>
) {
  const { id } = req.params as { id: string };
  const body = req.body as { name?: string; icon?: string; filters?: Record<string, unknown>; sort_key?: string };

  const existing = await (prisma.savedView.findFirst as ReturnType<typeof vi.fn>)({
    where: { id, userId: req.userId },
  });
  if (!existing) return reply.code(404).send({ error: 'View not found' });

  const view = await (prisma.savedView.update as ReturnType<typeof vi.fn>)({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.icon !== undefined && { icon: body.icon }),
      ...(body.filters !== undefined && { filters: body.filters }),
      ...(body.sort_key !== undefined && { sortKey: body.sort_key }),
    },
  });

  return { view };
}

async function simulateDeleteView(
  req: ReturnType<typeof mockRequest>,
  reply: ReturnType<typeof mockReply>
) {
  const { id } = req.params as { id: string };

  const existing = await (prisma.savedView.findFirst as ReturnType<typeof vi.fn>)({
    where: { id, userId: req.userId },
  });
  if (!existing) return reply.code(404).send({ error: 'View not found' });

  await (prisma.savedView.delete as ReturnType<typeof vi.fn>)({ where: { id } });
  return { ok: true };
}

// ── Templates simulate functions ──────────────────────────────────────────────

const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  subject: z.string().max(500).optional(),
  body_text: z.string().optional(),
  body_html: z.string().optional(),
  category: z.string().max(100).optional(),
  variables: z.record(z.unknown()).optional(),
});

const UpdateTemplateSchema = CreateTemplateSchema.partial();

async function simulateGetTemplates(req: ReturnType<typeof mockRequest>) {
  const templates = await (prisma.emailTemplate.findMany as ReturnType<typeof vi.fn>)({
    where: { userId: req.userId },
    orderBy: [{ usageCount: 'desc' }, { createdAt: 'desc' }],
  });
  return { templates };
}

async function simulateCreateTemplate(
  req: ReturnType<typeof mockRequest>,
  reply: ReturnType<typeof mockReply>
) {
  let body: z.infer<typeof CreateTemplateSchema>;
  try {
    body = CreateTemplateSchema.parse(req.body);
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }

  const template = await (prisma.emailTemplate.create as ReturnType<typeof vi.fn>)({
    data: {
      userId: req.userId,
      name: body.name,
      subject: body.subject ?? null,
      bodyText: body.body_text ?? null,
      bodyHtml: body.body_html ?? null,
      category: body.category ?? null,
      variables: body.variables ?? null,
    },
  });

  return { template };
}

async function simulateUpdateTemplate(
  req: ReturnType<typeof mockRequest>,
  reply: ReturnType<typeof mockReply>
) {
  const { id } = req.params as { id: string };
  let body: z.infer<typeof UpdateTemplateSchema>;
  try {
    body = UpdateTemplateSchema.parse(req.body);
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }

  const existing = await (prisma.emailTemplate.findFirst as ReturnType<typeof vi.fn>)({
    where: { id, userId: req.userId },
  });
  if (!existing) return reply.code(404).send({ error: 'Template not found' });

  const template = await (prisma.emailTemplate.update as ReturnType<typeof vi.fn>)({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.subject !== undefined && { subject: body.subject }),
      ...(body.body_text !== undefined && { bodyText: body.body_text }),
      ...(body.body_html !== undefined && { bodyHtml: body.body_html }),
      ...(body.category !== undefined && { category: body.category }),
      ...(body.variables !== undefined && { variables: body.variables }),
    },
  });

  return { template };
}

async function simulateDeleteTemplate(
  req: ReturnType<typeof mockRequest>,
  reply: ReturnType<typeof mockReply>
) {
  const { id } = req.params as { id: string };

  const existing = await (prisma.emailTemplate.findFirst as ReturnType<typeof vi.fn>)({
    where: { id, userId: req.userId },
  });
  if (!existing) return reply.code(404).send({ error: 'Template not found' });

  await (prisma.emailTemplate.delete as ReturnType<typeof vi.fn>)({ where: { id } });
  return { ok: true };
}

async function simulateUseTemplate(
  req: ReturnType<typeof mockRequest>,
  reply: ReturnType<typeof mockReply>
) {
  const { id } = req.params as { id: string };

  const existing = await (prisma.emailTemplate.findFirst as ReturnType<typeof vi.fn>)({
    where: { id, userId: req.userId },
  });
  if (!existing) return reply.code(404).send({ error: 'Template not found' });

  const template = await (prisma.emailTemplate.update as ReturnType<typeof vi.fn>)({
    where: { id },
    data: { usageCount: { increment: 1 } },
  });

  return { template };
}

async function simulateGenerateTemplate(
  req: ReturnType<typeof mockRequest>,
  reply: ReturnType<typeof mockReply>
) {
  const body = req.body as { instructions?: string; name?: string; category?: string };

  if (!body.instructions) {
    return reply.code(400).send({ error: 'instructions is required' });
  }

  try {
    const prompt = `Skriv en e-postmall baserat på följande instruktion. Svara med JSON i formatet:
{"subject": "...", "body_text": "...", "body_html": "..."}

Instruktion: ${body.instructions}

Skriv på svenska om inte instruktionen specificerar annat. Gör mallen professionell och klar för användning.`;

    const result = await (aiService.chat as ReturnType<typeof vi.fn>)(
      'Du är en expert på att skriva e-postmallar.',
      prompt
    );
    let parsed: { subject?: string; body_text?: string; body_html?: string } = {};

    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch {
      parsed = { body_text: result };
    }

    const template = await (prisma.emailTemplate.create as ReturnType<typeof vi.fn>)({
      data: {
        userId: req.userId,
        name: body.name ?? `AI-mall ${new Date().toLocaleDateString('sv-SE')}`,
        subject: parsed.subject ?? null,
        bodyText: parsed.body_text ?? null,
        bodyHtml: parsed.body_html ?? null,
        category: body.category ?? 'ai-generated',
      },
    });

    return { template };
  } catch (err: any) {
    return reply.code(500).send({ error: 'AI generation failed', message: err.message });
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Sprint 19 — Saved Views Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── GET /views ───────────────────────────────────────────────────────────

  describe('GET /views', () => {
    it('returns all views for user ordered by position', async () => {
      const fakeViews = [
        { id: 'v1', name: 'Inbox', position: 0 },
        { id: 'v2', name: 'Work', position: 1 },
      ];
      (prisma.savedView.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(fakeViews);

      const result = await simulateGetViews(mockRequest());

      expect(result).toEqual({ views: fakeViews });
      expect(prisma.savedView.findMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        orderBy: { position: 'asc' },
      });
    });

    it('returns empty array when no views', async () => {
      (prisma.savedView.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await simulateGetViews(mockRequest());

      expect(result).toEqual({ views: [] });
    });
  });

  // ── POST /views ──────────────────────────────────────────────────────────

  describe('POST /views', () => {
    it('returns 400 when name is missing', async () => {
      const req = mockRequest({ body: { filters: { classification: 'important' } } });
      const reply = mockReply();

      await simulateCreateView(req, reply);

      expect(reply._code).toBe(400);
      expect(reply._body).toMatchObject({ error: 'name and filters are required' });
    });

    it('returns 400 when filters is missing', async () => {
      const req = mockRequest({ body: { name: 'My View' } });
      const reply = mockReply();

      await simulateCreateView(req, reply);

      expect(reply._code).toBe(400);
    });

    it('sets position to max + 1', async () => {
      (prisma.savedView.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
        _max: { position: 4 },
      });
      (prisma.savedView.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'v1', position: 5 });

      const req = mockRequest({ body: { name: 'My View', filters: {} } });
      const reply = mockReply();

      await simulateCreateView(req, reply);

      const createCall = (prisma.savedView.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.position).toBe(5);
    });

    it('sets position to 0 when no views exist (max is null)', async () => {
      (prisma.savedView.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
        _max: { position: null },
      });
      (prisma.savedView.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'v1', position: 0 });

      const req = mockRequest({ body: { name: 'First View', filters: {} } });
      const reply = mockReply();

      await simulateCreateView(req, reply);

      const createCall = (prisma.savedView.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.position).toBe(0);
    });

    it('creates view with correct data', async () => {
      (prisma.savedView.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({ _max: { position: 0 } });
      const fakeView = { id: 'v1', name: 'Work', icon: '💼', position: 1 };
      (prisma.savedView.create as ReturnType<typeof vi.fn>).mockResolvedValue(fakeView);

      const req = mockRequest({
        body: { name: 'Work', icon: '💼', filters: { classification: 'work' }, sort_key: 'date' },
      });
      const reply = mockReply();

      const result = await simulateCreateView(req, reply);

      expect(result).toEqual({ view: fakeView });
      expect(prisma.savedView.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: USER_ID,
            name: 'Work',
            icon: '💼',
            sortKey: 'date',
          }),
        })
      );
    });

    it('defaults icon and sort_key to null when not provided', async () => {
      (prisma.savedView.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({ _max: { position: null } });
      (prisma.savedView.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'v1' });

      const req = mockRequest({ body: { name: 'Simple View', filters: {} } });
      const reply = mockReply();

      await simulateCreateView(req, reply);

      const createCall = (prisma.savedView.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.icon).toBeNull();
      expect(createCall.data.sortKey).toBeNull();
    });
  });

  // ── PATCH /views/reorder ─────────────────────────────────────────────────

  describe('PATCH /views/reorder', () => {
    it('returns 400 when ids is not an array', async () => {
      const req = mockRequest({ body: { ids: 'not-an-array' } });
      const reply = mockReply();

      await simulateReorderViews(req, reply);

      expect(reply._code).toBe(400);
      expect(reply._body).toMatchObject({ error: 'ids array is required' });
    });

    it('returns 400 when ids is missing', async () => {
      const req = mockRequest({ body: {} });
      const reply = mockReply();

      await simulateReorderViews(req, reply);

      expect(reply._code).toBe(400);
    });

    it('calls updateMany for each id with correct position index', async () => {
      (prisma.savedView.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
      (prisma.savedView.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const req = mockRequest({ body: { ids: ['v3', 'v1', 'v2'] } });
      const reply = mockReply();

      await simulateReorderViews(req, reply);

      expect(prisma.savedView.updateMany).toHaveBeenCalledTimes(3);
      expect(prisma.savedView.updateMany).toHaveBeenCalledWith({
        where: { id: 'v3', userId: USER_ID },
        data: { position: 0 },
      });
      expect(prisma.savedView.updateMany).toHaveBeenCalledWith({
        where: { id: 'v1', userId: USER_ID },
        data: { position: 1 },
      });
      expect(prisma.savedView.updateMany).toHaveBeenCalledWith({
        where: { id: 'v2', userId: USER_ID },
        data: { position: 2 },
      });
    });

    it('returns re-fetched views after reorder', async () => {
      (prisma.savedView.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
      const reorderedViews = [
        { id: 'v3', position: 0 },
        { id: 'v1', position: 1 },
      ];
      (prisma.savedView.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(reorderedViews);

      const req = mockRequest({ body: { ids: ['v3', 'v1'] } });
      const reply = mockReply();

      const result = await simulateReorderViews(req, reply);

      expect(result).toEqual({ views: reorderedViews });
    });
  });

  // ── PATCH /views/:id ─────────────────────────────────────────────────────

  describe('PATCH /views/:id', () => {
    it('returns 404 when view not found', async () => {
      (prisma.savedView.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const req = mockRequest({ params: { id: 'v1' }, body: { name: 'New Name' } });
      const reply = mockReply();

      await simulateUpdateView(req, reply);

      expect(reply._code).toBe(404);
      expect(reply._body).toMatchObject({ error: 'View not found' });
    });

    it('updates only provided fields', async () => {
      (prisma.savedView.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'v1' });
      const updated = { id: 'v1', name: 'New Name' };
      (prisma.savedView.update as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

      const req = mockRequest({ params: { id: 'v1' }, body: { name: 'New Name' } });
      const reply = mockReply();

      const result = await simulateUpdateView(req, reply);

      expect(result).toEqual({ view: updated });
      const updateCall = (prisma.savedView.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateCall.data).toEqual({ name: 'New Name' });
      expect(updateCall.data.icon).toBeUndefined();
    });

    it('passes sort_key as sortKey to Prisma', async () => {
      (prisma.savedView.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'v1' });
      (prisma.savedView.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'v1' });

      const req = mockRequest({ params: { id: 'v1' }, body: { sort_key: 'subject' } });
      const reply = mockReply();

      await simulateUpdateView(req, reply);

      const updateCall = (prisma.savedView.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateCall.data.sortKey).toBe('subject');
    });
  });

  // ── DELETE /views/:id ────────────────────────────────────────────────────

  describe('DELETE /views/:id', () => {
    it('returns 404 when view not found', async () => {
      (prisma.savedView.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const req = mockRequest({ params: { id: 'v1' } });
      const reply = mockReply();

      await simulateDeleteView(req, reply);

      expect(reply._code).toBe(404);
    });

    it('deletes view and returns ok: true', async () => {
      (prisma.savedView.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'v1' });
      (prisma.savedView.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'v1' });

      const req = mockRequest({ params: { id: 'v1' } });
      const reply = mockReply();

      const result = await simulateDeleteView(req, reply);

      expect(result).toEqual({ ok: true });
      expect(prisma.savedView.delete).toHaveBeenCalledWith({ where: { id: 'v1' } });
    });
  });
});

// ── Template Route Tests ──────────────────────────────────────────────────────

describe('Sprint 19 — Templates Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── GET /templates ───────────────────────────────────────────────────────

  describe('GET /templates', () => {
    it('returns templates ordered by usageCount desc then createdAt desc', async () => {
      const fakeTemplates = [
        { id: 't1', name: 'Follow-up', usageCount: 5 },
        { id: 't2', name: 'Welcome', usageCount: 1 },
      ];
      (prisma.emailTemplate.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(fakeTemplates);

      const result = await simulateGetTemplates(mockRequest());

      expect(result).toEqual({ templates: fakeTemplates });
      expect(prisma.emailTemplate.findMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        orderBy: [{ usageCount: 'desc' }, { createdAt: 'desc' }],
      });
    });

    it('returns empty array when no templates', async () => {
      (prisma.emailTemplate.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await simulateGetTemplates(mockRequest());

      expect(result).toEqual({ templates: [] });
    });
  });

  // ── POST /templates ──────────────────────────────────────────────────────

  describe('POST /templates', () => {
    it('returns 400 when name is missing', async () => {
      const req = mockRequest({ body: {} });
      const reply = mockReply();

      await simulateCreateTemplate(req, reply);

      expect(reply._code).toBe(400);
    });

    it('returns 400 when name is empty string', async () => {
      const req = mockRequest({ body: { name: '' } });
      const reply = mockReply();

      await simulateCreateTemplate(req, reply);

      expect(reply._code).toBe(400);
    });

    it('returns 400 when name exceeds 200 chars', async () => {
      const req = mockRequest({ body: { name: 'a'.repeat(201) } });
      const reply = mockReply();

      await simulateCreateTemplate(req, reply);

      expect(reply._code).toBe(400);
    });

    it('creates template with correct data', async () => {
      const fakeTemplate = { id: 't1', name: 'Follow-up', usageCount: 0 };
      (prisma.emailTemplate.create as ReturnType<typeof vi.fn>).mockResolvedValue(fakeTemplate);

      const req = mockRequest({
        body: {
          name: 'Follow-up',
          subject: 'Re: {{subject}}',
          body_text: 'Hello {{name}},',
          category: 'sales',
        },
      });
      const reply = mockReply();

      const result = await simulateCreateTemplate(req, reply);

      expect(result).toEqual({ template: fakeTemplate });
      expect(prisma.emailTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: USER_ID,
            name: 'Follow-up',
            subject: 'Re: {{subject}}',
            bodyText: 'Hello {{name}},',
            category: 'sales',
          }),
        })
      );
    });

    it('defaults optional fields to null', async () => {
      (prisma.emailTemplate.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1' });

      const req = mockRequest({ body: { name: 'Simple' } });
      const reply = mockReply();

      await simulateCreateTemplate(req, reply);

      const createCall = (prisma.emailTemplate.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.subject).toBeNull();
      expect(createCall.data.bodyText).toBeNull();
      expect(createCall.data.bodyHtml).toBeNull();
      expect(createCall.data.category).toBeNull();
    });
  });

  // ── PATCH /templates/:id ─────────────────────────────────────────────────

  describe('PATCH /templates/:id', () => {
    it('returns 404 when template not found', async () => {
      (prisma.emailTemplate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const req = mockRequest({ params: { id: 't1' }, body: { name: 'New Name' } });
      const reply = mockReply();

      await simulateUpdateTemplate(req, reply);

      expect(reply._code).toBe(404);
      expect(reply._body).toMatchObject({ error: 'Template not found' });
    });

    it('updates only provided fields', async () => {
      (prisma.emailTemplate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1' });
      const updated = { id: 't1', name: 'Updated' };
      (prisma.emailTemplate.update as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

      const req = mockRequest({ params: { id: 't1' }, body: { name: 'Updated' } });
      const reply = mockReply();

      const result = await simulateUpdateTemplate(req, reply);

      expect(result).toEqual({ template: updated });
      const updateCall = (prisma.emailTemplate.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(Object.keys(updateCall.data)).toEqual(['name']);
    });

    it('maps body_text to bodyText and body_html to bodyHtml', async () => {
      (prisma.emailTemplate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1' });
      (prisma.emailTemplate.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1' });

      const req = mockRequest({
        params: { id: 't1' },
        body: { body_text: 'New text', body_html: '<p>New HTML</p>' },
      });
      const reply = mockReply();

      await simulateUpdateTemplate(req, reply);

      const updateCall = (prisma.emailTemplate.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateCall.data.bodyText).toBe('New text');
      expect(updateCall.data.bodyHtml).toBe('<p>New HTML</p>');
    });
  });

  // ── DELETE /templates/:id ────────────────────────────────────────────────

  describe('DELETE /templates/:id', () => {
    it('returns 404 when template not found', async () => {
      (prisma.emailTemplate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const req = mockRequest({ params: { id: 't1' } });
      const reply = mockReply();

      await simulateDeleteTemplate(req, reply);

      expect(reply._code).toBe(404);
    });

    it('deletes template and returns ok: true', async () => {
      (prisma.emailTemplate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1' });
      (prisma.emailTemplate.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1' });

      const req = mockRequest({ params: { id: 't1' } });
      const reply = mockReply();

      const result = await simulateDeleteTemplate(req, reply);

      expect(result).toEqual({ ok: true });
      expect(prisma.emailTemplate.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
    });
  });

  // ── POST /templates/:id/use ──────────────────────────────────────────────

  describe('POST /templates/:id/use', () => {
    it('returns 404 when template not found', async () => {
      (prisma.emailTemplate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const req = mockRequest({ params: { id: 't1' } });
      const reply = mockReply();

      await simulateUseTemplate(req, reply);

      expect(reply._code).toBe(404);
    });

    it('increments usageCount and returns updated template', async () => {
      const existing = { id: 't1', usageCount: 3 };
      (prisma.emailTemplate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
      const updated = { ...existing, usageCount: 4 };
      (prisma.emailTemplate.update as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

      const req = mockRequest({ params: { id: 't1' } });
      const reply = mockReply();

      const result = await simulateUseTemplate(req, reply);

      expect(result).toEqual({ template: updated });
      expect(prisma.emailTemplate.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { usageCount: { increment: 1 } },
      });
    });
  });

  // ── POST /templates/generate ─────────────────────────────────────────────

  describe('POST /templates/generate', () => {
    it('returns 400 when instructions is missing', async () => {
      const req = mockRequest({ body: {} });
      const reply = mockReply();

      await simulateGenerateTemplate(req, reply);

      expect(reply._code).toBe(400);
      expect(reply._body).toMatchObject({ error: 'instructions is required' });
    });

    it('returns 400 when instructions is empty string', async () => {
      const req = mockRequest({ body: { instructions: '' } });
      const reply = mockReply();

      await simulateGenerateTemplate(req, reply);

      expect(reply._code).toBe(400);
    });

    it('calls aiService.chat and creates template from JSON response', async () => {
      const aiResponse = '{"subject": "Uppföljning", "body_text": "Hej,\\n\\nVill bara följa upp.", "body_html": "<p>Hej</p>"}';
      (aiService.chat as ReturnType<typeof vi.fn>).mockResolvedValue(aiResponse);
      const fakeTemplate = { id: 't1', name: 'Follow-up mall', subject: 'Uppföljning' };
      (prisma.emailTemplate.create as ReturnType<typeof vi.fn>).mockResolvedValue(fakeTemplate);

      const req = mockRequest({
        body: { instructions: 'Skriv en uppföljningsmall', name: 'Follow-up mall' },
      });
      const reply = mockReply();

      const result = await simulateGenerateTemplate(req, reply);

      expect(result).toEqual({ template: fakeTemplate });
      expect(aiService.chat).toHaveBeenCalledWith(
        'Du är en expert på att skriva e-postmallar.',
        expect.stringContaining('Skriv en uppföljningsmall')
      );
      expect(prisma.emailTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subject: 'Uppföljning',
            bodyText: 'Hej,\n\nVill bara följa upp.',
          }),
        })
      );
    });

    it('falls back to body_text: result when regex finds braces but JSON.parse fails', async () => {
      // The fallback `parsed = { body_text: result }` triggers only when
      // the regex matches something that looks like JSON but fails to parse.
      const malformedJson = '{ invalid json here }';
      (aiService.chat as ReturnType<typeof vi.fn>).mockResolvedValue(malformedJson);
      (prisma.emailTemplate.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1' });

      const req = mockRequest({ body: { instructions: 'Skriv ett enkelt svar' } });
      const reply = mockReply();

      await simulateGenerateTemplate(req, reply);

      const createCall = (prisma.emailTemplate.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.bodyText).toBe(malformedJson);
      expect(createCall.data.subject).toBeNull();
    });

    it('leaves subject/body null when AI returns plain text with no JSON', async () => {
      // When regex does not match (no `{...}`) → parsed stays `{}` → all null
      const plainText = 'Hej! Det här är ett svar utan JSON-struktur.';
      (aiService.chat as ReturnType<typeof vi.fn>).mockResolvedValue(plainText);
      (prisma.emailTemplate.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1' });

      const req = mockRequest({ body: { instructions: 'Skriv ett enkelt svar' } });
      const reply = mockReply();

      await simulateGenerateTemplate(req, reply);

      const createCall = (prisma.emailTemplate.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.subject).toBeNull();
      expect(createCall.data.bodyText).toBeNull();
    });

    it('extracts JSON from AI response that contains surrounding text', async () => {
      const aiResponse = 'Here is the template:\n{"subject": "Test", "body_text": "Test body"}\n\nDone.';
      (aiService.chat as ReturnType<typeof vi.fn>).mockResolvedValue(aiResponse);
      (prisma.emailTemplate.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1' });

      const req = mockRequest({ body: { instructions: 'Make a template' } });
      const reply = mockReply();

      await simulateGenerateTemplate(req, reply);

      const createCall = (prisma.emailTemplate.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.subject).toBe('Test');
      expect(createCall.data.bodyText).toBe('Test body');
    });

    it('uses provided name instead of AI-generated default', async () => {
      (aiService.chat as ReturnType<typeof vi.fn>).mockResolvedValue('{"subject": "Test"}');
      (prisma.emailTemplate.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1' });

      const req = mockRequest({
        body: { instructions: 'Create template', name: 'My Custom Name' },
      });
      const reply = mockReply();

      await simulateGenerateTemplate(req, reply);

      const createCall = (prisma.emailTemplate.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.name).toBe('My Custom Name');
    });

    it('uses provided category instead of ai-generated default', async () => {
      (aiService.chat as ReturnType<typeof vi.fn>).mockResolvedValue('{"subject": "Test"}');
      (prisma.emailTemplate.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1' });

      const req = mockRequest({
        body: { instructions: 'Create template', category: 'sales' },
      });
      const reply = mockReply();

      await simulateGenerateTemplate(req, reply);

      const createCall = (prisma.emailTemplate.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.category).toBe('sales');
    });

    it('defaults category to ai-generated when not provided', async () => {
      (aiService.chat as ReturnType<typeof vi.fn>).mockResolvedValue('{"subject": "Test"}');
      (prisma.emailTemplate.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 't1' });

      const req = mockRequest({ body: { instructions: 'Create template' } });
      const reply = mockReply();

      await simulateGenerateTemplate(req, reply);

      const createCall = (prisma.emailTemplate.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.category).toBe('ai-generated');
    });

    it('returns 500 when aiService.chat throws', async () => {
      (aiService.chat as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('AI unavailable'));

      const req = mockRequest({ body: { instructions: 'Create template' } });
      const reply = mockReply();

      await simulateGenerateTemplate(req, reply);

      expect(reply._code).toBe(500);
      expect(reply._body).toMatchObject({ error: 'AI generation failed', message: 'AI unavailable' });
    });

    it('does not create template when AI fails', async () => {
      (aiService.chat as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('AI error'));

      const req = mockRequest({ body: { instructions: 'Create template' } });
      const reply = mockReply();

      await simulateGenerateTemplate(req, reply);

      expect(prisma.emailTemplate.create).not.toHaveBeenCalled();
    });
  });
});
