/**
 * Draft routes - CRITICAL PATH
 *
 * These routes manage the draft lifecycle.
 * The /send endpoint enforces the approval gate.
 */

import { FastifyInstance } from 'fastify';
import { draftService } from '../services/draft.service';
import { brainCoreService } from '../services/brain-core.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { CreateDraftSchema, UpdateDraftSchema, DraftQuerySchema } from '../utils/validators';

export async function draftRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  /**
   * POST /drafts - Create a new pending draft
   */
  fastify.post('/drafts', async (request, reply) => {
    const parsed = CreateDraftSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.issues });
    }

    const draft = await draftService.create(request.userId, parsed.data);
    return reply.code(201).send({ draft });
  });

  /**
   * GET /drafts - List drafts with optional filters
   */
  fastify.get('/drafts', async (request) => {
    const query = DraftQuerySchema.safeParse(request.query);
    const options = query.success ? query.data : {};

    return draftService.list(request.userId, {
      status: options.status,
      accountId: options.account_id,
      page: options.page,
      limit: options.limit,
    });
  });

  /**
   * GET /drafts/:id - Get a specific draft
   */
  fastify.get('/drafts/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const draft = await draftService.getById(id, request.userId);
      return { draft };
    } catch (error: any) {
      return reply.code(404).send({ error: error.message });
    }
  });

  /**
   * PATCH /drafts/:id - Update a pending draft
   */
  fastify.patch('/drafts/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateDraftSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.issues });
    }

    try {
      const draft = await draftService.update(id, request.userId, parsed.data);
      return { draft };
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : 400;
      return reply.code(code).send({ error: error.message });
    }
  });

  /**
   * POST /drafts/:id/approve - Mark draft as approved
   */
  fastify.post('/drafts/:id/approve', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const draft = await draftService.approve(id, request.userId);

      // Record learning event — non-critical, fire-and-forget
      brainCoreService.recordLearning(
        request.userId!,
        'draft:approved',
        {
          draft_id: draft.id,
          thread_id: draft.threadId ?? null,
          to_addresses: draft.toAddresses,
          subject: draft.subject,
          word_count: draft.bodyText
            ? draft.bodyText.trim().split(/\s+/).filter(Boolean).length
            : 0,
          char_count: draft.bodyText?.length ?? 0,
        },
        'draft_approve',
        draft.id
      ).catch(() => {});

      return { draft, message: 'Draft approved. You can now send it.' };
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : 400;
      return reply.code(code).send({ error: error.message });
    }
  });

  /**
   * POST /drafts/:id/send - Send an approved draft via Gmail
   *
   * CRITICAL: This endpoint ONLY works for drafts with status 'approved'.
   * The safety gate is enforced in DraftService.send().
   */
  fastify.post('/drafts/:id/send', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const draft = await draftService.send(id, request.userId);
      return {
        draft,
        message: 'Email sent successfully via Gmail.',
      };
    } catch (error: any) {
      if (error.message.includes('SECURITY')) {
        return reply.code(403).send({ error: error.message });
      }
      const code = error.message.includes('not found') ? 404 : 500;
      return reply.code(code).send({ error: error.message });
    }
  });

  /**
   * POST /drafts/:id/schedule — Schedule a draft for future delivery
   * Body: { send_at: ISO datetime string }
   * Requires draft to be in 'approved' status.
   */
  fastify.post('/drafts/:id/schedule', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { send_at?: string };

    if (!body?.send_at) {
      return reply.code(400).send({ error: 'send_at is required (ISO datetime string)' });
    }

    const sendAt = new Date(body.send_at);
    if (isNaN(sendAt.getTime())) {
      return reply.code(400).send({ error: 'send_at must be a valid ISO datetime' });
    }
    if (sendAt <= new Date()) {
      return reply.code(400).send({ error: 'send_at must be in the future' });
    }

    try {
      const { prisma } = await import('../config/database');
      const draft = await prisma.draft.findFirst({
        where: { id, userId: request.userId },
      });
      if (!draft) return reply.code(404).send({ error: 'Draft not found' });
      if (draft.status !== 'approved') {
        return reply.code(400).send({ error: 'Draft must be approved before scheduling' });
      }

      const updated = await prisma.draft.update({
        where: { id },
        data: { scheduledAt: sendAt },
        include: { account: { select: { emailAddress: true, id: true } }, thread: { select: { id: true, subject: true } } },
      });

      await prisma.actionLog.create({
        data: {
          userId: request.userId!,
          actionType: 'draft_scheduled',
          targetType: 'draft',
          targetId: id,
          metadata: { send_at: sendAt.toISOString() },
        },
      });

      return {
        draft: updated,
        message: `Schemalagt för ${sendAt.toLocaleString('sv-SE')}`,
      };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * DELETE /drafts/:id/schedule — Cancel scheduled send
   */
  fastify.delete('/drafts/:id/schedule', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const { prisma } = await import('../config/database');
      const draft = await prisma.draft.findFirst({
        where: { id, userId: request.userId },
      });
      if (!draft) return reply.code(404).send({ error: 'Draft not found' });

      const updated = await prisma.draft.update({
        where: { id },
        data: { scheduledAt: null },
        include: { account: { select: { emailAddress: true, id: true } }, thread: { select: { id: true, subject: true } } },
      });

      return { draft: updated, message: 'Schemaläggning avbruten' };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * POST /drafts/:id/discard - Discard a draft
   */
  fastify.post('/drafts/:id/discard', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const draft = await draftService.discard(id, request.userId);
      return { draft, message: 'Draft discarded.' };
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : 400;
      return reply.code(code).send({ error: error.message });
    }
  });
}
