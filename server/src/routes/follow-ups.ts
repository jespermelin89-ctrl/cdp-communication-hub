/**
 * Follow-Up Reminder routes
 *
 * GET    /follow-ups               — List active reminders
 * POST   /threads/:id/follow-up    — Create manual reminder
 * PATCH  /follow-ups/:id/complete  — Mark as done
 * DELETE /follow-ups/:id           — Delete
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database';
import { authMiddleware } from '../middleware/auth.middleware';

export async function followUpRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // GET /follow-ups — list active reminders (isCompleted: false)
  fastify.get('/follow-ups', async (request) => {
    const reminders = await prisma.followUpReminder.findMany({
      where: {
        userId: request.userId,
        isCompleted: false,
      },
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
  });

  // POST /threads/:id/follow-up — create manual reminder
  fastify.post('/threads/:id/follow-up', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { remind_at: string; note?: string };

    if (!body.remind_at) {
      return reply.code(400).send({ error: 'remind_at is required' });
    }

    // Verify thread belongs to user
    const thread = await prisma.emailThread.findFirst({
      where: { id, account: { userId: request.userId } },
    });
    if (!thread) {
      return reply.code(404).send({ error: 'Thread not found' });
    }

    const reminder = await prisma.followUpReminder.create({
      data: {
        userId: request.userId,
        threadId: id,
        remindAt: new Date(body.remind_at),
        reason: 'follow_up',
        note: body.note ?? null,
      },
    });

    return { reminder };
  });

  // PATCH /follow-ups/:id/complete — mark as done
  fastify.patch('/follow-ups/:id/complete', async (request, reply) => {
    const { id } = request.params as { id: string };

    const reminder = await prisma.followUpReminder.findFirst({
      where: { id, userId: request.userId },
    });
    if (!reminder) {
      return reply.code(404).send({ error: 'Reminder not found' });
    }

    const updated = await prisma.followUpReminder.update({
      where: { id },
      data: { isCompleted: true },
    });

    return { reminder: updated };
  });

  // DELETE /follow-ups/:id — delete reminder
  fastify.delete('/follow-ups/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const reminder = await prisma.followUpReminder.findFirst({
      where: { id, userId: request.userId },
    });
    if (!reminder) {
      return reply.code(404).send({ error: 'Reminder not found' });
    }

    await prisma.followUpReminder.delete({ where: { id } });

    return { ok: true };
  });
}
