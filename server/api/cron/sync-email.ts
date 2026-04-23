/**
 * Vercel Cron — Email Sync
 * Schedule: every 30 minutes (*/30 * * * *)
 *
 * Triggers syncAllAccounts() which fetches new threads from Gmail,
 * runs auto-triage, contact auto-learn, and follow-up detection.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  require('dotenv').config();
  const { connectDatabase } = await import('../../src/config/database');
  await connectDatabase();

  const { startSyncNow } = await import('../../src/services/sync-scheduler.service');

  try {
    await startSyncNow();
    res.json({ ok: true, job: 'sync-email', timestamp: new Date().toISOString() });
  } catch (err: any) {
    console.error('[Cron:sync-email] Error:', err);
    res.status(500).json({ error: err.message });
  }
}
