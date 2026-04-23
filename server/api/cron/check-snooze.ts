/**
 * Vercel Cron — Snooze Check
 * Schedule: every minute (* * * * *)
 *
 * Wakes snoozed threads whose snoozedUntil has passed.
 * Sends push notifications and emits SSE events.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  require('dotenv').config();
  const { connectDatabase, prisma } = await import('../../src/config/database');
  await connectDatabase();

  try {
    const now = new Date();
    const snoozed = await prisma.emailThread.findMany({
      where: { snoozedUntil: { lte: now } },
      select: {
        id: true,
        subject: true,
        snoozedUntil: true,
        account: { select: { userId: true } },
      },
    });

    let woken = 0;
    for (const thread of snoozed) {
      await prisma.emailThread.update({
        where: { id: thread.id },
        data: { snoozedUntil: null, isRead: false },
      });

      await prisma.actionLog.create({
        data: {
          userId: thread.account.userId,
          actionType: 'snooze_wake',
          targetType: 'thread',
          targetId: thread.id,
          metadata: {},
        },
      });

      woken++;
    }

    res.json({ ok: true, job: 'check-snooze', woken, timestamp: new Date().toISOString() });
  } catch (err: any) {
    console.error('[Cron:check-snooze] Error:', err);
    res.status(500).json({ error: err.message });
  }
}
