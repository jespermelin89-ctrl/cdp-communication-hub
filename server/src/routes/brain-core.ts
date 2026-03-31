/**
 * Brain Core routes — Writing profile, contacts, classification, daily summary, learning.
 *
 * GET  /brain-core/writing-profile          — full writing profile (modes + attributes)
 * PATCH /brain-core/writing-mode/:key       — update a writing mode
 * GET  /brain-core/contacts                 — list contact profiles
 * PATCH /brain-core/contact/:email          — upsert a contact profile
 * GET  /brain-core/classification           — list classification rules
 * GET  /brain-core/daily-summary            — get or generate today's daily summary
 * POST /brain-core/daily-summary            — force-regenerate today's daily summary
 * POST /brain-core/learn                    — record a learning event
 * GET  /brain-core/learning-stats           — get learning event stats
 */

import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.middleware';
import { brainCoreService } from '../services/brain-core.service';

export async function brainCoreRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // GET /brain-core/writing-profile
  fastify.get('/brain-core/writing-profile', async (request) => {
    const profile = await brainCoreService.getWritingProfile(request.userId);
    return { profile };
  });

  // PATCH /brain-core/writing-mode/:key
  fastify.patch('/brain-core/writing-mode/:key', async (request, reply) => {
    const { key } = request.params as { key: string };
    const body = request.body as any;

    try {
      const updated = await brainCoreService.updateWritingMode(request.userId, key, body);
      return { mode: updated };
    } catch (_) {
      return reply.code(404).send({ error: 'Writing mode not found' });
    }
  });

  // GET /brain-core/contacts?search=query
  fastify.get('/brain-core/contacts', async (request) => {
    const { search } = request.query as { search?: string };
    const contacts = await brainCoreService.getContacts(request.userId, 100, search);
    return { contacts };
  });

  // PATCH /brain-core/contacts/:id — update contact by ID
  fastify.patch('/brain-core/contacts/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;

    try {
      const { prisma } = await import('../config/database');
      const existing = await prisma.contactProfile.findFirst({
        where: { id, userId: request.userId },
      });
      if (!existing) return reply.code(404).send({ error: 'Contact not found' });

      const allowed = ['displayName', 'relationship', 'preferredMode', 'language', 'notes'];
      const updateData: Record<string, string> = {};
      for (const key of allowed) {
        if (body[key] !== undefined) updateData[key] = body[key];
      }

      const contact = await prisma.contactProfile.update({
        where: { id },
        data: updateData,
      });
      return { contact };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  // GET /brain-core/contacts/:id/threads — recent 5 threads with this contact
  fastify.get('/brain-core/contacts/:id/threads', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const { prisma } = await import('../config/database');
      const contact = await prisma.contactProfile.findFirst({
        where: { id, userId: request.userId },
      });
      if (!contact) return reply.code(404).send({ error: 'Contact not found' });

      const threads = await prisma.emailThread.findMany({
        where: {
          account: { userId: request.userId },
          participantEmails: { has: contact.emailAddress },
        },
        orderBy: { lastMessageAt: 'desc' },
        take: 5,
        select: { id: true, subject: true, lastMessageAt: true, messageCount: true, isRead: true },
      });
      return { threads };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  // PATCH /brain-core/contact/:email (legacy — kept for backwards compat)
  fastify.patch('/brain-core/contact/:email', async (request) => {
    const { email } = request.params as { email: string };
    const body = request.body as any;

    const contact = await brainCoreService.upsertContact(
      request.userId,
      decodeURIComponent(email),
      body
    );
    return { contact };
  });

  // GET /brain-core/classification
  fastify.get('/brain-core/classification', async (request) => {
    const rules = await brainCoreService.getClassificationRules(request.userId);
    return { rules };
  });

  // GET /brain-core/daily-summary
  fastify.get('/brain-core/daily-summary', async (request) => {
    const summary = await brainCoreService.getDailySummary(request.userId);
    return { summary };
  });

  // POST /brain-core/daily-summary  (force regenerate)
  fastify.post('/brain-core/daily-summary', async (request) => {
    const summary = await brainCoreService.generateDailySummary(request.userId);
    return { summary };
  });

  // POST /brain-core/learn
  fastify.post('/brain-core/learn', async (request, reply) => {
    const { event_type, data, source_type, source_id } = request.body as any;

    if (!event_type) {
      return reply.code(400).send({ error: 'event_type is required' });
    }

    const event = await brainCoreService.recordLearning(
      request.userId,
      event_type,
      data || {},
      source_type,
      source_id
    );
    return { event };
  });

  // GET /brain-core/learning-stats
  fastify.get('/brain-core/learning-stats', async (request) => {
    const stats = await brainCoreService.getLearningStats(request.userId);
    return { stats };
  });

  // POST /brain-core/sender-rules — create or update a sender rule
  fastify.post('/brain-core/sender-rules', async (request, reply) => {
    const { senderPattern, action, subjectPattern, categoryId, priority } = request.body as {
      senderPattern: string;
      action: 'spam' | 'archive' | 'categorize' | 'mute' | 'star';
      subjectPattern?: string;
      categoryId?: string;
      priority?: string;
    };

    if (!senderPattern || !action) {
      return reply.code(400).send({ error: 'senderPattern and action are required' });
    }

    const { prisma } = await import('../config/database');
    const existing = await prisma.senderRule.findFirst({
      where: { userId: request.userId, senderPattern },
    });

    const data = {
      action,
      subjectPattern: subjectPattern ?? null,
      categoryId: categoryId ?? null,
      priority: priority ?? null,
      confidence: 1.0,
      isActive: true,
    };

    let rule;
    if (existing) {
      rule = await prisma.senderRule.update({ where: { id: existing.id }, data });
    } else {
      rule = await prisma.senderRule.create({
        data: { userId: request.userId, senderPattern, ...data },
      });
    }

    return { rule };
  });
}
