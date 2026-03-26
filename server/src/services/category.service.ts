/**
 * Category & Sender Rules Service
 *
 * Handles:
 * - CRUD for categories (groups like "CI/CD Noise", "Business", "Spam")
 * - Sender rules that learn from user actions
 * - Auto-classification of incoming mail based on learned rules
 */

import { prisma } from '../config/database';

// Default system categories seeded on first use
const SYSTEM_CATEGORIES = [
  { name: 'Important', slug: 'important', color: '#EF4444', icon: '🔴', description: 'Requires your attention', sortOrder: 0 },
  { name: 'Business', slug: 'business', color: '#10B981', icon: '💰', description: 'Revenue, clients, partnerships', sortOrder: 1 },
  { name: 'Dev & CI/CD', slug: 'dev-cicd', color: '#6366F1', icon: '⚙️', description: 'GitHub, deploys, CI notifications', sortOrder: 2 },
  { name: 'Community', slug: 'community', color: '#F59E0B', icon: '👥', description: 'Skool, forums, social', sortOrder: 3 },
  { name: 'Services', slug: 'services', color: '#8B5CF6', icon: '🔧', description: 'SaaS tools, onboarding, billing', sortOrder: 4 },
  { name: 'Personal', slug: 'personal', color: '#3B82F6', icon: '🏠', description: 'Personal correspondence', sortOrder: 5 },
  { name: 'Spam / Noise', slug: 'spam', color: '#9CA3AF', icon: '🗑️', description: 'Junk, noise, auto-archive', sortOrder: 99 },
];

export const categoryService = {

  /**
   * Ensure system categories exist for a user
   */
  async ensureDefaults(userId: string) {
    const existing = await prisma.category.findMany({ where: { userId } });
    if (existing.length > 0) return existing;

    const created = [];
    for (const cat of SYSTEM_CATEGORIES) {
      const c = await prisma.category.create({
        data: { userId, ...cat, isSystem: true },
      });
      created.push(c);
    }
    return created;
  },

  /**
   * Get all categories for a user
   */
  async getAll(userId: string) {
    await this.ensureDefaults(userId);
    return prisma.category.findMany({
      where: { userId },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { rules: true } } },
    });
  },

  /**
   * Create a custom category
   */
  async create(userId: string, data: { name: string; color?: string; icon?: string; description?: string }) {
    const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return prisma.category.create({
      data: { userId, slug, ...data },
    });
  },

  /**
   * Create a sender rule — this is what powers "mark as spam" learning
   */
  async createRule(userId: string, data: {
    senderPattern: string;
    subjectPattern?: string;
    action: string;
    categorySlug?: string;
    priority?: string;
  }) {
    let categoryId: string | undefined;
    if (data.categorySlug) {
      await this.ensureDefaults(userId);
      const cat = await prisma.category.findFirst({
        where: { userId, slug: data.categorySlug },
      });
      categoryId = cat?.id;
    }

    return prisma.senderRule.create({
      data: {
        userId,
        senderPattern: data.senderPattern,
        subjectPattern: data.subjectPattern || null,
        action: data.action,
        categoryId: categoryId || null,
        priority: data.priority || null,
      },
    });
  },

  /**
   * Get all active rules for a user
   */
  async getRules(userId: string) {
    return prisma.senderRule.findMany({
      where: { userId, isActive: true },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Match a sender+subject against rules
   * Returns the first matching rule, or null
   */
  async matchRules(userId: string, senderEmail: string, subject?: string) {
    const rules = await prisma.senderRule.findMany({
      where: { userId, isActive: true },
      include: { category: true },
    });

    for (const rule of rules) {
      const pattern = rule.senderPattern.toLowerCase();
      const sender = senderEmail.toLowerCase();

      // Exact match
      if (pattern === sender) return rule;

      // Domain wildcard: *@domain.com
      if (pattern.startsWith('*@') && sender.endsWith(pattern.slice(1))) return rule;

      // Starts with wildcard: *pattern*
      if (pattern.startsWith('*') && pattern.endsWith('*') && sender.includes(pattern.slice(1, -1))) return rule;

      // Subject pattern match
      if (rule.subjectPattern && subject) {
        try {
          const regex = new RegExp(rule.subjectPattern, 'i');
          if (regex.test(subject) && (pattern === sender || pattern === '*')) return rule;
        } catch {
          // Invalid regex, skip
        }
      }
    }

    return null;
  },

  /**
   * Classify a batch of threads against rules
   * Returns a map of threadId -> { category, action, rule }
   */
  async classifyThreads(userId: string, threads: Array<{
    id: string;
    senderEmail: string;
    subject?: string;
  }>) {
    const results: Record<string, { category: any; action: string; rule: any }> = {};

    for (const thread of threads) {
      const match = await this.matchRules(userId, thread.senderEmail, thread.subject);
      if (match) {
        results[thread.id] = {
          category: match.category,
          action: match.action,
          rule: match,
        };
        // Increment times_applied
        await prisma.senderRule.update({
          where: { id: match.id },
          data: { timesApplied: { increment: 1 } },
        });
      }
    }

    return results;
  },

  /**
   * Delete a rule
   */
  async deleteRule(ruleId: string) {
    return prisma.senderRule.delete({ where: { id: ruleId } });
  },

  /**
   * Delete a category (non-system only)
   */
  async deleteCategory(categoryId: string) {
    const cat = await prisma.category.findUnique({ where: { id: categoryId } });
    if (cat?.isSystem) throw new Error('Cannot delete system categories');
    return prisma.category.delete({ where: { id: categoryId } });
  },
};
