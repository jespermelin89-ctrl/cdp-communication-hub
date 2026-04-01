/**
 * Thread routes - Browse and manage email threads.
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database';
import { emailProviderFactory } from '../services/email-provider.factory';
import { gmailService } from '../services/gmail.service';
import { brainCoreService } from '../services/brain-core.service';
import { aiService } from '../services/ai.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { ThreadQuerySchema } from '../utils/validators';
import { sanitizeSearch, sanitizeLabel } from '../utils/sanitize';

const QUESTION_PATTERN = /\?|can you|could you|please|vänligen|kan du|skulle du|hjälp/i;

export function buildMessageLookupWhere(threadId: string, messageId: string) {
  return {
    OR: [
      { id: messageId, threadId },
      { gmailMessageId: messageId, threadId },
    ],
  };
}

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

    const rawQuery = query.data;
    const account_id = rawQuery.account_id;
    const page = rawQuery.page;
    const limit = Math.min(rawQuery.limit ?? 25, 50);
    const cursor = rawQuery.cursor as string | undefined;
    const search = rawQuery.search ? sanitizeSearch(rawQuery.search) : undefined;
    const label = rawQuery.label ? sanitizeLabel(rawQuery.label) : undefined;

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

    const mailbox = rawQuery.mailbox;
    if (mailbox) {
      const now = new Date();
      switch (mailbox) {
        case 'inbox':
          where.labels = { has: 'INBOX' };
          where.NOT = { labels: { has: 'TRASH' } };
          where.snoozedUntil = null;
          break;
        case 'sent':
          where.isSentByUser = true;
          break;
        case 'trash':
          where.labels = { has: 'TRASH' };
          break;
        case 'archive':
          where.NOT = [{ labels: { has: 'INBOX' } }, { labels: { has: 'TRASH' } }];
          break;
        case 'snoozed':
          where.snoozedUntil = { gt: now };
          break;
        case 'all':
          where.NOT = { labels: { has: 'TRASH' } };
          break;
      }
    }

    // Cursor-based pagination: cursor = base64(lastMessageAt:id)
    let cursorWhere: any = {};
    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
        const [lastMsgAt, cursorId] = decoded.split('::');
        if (lastMsgAt && cursorId) {
          cursorWhere = {
            OR: [
              { lastMessageAt: { lt: new Date(lastMsgAt) } },
              { lastMessageAt: new Date(lastMsgAt), id: { lt: cursorId } },
            ],
          };
        }
      } catch {
        // Invalid cursor — ignore and use offset fallback
      }
    }

    const effectiveWhere = cursor ? { AND: [where, cursorWhere] } : where;

    const threadSelect = {
      where: effectiveWhere,
      include: {
        account: { select: { id: true, emailAddress: true, provider: true } },
        analyses: {
          orderBy: { createdAt: 'desc' } as const,
          take: 1,
          select: {
            summary: true,
            classification: true,
            priority: true,
            suggestedAction: true,
          },
        },
        threadLabels: {
          include: { label: { select: { id: true, name: true, color: true, icon: true } } },
        },
      },
      orderBy: { lastMessageAt: 'desc' } as const,
      skip: cursor ? 0 : (page - 1) * limit,
      take: limit + 1, // fetch one extra to determine hasMore
    };

    let [threadsRaw, total, accountCountsRaw] = await Promise.all([
      prisma.emailThread.findMany(threadSelect),
      prisma.emailThread.count({ where }),
      // Per-account unread counts for the unified inbox header
      prisma.emailThread.groupBy({
        by: ['accountId'],
        where: { account: { userId: request.userId }, isRead: false },
        _count: true,
      }),
    ]);

    // Determine hasMore and nextCursor from the extra item
    const hasMoreCursor = threadsRaw.length > limit;
    const threads = hasMoreCursor ? threadsRaw.slice(0, limit) : threadsRaw;
    const accountCounts: Record<string, number> = {};
    for (const row of accountCountsRaw) {
      accountCounts[row.accountId] = row._count;
    }

    // Gmail search fallback: if local results are sparse, query Gmail API and sync missing threads
    if (search && threads.length < 5) {
      try {
        // Find all Gmail accounts in scope
        const gmailAccounts = await prisma.emailAccount.findMany({
          where: {
            userId: request.userId,
            provider: 'gmail',
            isActive: true,
            ...(account_id ? { id: account_id } : {}),
          },
          select: { id: true },
        });

        const localGmailThreadIds = new Set(threads.map((t) => t.gmailThreadId));

        await Promise.allSettled(
          gmailAccounts.map(async (acc) => {
            const gmailMessages = await gmailService.searchMessages(acc.id, search, 10);
            // Deduplicate by threadId and sync only threads not already local
            const seenThreadIds = new Set<string>();
            for (const msg of gmailMessages) {
              const gmailThreadId = msg.threadId ?? msg.id;
              if (!gmailThreadId || seenThreadIds.has(gmailThreadId) || localGmailThreadIds.has(gmailThreadId)) continue;
              seenThreadIds.add(gmailThreadId);
              try {
                await emailProviderFactory.fetchMessages(acc.id, gmailThreadId);
              } catch {
                // Non-fatal: skip individual thread sync failures
              }
            }
          })
        );

        // Re-fetch after sync
        const refetchedRaw = await prisma.emailThread.findMany(threadSelect);
        total = await prisma.emailThread.count({ where });
        threadsRaw = refetchedRaw;
      } catch {
        // Non-fatal: return whatever local results we have
      }
    }

    // Build next cursor from last thread in result
    const lastThread = threads[threads.length - 1];
    const nextCursor = (hasMoreCursor && lastThread?.lastMessageAt && lastThread?.id)
      ? Buffer.from(`${lastThread.lastMessageAt.toISOString()}::${lastThread.id}`).toString('base64')
      : null;

    return {
      threads: threads.map((t) => ({
        ...t,
        latestAnalysis: (t.analyses as any[])[0] || null,
        analyses: undefined,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      total,
      totalCount: total,
      page,
      pageSize: limit,
      hasMore: cursor ? hasMoreCursor : (page * limit < total),
      nextCursor,
      mailbox: mailbox ?? 'inbox',
      accountCounts, // unread count per accountId for unified inbox header
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

    const latestAnalysis = thread.analyses[0] ?? null;

    // ── Smart reply suggestion (7B) ──────────────────────────────────────
    // Generate once for unread, high-priority threads with question patterns.
    let suggestedReply: string | null = latestAnalysis?.suggestedReply ?? null;

    if (
      !suggestedReply &&
      !thread.isRead &&
      latestAnalysis?.priority === 'high' &&
      thread.messages.length > 0
    ) {
      const lastMsg = thread.messages[thread.messages.length - 1];
      const bodyForCheck = (lastMsg.bodyText ?? '') + ' ' + (thread.subject ?? '');
      if (QUESTION_PATTERN.test(bodyForCheck)) {
        try {
          suggestedReply = await aiService.generateSmartReply({
            subject: thread.subject,
            messages: thread.messages.map((m) => ({
              from: m.fromAddress,
              body: m.bodyText ?? '',
              date: m.receivedAt.toISOString(),
            })),
          });

          if (suggestedReply && latestAnalysis) {
            await prisma.aIAnalysis.update({
              where: { id: latestAnalysis.id },
              data: { suggestedReply },
            }).catch(() => {});
          }
        } catch {
          // Non-fatal — smart reply is best-effort
        }
      }
    }

    // Expose unsubscribeUrl from the most recent message that has one
    const unsubscribeUrl =
      [...thread.messages].reverse().find((m) => (m as any).unsubscribeUrl)?.unsubscribeUrl ?? null;

    return {
      thread: {
        ...thread,
        latestAnalysis,
        suggestedReply,
        unsubscribeUrl,
      },
    };
  });

  /**
   * POST /threads/:id/spam — Report sender as spam, move to trash, create sender rule.
   * SAFETY: Only trashes (reversible). Never permanently deletes.
   */
  fastify.post('/threads/:id/spam', async (request, reply) => {
    const { id } = request.params as { id: string };

    const thread = await prisma.emailThread.findFirst({
      where: { id, account: { userId: request.userId } },
      include: {
        account: { select: { id: true, provider: true } },
        messages: { orderBy: { receivedAt: 'asc' }, take: 1, select: { fromAddress: true } },
      },
    });
    if (!thread) return reply.code(404).send({ error: 'Thread not found' });

    // Move to trash (reversible)
    if (thread.account.provider === 'gmail') {
      try {
        await gmailService.trashThread(thread.account.id, thread.gmailThreadId);
      } catch {
        // Non-fatal — still update DB
      }
    }
    await prisma.emailThread.update({
      where: { id },
      data: { labels: [...thread.labels.filter((l) => l !== 'INBOX'), 'TRASH', 'SPAM'] },
    });

    // Auto-create a sender rule for the from address
    const fromAddress = thread.messages[0]?.fromAddress ?? thread.participantEmails[0];
    if (fromAddress) {
      const existing = await prisma.senderRule.findFirst({
        where: { userId: request.userId, senderPattern: fromAddress },
      });
      if (existing) {
        await prisma.senderRule.update({
          where: { id: existing.id },
          data: { action: 'spam', isActive: true, updatedAt: new Date() },
        });
      } else {
        await prisma.senderRule.create({
          data: {
            userId: request.userId,
            senderPattern: fromAddress,
            action: 'spam',
            confidence: 1.0,
          },
        });
      }
    }

    await prisma.actionLog.create({
      data: {
        userId: request.userId,
        actionType: 'spam_reported',
        targetType: 'thread',
        targetId: id,
        metadata: { fromAddress },
      },
    });

    return { message: 'Thread marked as spam and moved to trash.' };
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
   * POST /threads/:id/read — Mark thread as read in DB and Gmail.
   */
  fastify.post('/threads/:id/read', async (request, reply) => {
    const { id } = request.params as { id: string };

    const thread = await prisma.emailThread.findFirst({
      where: { id, account: { userId: request.userId } },
      include: { account: { select: { id: true, provider: true } } },
    });
    if (!thread) return reply.code(404).send({ error: 'Thread not found' });

    if (thread.account.provider === 'gmail' && thread.gmailThreadId) {
      try {
        await gmailService.markAsRead(thread.account.id, thread.gmailThreadId);
      } catch {
        // Non-fatal — DB update still proceeds if Gmail call fails
      }
    }

    await prisma.emailThread.update({ where: { id }, data: { isRead: true } });
    return { message: 'Thread marked as read.' };
  });

  /**
   * POST /threads/:id/star — Star thread (add STARRED label).
   */
  fastify.post('/threads/:id/star', async (request, reply) => {
    const { id } = request.params as { id: string };
    const thread = await prisma.emailThread.findFirst({
      where: { id, account: { userId: request.userId } },
      include: { account: { select: { id: true, provider: true } } },
    });
    if (!thread) return reply.code(404).send({ error: 'Thread not found' });
    if (thread.account.provider === 'gmail' && thread.gmailThreadId) {
      try { await gmailService.starThread(thread.account.id, thread.gmailThreadId); } catch { /* non-fatal */ }
    }
    const labels = [...new Set([...thread.labels, 'STARRED'])];
    await prisma.emailThread.update({ where: { id }, data: { labels } });
    return { message: 'Thread starred.', labels };
  });

  /**
   * POST /threads/:id/unstar — Unstar thread (remove STARRED label).
   */
  fastify.post('/threads/:id/unstar', async (request, reply) => {
    const { id } = request.params as { id: string };
    const thread = await prisma.emailThread.findFirst({
      where: { id, account: { userId: request.userId } },
      include: { account: { select: { id: true, provider: true } } },
    });
    if (!thread) return reply.code(404).send({ error: 'Thread not found' });
    if (thread.account.provider === 'gmail' && thread.gmailThreadId) {
      try { await gmailService.unstarThread(thread.account.id, thread.gmailThreadId); } catch { /* non-fatal */ }
    }
    const labels = thread.labels.filter((l) => l !== 'STARRED');
    await prisma.emailThread.update({ where: { id }, data: { labels } });
    return { message: 'Thread unstarred.', labels };
  });

  /**
   * POST /threads/:id/unread — Mark thread as unread (add UNREAD label).
   */
  fastify.post('/threads/:id/unread', async (request, reply) => {
    const { id } = request.params as { id: string };

    const thread = await prisma.emailThread.findFirst({
      where: { id, account: { userId: request.userId } },
      include: { account: { select: { id: true, provider: true } } },
    });
    if (!thread) return reply.code(404).send({ error: 'Thread not found' });

    if (thread.account.provider === 'gmail' && thread.gmailThreadId) {
      try {
        await gmailService.markAsUnread(thread.account.id, thread.gmailThreadId);
      } catch {
        // Non-fatal — DB update still proceeds
      }
    }

    await prisma.emailThread.update({ where: { id }, data: { isRead: false } });
    return { message: 'Thread marked as unread.' };
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
   * POST /threads/:id/restore — Restore a trashed thread back to Inbox.
   */
  fastify.post('/threads/:id/restore', async (request, reply) => {
    const { id } = request.params as { id: string };

    const thread = await prisma.emailThread.findFirst({
      where: { id, account: { userId: request.userId } },
      include: { account: { select: { id: true, provider: true } } },
    });
    if (!thread) return reply.code(404).send({ error: 'Thread not found' });

    if (thread.account.provider === 'gmail') {
      try {
        await gmailService.restoreThread(thread.account.id, thread.gmailThreadId);
      } catch (err: any) {
        return reply.code(502).send({ error: `Gmail restore failed: ${err.message}` });
      }
    }

    // Update cached labels: remove TRASH, add INBOX
    await prisma.emailThread.update({
      where: { id },
      data: {
        labels: [...thread.labels.filter((l: string) => l !== 'TRASH' && l !== 'INBOX'), 'INBOX'],
      },
    });

    return { message: 'Thread restored to inbox.' };
  });

  /**
   * POST /threads/:id/snooze — Snooze thread until a given datetime.
   * Body: { until: ISO 8601 datetime string }
   */
  fastify.post('/threads/:id/snooze', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { until } = request.body as { until: string };

    if (!until || isNaN(Date.parse(until))) {
      return reply.code(400).send({ error: 'until must be a valid ISO 8601 datetime' });
    }

    const thread = await prisma.emailThread.findFirst({
      where: { id, account: { userId: request.userId } },
    });
    if (!thread) return reply.code(404).send({ error: 'Thread not found' });

    await prisma.emailThread.update({
      where: { id },
      data: { snoozedUntil: new Date(until) },
    });

    await prisma.actionLog.create({
      data: {
        userId: request.userId,
        actionType: 'snooze',
        targetType: 'thread',
        targetId: id,
        metadata: { until },
      },
    });

    return { message: `Thread snoozed until ${until}` };
  });

  /**
   * DELETE /threads/:id/snooze — Unsnooze a thread immediately.
   */
  fastify.delete('/threads/:id/snooze', async (request, reply) => {
    const { id } = request.params as { id: string };
    const thread = await prisma.emailThread.findFirst({
      where: { id, account: { userId: request.userId } },
    });
    if (!thread) return reply.code(404).send({ error: 'Thread not found' });

    await prisma.emailThread.update({
      where: { id },
      data: { snoozedUntil: null },
    });

    return { message: 'Thread unsnoozed' };
  });

  /**
   * POST /threads/batch — Batch action on multiple threads.
   * Body: { threadIds: string[], action: 'archive' | 'trash' | 'read' | 'unread' | 'star' | 'unstar' }
   */
  fastify.post('/threads/batch', async (request, reply) => {
    const { threadIds, action } = request.body as {
      threadIds: string[];
      action: 'archive' | 'trash' | 'read' | 'unread' | 'star' | 'unstar';
    };

    if (!Array.isArray(threadIds) || threadIds.length === 0) {
      return reply.code(400).send({ error: 'threadIds must be a non-empty array' });
    }
    const validActions = ['archive', 'trash', 'read', 'unread', 'star', 'unstar'] as const;
    if (!validActions.includes(action as any)) {
      return reply.code(400).send({ error: `action must be one of: ${validActions.join(', ')}` });
    }

    const threads = await prisma.emailThread.findMany({
      where: { id: { in: threadIds }, account: { userId: request.userId } },
      include: { account: { select: { id: true, provider: true } } },
    });

    const results = await Promise.allSettled(
      threads.map(async (thread) => {
        const isGmail = thread.account.provider === 'gmail';
        switch (action) {
          case 'archive':
            if (isGmail) await gmailService.archiveThread(thread.account.id, thread.gmailThreadId);
            await prisma.emailThread.update({
              where: { id: thread.id },
              data: { labels: thread.labels.filter((l) => l !== 'INBOX') },
            });
            break;
          case 'trash':
            if (isGmail) await gmailService.trashThread(thread.account.id, thread.gmailThreadId);
            await prisma.emailThread.update({
              where: { id: thread.id },
              data: { labels: [...thread.labels.filter((l) => l !== 'INBOX'), 'TRASH'] },
            });
            break;
          case 'read':
            if (isGmail) await gmailService.markAsRead(thread.account.id, thread.gmailThreadId);
            await prisma.emailThread.update({ where: { id: thread.id }, data: { isRead: true } });
            break;
          case 'unread':
            if (isGmail) await gmailService.markAsUnread(thread.account.id, thread.gmailThreadId);
            await prisma.emailThread.update({ where: { id: thread.id }, data: { isRead: false } });
            break;
          case 'star':
            if (isGmail) await gmailService.starThread(thread.account.id, thread.gmailThreadId);
            await prisma.emailThread.update({
              where: { id: thread.id },
              data: { labels: [...new Set([...thread.labels, 'STARRED'])] },
            });
            break;
          case 'unstar':
            if (isGmail) await gmailService.unstarThread(thread.account.id, thread.gmailThreadId);
            await prisma.emailThread.update({
              where: { id: thread.id },
              data: { labels: thread.labels.filter((l) => l !== 'STARRED') },
            });
            break;
        }
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

  /**
   * PATCH /threads/:id — Update thread metadata (labels, priority, classification).
   */
  fastify.patch('/threads/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { labels, priority, classification } = request.body as {
      labels?: string[];
      priority?: string;
      classification?: string;
    };

    const thread = await prisma.emailThread.findFirst({
      where: { id, account: { userId: request.userId } },
    });
    if (!thread) return reply.code(404).send({ error: 'Thread not found' });

    const updated = await prisma.emailThread.update({
      where: { id },
      data: { ...(labels !== undefined && { labels }) },
    });

    // If priority or classification changed, check against AI analysis and log learning
    if (priority !== undefined || classification !== undefined) {
      brainCoreService
        .recordLearning(
          request.userId!,
          'classification:override',
          {
            thread_id: id,
            subject: thread.subject,
            new_priority: priority,
            new_classification: classification,
            timestamp: new Date().toISOString(),
          },
          'ui',
          id
        )
        .catch(() => {});
    }

    return { thread: updated };
  });

  /**
   * GET /threads/export?format=csv|json — Export all threads as CSV or JSON.
   * SAFETY: Read-only. No modifications.
   */
  fastify.get('/threads/export', async (request, reply) => {
    const { format = 'csv' } = request.query as { format?: string };

    const threads = await prisma.emailThread.findMany({
      where: { account: { userId: request.userId, isActive: true } },
      include: {
        analyses: { orderBy: { createdAt: 'desc' }, take: 1, select: { priority: true, classification: true } },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 5000,
    });

    if (format === 'json') {
      return reply
        .header('Content-Type', 'application/json')
        .header('Content-Disposition', 'attachment; filename="cdp-hub-export.json"')
        .send(JSON.stringify(threads, null, 2));
    }

    // CSV (default)
    const header = 'ID,Subject,From,Date,Priority,Classification,Labels,Read,Archived,Trashed\n';
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const rows = threads.map((t) => {
      const analysis = (t.analyses as any[])[0] ?? null;
      const isArchived = !t.labels.includes('INBOX') && !t.labels.includes('TRASH');
      const isTrashed = t.labels.includes('TRASH');
      return [
        t.id,
        escape(t.subject ?? ''),
        escape(t.participantEmails[0] ?? ''),
        t.lastMessageAt?.toISOString() ?? '',
        analysis?.priority ?? '',
        analysis?.classification ?? '',
        escape(t.labels.join(', ')),
        t.isRead ? 'yes' : 'no',
        isArchived ? 'yes' : 'no',
        isTrashed ? 'yes' : 'no',
      ].join(',');
    });

    return reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', 'attachment; filename="cdp-hub-export.csv"')
      .send(header + rows.join('\n'));
  });

  /**
   * GET /threads/:threadId/messages/:messageId/attachments/:attachmentId
   * Download attachment binary — authenticated, streams base64 as binary.
   */
  fastify.get(
    '/threads/:threadId/messages/:messageId/attachments/:attachmentId',
    async (request, reply) => {
      const { threadId, messageId, attachmentId } = request.params as {
        threadId: string;
        messageId: string;
        attachmentId: string;
      };

      const message = await prisma.emailMessage.findFirst({
        where: buildMessageLookupWhere(threadId, messageId),
        include: { thread: { include: { account: { select: { id: true, userId: true, provider: true } } } } },
      });

      if (!message || message.thread.account.userId !== request.userId) {
        return reply.code(404).send({ error: 'Not found' });
      }

      const attachments = (message.attachments as any[]) ?? [];
      const att = attachments.find((a: any) => a.attachmentId === attachmentId);

      try {
        const base64Data = await emailProviderFactory.getAttachment(
          message.thread.account.id,
          message.gmailMessageId,
          attachmentId
        );
        const buffer = Buffer.from(base64Data, 'base64');
        const filename = att?.filename || 'download';
        const mimeType = att?.mimeType || 'application/octet-stream';

        reply
          .header('Content-Type', mimeType)
          .header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
          .header('Content-Length', buffer.length)
          .send(buffer);
      } catch (err: any) {
        return reply.code(502).send({ error: `Failed to fetch attachment: ${err.message}` });
      }
    }
  );

  /**
   * GET /threads/:threadId/messages/:messageId/inline/:cid
   * Proxy inline (CID) images — used when email HTML contains cid: references.
   * Returns the image binary with correct Content-Type. Authenticated.
   */
  fastify.get(
    '/threads/:threadId/messages/:messageId/inline/:cid',
    async (request, reply) => {
      const { threadId, messageId, cid } = request.params as {
        threadId: string;
        messageId: string;
        cid: string;
      };

      // Resolve by DB message id first, fall back to gmailMessageId match
      const message = await prisma.emailMessage.findFirst({
        where: buildMessageLookupWhere(threadId, messageId),
        include: { thread: { include: { account: { select: { id: true, userId: true } } } } },
      });

      if (!message || message.thread.account.userId !== request.userId) {
        return reply.code(404).send({ error: 'Not found' });
      }

      try {
        const result = await gmailService.getInlineImage(
          message.thread.account.id,
          message.gmailMessageId,
          decodeURIComponent(cid),
        );

        if (!result) {
          return reply.code(404).send({ error: 'Inline image not found' });
        }

        reply
          .header('Content-Type', result.mimeType)
          .header('Cache-Control', 'private, max-age=86400')
          .header('Content-Length', result.data.length)
          .send(result.data);
      } catch (err: any) {
        return reply.code(502).send({ error: `Failed to fetch inline image: ${err.message}` });
      }
    }
  );

  /**
   * GET /threads/:threadId/messages/:messageId/attachments/:attachmentId/data
   * Sprint 6: Returns attachment as base64 JSON for preview in browser.
   */
  fastify.get(
    '/threads/:threadId/messages/:messageId/attachments/:attachmentId/data',
    async (request, reply) => {
      const { threadId, messageId, attachmentId } = request.params as {
        threadId: string;
        messageId: string;
        attachmentId: string;
      };

      const message = await prisma.emailMessage.findFirst({
        where: buildMessageLookupWhere(threadId, messageId),
        include: { thread: { include: { account: { select: { id: true, userId: true } } } } },
      });

      if (!message || message.thread.account.userId !== request.userId) {
        return reply.code(404).send({ error: 'Not found' });
      }

      const attachments = (message.attachments as any[]) ?? [];
      const att = attachments.find((a: any) => a.attachmentId === attachmentId);

      try {
        const base64Data = await emailProviderFactory.getAttachment(
          message.thread.account.id,
          message.gmailMessageId,
          attachmentId
        );
        return {
          data: base64Data,
          mimeType: att?.mimeType || 'application/octet-stream',
          filename: att?.filename || 'download',
          size: att?.size || 0,
        };
      } catch (err: any) {
        return reply.code(502).send({ error: `Failed to fetch attachment: ${err.message}` });
      }
    }
  );

  // ============================================================
  // SPRINT 1 — Dedicated bulk endpoints
  // ============================================================

  /**
   * POST /threads/bulk/archive — Bulk archive threads.
   */
  fastify.post('/threads/bulk/archive', async (request, reply) => {
    const { threadIds } = request.body as { threadIds: string[] };
    if (!Array.isArray(threadIds) || threadIds.length === 0)
      return reply.code(400).send({ error: 'threadIds must be a non-empty array' });

    const threads = await prisma.emailThread.findMany({
      where: { id: { in: threadIds }, account: { userId: request.userId } },
      include: { account: { select: { id: true, provider: true } } },
    });

    await Promise.allSettled(threads.map(async (t) => {
      if (t.account.provider === 'gmail') await gmailService.archiveThread(t.account.id, t.gmailThreadId).catch(() => {});
      await prisma.emailThread.update({ where: { id: t.id }, data: { labels: t.labels.filter((l) => l !== 'INBOX') } });
    }));

    return { updated: threads.length };
  });

  /**
   * POST /threads/bulk/trash — Bulk trash threads.
   */
  fastify.post('/threads/bulk/trash', async (request, reply) => {
    const { threadIds } = request.body as { threadIds: string[] };
    if (!Array.isArray(threadIds) || threadIds.length === 0)
      return reply.code(400).send({ error: 'threadIds must be a non-empty array' });

    const threads = await prisma.emailThread.findMany({
      where: { id: { in: threadIds }, account: { userId: request.userId } },
      include: { account: { select: { id: true, provider: true } } },
    });

    await Promise.allSettled(threads.map(async (t) => {
      if (t.account.provider === 'gmail') await gmailService.trashThread(t.account.id, t.gmailThreadId).catch(() => {});
      await prisma.emailThread.update({
        where: { id: t.id },
        data: { labels: [...t.labels.filter((l) => l !== 'INBOX'), 'TRASH'] },
      });
    }));

    return { updated: threads.length };
  });

  /**
   * POST /threads/bulk/read — Bulk mark read/unread.
   */
  fastify.post('/threads/bulk/read', async (request, reply) => {
    const { threadIds, isRead } = request.body as { threadIds: string[]; isRead: boolean };
    if (!Array.isArray(threadIds) || threadIds.length === 0)
      return reply.code(400).send({ error: 'threadIds must be a non-empty array' });

    const threads = await prisma.emailThread.findMany({
      where: { id: { in: threadIds }, account: { userId: request.userId } },
      include: { account: { select: { id: true, provider: true } } },
    });

    await Promise.allSettled(threads.map(async (t) => {
      if (t.account.provider === 'gmail') {
        if (isRead) await gmailService.markAsRead(t.account.id, t.gmailThreadId).catch(() => {});
        else await gmailService.markAsUnread(t.account.id, t.gmailThreadId).catch(() => {});
      }
      await prisma.emailThread.update({ where: { id: t.id }, data: { isRead } });
    }));

    return { updated: threads.length };
  });

  /**
   * POST /threads/bulk/classify — Bulk set classification on AI analysis.
   */
  fastify.post('/threads/bulk/classify', async (request, reply) => {
    const { threadIds, classification } = request.body as { threadIds: string[]; classification: string };
    if (!Array.isArray(threadIds) || threadIds.length === 0)
      return reply.code(400).send({ error: 'threadIds must be a non-empty array' });
    if (!classification) return reply.code(400).send({ error: 'classification is required' });

    // Only threads owned by user
    const threads = await prisma.emailThread.findMany({
      where: { id: { in: threadIds }, account: { userId: request.userId } },
      select: { id: true },
    });
    const validIds = threads.map((t) => t.id);

    // Update the latest AI analysis for each thread
    await Promise.allSettled(validIds.map(async (threadId) => {
      const latest = await prisma.aIAnalysis.findFirst({ where: { threadId }, orderBy: { createdAt: 'desc' } });
      if (latest) {
        await prisma.aIAnalysis.update({ where: { id: latest.id }, data: { classification } });
      }
    }));

    return { updated: validIds.length };
  });

  /**
   * POST /threads/bulk/priority — Bulk set priority on AI analysis.
   */
  fastify.post('/threads/bulk/priority', async (request, reply) => {
    const { threadIds, priority } = request.body as { threadIds: string[]; priority: string };
    if (!Array.isArray(threadIds) || threadIds.length === 0)
      return reply.code(400).send({ error: 'threadIds must be a non-empty array' });
    if (!priority) return reply.code(400).send({ error: 'priority is required' });

    const threads = await prisma.emailThread.findMany({
      where: { id: { in: threadIds }, account: { userId: request.userId } },
      select: { id: true },
    });
    const validIds = threads.map((t) => t.id);

    await Promise.allSettled(validIds.map(async (threadId) => {
      const latest = await prisma.aIAnalysis.findFirst({ where: { threadId }, orderBy: { createdAt: 'desc' } });
      if (latest) {
        await prisma.aIAnalysis.update({ where: { id: latest.id }, data: { priority } });
      }
    }));

    return { updated: validIds.length };
  });
}
