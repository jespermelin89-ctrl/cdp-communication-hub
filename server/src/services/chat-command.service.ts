/**
 * Chat Command Service
 *
 * Natural language interface for mail management.
 * Parses commands like:
 *   "visa viktiga mail"
 *   "markera github CI som skräp"
 *   "svara på anthropic-mailet med ..."
 *   "sammanfatta inkorgen"
 *   "lägg till ny adress jesper@domain.com"
 *
 * Returns structured results the frontend/Dispatch can render.
 */

import { prisma } from '../config/database';
import { categoryService } from './category.service';
import { aiService } from './ai.service';
import { emailProviderFactory } from './email-provider.factory';

export interface ChatCommandResult {
  type: 'summary' | 'thread_list' | 'draft_created' | 'rule_created' |
        'categories' | 'action_done' | 'error' | 'info';
  message: string;
  data?: any;
}

export const chatCommandService = {

  /**
   * Get inbox summary grouped by category
   */
  async getInboxSummary(userId: string): Promise<ChatCommandResult> {
    const accounts = await prisma.emailAccount.findMany({
      where: { userId, isActive: true },
    });

    if (accounts.length === 0) {
      return { type: 'info', message: 'Inga konton kopplade ännu.' };
    }

    // Get all threads from last 7 days
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const threads = await prisma.emailThread.findMany({
      where: {
        accountId: { in: accounts.map((a) => a.id) },
        lastMessageAt: { gte: weekAgo },
      },
      include: {
        analyses: { orderBy: { createdAt: 'desc' }, take: 1 },
        account: true,
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
    });

    // Get categories and rules
    const categories = await categoryService.getAll(userId);
    const rules = await categoryService.getRules(userId);

    // Classify threads
    const classified: Record<string, any[]> = {};
    const uncategorized: any[] = [];

    for (const thread of threads) {
      // Get primary sender (first non-self participant)
      const sender = thread.participantEmails.find(
        (e) => e !== thread.account.emailAddress
      ) || thread.participantEmails[0] || 'unknown';

      const match = await categoryService.matchRules(userId, sender, thread.subject || undefined);

      if (match && match.category) {
        const catName = match.category.name;
        if (!classified[catName]) classified[catName] = [];
        classified[catName].push({
          id: thread.id,
          subject: thread.subject,
          sender,
          lastMessageAt: thread.lastMessageAt,
          isRead: thread.isRead,
          analysis: thread.analyses[0] || null,
          action: match.action,
        });
      } else {
        uncategorized.push({
          id: thread.id,
          subject: thread.subject,
          sender,
          lastMessageAt: thread.lastMessageAt,
          isRead: thread.isRead,
          analysis: thread.analyses[0] || null,
        });
      }
    }

    // Build summary
    const lines: string[] = [];
    lines.push(`📬 Inbox-sammanfattning (senaste 7 dagarna)`);
    lines.push(`${threads.length} trådar totalt, ${threads.filter((t) => !t.isRead).length} olästa\n`);

    for (const [catName, items] of Object.entries(classified)) {
      const cat = categories.find((c) => c.name === catName);
      lines.push(`${cat?.icon || '📁'} **${catName}** (${items.length})`);
      for (const item of items.slice(0, 3)) {
        lines.push(`  - ${item.subject || '(Ingen ämnesrad)'} — ${item.sender}`);
      }
      if (items.length > 3) lines.push(`  ... +${items.length - 3} till`);
      lines.push('');
    }

    if (uncategorized.length > 0) {
      lines.push(`📋 **Okategoriserade** (${uncategorized.length})`);
      for (const item of uncategorized.slice(0, 5)) {
        lines.push(`  - ${item.subject || '(Ingen ämnesrad)'} — ${item.sender}`);
      }
      if (uncategorized.length > 5) lines.push(`  ... +${uncategorized.length - 5} till`);
    }

    return {
      type: 'summary',
      message: lines.join('\n'),
      data: { classified, uncategorized, categories },
    };
  },

  /**
   * Mark a sender/pattern as spam — creates a rule and applies to future mail
   */
  async markAsSpam(userId: string, senderPattern: string, subjectPattern?: string): Promise<ChatCommandResult> {
    const rule = await categoryService.createRule(userId, {
      senderPattern,
      subjectPattern,
      action: 'spam',
      categorySlug: 'spam',
    });

    return {
      type: 'rule_created',
      message: `Klart! All framtida mail från \`${senderPattern}\`${subjectPattern ? ` med ämne "${subjectPattern}"` : ''} klassas nu som skräp och arkiveras automatiskt.`,
      data: rule,
    };
  },

  /**
   * Categorize a sender
   */
  async categorizeSender(userId: string, senderPattern: string, categorySlug: string): Promise<ChatCommandResult> {
    const rule = await categoryService.createRule(userId, {
      senderPattern,
      action: 'categorize',
      categorySlug,
    });

    return {
      type: 'rule_created',
      message: `Klart! Mail från \`${senderPattern}\` sorteras nu under "${categorySlug}".`,
      data: rule,
    };
  },

  /**
   * List threads matching a filter
   */
  async getFilteredThreads(userId: string, filter: {
    category?: string;
    priority?: string;
    unreadOnly?: boolean;
    limit?: number;
    threadIds?: string[];
  }): Promise<ChatCommandResult> {
    const accounts = await prisma.emailAccount.findMany({
      where: { userId, isActive: true },
    });

    const where: any = {
      accountId: { in: accounts.map((a) => a.id) },
    };

    if (filter.threadIds && filter.threadIds.length > 0) {
      where.id = { in: filter.threadIds };
    }

    if (filter.unreadOnly) where.isRead = false;

    const threads = await prisma.emailThread.findMany({
      where,
      include: {
        analyses: { orderBy: { createdAt: 'desc' }, take: 1 },
        account: true,
      },
      orderBy: { lastMessageAt: 'desc' },
      take: filter.limit || 20,
    });

    // Filter by priority if specified
    let filtered = threads;
    if (filter.priority) {
      filtered = threads.filter((t) =>
        t.analyses[0]?.priority === filter.priority
      );
    }

    return {
      type: 'thread_list',
      message: `${filtered.length} trådar hittades.`,
      data: filtered.map((t) => ({
        id: t.id,
        subject: t.subject,
        sender: t.participantEmails[0],
        lastMessageAt: t.lastMessageAt,
        isRead: t.isRead,
        priority: t.analyses[0]?.priority || null,
        classification: t.analyses[0]?.classification || null,
      })),
    };
  },

  /**
   * List all sender rules
   */
  async listRules(userId: string): Promise<ChatCommandResult> {
    const rules = await categoryService.getRules(userId);

    if (rules.length === 0) {
      return { type: 'info', message: 'Inga regler satta ännu. Säg t.ex. "markera github CI som skräp" för att skapa en.' };
    }

    const lines = rules.map((r) =>
      `• \`${r.senderPattern}\`${r.subjectPattern ? ` [${r.subjectPattern}]` : ''} → ${r.action}${r.category ? ` (${r.category.name})` : ''} — använd ${r.timesApplied}x`
    );

    return {
      type: 'info',
      message: `**Aktiva regler (${rules.length}):**\n${lines.join('\n')}`,
      data: rules,
    };
  },

  /**
   * Get categories overview
   */
  async getCategories(userId: string): Promise<ChatCommandResult> {
    const categories = await categoryService.getAll(userId);

    const lines = categories.map((c: any) =>
      `${c.icon || '📁'} **${c.name}** — ${c.description || ''}${c._count?.rules ? ` (${c._count.rules} regler)` : ''}`
    );

    return {
      type: 'categories',
      message: lines.join('\n'),
      data: categories,
    };
  },
};
