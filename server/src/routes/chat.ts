/**
 * Chat Command routes — the conversational interface
 *
 * POST /chat/command    — Execute a structured chat command
 * POST /chat/ask        — Natural language query (AI-parsed)
 *
 * This is what Dispatch and the frontend chat widget use to
 * let the user interact with their mail via conversation.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../middleware/auth.middleware';
import { chatCommandService } from '../services/chat-command.service';
import { categoryService } from '../services/category.service';
import { brainCoreService } from '../services/brain-core.service';
import { aiService } from '../services/ai.service';
import { env } from '../config/env';
import { prisma } from '../config/database';

type CommandType =
  | 'inbox_summary'
  | 'mark_spam'
  | 'categorize'
  | 'list_rules'
  | 'list_categories'
  | 'filter_threads'
  | 'create_category'
  | 'remove_rule';

/**
 * Auth hook that accepts either JWT (Bearer) or COMMAND_API_KEY (X-API-Key).
 * When X-API-Key is used, userId is set to the first active user that owns accounts.
 */
async function chatAuthMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const apiKey = request.headers['x-api-key'];
  if (apiKey && env.COMMAND_API_KEY && apiKey === env.COMMAND_API_KEY) {
    // Find first user (single-user setup for Siri/Apple Shortcuts integration)
    const account = await prisma.emailAccount.findFirst({ where: { isActive: true } });
    if (!account) {
      return reply.code(403).send({ error: 'No active accounts found' });
    }
    request.userId = account.userId;
    request.userEmail = '';
    return;
  }
  return authMiddleware(request, reply);
}

export default async function chatRoutes(app: FastifyInstance) {
  app.addHook('onRequest', chatAuthMiddleware);

  /**
   * POST /chat/command
   * Structured command — called from Dispatch/frontend
   *
   * Body: { command: CommandType, params: { ... } }
   */
  app.post('/chat/command', async (req, reply) => {
    const { command, params } = req.body as { command: CommandType; params?: any };

    let result: any;
    try {
      switch (command) {
        case 'inbox_summary':
          result = await chatCommandService.getInboxSummary(req.userId!);
          break;

        case 'mark_spam':
          if (!params?.sender_pattern) throw new Error('sender_pattern required');
          result = await chatCommandService.markAsSpam(
            req.userId!,
            params.sender_pattern,
            params.subject_pattern
          );
          break;

        case 'categorize':
          if (!params?.sender_pattern || !params?.category_slug)
            throw new Error('sender_pattern and category_slug required');
          result = await chatCommandService.categorizeSender(
            req.userId!,
            params.sender_pattern,
            params.category_slug
          );
          break;

        case 'list_rules':
          result = await chatCommandService.listRules(req.userId!);
          break;

        case 'list_categories':
          result = await chatCommandService.getCategories(req.userId!);
          break;

        case 'filter_threads':
          result = await chatCommandService.getFilteredThreads(req.userId!, {
            category: params?.category,
            priority: params?.priority,
            unreadOnly: params?.unread_only,
            limit: params?.limit,
          });
          break;

        case 'create_category': {
          if (!params?.name) throw new Error('name required');
          const cat = await categoryService.create(req.userId!, {
            name: params.name,
            color: params.color,
            icon: params.icon,
            description: params.description,
          });
          result = {
            type: 'action_done',
            message: `Kategori "${params.name}" skapad!`,
            data: cat,
          };
          break;
        }

        case 'remove_rule': {
          if (!params?.rule_id) throw new Error('rule_id required');
          await categoryService.deleteRule(params.rule_id);
          result = { type: 'action_done', message: 'Regel borttagen.' };
          break;
        }

        default:
          return reply.send({ type: 'error', message: `Okänt kommando: ${command}` });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Okänt fel';
      const safeMessage = /prisma|database|connection/i.test(message)
        ? 'Kunde inte hämta data. Försök igen om en stund.'
        : message;
      return reply.status(500).send({ type: 'error', message: safeMessage });
    }

    // Record learning event — fire-and-forget, non-critical
    brainCoreService.recordLearning(
      req.userId!,
      `command:${command}`,
      { command, params: params || {}, timestamp: new Date().toISOString() },
      'chat_widget'
    ).catch(() => {});

    return result;
  });

  /**
   * POST /chat/ask
   * Natural language — keyword shortcuts first, then AI fallback with optional thread context.
   * Body: { message: string, thread_ids?: string[] }
   */
  app.post('/chat/ask', async (req, reply) => {
    const { message, thread_ids } = req.body as { message: string; thread_ids?: string[] };
    if (!message?.trim()) return reply.status(400).send({ type: 'error', message: 'message required' });

    try {
      const msg = message.toLowerCase();

      // ── Thread-specific keywords ──────────────────────────────────────────
      if (thread_ids && thread_ids.length > 0) {
        if (msg.includes('sammanfatt') || msg.includes('analysera') || msg.includes('summary') ||
            msg.includes('analyze') || msg.includes('vad handlar')) {
          return chatCommandService.getFilteredThreads(req.userId!, {
            threadIds: thread_ids,
            limit: thread_ids.length,
          });
        }
      }

      // ── Inbox overview ────────────────────────────────────────────────────
      if (msg.includes('sammanfatt') || msg.includes('summary') || msg.includes('överblick') ||
          (msg.includes('inbox') && (msg.includes('visa') || msg.includes('show')))) {
        return chatCommandService.getInboxSummary(req.userId!);
      }

      // ── Spam / block ──────────────────────────────────────────────────────
      if (msg.includes('skräp') || msg.includes('spam') || msg.includes('mute') || msg.includes('block')) {
        const emailMatch = msg.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        const domainMatch = msg.match(/\*@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        const knownPatterns: Record<string, string> = {
          'github ci': 'notifications@github.com',
          'github actions': 'notifications@github.com',
          'skool': 'noreply@skool.com',
          'ci/cd': 'notifications@github.com',
        };
        let senderPattern = domainMatch?.[0] || emailMatch?.[0];
        if (!senderPattern) {
          for (const [keyword, pattern] of Object.entries(knownPatterns)) {
            if (msg.includes(keyword)) { senderPattern = pattern; break; }
          }
        }
        if (senderPattern) {
          const subjectPattern = (msg.includes('ci.yml') || msg.includes('ci/cd') || msg.includes('run failed'))
            ? 'Run failed.*ci\\.yml' : undefined;
          return chatCommandService.markAsSpam(req.userId!, senderPattern, subjectPattern);
        }
        return { type: 'info', message: 'Vill du markera som skräp? Ange avsändaradressen, t.ex. "markera noreply@skool.com som skräp".' };
      }

      // ── Structured data queries ───────────────────────────────────────────
      if (msg.includes('regler') || msg.includes('rules') || msg.includes('filter')) {
        return chatCommandService.listRules(req.userId!);
      }
      if (msg.includes('kategorier') || msg.includes('categories') || msg.includes('grupper')) {
        return chatCommandService.getCategories(req.userId!);
      }
      if (msg.includes('viktig') || msg.includes('important') || msg.includes('priorit')) {
        return chatCommandService.getFilteredThreads(req.userId!, { priority: 'high', limit: 10 });
      }
      if (msg.includes('oläs') || msg.includes('unread') || msg.includes('nya mail')) {
        return chatCommandService.getFilteredThreads(req.userId!, { unreadOnly: true, limit: 20 });
      }

      // ── Stats ─────────────────────────────────────────────────────────────
      if (msg.includes('statistik') || msg.includes('stats') || msg.includes('hur många') ||
          msg.includes('antal') || msg.includes('how many')) {
        const accounts = await prisma.emailAccount.findMany({
          where: { userId: req.userId!, isActive: true },
          select: { id: true, emailAddress: true, lastSyncAt: true },
        });
        const accountIds = accounts.map((a) => a.id);
        const now = new Date();

        const [unread, highPrio, snoozed, pendingDrafts] = await Promise.all([
          prisma.emailThread.count({ where: { accountId: { in: accountIds }, isRead: false, labels: { has: 'INBOX' } } }),
          prisma.aIAnalysis.count({ where: { thread: { accountId: { in: accountIds } }, priority: 'high' } }),
          prisma.emailThread.count({ where: { accountId: { in: accountIds }, snoozedUntil: { gt: now } } }),
          prisma.draft.count({ where: { userId: req.userId!, status: 'pending' } }),
        ]);

        const lastSync = accounts
          .map((a) => a.lastSyncAt)
          .filter(Boolean)
          .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0];

        const lastSyncLabel = lastSync
          ? new Date(lastSync).toLocaleString('sv-SE', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })
          : 'aldrig';

        return {
          type: 'info',
          message: `**Din inkorgsöversikt:**\n\n📬 Olästa: **${unread}**\n⚡ Hög prioritet: **${highPrio}**\n⏰ Snoozade: **${snoozed}**\n📝 Utkast att granska: **${pendingDrafts}**\n\n_Senast synkad: ${lastSyncLabel}_`,
        };
      }

      // ── Snooze selected threads ───────────────────────────────────────────
      if ((msg.includes('snooze') || msg.includes('påminn') || msg.includes('vänta') || msg.includes('snooza')) &&
          thread_ids && thread_ids.length > 0) {
        // Parse duration
        let until: Date | null = null;
        const hourMatch = msg.match(/(\d+)\s*timm?[ae]?r?/);
        const dayMatch = msg.match(/(\d+)\s*dag(ar)?/);
        const weekMatch = msg.match(/(\d+)\s*veck[ao]/);
        if (hourMatch) {
          until = new Date(Date.now() + Number(hourMatch[1]) * 3600 * 1000);
        } else if (dayMatch) {
          until = new Date(Date.now() + Number(dayMatch[1]) * 86400 * 1000);
        } else if (weekMatch) {
          until = new Date(Date.now() + Number(weekMatch[1]) * 7 * 86400 * 1000);
        } else if (msg.includes('imorgon') || msg.includes('tomorrow')) {
          const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(9, 0, 0, 0);
          until = tomorrow;
        } else if (msg.includes('måndag') || msg.includes('monday')) {
          const d = new Date(); const day = d.getDay(); const diff = (day <= 1 ? 1 - day : 8 - day);
          d.setDate(d.getDate() + diff); d.setHours(9, 0, 0, 0); until = d;
        } else {
          // Default: 3 hours
          until = new Date(Date.now() + 3 * 3600 * 1000);
        }

        const threads = await prisma.emailThread.findMany({
          where: { id: { in: thread_ids }, account: { userId: req.userId! } },
          select: { id: true },
        });
        await prisma.emailThread.updateMany({
          where: { id: { in: threads.map((t) => t.id) } },
          data: { snoozedUntil: until },
        });

        const label = until.toLocaleString('sv-SE', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
        return {
          type: 'action_done',
          message: `⏰ ${threads.length} tråd${threads.length !== 1 ? 'ar' : ''} snoozad${threads.length !== 1 ? 'e' : ''} tills ${label}.`,
        };
      }

      // ── Label selected threads ────────────────────────────────────────────
      if ((msg.includes('etikett') || msg.includes('label') || msg.includes('märk') || msg.includes('tagga')) &&
          thread_ids && thread_ids.length > 0) {
        // Extract label name — look for quoted string or word after key phrase
        const quotedMatch = msg.match(/["']([^"']+)["']/);
        const phraseMatch = msg.match(/(?:etikett|label|märk|tagga)\s+(?:med\s+)?(\S+)/i);
        const labelName = (quotedMatch?.[1] || phraseMatch?.[1] || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '');

        if (!labelName) {
          return { type: 'info', message: 'Vilket etikettnamn vill du använda? T.ex. "etikett VIKTIG".' };
        }

        const threads = await prisma.emailThread.findMany({
          where: { id: { in: thread_ids }, account: { userId: req.userId! } },
          select: { id: true, labels: true },
        });

        await Promise.all(threads.map((t) =>
          prisma.emailThread.update({
            where: { id: t.id },
            data: { labels: [...new Set([...(t.labels as string[]), labelName])] },
          })
        ));

        return {
          type: 'action_done',
          message: `🏷️ Etikett **${labelName}** tillagd på ${threads.length} tråd${threads.length !== 1 ? 'ar' : ''}.`,
        };
      }

      // ── AI fallback — natural language conversation with optional thread context ──
      let threadContext = '';
      if (thread_ids && thread_ids.length > 0) {
        try {
          const threads = await prisma.emailThread.findMany({
            where: {
              id: { in: thread_ids },
              account: { userId: req.userId! },
            },
            select: {
              id: true,
              subject: true,
              snippet: true,
              participantEmails: true,
              messages: {
                orderBy: { receivedAt: 'desc' },
                take: 1,
                select: { fromAddress: true, bodyText: true },
              },
            },
          });
          if (threads.length > 0) {
            threadContext = '\n\nVALDA TRÅDAR:\n' + threads.map((t) => {
              const sender = t.messages[0]?.fromAddress ?? t.participantEmails[0] ?? 'okänd';
              const preview = t.snippet ?? t.messages[0]?.bodyText?.slice(0, 200) ?? '';
              return `- "${t.subject ?? '(utan ämne)'}" från ${sender}: ${preview}`;
            }).join('\n');
          }
        } catch {
          // thread context is optional — continue without it
        }
      }

      const amandaSystemPrompt = `Du är Amanda, en AI-mailassistent för CDP Communication Hub.
Du hjälper användaren med deras e-post på ett personligt, vänligt och professionellt sätt.
Du kan svara på frågor om e-post, ge råd om kommunikation och hjälpa till med formuleringar.

Tillgängliga snabbkommandon du kan tipsa om:
- "statistik" — visa inkorgsstatistik
- "visa viktiga" — hög-prioriterade trådar
- "visa olästa" — olästa trådar
- "snooze 3 timmar" (med valda trådar) — snooze valda trådar
- "etikett NAMN" (med valda trådar) — sätt etikett
- "sammanfatta" (med valda trådar) — AI-sammanfattning
- "sammanfatta inkorgen" — veckoöversikt

VIKTIGT: Du KAN INTE skicka mail, ta bort mail eller utföra åtgärder på egen hand — du föreslår, användaren bestämmer.
Svara alltid på svenska om inget annat anges. Håll svaren koncisa (max 3-4 meningar). Använd markdown för listor.${threadContext}`;

      const aiReply = await aiService.chat(amandaSystemPrompt, message);

      return {
        type: 'ai_response',
        message: aiReply,
        provider: 'amanda',
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Okänt fel';
      const safeMsg = /prisma|database|connection/i.test(msg)
        ? 'Kunde inte hämta data. Försök igen om en stund.'
        : msg;
      return reply.status(500).send({ type: 'error', message: safeMsg });
    }
  });
}
