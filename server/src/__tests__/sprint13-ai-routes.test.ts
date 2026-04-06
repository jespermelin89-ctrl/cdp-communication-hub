/**
 * Sprint 13 — AI route tests.
 *
 * POST /ai/analyze-thread   — Zod validation, thread auth, no messages, AI 503, auto-draft logic
 * POST /ai/generate-draft   — account auth, empty recipient guard, AI 503
 * POST /ai/bulk-classify    — limit clamping, rule-first, MAX_AI=10 cap, failed thread skip
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../config/database', () => ({
  prisma: {
    emailAccount: { findFirst: vi.fn() },
    emailThread: { findFirst: vi.fn(), findMany: vi.fn() },
    aIAnalysis: { create: vi.fn() },
    draft: { findMany: vi.fn() },
  },
}));

vi.mock('../services/ai.service', () => ({
  aiService: {
    analyzeThread: vi.fn(),
    generateDraftWithProfile: vi.fn(),
    summarizeInbox: vi.fn(),
  },
}));

vi.mock('../services/draft.service', () => ({
  draftService: {
    create: vi.fn(),
  },
}));

vi.mock('../services/action-log.service', () => ({
  actionLogService: {
    log: vi.fn(),
  },
}));

vi.mock('../services/brain-core.service', () => ({
  brainCoreService: {
    getRelevantLearning: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../services/rule-engine.service', () => ({
  matchClassificationRule: vi.fn(),
}));

import { prisma } from '../config/database';
import { aiService } from '../services/ai.service';
import { draftService } from '../services/draft.service';
import { actionLogService } from '../services/action-log.service';
import { matchClassificationRule } from '../services/rule-engine.service';

// ─── UUID fixtures ────────────────────────────────────────────────────────────

const THREAD_ID = '11111111-1111-1111-1111-111111111111';
const ACCOUNT_ID = '22222222-2222-2222-2222-222222222222';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeThread(overrides: Record<string, any> = {}) {
  return {
    id: THREAD_ID,
    subject: 'Test subject',
    participantEmails: ['sender@external.com', 'me@company.com'],
    account: { id: ACCOUNT_ID, emailAddress: 'me@company.com' },
    messages: [
      {
        fromAddress: 'sender@external.com',
        toAddresses: ['me@company.com'],
        bodyText: 'Hello',
        receivedAt: new Date('2026-04-06T10:00:00Z'),
      },
    ],
    ...overrides,
  };
}

function makeAnalysisResult(overrides: Record<string, any> = {}) {
  return {
    summary: 'Test summary',
    classification: 'action_required',
    priority: 'high',
    suggested_action: 'reply',
    draft_text: 'Draft reply text',
    confidence: 0.9,
    model_used: 'groq',
    ...overrides,
  };
}

function makeStoredAnalysis(overrides: Record<string, any> = {}) {
  return {
    id: 'analysis-1',
    threadId: 'thread-1',
    summary: 'Test summary',
    classification: 'action_required',
    priority: 'high',
    ...overrides,
  };
}

// ─── Simulate route handlers ──────────────────────────────────────────────────

async function simulateAnalyzeThread(body: unknown, userId: string) {
  // Validate input
  const { AnalyzeThreadRequestSchema } = await import('../utils/validators');
  const parsed = AnalyzeThreadRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { code: 400, body: { error: 'Invalid input', details: parsed.error.issues } };
  }

  const { thread_id } = parsed.data;
  const thread = await (prisma.emailThread.findFirst as any)({
    where: { id: thread_id, account: { userId } },
  });

  if (!thread) return { code: 404, body: { error: 'Thread not found' } };
  if (thread.messages.length === 0) {
    return { code: 400, body: { error: 'Thread has no cached messages. Sync messages first via POST /threads/:id/sync-messages' } };
  }

  let analysis;
  try {
    analysis = await aiService.analyzeThread({
      subject: thread.subject || '(No Subject)',
      messages: thread.messages.map((m: any) => ({
        from: m.fromAddress,
        to: m.toAddresses,
        body: m.bodyText || '(No text content)',
        date: m.receivedAt.toISOString(),
      })),
    });
  } catch (aiErr: any) {
    return { code: 503, body: { error: 'AI analysis failed', message: aiErr?.message || 'AI service unavailable', code: 'AI_ERROR' } };
  }

  const stored = await (prisma.aIAnalysis.create as any)({ data: { threadId: thread_id, ...analysis } });

  await actionLogService.log(userId, 'analysis_run', 'thread', thread_id, {});

  let draft = null;
  if (analysis.suggested_action === 'reply' && analysis.draft_text) {
    const lastMessage = thread.messages[thread.messages.length - 1];
    const rawReplyTo = lastMessage.fromAddress !== thread.account.emailAddress
      ? [lastMessage.fromAddress]
      : lastMessage.toAddresses.filter((addr: string) => addr !== thread.account.emailAddress);

    const NO_REPLY_PATTERN = /^(mailer-daemon|noreply|no-reply|no\.reply|do-not-reply|donotreply|bounces?|postmaster|notifications?)\+?@/i;
    const replyTo = rawReplyTo.filter((addr: string) => !NO_REPLY_PATTERN.test(addr));

    if (replyTo.length > 0) {
      draft = await draftService.create(userId, {
        account_id: thread.account.id,
        thread_id,
        to_addresses: replyTo,
        cc_addresses: [],
        subject: `Re: ${thread.subject}`,
        body_text: analysis.draft_text,
      });
    }
  }

  return {
    code: 200,
    body: {
      analysis: stored,
      draft: draft || null,
      message: draft ? 'Analysis complete. A reply draft has been created (status: pending).' : 'Analysis complete.',
    },
  };
}

async function simulateGenerateDraft(body: unknown, userId: string) {
  const { GenerateDraftRequestSchema } = await import('../utils/validators');
  const parsed = GenerateDraftRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { code: 400, body: { error: 'Invalid input', details: parsed.error.issues } };
  }

  const { account_id, thread_id, instruction, to_addresses, subject } = parsed.data;

  const account = await (prisma.emailAccount.findFirst as any)({ where: { id: account_id, userId } });
  if (!account) return { code: 404, body: { error: 'Account not found' } };

  let draftText: string;
  try {
    draftText = await aiService.generateDraftWithProfile({ instruction, userId });
  } catch (aiErr: any) {
    return { code: 503, body: { error: 'Draft generation failed', message: aiErr?.message || 'AI service unavailable', code: 'AI_ERROR' } };
  }

  const finalTo = to_addresses || [];
  if (finalTo.length === 0) {
    return { code: 400, body: { error: 'Could not determine recipients. Provide to_addresses or a thread_id.' } };
  }

  const draft = await draftService.create(userId, {
    account_id,
    thread_id,
    to_addresses: finalTo,
    cc_addresses: [],
    subject: subject || 'New message',
    body_text: draftText,
  });

  return { code: 200, body: { draft, message: 'Draft generated and saved (status: pending). Review and approve before sending.' } };
}

async function simulateBulkClassify(body: { limit?: number } | undefined, userId: string) {
  const limit = Math.min(Number(body?.limit) || 10, 20);
  const MAX_AI = 10;

  const unanalyzed = await (prisma.emailThread.findMany as any)({
    where: { account: { userId }, analyses: { none: {} }, messages: { some: {} } },
    orderBy: { lastMessageAt: 'desc' },
    take: limit,
  }) as any[];

  const results: Array<{
    thread_id: string;
    subject: string | null;
    priority: string;
    classification: string;
    source: 'rule' | 'ai';
  }> = [];

  let aiCalls = 0;

  for (const thread of unanalyzed) {
    try {
      const ruleMatch = await (matchClassificationRule as any)(
        { subject: thread.subject, participantEmails: thread.participantEmails, messages: [] },
        userId
      );

      if (ruleMatch) {
        await (prisma.aIAnalysis.create as any)({
          data: {
            threadId: thread.id,
            summary: `Matchad regel: ${ruleMatch.categoryName}`,
            classification: ruleMatch.categoryKey,
            priority: ruleMatch.priority,
            suggestedAction: ruleMatch.action,
            confidence: 1.0,
            modelUsed: 'rule-engine',
          },
        });
        results.push({ thread_id: thread.id, subject: thread.subject, priority: ruleMatch.priority, classification: ruleMatch.categoryKey, source: 'rule' });
        continue;
      }

      if (aiCalls >= MAX_AI) continue;

      const analysis = await aiService.analyzeThread({
        subject: thread.subject || '(No Subject)',
        messages: [],
      });
      aiCalls++;

      await (prisma.aIAnalysis.create as any)({ data: { threadId: thread.id, ...analysis } });
      results.push({ thread_id: thread.id, subject: thread.subject, priority: analysis.priority, classification: analysis.classification, source: 'ai' });
    } catch {
      // skip failed threads
    }
  }

  return { analyzed: results.length, total_unanalyzed: unanalyzed.length, ai_calls: aiCalls, results };
}

// ─── analyze-thread tests ─────────────────────────────────────────────────────

describe('POST /ai/analyze-thread — validation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 400 when thread_id is missing', async () => {
    const result = await simulateAnalyzeThread({}, 'user-1');
    expect(result.code).toBe(400);
    expect((result.body as any).error).toBe('Invalid input');
  });

  it('returns 404 when thread not found', async () => {
    vi.mocked(prisma.emailThread.findFirst).mockResolvedValue(null);
    const result = await simulateAnalyzeThread({ thread_id: THREAD_ID }, 'user-1');
    expect(result.code).toBe(404);
  });

  it('returns 400 when thread has no messages', async () => {
    vi.mocked(prisma.emailThread.findFirst).mockResolvedValue({ ...makeThread(), messages: [] } as any);
    const result = await simulateAnalyzeThread({ thread_id: THREAD_ID }, 'user-1');
    expect(result.code).toBe(400);
    expect((result.body as any).error).toMatch(/no cached messages/i);
  });

  it('returns 503 with AI_ERROR code when AI service throws', async () => {
    vi.mocked(prisma.emailThread.findFirst).mockResolvedValue(makeThread() as any);
    vi.mocked(aiService.analyzeThread).mockRejectedValue(new Error('Groq down'));
    const result = await simulateAnalyzeThread({ thread_id: THREAD_ID }, 'user-1');
    expect(result.code).toBe(503);
    expect((result.body as any).code).toBe('AI_ERROR');
    expect((result.body as any).message).toBe('Groq down');
  });
});

describe('POST /ai/analyze-thread — auto-draft creation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('creates draft when suggested_action=reply and external sender', async () => {
    vi.mocked(prisma.emailThread.findFirst).mockResolvedValue(makeThread() as any);
    vi.mocked(aiService.analyzeThread).mockResolvedValue(makeAnalysisResult() as any);
    vi.mocked(prisma.aIAnalysis.create).mockResolvedValue(makeStoredAnalysis() as any);
    vi.mocked(draftService.create).mockResolvedValue({ id: 'draft-1', status: 'pending' } as any);
    vi.mocked(actionLogService.log).mockResolvedValue({} as any);

    const result = await simulateAnalyzeThread({ thread_id: THREAD_ID }, 'user-1');
    expect(result.code).toBe(200);
    expect(draftService.create).toHaveBeenCalled();
    expect((result.body as any).draft).not.toBeNull();
    expect((result.body as any).message).toContain('reply draft has been created');
  });

  it('does NOT create draft when suggested_action is not reply', async () => {
    vi.mocked(prisma.emailThread.findFirst).mockResolvedValue(makeThread() as any);
    vi.mocked(aiService.analyzeThread).mockResolvedValue(makeAnalysisResult({ suggested_action: 'archive', draft_text: null }) as any);
    vi.mocked(prisma.aIAnalysis.create).mockResolvedValue(makeStoredAnalysis() as any);
    vi.mocked(actionLogService.log).mockResolvedValue({} as any);

    const result = await simulateAnalyzeThread({ thread_id: THREAD_ID }, 'user-1');
    expect(result.code).toBe(200);
    expect(draftService.create).not.toHaveBeenCalled();
    expect((result.body as any).draft).toBeNull();
  });

  it('filters out noreply addresses — no draft created', async () => {
    const thread = makeThread({
      messages: [{
        fromAddress: 'noreply@service.com',
        toAddresses: ['me@company.com'],
        bodyText: 'Auto mail',
        receivedAt: new Date(),
      }],
    });
    vi.mocked(prisma.emailThread.findFirst).mockResolvedValue(thread as any);
    vi.mocked(aiService.analyzeThread).mockResolvedValue(makeAnalysisResult() as any);
    vi.mocked(prisma.aIAnalysis.create).mockResolvedValue(makeStoredAnalysis() as any);
    vi.mocked(actionLogService.log).mockResolvedValue({} as any);

    const result = await simulateAnalyzeThread({ thread_id: THREAD_ID }, 'user-1');
    expect(result.code).toBe(200);
    expect(draftService.create).not.toHaveBeenCalled();
    expect((result.body as any).draft).toBeNull();
  });

  it('filters out mailer-daemon addresses — no draft created', async () => {
    const thread = makeThread({
      messages: [{
        fromAddress: 'mailer-daemon@mail.example.com',
        toAddresses: ['me@company.com'],
        bodyText: 'Bounce',
        receivedAt: new Date(),
      }],
    });
    vi.mocked(prisma.emailThread.findFirst).mockResolvedValue(thread as any);
    vi.mocked(aiService.analyzeThread).mockResolvedValue(makeAnalysisResult() as any);
    vi.mocked(prisma.aIAnalysis.create).mockResolvedValue(makeStoredAnalysis() as any);
    vi.mocked(actionLogService.log).mockResolvedValue({} as any);

    const result = await simulateAnalyzeThread({ thread_id: THREAD_ID }, 'user-1');
    expect(draftService.create).not.toHaveBeenCalled();
  });
});

// ─── generate-draft tests ─────────────────────────────────────────────────────

describe('POST /ai/generate-draft — validation and auth', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 400 when required fields are missing', async () => {
    const result = await simulateGenerateDraft({}, 'user-1');
    expect(result.code).toBe(400);
  });

  it('returns 404 when account not found', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(null);
    const result = await simulateGenerateDraft({
      account_id: ACCOUNT_ID,
      instruction: 'Write a follow-up',
    }, 'user-1');
    expect(result.code).toBe(404);
    expect((result.body as any).error).toBe('Account not found');
  });

  it('returns 503 with AI_ERROR when AI throws', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue({ id: ACCOUNT_ID } as any);
    vi.mocked(aiService.generateDraftWithProfile).mockRejectedValue(new Error('Timeout'));
    const result = await simulateGenerateDraft({
      account_id: ACCOUNT_ID,
      instruction: 'Write something',
      to_addresses: ['recipient@example.com'],
    }, 'user-1');
    expect(result.code).toBe(503);
    expect((result.body as any).code).toBe('AI_ERROR');
  });

  it('returns 400 when no recipients can be determined', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue({ id: ACCOUNT_ID } as any);
    vi.mocked(aiService.generateDraftWithProfile).mockResolvedValue('Draft text' as any);
    const result = await simulateGenerateDraft({
      account_id: ACCOUNT_ID,
      instruction: 'Write something',
      // no to_addresses, no thread_id
    }, 'user-1');
    expect(result.code).toBe(400);
    expect((result.body as any).error).toMatch(/recipients/i);
  });

  it('creates draft with to_addresses when provided', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue({ id: ACCOUNT_ID } as any);
    vi.mocked(aiService.generateDraftWithProfile).mockResolvedValue('Draft text' as any);
    vi.mocked(draftService.create).mockResolvedValue({ id: 'draft-2', status: 'pending' } as any);
    const result = await simulateGenerateDraft({
      account_id: ACCOUNT_ID,
      instruction: 'Write a follow-up',
      to_addresses: ['boss@company.com'],
    }, 'user-1');
    expect(result.code).toBe(200);
    expect(draftService.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ to_addresses: ['boss@company.com'] })
    );
    expect((result.body as any).message).toContain('pending');
  });
});

// ─── bulk-classify tests ──────────────────────────────────────────────────────

describe('POST /ai/bulk-classify — limit clamping', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(prisma.emailThread.findMany).mockResolvedValue([]); });

  it('defaults to 10 threads when limit not provided', async () => {
    await simulateBulkClassify(undefined, 'user-1');
    expect(prisma.emailThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 })
    );
  });

  it('uses provided limit', async () => {
    await simulateBulkClassify({ limit: 5 }, 'user-1');
    expect(prisma.emailThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 })
    );
  });

  it('clamps limit to max 20', async () => {
    await simulateBulkClassify({ limit: 100 }, 'user-1');
    expect(prisma.emailThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 })
    );
  });
});

describe('POST /ai/bulk-classify — rule-first logic', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('uses rule-engine result without calling AI when rule matches', async () => {
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue([
      { id: 't-1', subject: 'Newsletter', participantEmails: [], messages: [] },
    ] as any);
    vi.mocked(matchClassificationRule).mockResolvedValue({
      categoryKey: 'newsletter',
      categoryName: 'Newsletter',
      priority: 'low',
      action: 'archive',
    } as any);
    vi.mocked(prisma.aIAnalysis.create).mockResolvedValue({} as any);

    const result = await simulateBulkClassify({ limit: 5 }, 'user-1');
    expect(aiService.analyzeThread).not.toHaveBeenCalled();
    expect(result.results[0].source).toBe('rule');
    expect(result.ai_calls).toBe(0);
  });

  it('calls AI when no rule matches', async () => {
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue([
      { id: 't-1', subject: 'Question', participantEmails: [], messages: [] },
    ] as any);
    vi.mocked(matchClassificationRule).mockResolvedValue(null);
    vi.mocked(aiService.analyzeThread).mockResolvedValue(makeAnalysisResult({ suggested_action: 'archive' }) as any);
    vi.mocked(prisma.aIAnalysis.create).mockResolvedValue({} as any);

    const result = await simulateBulkClassify({ limit: 5 }, 'user-1');
    expect(aiService.analyzeThread).toHaveBeenCalledTimes(1);
    expect(result.results[0].source).toBe('ai');
    expect(result.ai_calls).toBe(1);
  });

  it('caps AI calls at MAX_AI=10, skips remaining threads', async () => {
    // 12 threads, none match rules
    const threads = Array.from({ length: 12 }, (_, i) => ({
      id: `t-${i}`, subject: `Thread ${i}`, participantEmails: [], messages: [],
    }));
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue(threads as any);
    vi.mocked(matchClassificationRule).mockResolvedValue(null);
    vi.mocked(aiService.analyzeThread).mockResolvedValue(makeAnalysisResult({ suggested_action: 'archive' }) as any);
    vi.mocked(prisma.aIAnalysis.create).mockResolvedValue({} as any);

    const result = await simulateBulkClassify({ limit: 12 }, 'user-1');
    expect(result.ai_calls).toBe(10);
    expect(result.analyzed).toBe(10); // threads 11 and 12 skipped
  });

  it('skips failed threads and continues processing', async () => {
    const threads = [
      { id: 't-1', subject: 'Good', participantEmails: [], messages: [] },
      { id: 't-2', subject: 'Bad', participantEmails: [], messages: [] },
      { id: 't-3', subject: 'Good', participantEmails: [], messages: [] },
    ];
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue(threads as any);
    vi.mocked(matchClassificationRule).mockResolvedValue(null);
    vi.mocked(aiService.analyzeThread)
      .mockResolvedValueOnce(makeAnalysisResult() as any)
      .mockRejectedValueOnce(new Error('AI failure'))
      .mockResolvedValueOnce(makeAnalysisResult() as any);
    vi.mocked(prisma.aIAnalysis.create).mockResolvedValue({} as any);

    const result = await simulateBulkClassify({ limit: 3 }, 'user-1');
    expect(result.analyzed).toBe(2); // only 2 succeeded
    expect(result.total_unanalyzed).toBe(3);
  });
});

describe('POST /ai/bulk-classify — response shape', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(prisma.emailThread.findMany).mockResolvedValue([]); });

  it('returns analyzed, total_unanalyzed, ai_calls, results', async () => {
    const result = await simulateBulkClassify(undefined, 'user-1');
    expect(result).toHaveProperty('analyzed');
    expect(result).toHaveProperty('total_unanalyzed');
    expect(result).toHaveProperty('ai_calls');
    expect(result).toHaveProperty('results');
    expect(Array.isArray(result.results)).toBe(true);
  });

  it('returns empty results when no unanalyzed threads', async () => {
    const result = await simulateBulkClassify(undefined, 'user-1');
    expect(result.analyzed).toBe(0);
    expect(result.total_unanalyzed).toBe(0);
    expect(result.ai_calls).toBe(0);
    expect(result.results).toHaveLength(0);
  });
});
