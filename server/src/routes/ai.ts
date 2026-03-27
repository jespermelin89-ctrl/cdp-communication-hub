/**
 * AI routes - Analysis, draft generation, inbox summary.
 *
 * AI is a suggestion engine. It analyzes and drafts, never executes.
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../config/database';
import { aiService } from '../services/ai.service';
import { draftService } from '../services/draft.service';
import { actionLogService } from '../services/action-log.service';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  AnalyzeThreadRequestSchema,
  GenerateDraftRequestSchema,
  SummarizeInboxRequestSchema,
} from '../utils/validators';

export async function aiRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  /**
   * POST /ai/analyze-thread - Run AI analysis on a thread
   * Returns: summary, classification, priority, suggested_action, draft_text
   */
  fastify.post('/ai/analyze-thread', async (request, reply) => {
    const parsed = AnalyzeThreadRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.issues });
    }

    const { thread_id } = parsed.data;

    // Load thread with messages
    const thread = await prisma.emailThread.findFirst({
      where: { id: thread_id, account: { userId: request.userId } },
      include: {
        messages: {
          orderBy: { receivedAt: 'asc' },
        },
        account: { select: { id: true, emailAddress: true } },
      },
    });

    if (!thread) {
      return reply.code(404).send({ error: 'Thread not found' });
    }

    if (thread.messages.length === 0) {
      return reply.code(400).send({
        error: 'Thread has no cached messages. Sync messages first via POST /threads/:id/sync-messages',
      });
    }

    // Run AI analysis
    let analysis;
    try {
      analysis = await aiService.analyzeThread({
        subject: thread.subject || '(No Subject)',
        messages: thread.messages.map((m) => ({
          from: m.fromAddress,
          to: m.toAddresses,
          body: m.bodyText || '(No text content)',
          date: m.receivedAt.toISOString(),
        })),
      });
    } catch (aiErr: any) {
      request.log.error(aiErr, 'AI analysis failed');
      return reply.code(503).send({
        error: 'AI analysis failed',
        message: aiErr?.message || 'AI service unavailable',
        code: 'AI_ERROR',
      });
    }

    // Store analysis in database
    const stored = await prisma.aIAnalysis.create({
      data: {
        threadId: thread_id,
        summary: analysis.summary,
        classification: analysis.classification,
        priority: analysis.priority,
        suggestedAction: analysis.suggested_action,
        draftText: analysis.draft_text,
        confidence: analysis.confidence,
        modelUsed: analysis.model_used,
      },
    });

    // Log the analysis
    await actionLogService.log(request.userId, 'analysis_run', 'thread', thread_id, {
      classification: analysis.classification,
      priority: analysis.priority,
      suggestedAction: analysis.suggested_action,
      confidence: analysis.confidence,
    });

    // If AI suggests a reply, auto-create a pending draft
    let draft = null;
    if (analysis.suggested_action === 'reply' && analysis.draft_text) {
      // Determine who to reply to:
      // If last message is FROM someone else → reply to them
      // If last message is FROM us → reply to the original TO recipients (excluding ourselves)
      const lastMessage = thread.messages[thread.messages.length - 1];
      const rawReplyTo = lastMessage.fromAddress !== thread.account.emailAddress
        ? [lastMessage.fromAddress]
        : lastMessage.toAddresses.filter((addr: string) => addr !== thread.account.emailAddress);

      // Skip draft if recipient is an automated address (mailer-daemon, noreply, bounces, etc.)
      const NO_REPLY_PATTERN = /^(mailer-daemon|noreply|no-reply|do-not-reply|donotreply|bounces?)\+?@/i;
      const replyTo = rawReplyTo.filter((addr: string) => !NO_REPLY_PATTERN.test(addr));

      if (replyTo.length > 0) {
        draft = await draftService.create(request.userId, {
          account_id: thread.account.id,
          thread_id: thread_id,
          to_addresses: replyTo,
          cc_addresses: [],
          subject: thread.subject?.startsWith('Re:')
            ? thread.subject
            : `Re: ${thread.subject || '(No Subject)'}`,
          body_text: analysis.draft_text,
        });
      }
    }

    return {
      analysis: stored,
      draft: draft || null,
      message: draft
        ? 'Analysis complete. A reply draft has been created (status: pending).'
        : 'Analysis complete.',
    };
  });

  /**
   * POST /ai/generate-draft - Generate a new draft from natural language
   */
  fastify.post('/ai/generate-draft', async (request, reply) => {
    const parsed = GenerateDraftRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.issues });
    }

    const { account_id, thread_id, instruction, to_addresses, subject } = parsed.data;

    // Verify account
    const account = await prisma.emailAccount.findFirst({
      where: { id: account_id, userId: request.userId },
    });
    if (!account) {
      return reply.code(404).send({ error: 'Account not found' });
    }

    // Load thread context if provided
    let threadContext;
    if (thread_id) {
      const thread = await prisma.emailThread.findFirst({
        where: { id: thread_id, account: { userId: request.userId } },
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

    // Generate draft text via AI
    let draftText: string;
    try {
      draftText = await aiService.generateDraft({
        instruction,
        threadContext,
      });
    } catch (aiErr: any) {
      request.log.error(aiErr, 'AI draft generation failed');
      return reply.code(503).send({
        error: 'Draft generation failed',
        message: aiErr?.message || 'AI service unavailable',
        code: 'AI_ERROR',
      });
    }

    // Determine recipients and subject
    const finalTo = to_addresses || (threadContext
      ? [threadContext.messages[threadContext.messages.length - 1].from]
      : []);

    if (finalTo.length === 0) {
      return reply.code(400).send({
        error: 'Could not determine recipients. Provide to_addresses or a thread_id.',
      });
    }

    const finalSubject = subject || (threadContext
      ? `Re: ${threadContext.subject}`
      : 'New message');

    // Create the draft
    const draft = await draftService.create(request.userId, {
      account_id,
      thread_id,
      to_addresses: finalTo,
      cc_addresses: [],
      subject: finalSubject,
      body_text: draftText,
    });

    return {
      draft,
      message: 'Draft generated and saved (status: pending). Review and approve before sending.',
    };
  });

  /**
   * POST /ai/summarize-inbox - Get a daily briefing summary
   */
  fastify.post('/ai/summarize-inbox', async (request, reply) => {
    const parsed = SummarizeInboxRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.issues });
    }

    const { account_id } = parsed.data;

    // Verify account
    const account = await prisma.emailAccount.findFirst({
      where: { id: account_id, userId: request.userId },
    });
    if (!account) {
      return reply.code(404).send({ error: 'Account not found' });
    }

    // Load recent threads with their analyses
    const threads = await prisma.emailThread.findMany({
      where: { accountId: account_id },
      include: {
        analyses: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 30,
    });

    let summary: string;
    try {
      summary = await aiService.summarizeInbox(
        threads.map((t) => ({
          subject: t.subject || '(No Subject)',
          snippet: t.snippet || '',
          priority: t.analyses[0]?.priority,
          classification: t.analyses[0]?.classification,
          messageCount: t.messageCount,
          lastMessageAt: t.lastMessageAt || new Date(),
          isRead: t.isRead,
        }))
      );
    } catch (aiErr: any) {
      request.log.error(aiErr, 'AI inbox summary failed');
      return reply.code(503).send({
        error: 'Inbox summary failed',
        message: aiErr?.message || 'AI service unavailable',
        code: 'AI_ERROR',
      });
    }

    return { summary };
  });
}
