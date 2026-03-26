/**
 * Thread routes - Browse and manage email threads.
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database';
import { emailProviderFactory } from '../services/email-provider.factory';
import { authMiddleware } from '../middleware/auth.middleware';
import { ThreadQuerySchema } from '../utils/validators';

export async function threadRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  /**
   * GET /threads - List cached threads with optional filters
   */
  fastify.get('/threads', async (request, reply) => {
    const query = ThreadQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ error: 'Invalid query', details: query.error.issues });
    }

    const { account_id, page, limit, search, label } = query.data;

    // Build where clause
    const where: any = {};

    if (account_id) {
      // Verify account belongs to user
      const account = await prisma.emailAccount.findFirst({
        where: { id: account_id, userId: request.userId },
      });
      if (!account) {
        return reply.code(404).send({ error: 'Account not found' });
      }
      where.accountId = account_id;
    } else {
      // All accounts for this user
      where.account = { userId: request.userId };
    }

    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { snippet: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (label) {
      where.labels = { has: label };
    }

    const [threads, total] = await Promise.all([
      prisma.emailThread.findMany({
        where,
        include: {
          account: { select: { emailAddress: true } },
          analyses: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              summary: true,
              classification: true,
              priority: true,
              suggestedAction: true,
            },
          },
        },
        orderBy: { lastMessageAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.emailThread.count({ where }),
    ]);

    return {
      threads: threads.map((t) => ({
        ...t,
        latestAnalysis: t.analyses[0] || null,
        analyses: undefined,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  });

  /**
   * GET /threads/:id - Get full thread with messages
   */
  fastify.get('/threads/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const thread = await prisma.emailThread.findFirst({
      where: {
        id,
        account: { userId: request.userId },
      },
      include: {
        account: { select: { id: true, emailAddress: true } },
        messages: {
          orderBy: { receivedAt: 'asc' },
        },
        analyses: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        drafts: {
          where: { status: { in: ['pending', 'approved'] } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!thread) {
      return reply.code(404).send({ error: 'Thread not found' });
    }

    return {
      thread: {
        ...thread,
        latestAnalysis: thread.analyses[0] || null,
      },
    };
  });

  /**
   * POST /threads/sync - Fetch latest threads from Gmail and cache them
   */
  fastify.post('/threads/sync', async (request, reply) => {
    const { account_id, max_results = 20 } = request.body as {
      account_id: string;
      max_results?: number;
    };

    if (!account_id) {
      return reply.code(400).send({ error: 'account_id is required' });
    }

    // Verify account belongs to user
    const account = await prisma.emailAccount.findFirst({
      where: { id: account_id, userId: request.userId },
    });

    if (!account) {
      return reply.code(404).send({ error: 'Account not found' });
    }

    try {
      const result = await emailProviderFactory.fetchThreads(account_id, {
        maxResults: Math.min(max_results, 50),
      });

      return {
        message: `Synced ${result.threads.length} threads`,
        threads: result.threads,
        nextPageToken: result.nextPageToken,
      };
    } catch (error: any) {
      if (error.code === 401 || error.message?.includes('invalid_grant')) {
        return reply.code(401).send({
          error: 'Gmail token expired or revoked',
          message: 'Please reconnect your Gmail account.',
        });
      }
      throw error;
    }
  });

  /**
   * POST /threads/:id/sync-messages - Fetch and cache all messages for a thread
   */
  fastify.post('/threads/:id/sync-messages', async (request, reply) => {
    const { id } = request.params as { id: string };

    const thread = await prisma.emailThread.findFirst({
      where: { id, account: { userId: request.userId } },
    });

    if (!thread) {
      return reply.code(404).send({ error: 'Thread not found' });
    }

    const messages = await emailProviderFactory.fetchMessages(thread.accountId, thread.gmailThreadId);

    return {
      message: `Synced ${messages.length} messages`,
      messages,
    };
  });
}
