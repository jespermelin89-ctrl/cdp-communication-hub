/**
 * Thread routes - Browse and manage email threads.
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database';
import { emailProviderFactory } from '../services/email-provider.factory';
import { gmailService } from '../services/gmail.service';
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

    let messages: any[];
    try {
      messages = await emailProviderFactory.fetchMessages(thread.accountId, thread.gmailThreadId);
    } catch (err: any) {
      const msg = err?.message || 'Unknown error';
      // Token-related errors from Gmail API
      if (msg.includes('invalid_grant') || msg.includes('Token has been expired') || msg.includes('Invalid Credentials')) {
        return reply.code(401).send({ error: 'Gmail access expired. Please reconnect your account.' });
      }
      return reply.code(502).send({ error: `Failed to fetch messages from email provider: ${msg}` });
    }

    if (messages.length === 0) {
      return reply.code(400).send({
        error: 'No messages found for this thread. The thread may be empty or have been deleted in Gmail.',
      });
    }

    return {
      message: `Synced ${messages.length} messages`,
      count: messages.length,
    };
  });

  /**
   * POST /threads/:id/archive — Remove thread from inbox (remove INBOX label).
   * SAFETY: Non-destructive. Thread remains in All Mail and can be restored.
   */
  fastify.post('/threads/:id/archive', async (request, reply) => {
    const { id } = request.params as { id: string };

    const thread = await prisma.emailThread.findFirst({
      where: { id, account: { userId: request.userId } },
      include: { account: { select: { id: true, provider: true } } },
    });
    if (!thread) return reply.code(404).send({ error: 'Thread not found' });

    if (thread.account.provider === 'gmail') {
      try {
        await gmailService.archiveThread(thread.account.id, thread.gmailThreadId);
      } catch (err: any) {
        return reply.code(502).send({ error: `Gmail archive failed: ${err.message}` });
      }
    }

    // Update cached labels
    await prisma.emailThread.update({
      where: { id },
      data: { labels: thread.labels.filter((l: string) => l !== 'INBOX') },
    });

    return { message: 'Thread archived (removed from inbox).' };
  });

  /**
   * POST /threads/:id/trash — Move thread to Gmail Trash (reversible, 30 days).
   * SAFETY: Uses threads.trash — NEVER threads.delete.
   */
  fastify.post('/threads/:id/trash', async (request, reply) => {
    const { id } = request.params as { id: string };

    const thread = await prisma.emailThread.findFirst({
      where: { id, account: { userId: request.userId } },
      include: { account: { select: { id: true, provider: true } } },
    });
    if (!thread) return reply.code(404).send({ error: 'Thread not found' });

    if (thread.account.provider === 'gmail') {
      try {
        await gmailService.trashThread(thread.account.id, thread.gmailThreadId);
      } catch (err: any) {
        return reply.code(502).send({ error: `Gmail trash failed: ${err.message}` });
      }
    }

    // Update cached labels
    await prisma.emailThread.update({
      where: { id },
      data: { labels: [...thread.labels.filter((l: string) => l !== 'INBOX'), 'TRASH'] },
    });

    return { message: 'Thread moved to trash (can be restored within 30 days).' };
  });

  /**
   * POST /threads/batch — Batch archive or trash multiple threads.
   * Body: { threadIds: string[], action: 'archive' | 'trash' }
   */
  fastify.post('/threads/batch', async (request, reply) => {
    const { threadIds, action } = request.body as { threadIds: string[]; action: 'archive' | 'trash' };

    if (!Array.isArray(threadIds) || threadIds.length === 0) {
      return reply.code(400).send({ error: 'threadIds must be a non-empty array' });
    }
    if (action !== 'archive' && action !== 'trash') {
      return reply.code(400).send({ error: 'action must be "archive" or "trash"' });
    }

    const threads = await prisma.emailThread.findMany({
      where: { id: { in: threadIds }, account: { userId: request.userId } },
      include: { account: { select: { id: true, provider: true } } },
    });

    const results = await Promise.allSettled(
      threads.map(async (thread) => {
        if (thread.account.provider === 'gmail') {
          if (action === 'archive') {
            await gmailService.archiveThread(thread.account.id, thread.gmailThreadId);
          } else {
            await gmailService.trashThread(thread.account.id, thread.gmailThreadId);
          }
        }
        await prisma.emailThread.update({
          where: { id: thread.id },
          data: {
            labels: action === 'archive'
              ? thread.labels.filter((l: string) => l !== 'INBOX')
              : [...thread.labels.filter((l: string) => l !== 'INBOX'), 'TRASH'],
          },
        });
      })
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    return {
      message: `Batch ${action}: ${succeeded} succeeded, ${failed} failed.`,
      succeeded,
      failed,
    };
  });
}
