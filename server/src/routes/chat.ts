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
  app.post('/chat/command', async (req) => {
    const { command, params } = req.body as { command: CommandType; params?: any };

    switch (command) {
      case 'inbox_summary':
        return chatCommandService.getInboxSummary(req.userId!);

      case 'mark_spam':
        if (!params?.sender_pattern) throw new Error('sender_pattern required');
        return chatCommandService.markAsSpam(
          req.userId!,
          params.sender_pattern,
          params.subject_pattern
        );

      case 'categorize':
        if (!params?.sender_pattern || !params?.category_slug)
          throw new Error('sender_pattern and category_slug required');
        return chatCommandService.categorizeSender(
          req.userId!,
          params.sender_pattern,
          params.category_slug
        );

      case 'list_rules':
        return chatCommandService.listRules(req.userId!);

      case 'list_categories':
        return chatCommandService.getCategories(req.userId!);

      case 'filter_threads':
        return chatCommandService.getFilteredThreads(req.userId!, {
          category: params?.category,
          priority: params?.priority,
          unreadOnly: params?.unread_only,
          limit: params?.limit,
        });

      case 'create_category': {
        if (!params?.name) throw new Error('name required');
        const cat = await categoryService.create(req.userId!, {
          name: params.name,
          color: params.color,
          icon: params.icon,
          description: params.description,
        });
        return {
          type: 'action_done',
          message: `Kategori "${params.name}" skapad!`,
          data: cat,
        };
      }

      case 'remove_rule': {
        if (!params?.rule_id) throw new Error('rule_id required');
        await categoryService.deleteRule(params.rule_id);
        return {
          type: 'action_done',
          message: 'Regel borttagen.',
        };
      }

      default:
        return {
          type: 'error',
          message: `Okänt kommando: ${command}`,
        };
    }
  });

  /**
   * POST /chat/ask
   * Natural language — AI parses the intent and calls the right command.
   * Body: { message: string, thread_ids?: string[] }
   */
  app.post('/chat/ask', async (req) => {
    const { message, thread_ids } = req.body as { message: string; thread_ids?: string[] };
    if (!message?.trim()) throw new Error('message required');

    // Simple intent detection patterns (works in both Swedish and English)
    const msg = message.toLowerCase();

    // If thread_ids provided, handle thread-specific intents first
    if (thread_ids && thread_ids.length > 0) {
      // Summarize / analyze selected threads
      if (msg.includes('sammanfatt') || msg.includes('analysera') || msg.includes('summary') ||
          msg.includes('analyze') || msg.includes('vad handlar')) {
        return chatCommandService.getFilteredThreads(req.userId!, {
          threadIds: thread_ids,
          limit: thread_ids.length,
        });
      }
    }

    // Inbox summary
    if (msg.includes('sammanfatt') || msg.includes('summary') || msg.includes('överblick') ||
        msg.includes('inbox') && (msg.includes('visa') || msg.includes('show'))) {
      return chatCommandService.getInboxSummary(req.userId!);
    }

    // Mark spam
    if (msg.includes('skräp') || msg.includes('spam') || msg.includes('mute') || msg.includes('block')) {
      // Try to extract sender pattern from message
      const emailMatch = msg.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      const domainMatch = msg.match(/\*@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      // Also check for known patterns
      const knownPatterns: Record<string, string> = {
        'github ci': 'notifications@github.com',
        'github actions': 'notifications@github.com',
        'skool': 'noreply@skool.com',
        'ci/cd': 'notifications@github.com',
      };

      let senderPattern = domainMatch?.[0] || emailMatch?.[0];
      if (!senderPattern) {
        for (const [keyword, pattern] of Object.entries(knownPatterns)) {
          if (msg.includes(keyword)) {
            senderPattern = pattern;
            break;
          }
        }
      }

      if (senderPattern) {
        // Check if there's a subject pattern hint
        let subjectPattern: string | undefined;
        if (msg.includes('ci.yml') || msg.includes('ci/cd') || msg.includes('run failed')) {
          subjectPattern = 'Run failed.*ci\\.yml';
        }
        return chatCommandService.markAsSpam(req.userId!, senderPattern, subjectPattern);
      }

      return {
        type: 'info',
        message: 'Vill du markera som skräp? Ange avsändaradressen eller ett mönster, t.ex. "markera noreply@skool.com som skräp" eller "markera *@github.com som skräp".',
      };
    }

    // List rules
    if (msg.includes('regler') || msg.includes('rules') || msg.includes('filter')) {
      return chatCommandService.listRules(req.userId!);
    }

    // Categories
    if (msg.includes('kategorier') || msg.includes('categories') || msg.includes('grupper')) {
      return chatCommandService.getCategories(req.userId!);
    }

    // High priority / important
    if (msg.includes('viktig') || msg.includes('important') || msg.includes('priorit')) {
      return chatCommandService.getFilteredThreads(req.userId!, { priority: 'high', limit: 10 });
    }

    // Unread
    if (msg.includes('oläs') || msg.includes('unread') || msg.includes('nya mail')) {
      return chatCommandService.getFilteredThreads(req.userId!, { unreadOnly: true, limit: 20 });
    }

    // Default: show summary
    return chatCommandService.getInboxSummary(req.userId!);
  });
}
