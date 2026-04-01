/**
 * Saved Views routes
 *
 * GET   /views             — List views
 * POST  /views             — Create view
 * PATCH /views/:id         — Update view
 * DELETE /views/:id        — Delete view
 * PATCH /views/reorder     — Reorder views
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database';
import { authMiddleware } from '../middleware/auth.middleware';

export async function savedViewsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // GET /views
  fastify.get('/views', async (request) => {
    const views = await prisma.savedView.findMany({
      where: { userId: request.userId },
      orderBy: { position: 'asc' },
    });
    return { views };
  });

  // POST /views — create
  fastify.post('/views', async (request, reply) => {
    const body = request.body as {
      name: string;
      icon?: string;
      filters: Record<string, unknown>;
      sort_key?: string;
    };

    if (!body.name || !body.filters) {
      return reply.code(400).send({ error: 'name and filters are required' });
    }

    // Determine next position
    const maxPos = await prisma.savedView.aggregate({
      where: { userId: request.userId },
      _max: { position: true },
    });

    const view = await prisma.savedView.create({
      data: {
        userId: request.userId,
        name: body.name,
        icon: body.icon ?? null,
        filters: body.filters as any,
        sortKey: body.sort_key ?? null,
        position: (maxPos._max.position ?? -1) + 1,
      },
    });

    return { view };
  });

  // PATCH /views/reorder — must come before :id route
  fastify.patch('/views/reorder', async (request, reply) => {
    const body = request.body as { ids: string[] };

    if (!Array.isArray(body.ids)) {
      return reply.code(400).send({ error: 'ids array is required' });
    }

    await Promise.all(
      body.ids.map((id, index) =>
        prisma.savedView.updateMany({
          where: { id, userId: request.userId },
          data: { position: index },
        })
      )
    );

    const views = await prisma.savedView.findMany({
      where: { userId: request.userId },
      orderBy: { position: 'asc' },
    });

    return { views };
  });

  // PATCH /views/:id — update
  fastify.patch('/views/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      icon?: string;
      filters?: Record<string, unknown>;
      sort_key?: string;
    };

    const existing = await prisma.savedView.findFirst({
      where: { id, userId: request.userId },
    });
    if (!existing) return reply.code(404).send({ error: 'View not found' });

    const view = await prisma.savedView.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.icon !== undefined && { icon: body.icon }),
        ...(body.filters !== undefined && { filters: body.filters as any }),
        ...(body.sort_key !== undefined && { sortKey: body.sort_key }),
      },
    });

    return { view };
  });

  // DELETE /views/:id
  fastify.delete('/views/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.savedView.findFirst({
      where: { id, userId: request.userId },
    });
    if (!existing) return reply.code(404).send({ error: 'View not found' });

    await prisma.savedView.delete({ where: { id } });
    return { ok: true };
  });
}
