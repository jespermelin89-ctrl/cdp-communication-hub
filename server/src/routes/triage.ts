/**
 * Triage Report routes — Sprint 7
 *
 * GET /api/v1/triage/report
 *   Query params:
 *     period  — 'today' | 'week' | 'month'  (default: today)
 *     action  — TriageAction filter           (optional)
 *
 *   Returns:
 *     { period, from, to, total, by_action, by_classification, by_sender, rows }
 *
 *   `rows` is grouped by sender + classification, sorted by count desc.
 *   Designed to power both the dashboard table and the voice triage-report agent action.
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { authMiddleware } from '../middleware/auth.middleware';

const PeriodSchema = z.enum(['today', 'week', 'month']).default('today');

function periodWindow(period: 'today' | 'week' | 'month'): { from: Date; to: Date; label: string } {
  const to = new Date();
  const from = new Date();

  switch (period) {
    case 'today':
      from.setHours(0, 0, 0, 0);
      break;
    case 'week':
      from.setDate(from.getDate() - 7);
      break;
    case 'month':
      from.setDate(from.getDate() - 30);
      break;
  }

  return { from, to, label: period };
}

export async function triageRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /triage/report
   * Triage activity report for a given period.
   */
  fastify.get('/triage/report', { preHandler: authMiddleware }, async (request, reply) => {
    const userId = (request as { userId?: string }).userId;
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

    const rawQuery = request.query as Record<string, string>;
    const periodParse = PeriodSchema.safeParse(rawQuery.period ?? 'today');
    const period = periodParse.success ? periodParse.data : 'today';
    const actionFilter = rawQuery.action as string | undefined;

    const { from, to } = periodWindow(period);

    // Build where clause
    const where: Record<string, unknown> = {
      userId,
      createdAt: { gte: from, lte: to },
    };
    if (actionFilter) {
      where.action = actionFilter;
    }

    const logs = await prisma.triageLog.findMany({
      where,
      select: {
        action: true,
        classification: true,
        priority: true,
        senderEmail: true,
        subject: true,
        source: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Aggregations
    const byAction: Record<string, number> = {};
    const byClassification: Record<string, number> = {};
    const bySender: Record<string, number> = {};

    for (const log of logs) {
      byAction[log.action] = (byAction[log.action] ?? 0) + 1;
      byClassification[log.classification] = (byClassification[log.classification] ?? 0) + 1;
      bySender[log.senderEmail] = (bySender[log.senderEmail] ?? 0) + 1;
    }

    // Group rows by sender + classification
    const grouped: Record<string, { sender: string; classification: string; count: number; actions: Record<string, number> }> = {};
    for (const log of logs) {
      const key = `${log.senderEmail}::${log.classification}`;
      if (!grouped[key]) {
        grouped[key] = { sender: log.senderEmail, classification: log.classification, count: 0, actions: {} };
      }
      grouped[key].count++;
      grouped[key].actions[log.action] = (grouped[key].actions[log.action] ?? 0) + 1;
    }

    const rows = Object.values(grouped).sort((a, b) => b.count - a.count);

    return reply.send({
      period,
      from: from.toISOString(),
      to: to.toISOString(),
      total: logs.length,
      by_action: byAction,
      by_classification: byClassification,
      by_sender: Object.entries(bySender)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 20)
        .map(([sender, count]) => ({ sender, count })),
      rows,
    });
  });
}
