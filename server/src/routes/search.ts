/**
 * Search routes — Sprint 7: Advanced Search
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database';
import { authMiddleware } from '../middleware/auth.middleware';

export async function searchRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  /**
   * GET /search — Advanced search with filters. Saves to search history.
   */
  fastify.get('/search', async (request) => {
    const q = request.query as {
      q?: string;
      from?: string;
      to?: string;
      dateFrom?: string;
      dateTo?: string;
      hasAttachment?: string;
      classification?: string;
      priority?: string;
      accountId?: string;
      labelIds?: string;
      page?: string;
      limit?: string;
    };

    const page = parseInt(q.page ?? '1', 10);
    const limit = Math.min(parseInt(q.limit ?? '20', 10), 50);
    const search = q.q?.trim();

    // Build dynamic where clause
    const where: any = {
      account: { userId: request.userId! },
    };

    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { snippet: { contains: search, mode: 'insensitive' } },
        { participantEmails: { has: search } },
      ];
    }

    if (q.accountId) {
      where.accountId = q.accountId;
    }

    if (q.dateFrom || q.dateTo) {
      where.lastMessageAt = {};
      if (q.dateFrom) where.lastMessageAt.gte = new Date(q.dateFrom);
      if (q.dateTo) where.lastMessageAt.lte = new Date(q.dateTo);
    }

    if (q.hasAttachment === 'true') {
      // Threads where any message has non-empty attachments
      where.messages = { some: { attachments: { not: { equals: [] } } } };
    }

    if (q.classification) {
      where.analyses = { some: { classification: q.classification } };
    }

    if (q.priority) {
      where.analyses = { some: { priority: q.priority } };
    }

    if (q.labelIds) {
      const labelIdList = q.labelIds.split(',').filter(Boolean);
      if (labelIdList.length > 0) {
        where.threadLabels = { some: { labelId: { in: labelIdList } } };
      }
    }

    const [threads, total] = await Promise.all([
      prisma.emailThread.findMany({
        where,
        include: {
          account: { select: { id: true, emailAddress: true, provider: true } },
          analyses: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { summary: true, classification: true, priority: true, suggestedAction: true },
          },
          threadLabels: { include: { label: true } },
        },
        orderBy: { lastMessageAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.emailThread.count({ where }),
    ]);

    // Save to search history
    if (search || q.classification || q.priority || q.from || q.to) {
      const filters: Record<string, any> = {};
      if (q.from) filters.from = q.from;
      if (q.to) filters.to = q.to;
      if (q.dateFrom) filters.dateFrom = q.dateFrom;
      if (q.dateTo) filters.dateTo = q.dateTo;
      if (q.hasAttachment) filters.hasAttachment = q.hasAttachment === 'true';
      if (q.classification) filters.classification = q.classification;
      if (q.priority) filters.priority = q.priority;
      if (q.accountId) filters.accountId = q.accountId;
      if (q.labelIds) filters.labelIds = q.labelIds;

      prisma.searchHistory.create({
        data: {
          userId: request.userId!,
          query: search ?? '',
          filters: Object.keys(filters).length > 0 ? filters : undefined,
          resultCount: total,
        },
      }).catch(() => {}); // non-blocking
    }

    const mapped = threads.map((t) => ({
      ...t,
      latestAnalysis: (t.analyses as any[])[0] ?? null,
      labels: (t as any).threadLabels?.map((tl: any) => tl.label) ?? [],
    }));

    return { threads: mapped, total, page, hasMore: page * limit < total };
  });

  /**
   * GET /search/history — Last 20 searches.
   */
  fastify.get('/search/history', async (request) => {
    const history = await prisma.searchHistory.findMany({
      where: { userId: request.userId! },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return { history };
  });

  /**
   * DELETE /search/history — Clear all search history.
   */
  fastify.delete('/search/history', async (request) => {
    await prisma.searchHistory.deleteMany({ where: { userId: request.userId! } });
    return { deleted: true };
  });

  /**
   * DELETE /search/history/:id — Delete one search history entry.
   */
  fastify.delete('/search/history/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const entry = await prisma.searchHistory.findFirst({ where: { id, userId: request.userId! } });
    if (!entry) return reply.code(404).send({ error: 'Not found' });
    await prisma.searchHistory.delete({ where: { id } });
    return { deleted: true };
  });
}
