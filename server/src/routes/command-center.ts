/**
 * Command Center route - Aggregated dashboard data.
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database';
import { authMiddleware } from '../middleware/auth.middleware';

export async function commandCenterRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  /**
   * GET /command-center - Get aggregated dashboard data
   */
  fastify.get('/command-center', async (request) => {
    const userId = request.userId;

    // Get user's account IDs
    const accounts = await prisma.emailAccount.findMany({
      where: { userId },
      select: { id: true, emailAddress: true, isDefault: true },
    });

    const accountIds = accounts.map((a) => a.id);

    // Run all queries in parallel for performance
    const [
      pendingDrafts,
      approvedDrafts,
      highPriorityThreads,
      mediumPriorityThreads,
      lowPriorityThreads,
      unreadThreads,
      recentActions,
      totalThreads,
      analyzedThreads,
    ] = await Promise.all([
      // Pending drafts count
      prisma.draft.count({
        where: { userId, status: 'pending' },
      }),
      // Approved (ready to send) drafts count
      prisma.draft.count({
        where: { userId, status: 'approved' },
      }),
      // High-priority analyzed threads (last 7 days)
      prisma.emailThread.count({
        where: {
          accountId: { in: accountIds },
          analyses: { some: { priority: 'high' } },
          lastMessageAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      // Medium-priority
      prisma.emailThread.count({
        where: {
          accountId: { in: accountIds },
          analyses: { some: { priority: 'medium' } },
          lastMessageAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      // Low-priority
      prisma.emailThread.count({
        where: {
          accountId: { in: accountIds },
          analyses: { some: { priority: 'low' } },
          lastMessageAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      // Unread threads
      prisma.emailThread.count({
        where: {
          accountId: { in: accountIds },
          isRead: false,
        },
      }),
      // Recent actions (last 5)
      prisma.actionLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          actionType: true,
          targetType: true,
          metadata: true,
          createdAt: true,
        },
      }),
      // Total cached threads
      prisma.emailThread.count({
        where: { accountId: { in: accountIds } },
      }),
      // Threads with at least one analysis
      prisma.emailThread.count({
        where: {
          accountId: { in: accountIds },
          analyses: { some: {} },
        },
      }),
    ]);

    // Get top high-priority thread senders for stat card subtitle
    const highPriorityThreadList = await prisma.emailThread.findMany({
      where: {
        accountId: { in: accountIds },
        analyses: { some: { priority: 'high' } },
        lastMessageAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: { participantEmails: true, subject: true },
      orderBy: { lastMessageAt: 'desc' },
      take: 3,
    });
    const highPrioritySenders = highPriorityThreadList.map((t) => {
      const ext = t.participantEmails.find((e: string) => !accountIds.some((id) => id === e))
        || t.participantEmails[0];
      return ext ? ext.split('@')[0] : t.subject?.split(' ')[0] || '—';
    });

    // Per-account unread + high-priority counts
    const [perAccountUnread, perAccountHighPrio] = await Promise.all([
      prisma.emailThread.groupBy({
        by: ['accountId'],
        where: { accountId: { in: accountIds }, isRead: false },
        _count: true,
      }),
      prisma.emailThread.groupBy({
        by: ['accountId'],
        where: {
          accountId: { in: accountIds },
          analyses: { some: { priority: 'high' } },
          lastMessageAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        _count: true,
      }),
    ]);
    const perAccountStats: Record<string, { unread: number; highPriority: number }> = {};
    for (const row of perAccountUnread) {
      if (!perAccountStats[row.accountId]) perAccountStats[row.accountId] = { unread: 0, highPriority: 0 };
      perAccountStats[row.accountId].unread = row._count;
    }
    for (const row of perAccountHighPrio) {
      if (!perAccountStats[row.accountId]) perAccountStats[row.accountId] = { unread: 0, highPriority: 0 };
      perAccountStats[row.accountId].highPriority = row._count;
    }

    // Get pending drafts for quick preview
    const pendingDraftsList = await prisma.draft.findMany({
      where: { userId, status: { in: ['pending', 'approved'] } },
      include: {
        account: { select: { emailAddress: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return {
      overview: {
        pending_drafts: pendingDrafts,
        approved_drafts: approvedDrafts,
        high_priority_threads: highPriorityThreads,
        medium_priority_threads: mediumPriorityThreads,
        low_priority_threads: lowPriorityThreads,
        unread_threads: unreadThreads,
        total_threads: totalThreads,
        unanalyzed_threads: totalThreads - analyzedThreads,
        high_priority_senders: highPrioritySenders,
      },
      drafts_preview: pendingDraftsList,
      recent_actions: recentActions,
      accounts,
      per_account_stats: perAccountStats,
    };
  });
}
