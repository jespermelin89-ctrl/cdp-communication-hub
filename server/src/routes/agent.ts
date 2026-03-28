/**
 * Agent API — external agent endpoint for Amanda / BRAIN-OS / Apple Shortcuts
 *
 * POST /api/v1/agent/execute
 * Auth: X-API-Key: <COMMAND_API_KEY>  (no JWT required)
 *
 * Actions
 * -------
 * briefing      — inbox summary + classified threads (unread, high priority first)
 * classify      — run AI analysis on a specific thread   { thread_id: string }
 * draft         — generate an AI draft                   { thread_id?, to_addresses?, subject?, instruction }
 * search        — search cached threads                  { query: string, limit?: number }
 * brain-status  — Brain Core snapshot (writing profile + last daily summary)
 *
 * Response: { success: boolean, action: string, data: any, provider_used?: string }
 *
 * SAFETY GUARANTEE: draft.body_text is NEVER included in briefing/search responses.
 * Sending always requires explicit human approval through the CDP UI.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database';
import { aiService } from '../services/ai.service';
import { draftService } from '../services/draft.service';
import { brainCoreService } from '../services/brain-core.service';
import { env } from '../config/env';

const ALLOWED_ACTIONS = ['briefing', 'classify', 'draft', 'search', 'brain-status'] as const;
type AgentAction = (typeof ALLOWED_ACTIONS)[number];

/** Reject request if X-API-Key header does not match COMMAND_API_KEY */
async function agentKeyAuth(request: FastifyRequest, reply: FastifyReply) {
  const key = request.headers['x-api-key'];
  if (!env.COMMAND_API_KEY) {
    return reply.code(503).send({ success: false, error: 'Agent API is not configured (COMMAND_API_KEY missing).' });
  }
  if (!key || key !== env.COMMAND_API_KEY) {
    return reply.code(401).send({ success: false, error: 'Invalid or missing X-API-Key.' });
  }
}

export default async function agentRoutes(app: FastifyInstance) {
  app.addHook('onRequest', agentKeyAuth);

  /**
   * POST /agent/execute
   */
  app.post('/agent/execute', async (req, reply) => {
    const body = req.body as { action?: string; params?: Record<string, any> };
    const action = body?.action as AgentAction | undefined;
    const params = body?.params ?? {};

    if (!action || !ALLOWED_ACTIONS.includes(action)) {
      return reply.code(400).send({
        success: false,
        error: `Okänd action. Tillåtna: ${ALLOWED_ACTIONS.join(', ')}`,
      });
    }

    // Resolve userId from the first active account (single-owner deployment)
    const account = await prisma.emailAccount.findFirst({ where: { isActive: true } });
    if (!account) {
      return reply.code(503).send({ success: false, error: 'Inga aktiva e-postkonton hittades.' });
    }
    const userId = account.userId;

    try {
      switch (action) {
        // ── BRIEFING ──────────────────────────────────────────────────────────
        case 'briefing': {
          const [threads, pendingDrafts, dailySummary] = await Promise.all([
            prisma.emailThread.findMany({
              where: { account: { userId }, isRead: false },
              orderBy: { lastMessageAt: 'desc' },
              take: 20,
              include: {
                analyses: {
                  orderBy: { createdAt: 'desc' as const },
                  take: 1,
                  select: { priority: true, classification: true, summary: true },
                },
                account: { select: { emailAddress: true, label: true } },
              },
            }),
            prisma.draft.findMany({
              where: { account: { userId }, status: { in: ['pending', 'approved'] } },
              orderBy: { createdAt: 'desc' },
              take: 10,
              select: {
                id: true,
                subject: true,
                status: true,
                toAddresses: true,
                createdAt: true,
                // bodyText intentionally excluded — human must review in UI
              },
            }),
            prisma.dailySummary.findFirst({
              where: { userId },
              orderBy: { date: 'desc' },
            }),
          ]);

          const withAnalysis = threads.map((t) => ({ ...t, latestAnalysis: t.analyses[0] ?? null }));
          const high   = withAnalysis.filter((t) => t.latestAnalysis?.priority === 'high');
          const medium = withAnalysis.filter((t) => t.latestAnalysis?.priority === 'medium');
          const unanalyzed = withAnalysis.filter((t) => !t.latestAnalysis);

          return {
            success: true,
            action,
            data: {
              generated_at: new Date().toISOString(),
              unread_count: threads.length,
              high_priority: high.map((t) => ({
                id: t.id,
                subject: t.subject,
                participants: t.participantEmails,
                account: t.account.emailAddress,
                summary: t.latestAnalysis?.summary ?? null,
                classification: t.latestAnalysis?.classification ?? null,
                last_message_at: t.lastMessageAt,
              })),
              medium_priority: medium.map((t) => ({
                id: t.id,
                subject: t.subject,
                participants: t.participantEmails,
                summary: t.latestAnalysis?.summary ?? null,
                last_message_at: t.lastMessageAt,
              })),
              unanalyzed_count: unanalyzed.length,
              pending_drafts: pendingDrafts,
              daily_summary: dailySummary
                ? {
                    date: dailySummary.date,
                    needs_reply: dailySummary.needsReply,
                    good_to_know: dailySummary.goodToKnow,
                    ai_recommendation: dailySummary.recommendation,
                  }
                : null,
            },
          };
        }

        // ── CLASSIFY ─────────────────────────────────────────────────────────
        case 'classify': {
          if (!params.thread_id) {
            return reply.code(400).send({ success: false, error: 'params.thread_id krävs.' });
          }
          const thread = await prisma.emailThread.findFirst({
            where: { id: params.thread_id, account: { userId } },
            include: { messages: { orderBy: { receivedAt: 'asc' } } },
          });
          if (!thread) {
            return reply.code(404).send({ success: false, error: 'Tråd hittades inte.' });
          }

          // Build ThreadData shape for aiService
          const threadData = {
            subject: thread.subject || '(No Subject)',
            messages: thread.messages.map((m) => ({
              from: m.fromAddress,
              to: m.toAddresses,
              body: m.bodyText || '',
              date: m.receivedAt.toISOString(),
            })),
          };

          const analysis = await aiService.analyzeThread(threadData);

          // Persist analysis — use upsert so re-running is idempotent
          const saved = await prisma.aIAnalysis.create({
            data: {
              threadId: thread.id,
              summary: analysis.summary,
              classification: analysis.classification,
              priority: analysis.priority,
              suggestedAction: analysis.suggested_action,
              draftText: analysis.draft_text,
              confidence: analysis.confidence,
              modelUsed: analysis.model_used,
            },
          });

          return {
            success: true,
            action,
            data: {
              thread_id: thread.id,
              subject: thread.subject,
              priority: analysis.priority,
              classification: analysis.classification,
              summary: analysis.summary,
              suggested_action: analysis.suggested_action,
              confidence: analysis.confidence,
              analysis_id: saved.id,
            },
            provider_used: env.AI_PROVIDER,
          };
        }

        // ── DRAFT ─────────────────────────────────────────────────────────────
        case 'draft': {
          if (!params.instruction) {
            return reply.code(400).send({ success: false, error: 'params.instruction krävs.' });
          }
          const draftAccount = params.account_id
            ? await prisma.emailAccount.findFirst({ where: { id: params.account_id, userId } })
            : await prisma.emailAccount.findFirst({ where: { userId, isActive: true } });

          if (!draftAccount) {
            return reply.code(400).send({ success: false, error: 'Inget konto hittades.' });
          }

          // Build thread context if thread_id provided (mirrors /ai/generate-draft)
          let threadContext:
            | { subject: string; messages: { from: string; to: string[]; body: string; date: string }[] }
            | undefined;

          if (params.thread_id) {
            const thread = await prisma.emailThread.findFirst({
              where: { id: params.thread_id, account: { userId } },
              include: { messages: { orderBy: { receivedAt: 'asc' } } },
            });
            if (thread && thread.messages.length > 0) {
              threadContext = {
                subject: thread.subject || '(No Subject)',
                messages: thread.messages.map((m) => ({
                  from: m.fromAddress,
                  to: m.toAddresses,
                  body: m.bodyText || '',
                  date: m.receivedAt.toISOString(),
                })),
              };
            }
          }

          const draftText = await aiService.generateDraft({
            instruction: params.instruction,
            threadContext,
          });

          const toAddrs: string[] = Array.isArray(params.to_addresses)
            ? params.to_addresses
            : threadContext && threadContext.messages.length > 0
              ? [threadContext.messages[threadContext.messages.length - 1].from]
              : [];

          if (toAddrs.length === 0) {
            return reply.code(400).send({
              success: false,
              error: 'Kan inte fastställa mottagare. Ange params.to_addresses eller params.thread_id.',
            });
          }

          const finalSubject =
            params.subject ?? (threadContext ? `Re: ${threadContext.subject}` : 'Nytt meddelande');

          const draft = await draftService.create(userId, {
            account_id: draftAccount.id,
            thread_id: params.thread_id,
            to_addresses: toAddrs,
            cc_addresses: [],
            subject: finalSubject,
            body_text: draftText,
          });

          return {
            success: true,
            action,
            data: {
              draft_id: draft.id,
              subject: draft.subject,
              status: draft.status,
              to_addresses: draft.toAddresses,
              // body_text intentionally omitted — human must review in UI before sending
              review_url: `${env.FRONTEND_URL ?? 'https://cdp-communication-hub.vercel.app'}/drafts/${draft.id}`,
              message:
                'Utkast skapat med status "pending". Granska och godkänn i CDP-gränssnittet innan det skickas.',
            },
            provider_used: env.AI_PROVIDER,
          };
        }

        // ── SEARCH ────────────────────────────────────────────────────────────
        case 'search': {
          if (!params.query) {
            return reply.code(400).send({ success: false, error: 'params.query krävs.' });
          }
          const limit = Math.min(Number(params.limit) || 10, 50);
          const q = params.query as string;

          const threads = await prisma.emailThread.findMany({
            where: {
              account: { userId },
              OR: [
                { subject: { contains: q, mode: 'insensitive' } },
                { snippet: { contains: q, mode: 'insensitive' } },
              ],
            },
            orderBy: { lastMessageAt: 'desc' },
            take: limit,
            include: {
              analyses: {
                orderBy: { createdAt: 'desc' as const },
                take: 1,
                select: { priority: true, classification: true, summary: true },
              },
              account: { select: { emailAddress: true } },
            },
          });

          return {
            success: true,
            action,
            data: {
              query: q,
              count: threads.length,
              threads: threads.map((t) => {
                const latest = t.analyses[0] ?? null;
                return {
                  id: t.id,
                  subject: t.subject,
                  participants: t.participantEmails,
                  account: t.account.emailAddress,
                  snippet: t.snippet,
                  is_read: t.isRead,
                  last_message_at: t.lastMessageAt,
                  priority: latest?.priority ?? null,
                  classification: latest?.classification ?? null,
                  summary: latest?.summary ?? null,
                };
              }),
            },
          };
        }

        // ── BRAIN-STATUS ──────────────────────────────────────────────────────
        case 'brain-status': {
          const [profile, contacts, rules, dailySummary] = await Promise.all([
            brainCoreService.getWritingProfile(userId),
            brainCoreService.getContacts(userId, 20),
            brainCoreService.getClassificationRules(userId),
            prisma.dailySummary.findFirst({ where: { userId }, orderBy: { date: 'desc' } }),
          ]);

          return {
            success: true,
            action,
            data: {
              writing_modes: profile.modes.length,
              voice_attributes: profile.attributes.length,
              contacts: contacts.length,
              classification_rules: rules.length,
              seeded: profile.modes.length > 0,
              daily_summary: dailySummary
                ? {
                    date: dailySummary.date,
                    needs_reply: dailySummary.needsReply,
                    good_to_know: dailySummary.goodToKnow,
                    ai_recommendation: dailySummary.recommendation,
                    generated_at: dailySummary.createdAt,
                  }
                : null,
              top_contacts: contacts.slice(0, 5).map((c) => ({
                email: c.emailAddress,
                name: c.displayName,
                relationship: c.relationship,
                total_emails: c.totalEmails,
              })),
            },
          };
        }
      }
    } catch (err: any) {
      const msg: string = err?.message ?? 'Okänt fel';
      const safe = /prisma|database|connection/i.test(msg)
        ? 'Databasfel — försök igen om en stund.'
        : msg;
      return reply.code(500).send({ success: false, action, error: safe });
    }
  });
}
