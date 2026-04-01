/**
 * Analytics routes
 *
 * GET /analytics/overview?days=30 — Aggregated mail stats
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database';
import { authMiddleware } from '../middleware/auth.middleware';

export async function analyticsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // GET /analytics/overview?days=30
  fastify.get('/analytics/overview', async (request) => {
    const { days: daysStr } = request.query as { days?: string };
    const days = Math.min(Math.max(parseInt(daysStr ?? '30', 10) || 30, 1), 365);

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const userId = request.userId;

    // Get all account IDs for this user
    const accounts = await prisma.emailAccount.findMany({
      where: { userId, isActive: true },
      select: { id: true },
    });
    const accountIds = accounts.map((a) => a.id);

    // ── Mail per day (received) ──────────────────────────────
    const receivedMessages = await prisma.emailMessage.findMany({
      where: {
        receivedAt: { gte: since },
        thread: { accountId: { in: accountIds } },
      },
      select: { receivedAt: true },
    });

    // ── Sent per day (drafts with status=sent) ───────────────
    const sentDrafts = await prisma.draft.findMany({
      where: {
        userId,
        status: 'sent',
        sentAt: { gte: since },
      },
      select: { sentAt: true },
    });

    // Build day-by-day buckets
    const dayMap: Record<string, { date: string; received: number; sent: number }> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(since.getTime() + i * 86400000);
      const key = d.toISOString().slice(0, 10);
      dayMap[key] = { date: key, received: 0, sent: 0 };
    }

    for (const msg of receivedMessages) {
      const key = new Date(msg.receivedAt).toISOString().slice(0, 10);
      if (dayMap[key]) dayMap[key].received++;
    }
    for (const draft of sentDrafts) {
      if (!draft.sentAt) continue;
      const key = new Date(draft.sentAt).toISOString().slice(0, 10);
      if (dayMap[key]) dayMap[key].sent++;
    }

    const mailPerDay = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));

    // ── Classification distribution ──────────────────────────
    const analyses = await prisma.aIAnalysis.findMany({
      where: {
        createdAt: { gte: since },
        thread: { accountId: { in: accountIds } },
      },
      select: { classification: true, priority: true, modelUsed: true },
    });

    const classificationMap: Record<string, number> = {};
    const priorityMap: Record<string, number> = { high: 0, medium: 0, low: 0 };
    let aiClassifications = 0;

    for (const a of analyses) {
      classificationMap[a.classification] = (classificationMap[a.classification] ?? 0) + 1;
      if (priorityMap[a.priority] !== undefined) priorityMap[a.priority]++;
      if (a.modelUsed !== 'rule-engine') aiClassifications++;
    }

    const classificationDistribution = Object.entries(classificationMap).map(([name, value]) => ({ name, value }));
    const priorityDistribution = Object.entries(priorityMap).map(([name, value]) => ({ name, value }));

    // ── Top 10 senders ───────────────────────────────────────
    const allMessages = await prisma.emailMessage.findMany({
      where: {
        receivedAt: { gte: since },
        thread: { accountId: { in: accountIds } },
      },
      select: { fromAddress: true },
    });

    const senderMap: Record<string, number> = {};
    for (const msg of allMessages) {
      const sender = msg.fromAddress?.toLowerCase().trim() ?? '';
      if (sender) senderMap[sender] = (senderMap[sender] ?? 0) + 1;
    }

    const topSenders = Object.entries(senderMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([email, count]) => ({ email, count }));

    // ── Amanda (AI) activity ─────────────────────────────────
    const generatedDrafts = await prisma.draft.count({
      where: { userId, createdAt: { gte: since } },
    });

    const learningEvents = await prisma.learningEvent.count({
      where: { userId, createdAt: { gte: since } },
    });

    // ── Average response time ────────────────────────────────
    const threadsWithResponse = await prisma.emailThread.findMany({
      where: {
        accountId: { in: accountIds },
        responseTimeHours: { not: null },
        updatedAt: { gte: since },
      },
      select: { responseTimeHours: true },
    });

    const avgResponseTime =
      threadsWithResponse.length > 0
        ? threadsWithResponse.reduce((sum, t) => sum + (t.responseTimeHours ?? 0), 0) /
          threadsWithResponse.length
        : null;

    // ── Follow-up stats ──────────────────────────────────────
    const activeFollowUps = await prisma.followUpReminder.count({
      where: { userId, isCompleted: false },
    });

    return {
      period: { days, since: since.toISOString() },
      mailPerDay,
      classificationDistribution,
      priorityDistribution,
      topSenders,
      amanda: {
        aiClassifications,
        generatedDrafts,
        learningEvents,
      },
      avgResponseTimeHours: avgResponseTime,
      activeFollowUps,
      totals: {
        received: receivedMessages.length,
        sent: sentDrafts.length,
        analyzed: analyses.length,
      },
    };
  });
}
