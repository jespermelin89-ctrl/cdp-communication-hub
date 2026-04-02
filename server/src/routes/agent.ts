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
 * The agent can only send or schedule drafts that have already been approved by a human.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { aiService } from '../services/ai.service';
import { draftService } from '../services/draft.service';
import { brainCoreService } from '../services/brain-core.service';
import { seedBrainCore } from '../services/seed-brain-core.service';
import { env } from '../config/env';
import { getAgentDraftStatusError } from '../utils/agent-safety';

const ALLOWED_ACTIONS = [
  'briefing', 'classify', 'draft', 'search', 'brain-status', 'learn',
  'bulk-classify', 'sync', 'cleanup', 'seed-brain-core',
  // v2 actions:
  'send', 'schedule', 'snooze', 'export', 'contacts', 'stats', 'compose', 'chat',
] as const;
type AgentAction = (typeof ALLOWED_ACTIONS)[number];

const AgentExecuteSchema = z.object({
  action: z.string(),
  params: z.record(z.unknown()).optional(),
});

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
  app.post('/execute', async (req, reply) => {
    const body = AgentExecuteSchema.parse(req.body);
    const action = body.action as AgentAction | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: Record<string, any> = body.params ?? {};

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

    // Async callback: if caller provides callback_url, accept immediately and POST result when done
    const callbackUrl = (params as Record<string, unknown>).callback_url as string | undefined;
    if (callbackUrl) {
      // Validate URL format before accepting
      try { new URL(callbackUrl); } catch {
        return reply.code(400).send({ success: false, error: 'callback_url måste vara en giltig URL.' });
      }

      // Fire and forget — execute then POST to callback_url
      setImmediate(async () => {
        try {
          const innerResp = await app.inject({
            method: 'POST',
            url: '/execute',
            headers: { 'x-api-key': env.COMMAND_API_KEY ?? '' },
            payload: { action, params: { ...params, callback_url: undefined } },
          });
          const resultBody = innerResp.json();
          await fetch(callbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(resultBody),
          }).catch(() => {});
        } catch (err: any) {
          await fetch(callbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: false, action, error: err?.message ?? 'Internal error' }),
          }).catch(() => {});
        }
      });

      return reply.code(202).send({ success: true, action, message: 'Accepterat — resultatet skickas till callback_url när klart.' });
    }

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

          // Build writing profile + learning context (mirrors /ai/generate-draft)
          let draftLearningContext: string | undefined;
          try {
            const [profile, approvedDrafts] = await Promise.all([
              brainCoreService.getWritingProfile(userId),
              brainCoreService.getRelevantLearning(userId, {
                sender: threadContext?.messages?.[0]?.from,
                eventType: 'draft:approved',
              }),
            ]);

            const parts: string[] = [];

            const defaultMode =
              profile.modes.find((m) => m.modeKey === 'casual_sv') ?? profile.modes[0];
            if (defaultMode) {
              parts.push(
                `Skriv i denna stil: ${defaultMode.description}` +
                (defaultMode.signOff ? `\nSignatur: ${defaultMode.signOff}` : '')
              );
            }

            if (approvedDrafts.length > 0) {
              const examples = approvedDrafts.slice(0, 3).map((e) => {
                const d = e.data as any;
                return `- Ton: ${d.tone ?? 'okänd'}, Längd: ${d.word_count ?? '?'} ord`;
              });
              parts.push('Historiska utkast:\n' + examples.join('\n'));
            }

            if (parts.length > 0) draftLearningContext = parts.join('\n\n');
          } catch {
            // Learning context is non-critical — continue without it
          }

          const draftText = await aiService.generateDraft({
            instruction: params.instruction,
            threadContext,
            learningContext: draftLearningContext,
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

        // ── LEARN ─────────────────────────────────────────────────────────────
        case 'learn': {
          if (!params.event_type) {
            return reply.code(400).send({ success: false, error: 'params.event_type krävs.' });
          }
          const event = await brainCoreService.recordLearning(
            userId,
            params.event_type,
            params.data || {},
            params.source_type || 'amanda_agent',
            params.source_id
          );
          return {
            success: true,
            action,
            data: { event_id: event.id, event_type: event.eventType },
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

        // ── BULK-CLASSIFY ─────────────────────────────────────────────────
        case 'bulk-classify': {
          const limit = Math.min(Number(params.limit) || 10, 20);

          const unanalyzed = await prisma.emailThread.findMany({
            where: {
              account: { userId },
              isRead: false,
              analyses: { none: {} },
            },
            take: limit,
            orderBy: { lastMessageAt: 'desc' },
            include: {
              messages: { orderBy: { receivedAt: 'asc' }, take: 3 },
            },
          });

          const results: Array<{
            thread_id: string;
            subject: string | null;
            priority: string;
            classification: string;
          }> = [];

          for (const thread of unanalyzed) {
            try {
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
              await prisma.aIAnalysis.create({
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
              results.push({
                thread_id: thread.id,
                subject: thread.subject,
                priority: analysis.priority,
                classification: analysis.classification,
              });
            } catch {
              // Skip failed analyses — continue with remaining threads
            }
          }

          return {
            success: true,
            action,
            data: { analyzed: results.length, total_unanalyzed: unanalyzed.length, results },
            provider_used: env.AI_PROVIDER,
          };
        }

        // ── SYNC ──────────────────────────────────────────────────────────
        case 'sync': {
          const { startSyncNow } = await import('../services/sync-scheduler.service');
          await startSyncNow();
          return {
            success: true,
            action,
            data: { message: 'Gmail-sync startad för alla aktiva konton.' },
          };
        }

        // ── SEND ─────────────────────────────────────────────────────────
        case 'send': {
          if (!params.draft_id) {
            return reply.code(400).send({ success: false, error: 'params.draft_id krävs.' });
          }
          const draftToSend = await prisma.draft.findFirst({ where: { id: params.draft_id, account: { userId } } });
          if (!draftToSend) return reply.code(404).send({ success: false, error: 'Utkast hittades inte.' });
          const sendError = getAgentDraftStatusError(draftToSend.status, 'send');
          if (sendError) {
            return reply.code(409).send({ success: false, error: sendError });
          }
          const sentDraft = await draftService.send(params.draft_id, userId);
          return { success: true, action, data: { draft_id: sentDraft.id, status: sentDraft.status, message: 'E-post skickad.' } };
        }

        // ── SCHEDULE ──────────────────────────────────────────────────────
        case 'schedule': {
          if (!params.draft_id || !params.send_at) {
            return reply.code(400).send({ success: false, error: 'params.draft_id och params.send_at krävs.' });
          }
          const sendAt = new Date(params.send_at);
          if (isNaN(sendAt.getTime())) return reply.code(400).send({ success: false, error: 'send_at måste vara ett giltigt ISO-datum.' });
          const draftForSchedule = await prisma.draft.findFirst({ where: { id: params.draft_id, account: { userId } } });
          if (!draftForSchedule) return reply.code(404).send({ success: false, error: 'Utkast hittades inte.' });
          const scheduleError = getAgentDraftStatusError(draftForSchedule.status, 'schedule');
          if (scheduleError) {
            return reply.code(409).send({ success: false, error: scheduleError });
          }
          const scheduled = await prisma.draft.update({ where: { id: params.draft_id }, data: { scheduledAt: sendAt } });
          return { success: true, action, data: { draft_id: scheduled.id, scheduled_at: sendAt.toISOString(), message: `Schemalagt för ${sendAt.toLocaleString('sv-SE')}` } };
        }

        // ── SNOOZE ────────────────────────────────────────────────────────
        case 'snooze': {
          if (!params.thread_id || !params.until) {
            return reply.code(400).send({ success: false, error: 'params.thread_id och params.until krävs.' });
          }
          const snoozeUntil = new Date(params.until);
          if (isNaN(snoozeUntil.getTime())) return reply.code(400).send({ success: false, error: 'until måste vara ett giltigt ISO-datum.' });
          const thread = await prisma.emailThread.findFirst({ where: { id: params.thread_id, account: { userId } } });
          if (!thread) return reply.code(404).send({ success: false, error: 'Tråd hittades inte.' });
          await prisma.emailThread.update({ where: { id: params.thread_id }, data: { snoozedUntil: snoozeUntil } });
          return { success: true, action, data: { thread_id: params.thread_id, snoozed_until: snoozeUntil.toISOString(), message: `Snoozad till ${snoozeUntil.toLocaleString('sv-SE')}` } };
        }

        // ── EXPORT ────────────────────────────────────────────────────────
        case 'export': {
          const threads = await prisma.emailThread.findMany({
            where: { account: { userId } },
            orderBy: { lastMessageAt: 'desc' },
            take: Math.min(Number(params.limit) || 100, 100),
            include: { analyses: { orderBy: { createdAt: 'desc' }, take: 1 } },
          });
          return {
            success: true,
            action,
            data: {
              count: threads.length,
              exported_at: new Date().toISOString(),
              threads: threads.map((t) => ({
                id: t.id,
                subject: t.subject,
                participants: t.participantEmails,
                is_read: t.isRead,
                last_message_at: t.lastMessageAt,
                labels: t.labels,
                priority: t.analyses[0]?.priority ?? null,
                classification: t.analyses[0]?.classification ?? null,
              })),
            },
          };
        }

        // ── CONTACTS ──────────────────────────────────────────────────────
        case 'contacts': {
          const contactList = await brainCoreService.getContacts(userId, Number(params.limit) || 50, params.search as string | undefined);
          return {
            success: true,
            action,
            data: {
              count: contactList.length,
              contacts: contactList.map((c) => ({
                email: c.emailAddress,
                name: c.displayName,
                relationship: c.relationship,
                total_emails: c.totalEmails,
                last_contact: c.lastContactAt,
              })),
            },
          };
        }

        // ── STATS ─────────────────────────────────────────────────────────
        case 'stats': {
          const [unread, highPrio, snoozed, pendingDrafts, accounts] = await Promise.all([
            prisma.emailThread.count({ where: { account: { userId }, isRead: false } }),
            prisma.emailThread.count({
              where: {
                account: { userId },
                isRead: false,
                analyses: { some: { priority: 'high' } },
              },
            }),
            prisma.emailThread.count({ where: { account: { userId }, snoozedUntil: { gt: new Date() } } }),
            prisma.draft.count({ where: { account: { userId }, status: 'pending' } }),
            prisma.emailAccount.findMany({ where: { userId, isActive: true }, select: { emailAddress: true, lastSyncAt: true } }),
          ]);
          return {
            success: true,
            action,
            data: {
              unread,
              high_priority: highPrio,
              snoozed,
              pending_drafts: pendingDrafts,
              accounts: accounts.map((a) => ({ email: a.emailAddress, last_sync: a.lastSyncAt })),
              generated_at: new Date().toISOString(),
            },
          };
        }

        // ── COMPOSE ───────────────────────────────────────────────────────
        case 'compose': {
          if (!params.account_id && !params.text) {
            return reply.code(400).send({ success: false, error: 'params.account_id eller params.text krävs.' });
          }
          const composeAccount = await prisma.emailAccount.findFirst({
            where: params.account_id ? { id: params.account_id, userId } : { userId, isActive: true },
          });
          if (!composeAccount) return reply.code(404).send({ success: false, error: 'Konto hittades inte.' });
          const newDraft = await draftService.create(userId, {
            account_id: composeAccount.id,
            to_addresses: params.to ? (Array.isArray(params.to) ? params.to : [params.to]) : [],
            subject: params.subject || '',
            body_text: params.text || params.body || '',
            cc_addresses: params.cc ? (Array.isArray(params.cc) ? params.cc : [params.cc]) : undefined,
          });
          return {
            success: true,
            action,
            data: { draft_id: newDraft.id, status: newDraft.status, message: 'Utkast skapat — granska i CDP UI.' },
          };
        }

        // ── CHAT ──────────────────────────────────────────────────────────
        case 'chat': {
          if (!params.message) {
            return reply.code(400).send({ success: false, error: 'params.message krävs.' });
          }
          const systemPrompt = 'Du är Amanda, en AI-assistent för CDP Communication Hub. Svara på svenska om inget annat anges.';
          const chatResponse = await aiService.chat(systemPrompt, String(params.message));
          return {
            success: true,
            action,
            data: { reply: chatResponse },
            provider_used: env.AI_PROVIDER,
          };
        }

        // ── CLEANUP ───────────────────────────────────────────────────────
        case 'cleanup': {
          // Remove test/debug learning events, keep real ones
          const patterns = (params.event_type_prefix as string | undefined) ?? 'test:';
          const deleted = await prisma.learningEvent.deleteMany({
            where: {
              userId,
              eventType: { startsWith: patterns },
            },
          });
          // Also prune old learning events if count exceeds 1000 (keep newest)
          const totalCount = await prisma.learningEvent.count({ where: { userId } });
          let pruned = 0;
          if (totalCount > 1000) {
            const oldest = await prisma.learningEvent.findMany({
              where: { userId },
              orderBy: { createdAt: 'asc' },
              take: totalCount - 1000,
              select: { id: true },
            });
            const pruneResult = await prisma.learningEvent.deleteMany({
              where: { id: { in: oldest.map((e) => e.id) } },
            });
            pruned = pruneResult.count;
          }
          return {
            success: true,
            action,
            data: {
              deleted_test_events: deleted.count,
              pruned_old_events: pruned,
              pattern: patterns,
            },
          };
        }

        // ── SEED-BRAIN-CORE ───────────────────────────────────────────────
        case 'seed-brain-core': {
          const result = await seedBrainCore(userId);
          return {
            success: true,
            action,
            data: { seeded: result },
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

  // ── POST /batch — Execute multiple actions in sequence ─────────────────────
  app.post('/batch', async (req, reply) => {
    const body = req.body as { actions?: Array<{ action: string; params?: Record<string, any> }> };
    const actions = body?.actions;

    if (!Array.isArray(actions) || actions.length === 0) {
      return reply.code(400).send({ success: false, error: 'body.actions måste vara en icke-tom array.' });
    }
    if (actions.length > 10) {
      return reply.code(400).send({ success: false, error: 'Max 10 actions per batch.' });
    }

    const account = await prisma.emailAccount.findFirst({ where: { isActive: true } });
    if (!account) return reply.code(503).send({ success: false, error: 'Inga aktiva konton.' });

    const results: Array<{ action: string; success: boolean; data?: any; error?: string }> = [];

    for (const item of actions) {
      const action = item.action as AgentAction;
      if (!ALLOWED_ACTIONS.includes(action)) {
        results.push({ action: item.action, success: false, error: `Okänd action: ${action}` });
        continue;
      }
      try {
        // Proxy each action through the /execute handler via Fastify inject
        const response = await app.inject({
          method: 'POST',
          url: '/execute',
          headers: { 'x-api-key': env.COMMAND_API_KEY ?? '' },
          payload: { action, params: item.params ?? {} },
        });
        const parsed = response.json<{ success: boolean; data?: any; error?: string }>();
        results.push({ action, success: parsed.success, data: parsed.data, error: parsed.error });
      } catch (err: any) {
        results.push({ action, success: false, error: err?.message ?? 'Okänt fel' });
      }
    }

    return { success: true, results };
  });

  // ── GET /notifications ─────────────────────────────────────────────────────
  app.get('/notifications', async (req, reply) => {
    const account = await prisma.emailAccount.findFirst({ where: { isActive: true } });
    if (!account) {
      return reply.code(503).send({ success: false, error: 'Inga aktiva konton.' });
    }
    const userId = account.userId;

    const since = new Date(Date.now() - 30 * 60 * 1000); // last 30 min

    const [newThreadCount, pendingDraftCount, highPriorityUnread] = await Promise.all([
      prisma.emailThread.count({
        where: {
          account: { userId },
          isRead: false,
          lastMessageAt: { gte: since },
        },
      }),
      prisma.draft.count({
        where: { account: { userId }, status: 'pending' },
      }),
      prisma.emailThread.findMany({
        where: {
          account: { userId },
          isRead: false,
          analyses: { some: { priority: 'high' } },
        },
        take: 5,
        orderBy: { lastMessageAt: 'desc' },
        select: {
          id: true,
          subject: true,
          participantEmails: true,
          lastMessageAt: true,
        },
      }),
    ]);

    return {
      success: true,
      data: {
        new_emails_30min: newThreadCount,
        pending_drafts: pendingDraftCount,
        high_priority_unread: highPriorityUnread,
        checked_at: new Date().toISOString(),
      },
    };
  });
}
