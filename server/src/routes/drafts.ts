/**
 * Draft routes - CRITICAL PATH
 *
 * These routes manage the draft lifecycle.
 * The /send endpoint enforces the approval gate.
 */

import { FastifyInstance } from 'fastify';
import { draftService } from '../services/draft.service';
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
