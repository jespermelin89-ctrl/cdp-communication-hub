/**
 * Review routes — Granskning-vy + regelförslag (Sprint 4)
 *
 * GET  /api/v1/review
 *   → Threads moved to the 'Granskning' Gmail label (unknown senders).
 *     Includes latest AI analysis so the user can make an informed decision.
 *
 * POST /api/v1/review/:threadId/decide
 *   → Body: { action: 'keep' | 'trash' | 'create_rule' }
 *   → keep        — move back to INBOX
 *   → trash       — move to Gmail TRASH (reversible)
 *   → create_rule — create a ClassificationRule for the sender's domain
 *
 * POST /api/v1/rules/suggest
 *   → Scan triage_log for patterns, generate pending suggestions, return list.
 *
 * POST /api/v1/rules/accept
 *   → Body: { suggestionId: string }  Accept suggestion → creates ClassificationRule.
 *
 * POST /api/v1/rules/dismiss
 *   → Body: { suggestionId: string }  Dismiss suggestion so it won't resurface.
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { gmailService } from '../services/gmail.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { ensureReviewLabel } from '../services/triage-action.service';
import {
  checkAndCreateSuggestion,
  generateSuggestions,
  acceptSuggestion,
  dismissSuggestion,
} from '../services/rule-suggestion.service';

const DecideSchema = z.object({
  action: z.enum(['keep', 'trash', 'create_rule']),
});

const SuggestionIdSchema = z.object({
  suggestionId: z.string().uuid(),
});

export async function reviewRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // ────────────────────────────────────────────────────────────────────────
  // GET /review — threads in the Granskning review queue
  // ────────────────────────────────────────────────────────────────────────
  fastify.get('/review', async (request, reply) => {
    const userId = request.userId;
    const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);

    // Find distinct thread IDs that were moved to Granskning in the last 30 days
    const triageLogs = await prisma.triageLog.findMany({
      where: { userId, action: 'label_review', createdAt: { gte: cutoff } },
      orderBy: { createdAt: 'desc' },
      distinct: ['threadId'],
      select: { threadId: true, senderEmail: true, subject: true, createdAt: true, reason: true },
    });

    if (triageLogs.length === 0) return reply.send({ threads: [] });

    const threadIds = triageLogs.map((l) => l.threadId);

    // Fetch threads with their latest AI analysis
    const threads = await prisma.emailThread.findMany({
      where: {
        id: { in: threadIds },
        account: { userId, isActive: true },
      },
      select: {
        id: true,
        gmailThreadId: true,
        subject: true,
        snippet: true,
        participantEmails: true,
        lastMessageAt: true,
        labels: true,
        accountId: true,
        analyses: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            classification: true,
            priority: true,
            confidence: true,
            summary: true,
            suggestedAction: true,
          },
        },
      },
    });

    // Merge triage log metadata into thread response
    const logByThreadId = new Map(triageLogs.map((l) => [l.threadId, l]));

    const result = threads.map((t) => ({
      id: t.id,
      gmailThreadId: t.gmailThreadId,
      subject: t.subject,
      snippet: t.snippet,
      participantEmails: t.participantEmails,
      lastMessageAt: t.lastMessageAt,
      labels: t.labels,
      accountId: t.accountId,
      triageReason: logByThreadId.get(t.id)?.reason ?? null,
      queuedAt: logByThreadId.get(t.id)?.createdAt ?? null,
      analysis: t.analyses[0] ?? null,
    }));

    return reply.send({ threads: result });
  });

  // ────────────────────────────────────────────────────────────────────────
  // POST /review/:threadId/decide — decide what to do with a queued thread
  // ────────────────────────────────────────────────────────────────────────
  fastify.post<{ Params: { threadId: string } }>(
    '/review/:threadId/decide',
    async (request, reply) => {
      const userId = request.userId;
      const { threadId } = request.params;

      const body = DecideSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'action must be keep | trash | create_rule' });
      }
      const { action } = body.data;

      // Verify thread belongs to this user and get account + gmail IDs
      const thread = await prisma.emailThread.findFirst({
        where: { id: threadId, account: { userId, isActive: true } },
        select: {
          id: true,
          gmailThreadId: true,
          accountId: true,
          participantEmails: true,
          subject: true,
        },
      });

      if (!thread) {
        return reply.code(404).send({ error: 'Thread not found' });
      }

      const senderEmail = thread.participantEmails[0] ?? '';

      try {
        switch (action) {
          case 'keep': {
            // Remove Granskning label, restore INBOX
            const reviewLabelId = await ensureReviewLabel(thread.accountId);
            await gmailService.modifyLabels(
              thread.accountId,
              thread.gmailThreadId,
              ['INBOX'],
              [reviewLabelId]
            );
            break;
          }

          case 'trash': {
            await gmailService.trashThread(thread.accountId, thread.gmailThreadId);
            // Fire-and-forget rule suggestion check
            checkAndCreateSuggestion(senderEmail, userId).catch((e) =>
              fastify.log.warn(`[Review] Rule suggestion check failed: ${e?.message}`)
            );
            break;
          }

          case 'create_rule': {
            // Extract domain and create a ClassificationRule
            const domain = senderEmail.split('@')[1]?.toLowerCase().trim();
            if (!domain) {
              return reply.code(400).send({ error: 'Cannot extract domain from sender email' });
            }
            const senderPattern = `*@${domain}`;
            const categoryKey = `auto_${domain.replace(/[^a-z0-9]/gi, '_')}`;

            try {
              await prisma.classificationRule.create({
                data: {
                  userId,
                  categoryKey,
                  categoryName: `Auto: ${senderPattern}`,
                  description: `User-created rule from Granskning review for ${senderPattern}`,
                  priority: 'low',
                  action: 'trash',
                  senderPatterns: [senderPattern],
                  subjectPatterns: [],
                  bodyPatterns: [],
                  isActive: true,
                },
              });
            } catch (err: any) {
              // Rule already exists — idempotent
              if (!err?.message?.includes('Unique constraint')) throw err;
            }

            // Also trash this thread
            await gmailService.trashThread(thread.accountId, thread.gmailThreadId);
            break;
          }
        }
      } catch (err: any) {
        fastify.log.error({ err, threadId, action }, '[Review] decide action failed');
        return reply.code(502).send({ error: 'Gmail API call failed', message: err?.message });
      }

      return reply.send({ success: true, action, threadId });
    }
  );

  // ────────────────────────────────────────────────────────────────────────
  // POST /rules/suggest — scan triage_log and return pending suggestions
  // ────────────────────────────────────────────────────────────────────────
  fastify.post('/rules/suggest', async (request, reply) => {
    const userId = request.userId;
    const suggestions = await generateSuggestions(userId);
    return reply.send({ suggestions });
  });

  // ────────────────────────────────────────────────────────────────────────
  // POST /rules/accept — accept a suggestion → create ClassificationRule
  // ────────────────────────────────────────────────────────────────────────
  fastify.post('/rules/accept', async (request, reply) => {
    const userId = request.userId;

    const body = SuggestionIdSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'suggestionId (UUID) is required' });
    }

    try {
      const result = await acceptSuggestion(body.data.suggestionId, userId);
      return reply.send({ success: true, ...result });
    } catch (err: any) {
      if (err?.message?.includes('not found')) {
        return reply.code(404).send({ error: err.message });
      }
      throw err;
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // POST /rules/dismiss — dismiss a suggestion
  // ────────────────────────────────────────────────────────────────────────
  fastify.post('/rules/dismiss', async (request, reply) => {
    const userId = request.userId;

    const body = SuggestionIdSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'suggestionId (UUID) is required' });
    }

    try {
      await dismissSuggestion(body.data.suggestionId, userId);
      return reply.send({ success: true });
    } catch (err: any) {
      if (err?.message?.includes('not found')) {
        return reply.code(404).send({ error: err.message });
      }
      throw err;
    }
  });
}
