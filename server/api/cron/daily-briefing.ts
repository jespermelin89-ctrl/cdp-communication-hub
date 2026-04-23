/**
 * Vercel Cron — Daily Morning Briefing
 * Schedule: 07:00 UTC every day (0 7 * * *)
 *
 * Generates a morning briefing summary for each user with:
 * - Urgent unread high-priority threads
 * - Yesterday's email stats (received, sent, classified)
 * - AI-generated recommendations
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  require('dotenv').config();
  const { connectDatabase, prisma } = await import('../../src/config/database');
  await connectDatabase();

  const { aiService } = await import('../../src/services/ai.service');
  const { sendPushToUser } = await import('../../src/services/push.service');

  try {
    const users = await prisma.user.findMany({ select: { id: true } });
    let generated = 0;

    for (const user of users) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Skip if already generated today
      const existing = await prisma.dailySummary.findFirst({
        where: { userId: user.id, createdAt: { gte: today } },
      }).catch(() => null);
      if (existing) continue;

      // Urgent unread high-priority threads
      const urgent = await prisma.emailThread.findMany({
        where: {
          account: { userId: user.id, isActive: true },
          isRead: false,
          NOT: { labels: { has: 'TRASH' } },
          analyses: { some: { priority: 'high' } },
        },
        take: 10,
        orderBy: { lastMessageAt: 'desc' },
        select: {
          subject: true,
          snippet: true,
          participantEmails: true,
        },
      }).catch(() => []);

      // Yesterday's stats
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const [received, sent, classified] = await Promise.all([
        prisma.emailMessage.count({
          where: { thread: { account: { userId: user.id } }, receivedAt: { gte: yesterday, lt: today } },
        }).catch(() => 0),
        prisma.draft.count({
          where: { account: { userId: user.id }, status: 'sent', updatedAt: { gte: yesterday, lt: today } },
        }).catch(() => 0),
        prisma.aIAnalysis.count({
          where: { thread: { account: { userId: user.id } }, createdAt: { gte: yesterday, lt: today } },
        }).catch(() => 0),
      ]);

      const summary = await aiService.generateBriefing(user.id, urgent, { received, sent, classified });

      await prisma.dailySummary.create({
        data: {
          userId: user.id,
          date: today,
          needsReply: summary.needsReply,
          goodToKnow: summary.goodToKnow,
          autoArchived: summary.autoArchived,
          awaitingReply: summary.awaitingReply,
          recommendation: summary.recommendation,
          totalNew: summary.totalNew,
          totalUnread: summary.totalUnread,
          totalAutoSorted: summary.totalAutoSorted,
          modelUsed: summary.modelUsed,
        },
      }).catch((e: any) => {
        if (!e?.message?.includes('Unique constraint')) throw e;
      });

      sendPushToUser(user.id, {
        title: 'God morgon — din briefing ar klar',
        body: `${received} nya mail igar, ${urgent.length} kraver uppmarksamhet`,
        url: '/',
      }).catch(() => {});

      generated++;
    }

    res.json({ ok: true, job: 'daily-briefing', generated, timestamp: new Date().toISOString() });
  } catch (err: any) {
    console.error('[Cron:daily-briefing] Error:', err);
    res.status(500).json({ error: err.message });
  }
}
