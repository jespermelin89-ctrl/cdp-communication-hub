/**
 * Vercel Cron — Scheduled Send
 * Schedule: every minute (* * * * *)
 *
 * Sends drafts whose scheduledAt timestamp has passed and status is 'approved'.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  require('dotenv').config();
  const { connectDatabase, prisma } = await import('../../src/config/database');
  await connectDatabase();

  const { draftService } = await import('../../src/services/draft.service');

  try {
    const now = new Date();
    const ready = await prisma.draft.findMany({
      where: {
        scheduledAt: { lte: now },
        status: { in: ['approved', 'sending'] },
      },
      select: { id: true, subject: true, status: true, account: { select: { userId: true } } },
    });

    let sent = 0;
    for (const draft of ready) {
      try {
        // Normalize legacy undo-send drafts stored as "sending"
        if (draft.status === 'sending') {
          await prisma.draft.update({
            where: { id: draft.id },
            data: { status: 'approved' },
          });
        }

        await draftService.send(draft.id, draft.account.userId);

        await prisma.actionLog.create({
          data: {
            userId: draft.account.userId,
            actionType: 'scheduled_send',
            targetType: 'draft',
            targetId: draft.id,
            metadata: { subject: draft.subject },
          },
        });

        sent++;
      } catch (err: any) {
        // Mark as failed — do not auto-retry
        await prisma.draft.update({
          where: { id: draft.id },
          data: {
            status: 'failed',
            errorMessage: err?.message ?? 'Scheduled send failed',
            scheduledAt: null,
          },
        }).catch(() => {});

        console.warn(`[Cron:send-scheduled] Failed draft ${draft.id}: ${err?.message}`);
      }
    }

    res.json({ ok: true, job: 'send-scheduled', sent, timestamp: new Date().toISOString() });
  } catch (err: any) {
    console.error('[Cron:send-scheduled] Error:', err);
    res.status(500).json({ error: err.message });
  }
}
