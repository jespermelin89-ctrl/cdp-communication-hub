/**
 * Brain Summary route — Aggregated daily view for BRAIN-OS and external consumers.
 *
 * GET /api/v1/brain-summary
 *
 * Returns a lightweight, stable snapshot designed for external systems:
 * - Unread message count
 * - High-priority / flagged threads (metadata only, no body content)
 * - Pending drafts awaiting approval (metadata only — body_text NEVER exposed here)
 * - Today's AI-generated daily summary (from daily_summaries table, null if not yet generated)
 *
 * Safety guarantee: draft body_text is NEVER included in this response.
 * Approval-model is fully respected.
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database';
import { authMiddleware } from '../middleware/auth.middleware';

export async function brainSummaryRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  fastify.get('/brain-summary', async (request) => {
    const userId = request.userId;

    // Fetch user's active account IDs
    const accounts = await prisma.emailAccount.findMany({
      where: { userId, isActive: true },
      select: { id: true, emailAddress: true, isDefault: true, provider: true, label: true },
    });
    const accountIds = accounts.map((a) => a.id);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      unreadCount,
      importantThreads,
      pendingDrafts,
      approvedDrafts,
      dailySummary,
    ] = await Promise.all([
      // Unread thread count
      prisma.emailThread.count({
        where: { accountId: { in: accountIds }, isRead: false },
      }),

      // High-priority threads from last 7 days — metadata only
      prisma.emailThread.findMany({
        where: {
          accountId: { in: accountIds },
          analyses: { some: { priority: 'high' } },
          lastMessageAt: { gte: sevenDaysAgo },
        },
        select: {
          id: true,
          subject: true,
          snippet: true,
          isRead: true,
          lastMessageAt: true,
          participantEmails: true,
          messageCount: true,
          analyses: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              priority: true,
              classification: true,
              suggestedAction: true,
              confidence: true,
            },
          },
        },
        orderBy: { lastMessageAt: 'desc' },
        take: 10,
      }),

      // Pending drafts awaiting approval — metadata ONLY, body_text excluded
      prisma.draft.findMany({
        where: { userId, status: 'pending' },
        select: {
          id: true,
          subject: true,
          toAddresses: true,
          status: true,
          createdAt: true,
          account: { select: { emailAddress: true, label: true } },
          // body_text intentionally omitted — approval required before exposure
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),

      // Approved drafts ready to send
      prisma.draft.count({
        where: { userId, status: 'approved' },
      }),

      // Today's AI daily summary (null if not generated yet)
      prisma.dailySummary.findUnique({
        where: { userId_date: { userId, date: today } },
        select: {
          id: true,
          date: true,
          totalNew: true,
          totalUnread: true,
          totalAutoSorted: true,
          recommendation: true,
          needsReply: true,
          goodToKnow: true,
          modelUsed: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      // Snapshot metadata
      generated_at: new Date().toISOString(),
      accounts: accounts.map((a) => ({
        id: a.id,
        email: a.emailAddress,
        label: a.label,
        is_default: a.isDefault,
        provider: a.provider,
      })),

      // Key metrics
      summary: {
        unread_threads: unreadCount,
        important_threads: importantThreads.length,
        pending_drafts: pendingDrafts.length,
        approved_drafts: approvedDrafts,
      },

      // Important threads (metadata only)
      important_threads: importantThreads.map((t) => ({
        id: t.id,
        subject: t.subject,
        snippet: t.snippet,
        is_read: t.isRead,
        last_message_at: t.lastMessageAt,
        participant_count: t.participantEmails.length,
        message_count: t.messageCount,
        analysis: t.analyses[0] ?? null,
      })),

      // Drafts awaiting action (no body content)
      pending_drafts: pendingDrafts.map((d) => ({
        id: d.id,
        subject: d.subject,
        to: d.toAddresses,
        status: d.status,
        account: d.account.emailAddress,
        account_label: d.account.label,
        created_at: d.createdAt,
        // body_text omitted — requires explicit approval before content is accessible
      })),

      // AI daily summary for today (null if not yet generated)
      daily_summary: dailySummary
        ? {
            id: dailySummary.id,
            date: dailySummary.date,
            total_new: dailySummary.totalNew,
            total_unread: dailySummary.totalUnread,
            total_auto_sorted: dailySummary.totalAutoSorted,
            recommendation: dailySummary.recommendation,
            needs_reply: dailySummary.needsReply,
            good_to_know: dailySummary.goodToKnow,
            model_used: dailySummary.modelUsed,
            generated_at: dailySummary.createdAt,
          }
        : null,
    };
  });
}
