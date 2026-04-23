/**
 * Vercel Cron — AI Classification
 * Schedule: every 10 minutes (*/10 * * * *)
 *
 * Classifies unanalyzed email threads using AI (Groq/Anthropic/OpenAI).
 * The classifyUnanalyzedThreads function is not exported from the scheduler
 * module directly, so we call autoTriageNewThreads for all active accounts
 * which handles both rule-engine and AI classification.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  require('dotenv').config();
  const { connectDatabase, prisma } = await import('../../src/config/database');
  await connectDatabase();

  const { autoTriageNewThreads } = await import('../../src/services/sync-scheduler.service');

  try {
    const accounts = await prisma.emailAccount.findMany({
      where: { isActive: true },
      select: { id: true, userId: true, emailAddress: true },
    });

    for (const account of accounts) {
      await autoTriageNewThreads(account.id, account.userId);
    }

    res.json({ ok: true, job: 'classify', accounts: accounts.length, timestamp: new Date().toISOString() });
  } catch (err: any) {
    console.error('[Cron:classify] Error:', err);
    res.status(500).json({ error: err.message });
  }
}
