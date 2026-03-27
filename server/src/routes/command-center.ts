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
      },
      drafts_preview: pendingDraftsList,
      recent_actions: recentActions,
      accounts,
    };
  });
}
