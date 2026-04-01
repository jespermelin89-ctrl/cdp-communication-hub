/**
 * Label routes — Sprint 2: Custom Labels & Tags
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database';
import { authMiddleware } from '../middleware/auth.middleware';

// Default labels seeded on first request
const DEFAULT_LABELS = [
  { name: 'CDP', color: '#3B82F6', position: 0 },
  { name: 'Myndighet', color: '#EF4444', position: 1 },
  { name: 'Ekonomi', color: '#F59E0B', position: 2 },
  { name: 'Personligt', color: '#10B981', position: 3 },
  { name: 'Viktigt', color: '#8B5CF6', position: 4 },
];

export async function labelRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  /**
   * GET /labels — List all labels for the user.
   * Auto-seeds defaults on first call.
   */
  fastify.get('/labels', async (request) => {
    // Auto-seed defaults if user has no labels
    const existing = await prisma.label.count({ where: { userId: request.userId! } });
    if (existing === 0) {
      await prisma.label.createMany({
        data: DEFAULT_LABELS.map((l) => ({ ...l, userId: request.userId! })),
        skipDuplicates: true,
      });
    }
    const labels = await prisma.label.findMany({
      where: { userId: request.userId! },
      orderBy: { position: 'asc' },
    });
    return { labels };
  });

  /**
   * POST /labels — Create a new label.
   */
  fastify.post('/labels', async (request, reply) => {
    const { name, color, icon } = request.body as { name: string; color?: string; icon?: string };
    if (!name?.trim()) return reply.code(400).send({ error: 'name is required' });

    const maxPos = await prisma.label.aggregate({
      where: { userId: request.userId! },
      _max: { position: true },
    });

    try {
      const label = await prisma.label.create({
        data: {
          userId: request.userId!,
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
  });

  /**
   * PATCH /labels/:id — Update a label.
   */
  fastify.patch('/labels/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { name, color, icon, position } = request.body as {
      name?: string;
      color?: string;
      icon?: string;
      position?: number;
    };

    const label = await prisma.label.findFirst({ where: { id, userId: request.userId! } });
    if (!label) return reply.code(404).send({ error: 'Label not found' });

    const updated = await prisma.label.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(color !== undefined && { color }),
        ...(icon !== undefined && { icon }),
        ...(position !== undefined && { position }),
      },
    });
    return { label: updated };
  });

  /**
   * DELETE /labels/:id — Delete a label and all its thread associations.
   */
  fastify.delete('/labels/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const label = await prisma.label.findFirst({ where: { id, userId: request.userId! } });
    if (!label) return reply.code(404).send({ error: 'Label not found' });
    await prisma.label.delete({ where: { id } });
    return { deleted: true };
  });

  /**
   * POST /threads/:id/labels — Set labels on a thread (replaces existing).
   */
  fastify.post('/threads/:id/labels', async (request, reply) => {
    const { id: threadId } = request.params as { id: string };
    const { labelIds } = request.body as { labelIds: string[] };

    const thread = await prisma.emailThread.findFirst({
      where: { id: threadId, account: { userId: request.userId! } },
    });
    if (!thread) return reply.code(404).send({ error: 'Thread not found' });

    // Validate all labelIds belong to user
    const validLabels = await prisma.label.findMany({
      where: { id: { in: labelIds }, userId: request.userId! },
      select: { id: true },
    });
    const validIds = validLabels.map((l) => l.id);

    // Delete all existing + re-create
    await prisma.threadLabel.deleteMany({ where: { threadId } });
    if (validIds.length > 0) {
      await prisma.threadLabel.createMany({
        data: validIds.map((labelId) => ({ threadId, labelId })),
        skipDuplicates: true,
      });
    }
    return { updated: validIds.length };
  });

  /**
   * DELETE /threads/:id/labels/:labelId — Remove a label from a thread.
   */
  fastify.delete('/threads/:id/labels/:labelId', async (request, reply) => {
    const { id: threadId, labelId } = request.params as { id: string; labelId: string };

    const thread = await prisma.emailThread.findFirst({
      where: { id: threadId, account: { userId: request.userId! } },
    });
    if (!thread) return reply.code(404).send({ error: 'Thread not found' });

    await prisma.threadLabel.deleteMany({ where: { threadId, labelId } });
    return { deleted: true };
  });

  /**
   * POST /threads/bulk/label — Bulk assign a label to multiple threads.
   */
  fastify.post('/threads/bulk/label', async (request, reply) => {
    const { threadIds, labelId } = request.body as { threadIds: string[]; labelId: string };
    if (!Array.isArray(threadIds) || threadIds.length === 0)
      return reply.code(400).send({ error: 'threadIds must be a non-empty array' });

    const label = await prisma.label.findFirst({ where: { id: labelId, userId: request.userId! } });
    if (!label) return reply.code(404).send({ error: 'Label not found' });

    const threads = await prisma.emailThread.findMany({
      where: { id: { in: threadIds }, account: { userId: request.userId! } },
      select: { id: true },
    });
    const validThreadIds = threads.map((t) => t.id);

    await prisma.threadLabel.createMany({
      data: validThreadIds.map((threadId) => ({ threadId, labelId })),
      skipDuplicates: true,
    });

    return { updated: validThreadIds.length };
  });
}
