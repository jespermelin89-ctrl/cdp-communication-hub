/**
 * BrainCoreService - Writing profile management and daily summary generation.
 *
 * Stateless operations that read/write Brain Core tables.
 * Daily summary uses AIService to generate the recommendation text.
 */

import { prisma } from '../config/database';
import { aiService } from './ai.service';

export class BrainCoreService {
  /**
   * Get the writing profile for a user (all modes + voice attributes).
   */
  async getWritingProfile(userId: string) {
    const [modes, attributes] = await Promise.all([
      prisma.writingMode.findMany({
        where: { userId, isActive: true },
        orderBy: { modeKey: 'asc' },
      }),
      prisma.voiceAttribute.findMany({
        where: { userId },
        orderBy: { attribute: 'asc' },
      }),
    ]);
    return { modes, attributes };
  }

  /**
   * Get contact profiles for a user.
   */
  async getContacts(userId: string, limit = 100, search?: string) {
    return prisma.contactProfile.findMany({
      where: search
        ? {
            userId,
            OR: [
              { emailAddress: { contains: search, mode: 'insensitive' } },
              { displayName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : { userId },
      orderBy: { lastContactAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Upsert a contact profile.
   */
  async upsertContact(
    userId: string,
    emailAddress: string,
    data: Partial<{
      displayName: string;
      relationship: string;
      preferredMode: string;
      language: string;
      notes: string;
      lastContactAt: Date;
      totalEmails: number;
      responseRate: number;
      avgResponseTime: number;
    }>
  ) {
    return prisma.contactProfile.upsert({
      where: { userId_emailAddress: { userId, emailAddress } },
      create: { userId, emailAddress, ...data },
      update: data,
    });
  }

  /**
   * Get classification rules for a user.
   */
  async getClassificationRules(userId: string) {
    return prisma.classificationRule.findMany({
      where: { userId, isActive: true },
      orderBy: { categoryKey: 'asc' },
    });
  }

  /**
   * Get or generate the daily summary for today.
   * If one already exists for today, returns it directly.
   */
  async getDailySummary(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await prisma.dailySummary.findUnique({
      where: { userId_date: { userId, date: today } },
    });

    if (existing) return existing;

    return this.generateDailySummary(userId);
  }

  /**
   * Generate and persist a fresh daily summary for today.
   */
  async generateDailySummary(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Load recent threads across all user accounts
    const accounts = await prisma.emailAccount.findMany({
      where: { userId, isActive: true },
      select: { id: true },
    });

    const accountIds = accounts.map((a) => a.id);

    const threads = await prisma.emailThread.findMany({
      where: { accountId: { in: accountIds } },
      include: {
        analyses: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 50,
    });

    // Categorize threads
    const needsReply = threads
      .filter((t) => t.analyses[0]?.suggestedAction === 'reply' && !t.isRead === false)
      .slice(0, 10)
      .map((t) => ({
        threadId: t.id,
        subject: t.subject,
        snippet: t.snippet,
        priority: t.analyses[0]?.priority,
        classification: t.analyses[0]?.classification,
      }));

    const goodToKnow = threads
      .filter((t) => t.analyses[0]?.suggestedAction === 'review_later')
      .slice(0, 5)
      .map((t) => ({
        threadId: t.id,
        subject: t.subject,
        snippet: t.snippet,
        classification: t.analyses[0]?.classification,
      }));

    const autoArchived = threads
      .filter((t) => t.analyses[0]?.suggestedAction === 'archive_suggestion')
      .slice(0, 10)
      .map((t) => ({
        threadId: t.id,
        subject: t.subject,
        classification: t.analyses[0]?.classification,
      }));

    const totalNew = threads.filter((t) => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return t.lastMessageAt && t.lastMessageAt > oneDayAgo;
    }).length;

    const totalUnread = threads.filter((t) => !t.isRead).length;
    const totalAutoSorted = autoArchived.length;

    // Generate AI recommendation
    let recommendation: string | undefined;
    try {
      recommendation = await aiService.summarizeInbox(
        threads.slice(0, 20).map((t) => ({
          subject: t.subject || '(No Subject)',
          snippet: t.snippet || '',
          priority: t.analyses[0]?.priority,
          classification: t.analyses[0]?.classification,
          messageCount: t.messageCount,
          lastMessageAt: t.lastMessageAt || new Date(),
          isRead: t.isRead,
        }))
      );
    } catch (_) {
      recommendation = undefined;
    }

    // Upsert the summary (overwrite if somehow generated twice)
    const summary = await prisma.dailySummary.upsert({
      where: { userId_date: { userId, date: today } },
      create: {
        userId,
        date: today,
        needsReply,
        goodToKnow,
        autoArchived,
        awaitingReply: [],
        recommendation,
        totalNew,
        totalUnread,
        totalAutoSorted,
        modelUsed: 'claude-sonnet-4-5',
      },
      update: {
        needsReply,
        goodToKnow,
        autoArchived,
        recommendation,
        totalNew,
        totalUnread,
        totalAutoSorted,
        modelUsed: 'claude-sonnet-4-5',
      },
    });

    return summary;
  }

  /**
   * Record a learning event.
   */
  async recordLearning(
    userId: string,
    eventType: string,
    data: object,
    sourceType?: string,
    sourceId?: string
  ) {
    return prisma.learningEvent.create({
      data: { userId, eventType, sourceType, sourceId, data },
    });
  }

  /**
   * Get relevant learning events for a user, optionally filtered by sender or event type.
   * Used to inject historical context into AI prompts.
   */
  async getRelevantLearning(
    userId: string,
    context: {
      sender?: string;
      eventType?: string;
    } = {}
  ) {
    const where: any = { userId };
    if (context.eventType) where.eventType = context.eventType;

    const events = await prisma.learningEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Narrow to sender-specific events if available
    if (context.sender && events.length > 0) {
      const senderEvents = events.filter((e) =>
        JSON.stringify(e.data).includes(context.sender!)
      );
      if (senderEvents.length > 0) return senderEvents;
    }

    return events;
  }

  /**
   * Get learning event stats for a user.
   */
  async getLearningStats(userId: string) {
    const events = await prisma.learningEvent.groupBy({
      by: ['eventType'],
      where: { userId },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    const total = events.reduce((sum, e) => sum + e._count.id, 0);

    return {
      total,
      byType: events.map((e) => ({ type: e.eventType, count: e._count.id })),
    };
  }

  /**
   * Update a writing mode by key.
   */
  async updateWritingMode(
    userId: string,
    modeKey: string,
    data: {
      name?: string;
      description?: string;
      characteristics?: object;
      examplePhrases?: string[];
      signOff?: string;
      openerStyle?: string;
      isActive?: boolean;
    }
  ) {
    return prisma.writingMode.update({
      where: { userId_modeKey: { userId, modeKey } },
      data,
    });
  }
}

export const brainCoreService = new BrainCoreService();
