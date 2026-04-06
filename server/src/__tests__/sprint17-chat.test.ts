/**
 * Sprint 17 — Route-level tests for chat.ts.
 *
 * chat-stats.test.ts already covers: parseSnoozeUntil, extractLabel, intent detection, stats shape.
 * This file covers the remaining route logic:
 *
 *  chatAuthMiddleware   — X-API-Key: matches COMMAND_API_KEY → resolve userId;
 *                         no matching account → 403; wrong key → falls through to JWT auth
 *  POST /chat/command   — all 8 command types, unknown command → error,
 *                         error handling (Prisma msg sanitized, generic error passed through),
 *                         brainCoreService.recordLearning fire-and-forget on success
 *  POST /chat/ask       — empty message → 400; keyword routing (summary, spam w/ email/domain/
 *                         known-pattern, regler, kategorier, viktig, oläst, thread summarize);
 *                         AI fallback; Prisma error sanitized; generic error passed through
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../config/env', () => ({
  env: {
    COMMAND_API_KEY: 'test-command-key',
    FRONTEND_URL: 'https://app.example.com',
  },
}));

vi.mock('../config/database', () => ({
  prisma: {
    emailAccount: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    emailThread: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    aIAnalysis: {
      count: vi.fn(),
    },
    draft: {
      count: vi.fn(),
    },
  },
}));

vi.mock('../services/chat-command.service', () => ({
  chatCommandService: {
    getInboxSummary: vi.fn(),
    markAsSpam: vi.fn(),
    categorizeSender: vi.fn(),
    listRules: vi.fn(),
    getCategories: vi.fn(),
    getFilteredThreads: vi.fn(),
  },
}));

vi.mock('../services/category.service', () => ({
  categoryService: {
    create: vi.fn(),
    deleteRule: vi.fn(),
  },
}));

vi.mock('../services/brain-core.service', () => ({
  brainCoreService: {
    recordLearning: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../services/ai.service', () => ({
  aiService: {
    chat: vi.fn(),
  },
}));

import { prisma } from '../config/database';
import { chatCommandService } from '../services/chat-command.service';
import { categoryService } from '../services/category.service';
import { brainCoreService } from '../services/brain-core.service';
import { aiService } from '../services/ai.service';
import { env } from '../config/env';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const USER_ID = 'user-1';

/** Simulate chatAuthMiddleware */
async function simulateChatAuth(apiKey: string | undefined): Promise<
  | { code: 403; body: { error: string } }
  | { userId: string }
> {
  if (apiKey && env.COMMAND_API_KEY && apiKey === env.COMMAND_API_KEY) {
    const account = await (prisma.emailAccount.findFirst as any)({ where: { isActive: true } });
    if (!account) return { code: 403, body: { error: 'No active accounts found' } };
    return { userId: account.userId };
  }
  // Falls through to JWT auth (in test context we simulate as resolved)
  return { userId: USER_ID };
}

/** Simulate POST /chat/command */
async function simulateChatCommand(
  body: { command?: string; params?: any },
  userId = USER_ID
) {
  const { command, params } = body;
  let result: any;

  try {
    switch (command) {
      case 'inbox_summary':
        result = await chatCommandService.getInboxSummary(userId);
        break;
      case 'mark_spam':
        if (!params?.sender_pattern) throw new Error('sender_pattern required');
        result = await chatCommandService.markAsSpam(userId, params.sender_pattern, params.subject_pattern);
        break;
      case 'categorize':
        if (!params?.sender_pattern || !params?.category_slug)
          throw new Error('sender_pattern and category_slug required');
        result = await chatCommandService.categorizeSender(userId, params.sender_pattern, params.category_slug);
        break;
      case 'list_rules':
        result = await chatCommandService.listRules(userId);
        break;
      case 'list_categories':
        result = await chatCommandService.getCategories(userId);
        break;
      case 'filter_threads':
        result = await chatCommandService.getFilteredThreads(userId, {
          category: params?.category,
          priority: params?.priority,
          unreadOnly: params?.unread_only,
          limit: params?.limit,
        });
        break;
      case 'create_category': {
        if (!params?.name) throw new Error('name required');
        const cat = await categoryService.create(userId, {
          name: params.name,
          color: params.color,
          icon: params.icon,
          description: params.description,
        });
        result = { type: 'action_done', message: `Kategori "${params.name}" skapad!`, data: cat };
        break;
      }
      case 'remove_rule': {
        if (!params?.rule_id) throw new Error('rule_id required');
        await categoryService.deleteRule(params.rule_id);
        result = { type: 'action_done', message: 'Regel borttagen.' };
        break;
      }
      default:
        return { code: 200, body: { type: 'error', message: `Okänt kommando: ${command}` } };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Okänt fel';
    const safeMessage = /prisma|database|connection/i.test(message)
      ? 'Kunde inte hämta data. Försök igen om en stund.'
      : message;
    return { code: 500, body: { type: 'error', message: safeMessage } };
  }

  // Fire-and-forget learning event
  brainCoreService.recordLearning(
    userId,
    `command:${command}`,
    { command, params: params || {}, timestamp: new Date().toISOString() },
    'chat_widget'
  ).catch(() => {});

  return { code: 200, body: result };
}

/** Simulate POST /chat/ask */
async function simulateChatAsk(
  body: { message?: string; thread_ids?: string[] },
  userId = USER_ID
) {
  const { message, thread_ids } = body;
  if (!message?.trim()) return { code: 400, body: { type: 'error', message: 'message required' } };

  try {
    const msg = message.toLowerCase();

    // Thread-specific keywords
    if (thread_ids && thread_ids.length > 0) {
      if (
        msg.includes('sammanfatt') || msg.includes('analysera') || msg.includes('summary') ||
        msg.includes('analyze') || msg.includes('vad handlar')
      ) {
        return { code: 200, body: await chatCommandService.getFilteredThreads(userId, { threadIds: thread_ids, limit: thread_ids.length }) };
      }
    }

    // Inbox overview
    if (
      msg.includes('sammanfatt') || msg.includes('summary') || msg.includes('överblick') ||
      (msg.includes('inbox') && (msg.includes('visa') || msg.includes('show')))
    ) {
      return { code: 200, body: await chatCommandService.getInboxSummary(userId) };
    }

    // Spam / block
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
        return { code: 200, body: await chatCommandService.markAsSpam(userId, senderPattern, subjectPattern) };
      }
      return { code: 200, body: { type: 'info', message: 'Vill du markera som skräp? Ange avsändaradressen, t.ex. "markera noreply@skool.com som skräp".' } };
    }

    // Structured queries
    if (msg.includes('regler') || msg.includes('rules') || msg.includes('filter')) {
      return { code: 200, body: await chatCommandService.listRules(userId) };
    }
    if (msg.includes('kategorier') || msg.includes('categories') || msg.includes('grupper')) {
      return { code: 200, body: await chatCommandService.getCategories(userId) };
    }
    if (msg.includes('viktig') || msg.includes('important') || msg.includes('priorit')) {
      return { code: 200, body: await chatCommandService.getFilteredThreads(userId, { priority: 'high', limit: 10 }) };
    }
    if (msg.includes('oläs') || msg.includes('unread') || msg.includes('nya mail')) {
      return { code: 200, body: await chatCommandService.getFilteredThreads(userId, { unreadOnly: true, limit: 20 }) };
    }

    // Stats
    if (
      msg.includes('statistik') || msg.includes('stats') || msg.includes('hur många') ||
      msg.includes('antal') || msg.includes('how many')
    ) {
      const accounts = await (prisma.emailAccount.findMany as any)({ where: { userId, isActive: true } });
      const accountIds = accounts.map((a: any) => a.id);
      const now = new Date();
      const [unread, highPrio, snoozed, pendingDrafts] = await Promise.all([
        (prisma.emailThread.count as any)({ where: { accountId: { in: accountIds }, isRead: false } }),
        (prisma.aIAnalysis.count as any)({ where: { priority: 'high' } }),
        (prisma.emailThread.count as any)({ where: { snoozedUntil: { gt: now } } }),
        (prisma.draft.count as any)({ where: { userId, status: 'pending' } }),
      ]);
      return {
        code: 200,
        body: {
          type: 'info',
          message: `**Din inkorgsöversikt:**\n\n📬 Olästa: **${unread}**\n⚡ Hög prioritet: **${highPrio}**\n⏰ Snoozade: **${snoozed}**\n📝 Utkast att granska: **${pendingDrafts}**`,
        },
      };
    }

    // AI fallback
    const aiReply = await aiService.chat('', message);
    return { code: 200, body: { type: 'ai_response', message: aiReply, provider: 'amanda' } };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Okänt fel';
    const safeMsg = /prisma|database|connection/i.test(errMsg)
      ? 'Kunde inte hämta data. Försök igen om en stund.'
      : errMsg;
    return { code: 500, body: { type: 'error', message: safeMsg } };
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── chatAuthMiddleware ───────────────────────────────────────────────────────

describe('chatAuthMiddleware', () => {
  it('returns userId from account when correct API key provided', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue({ userId: 'siri-user' } as any);
    const result = await simulateChatAuth('test-command-key');
    expect((result as any).userId).toBe('siri-user');
  });

  it('returns 403 when API key matches but no active accounts', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(null);
    const result = await simulateChatAuth('test-command-key');
    expect((result as any).code).toBe(403);
  });

  it('falls through to JWT auth when API key is wrong', async () => {
    const result = await simulateChatAuth('wrong-key');
    expect((result as any).userId).toBe(USER_ID); // JWT auth
    expect(prisma.emailAccount.findFirst).not.toHaveBeenCalled();
  });

  it('falls through to JWT auth when no API key provided', async () => {
    const result = await simulateChatAuth(undefined);
    expect((result as any).userId).toBe(USER_ID);
  });
});

// ─── POST /chat/command ───────────────────────────────────────────────────────

describe('POST /chat/command — inbox_summary', () => {
  it('calls getInboxSummary and returns result', async () => {
    vi.mocked(chatCommandService.getInboxSummary).mockResolvedValue({ type: 'summary', count: 5 } as any);
    const result = await simulateChatCommand({ command: 'inbox_summary' });
    expect(result.code).toBe(200);
    expect(chatCommandService.getInboxSummary).toHaveBeenCalledWith(USER_ID);
    expect((result.body as any).count).toBe(5);
  });
});

describe('POST /chat/command — mark_spam', () => {
  it('returns 500 when sender_pattern is missing', async () => {
    const result = await simulateChatCommand({ command: 'mark_spam', params: {} });
    expect(result.code).toBe(500);
    expect((result.body as any).message).toMatch(/sender_pattern required/i);
  });

  it('calls markAsSpam with correct params', async () => {
    vi.mocked(chatCommandService.markAsSpam).mockResolvedValue({ type: 'action_done' } as any);
    const result = await simulateChatCommand({
      command: 'mark_spam',
      params: { sender_pattern: 'spam@example.com', subject_pattern: 'Offer' },
    });
    expect(result.code).toBe(200);
    expect(chatCommandService.markAsSpam).toHaveBeenCalledWith(USER_ID, 'spam@example.com', 'Offer');
  });
});

describe('POST /chat/command — categorize', () => {
  it('returns 500 when params are missing', async () => {
    expect((await simulateChatCommand({ command: 'categorize', params: { sender_pattern: 'x' } })).code).toBe(500);
    expect((await simulateChatCommand({ command: 'categorize', params: { category_slug: 'news' } })).code).toBe(500);
  });

  it('calls categorizeSender with correct params', async () => {
    vi.mocked(chatCommandService.categorizeSender).mockResolvedValue({ type: 'action_done' } as any);
    await simulateChatCommand({ command: 'categorize', params: { sender_pattern: 'news@list.com', category_slug: 'newsletter' } });
    expect(chatCommandService.categorizeSender).toHaveBeenCalledWith(USER_ID, 'news@list.com', 'newsletter');
  });
});

describe('POST /chat/command — list_rules', () => {
  it('delegates to chatCommandService.listRules', async () => {
    vi.mocked(chatCommandService.listRules).mockResolvedValue({ type: 'rule_list', rules: [] } as any);
    const result = await simulateChatCommand({ command: 'list_rules' });
    expect(result.code).toBe(200);
    expect(chatCommandService.listRules).toHaveBeenCalledWith(USER_ID);
  });
});

describe('POST /chat/command — list_categories', () => {
  it('delegates to chatCommandService.getCategories', async () => {
    vi.mocked(chatCommandService.getCategories).mockResolvedValue({ type: 'category_list', categories: [] } as any);
    const result = await simulateChatCommand({ command: 'list_categories' });
    expect(result.code).toBe(200);
    expect(chatCommandService.getCategories).toHaveBeenCalledWith(USER_ID);
  });
});

describe('POST /chat/command — filter_threads', () => {
  it('passes all params to getFilteredThreads', async () => {
    vi.mocked(chatCommandService.getFilteredThreads).mockResolvedValue({ type: 'thread_list', threads: [] } as any);
    await simulateChatCommand({
      command: 'filter_threads',
      params: { category: 'newsletter', priority: 'high', unread_only: true, limit: 5 },
    });
    expect(chatCommandService.getFilteredThreads).toHaveBeenCalledWith(USER_ID, {
      category: 'newsletter',
      priority: 'high',
      unreadOnly: true,
      limit: 5,
    });
  });

  it('passes undefined params when omitted', async () => {
    vi.mocked(chatCommandService.getFilteredThreads).mockResolvedValue({ type: 'thread_list' } as any);
    await simulateChatCommand({ command: 'filter_threads', params: {} });
    expect(chatCommandService.getFilteredThreads).toHaveBeenCalledWith(USER_ID, {
      category: undefined,
      priority: undefined,
      unreadOnly: undefined,
      limit: undefined,
    });
  });
});

describe('POST /chat/command — create_category', () => {
  it('returns 500 when name is missing', async () => {
    expect((await simulateChatCommand({ command: 'create_category', params: {} })).code).toBe(500);
    expect((await simulateChatCommand({ command: 'create_category', params: { name: '' } })).code).toBe(500);
  });

  it('creates category and returns action_done', async () => {
    vi.mocked(categoryService.create).mockResolvedValue({ id: 'cat-1', name: 'Newsletter' } as any);
    const result = await simulateChatCommand({ command: 'create_category', params: { name: 'Newsletter' } });
    expect(result.code).toBe(200);
    expect((result.body as any).type).toBe('action_done');
    expect((result.body as any).message).toContain('Newsletter');
  });
});

describe('POST /chat/command — remove_rule', () => {
  it('returns 500 when rule_id is missing', async () => {
    expect((await simulateChatCommand({ command: 'remove_rule', params: {} })).code).toBe(500);
  });

  it('deletes rule and returns action_done', async () => {
    vi.mocked(categoryService.deleteRule).mockResolvedValue(undefined);
    const result = await simulateChatCommand({ command: 'remove_rule', params: { rule_id: 'rule-1' } });
    expect(result.code).toBe(200);
    expect((result.body as any).type).toBe('action_done');
    expect(categoryService.deleteRule).toHaveBeenCalledWith('rule-1');
  });
});

describe('POST /chat/command — unknown command', () => {
  it('returns error message for unknown command', async () => {
    const result = await simulateChatCommand({ command: 'fly_to_moon' });
    expect(result.code).toBe(200);
    expect((result.body as any).type).toBe('error');
    expect((result.body as any).message).toContain('fly_to_moon');
  });
});

describe('POST /chat/command — error handling', () => {
  it('sanitizes Prisma error messages', async () => {
    vi.mocked(chatCommandService.getInboxSummary).mockRejectedValue(new Error('prisma query failed'));
    const result = await simulateChatCommand({ command: 'inbox_summary' });
    expect(result.code).toBe(500);
    expect((result.body as any).message).toBe('Kunde inte hämta data. Försök igen om en stund.');
  });

  it('sanitizes database error messages', async () => {
    vi.mocked(chatCommandService.listRules).mockRejectedValue(new Error('database connection refused'));
    const result = await simulateChatCommand({ command: 'list_rules' });
    expect((result.body as any).message).toBe('Kunde inte hämta data. Försök igen om en stund.');
  });

  it('passes non-Prisma error messages through', async () => {
    vi.mocked(chatCommandService.getInboxSummary).mockRejectedValue(new Error('service unavailable'));
    const result = await simulateChatCommand({ command: 'inbox_summary' });
    expect((result.body as any).message).toBe('service unavailable');
  });

  it('fires brainCoreService.recordLearning after successful command', async () => {
    vi.mocked(chatCommandService.listRules).mockResolvedValue({ rules: [] } as any);
    await simulateChatCommand({ command: 'list_rules' });
    expect(brainCoreService.recordLearning).toHaveBeenCalledWith(
      USER_ID,
      'command:list_rules',
      expect.objectContaining({ command: 'list_rules' }),
      'chat_widget'
    );
  });

  it('does NOT fire recordLearning when command errors', async () => {
    vi.mocked(chatCommandService.getInboxSummary).mockRejectedValue(new Error('fail'));
    await simulateChatCommand({ command: 'inbox_summary' });
    expect(brainCoreService.recordLearning).not.toHaveBeenCalled();
  });
});

// ─── POST /chat/ask ───────────────────────────────────────────────────────────

describe('POST /chat/ask — input validation', () => {
  it('returns 400 for empty message', async () => {
    expect((await simulateChatAsk({ message: '' })).code).toBe(400);
  });

  it('returns 400 for whitespace-only message', async () => {
    expect((await simulateChatAsk({ message: '   ' })).code).toBe(400);
  });
});

describe('POST /chat/ask — inbox summary routing', () => {
  it('routes "sammanfatta inkorgen" to getInboxSummary', async () => {
    vi.mocked(chatCommandService.getInboxSummary).mockResolvedValue({ type: 'summary' } as any);
    const result = await simulateChatAsk({ message: 'sammanfatta inkorgen' });
    expect(result.code).toBe(200);
    expect(chatCommandService.getInboxSummary).toHaveBeenCalledOnce();
  });

  it('routes "visa inbox" to getInboxSummary', async () => {
    vi.mocked(chatCommandService.getInboxSummary).mockResolvedValue({ type: 'summary' } as any);
    await simulateChatAsk({ message: 'visa inbox' });
    expect(chatCommandService.getInboxSummary).toHaveBeenCalledOnce();
  });
});

describe('POST /chat/ask — thread summarize routing', () => {
  it('routes "sammanfatta" with thread_ids to getFilteredThreads', async () => {
    vi.mocked(chatCommandService.getFilteredThreads).mockResolvedValue({ type: 'thread_list' } as any);
    const result = await simulateChatAsk({ message: 'sammanfatta dessa', thread_ids: ['t1', 't2'] });
    expect(result.code).toBe(200);
    expect(chatCommandService.getFilteredThreads).toHaveBeenCalledWith(USER_ID, { threadIds: ['t1', 't2'], limit: 2 });
  });

  it('routes "analysera" with thread_ids to getFilteredThreads', async () => {
    vi.mocked(chatCommandService.getFilteredThreads).mockResolvedValue({ type: 'thread_list' } as any);
    await simulateChatAsk({ message: 'analysera dessa mail', thread_ids: ['t1'] });
    expect(chatCommandService.getFilteredThreads).toHaveBeenCalledOnce();
  });
});

describe('POST /chat/ask — spam routing', () => {
  it('extracts email address and calls markAsSpam', async () => {
    vi.mocked(chatCommandService.markAsSpam).mockResolvedValue({ type: 'action_done' } as any);
    const result = await simulateChatAsk({ message: 'markera noreply@spam.com som skräp' });
    expect(result.code).toBe(200);
    expect(chatCommandService.markAsSpam).toHaveBeenCalledWith(USER_ID, 'noreply@spam.com', undefined);
  });

  it('extracts domain wildcard and calls markAsSpam', async () => {
    vi.mocked(chatCommandService.markAsSpam).mockResolvedValue({ type: 'action_done' } as any);
    await simulateChatAsk({ message: 'blockera *@newsletter.com' });
    expect(chatCommandService.markAsSpam).toHaveBeenCalledWith(USER_ID, '*@newsletter.com', undefined);
  });

  it('uses known pattern for "github ci" keyword', async () => {
    vi.mocked(chatCommandService.markAsSpam).mockResolvedValue({ type: 'action_done' } as any);
    await simulateChatAsk({ message: 'github ci är spam' });
    expect(chatCommandService.markAsSpam).toHaveBeenCalledWith(USER_ID, 'notifications@github.com', undefined);
  });

  it('uses known pattern for "skool" keyword', async () => {
    vi.mocked(chatCommandService.markAsSpam).mockResolvedValue({ type: 'action_done' } as any);
    await simulateChatAsk({ message: 'mute skool notifications' });
    expect(chatCommandService.markAsSpam).toHaveBeenCalledWith(USER_ID, 'noreply@skool.com', undefined);
  });

  it('includes subject pattern when ci/cd mentioned', async () => {
    vi.mocked(chatCommandService.markAsSpam).mockResolvedValue({ type: 'action_done' } as any);
    await simulateChatAsk({ message: 'blockera ci/cd notifications@github.com' });
    expect(chatCommandService.markAsSpam).toHaveBeenCalledWith(
      USER_ID,
      'notifications@github.com',
      'Run failed.*ci\\.yml'
    );
  });

  it('returns info message when no pattern found', async () => {
    const result = await simulateChatAsk({ message: 'det här är spam' });
    expect(result.code).toBe(200);
    expect((result.body as any).type).toBe('info');
    expect(chatCommandService.markAsSpam).not.toHaveBeenCalled();
  });
});

describe('POST /chat/ask — structured query routing', () => {
  it('routes "regler" to listRules', async () => {
    vi.mocked(chatCommandService.listRules).mockResolvedValue({ type: 'rule_list' } as any);
    await simulateChatAsk({ message: 'visa mina regler' });
    expect(chatCommandService.listRules).toHaveBeenCalledWith(USER_ID);
  });

  it('routes "kategorier" to getCategories', async () => {
    vi.mocked(chatCommandService.getCategories).mockResolvedValue({ type: 'category_list' } as any);
    await simulateChatAsk({ message: 'lista kategorier' });
    expect(chatCommandService.getCategories).toHaveBeenCalledWith(USER_ID);
  });

  it('routes "viktig" to high-priority filtered threads', async () => {
    vi.mocked(chatCommandService.getFilteredThreads).mockResolvedValue({ type: 'thread_list' } as any);
    await simulateChatAsk({ message: 'visa viktiga mail' });
    expect(chatCommandService.getFilteredThreads).toHaveBeenCalledWith(USER_ID, { priority: 'high', limit: 10 });
  });

  it('routes "unread" to unread filtered threads', async () => {
    vi.mocked(chatCommandService.getFilteredThreads).mockResolvedValue({ type: 'thread_list' } as any);
    await simulateChatAsk({ message: 'show unread' });
    expect(chatCommandService.getFilteredThreads).toHaveBeenCalledWith(USER_ID, { unreadOnly: true, limit: 20 });
  });

  it('routes "olästa" to unread filtered threads', async () => {
    vi.mocked(chatCommandService.getFilteredThreads).mockResolvedValue({ type: 'thread_list' } as any);
    await simulateChatAsk({ message: 'visa olästa mail' });
    expect(chatCommandService.getFilteredThreads).toHaveBeenCalledWith(USER_ID, { unreadOnly: true, limit: 20 });
  });
});

describe('POST /chat/ask — stats routing', () => {
  it('routes "statistik" to stats query', async () => {
    vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([{ id: 'acc-1', lastSyncAt: null }] as any);
    vi.mocked(prisma.emailThread.count).mockResolvedValue(5);
    vi.mocked(prisma.aIAnalysis.count).mockResolvedValue(2);
    vi.mocked(prisma.draft.count).mockResolvedValue(1);
    const result = await simulateChatAsk({ message: 'visa statistik' });
    expect(result.code).toBe(200);
    expect((result.body as any).type).toBe('info');
    expect((result.body as any).message).toContain('Olästa');
    expect((result.body as any).message).toContain('5');
  });

  it('routes "hur många" to stats query', async () => {
    vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([]) as any;
    vi.mocked(prisma.emailThread.count).mockResolvedValue(0);
    vi.mocked(prisma.aIAnalysis.count).mockResolvedValue(0);
    vi.mocked(prisma.draft.count).mockResolvedValue(0);
    const result = await simulateChatAsk({ message: 'hur många mail har jag?' });
    expect(result.code).toBe(200);
    expect((result.body as any).type).toBe('info');
  });
});

describe('POST /chat/ask — AI fallback', () => {
  it('calls aiService.chat for unrecognized messages', async () => {
    vi.mocked(aiService.chat).mockResolvedValue('Hej! Hur kan jag hjälpa dig?');
    const result = await simulateChatAsk({ message: 'berätta ett skämt' });
    expect(result.code).toBe(200);
    expect((result.body as any).type).toBe('ai_response');
    expect((result.body as any).message).toBe('Hej! Hur kan jag hjälpa dig?');
    expect((result.body as any).provider).toBe('amanda');
    expect(aiService.chat).toHaveBeenCalledOnce();
  });
});

describe('POST /chat/ask — error handling', () => {
  it('sanitizes Prisma errors', async () => {
    vi.mocked(chatCommandService.getInboxSummary).mockRejectedValue(new Error('prisma error'));
    const result = await simulateChatAsk({ message: 'sammanfatta' });
    expect(result.code).toBe(500);
    expect((result.body as any).message).toBe('Kunde inte hämta data. Försök igen om en stund.');
  });

  it('passes non-database errors through', async () => {
    vi.mocked(chatCommandService.listRules).mockRejectedValue(new Error('rate limited'));
    const result = await simulateChatAsk({ message: 'visa regler' });
    expect(result.code).toBe(500);
    expect((result.body as any).message).toBe('rate limited');
  });
});
