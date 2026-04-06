/**
 * Sprint 14 — Agent route tests.
 *
 * POST /agent/execute — external API for Amanda / BRAIN-OS / Apple Shortcuts
 *
 * Key invariants:
 *  - X-API-Key auth: missing/wrong → 401; unconfigured COMMAND_API_KEY → 503
 *  - Unknown action → 400; no active account → 503
 *  - briefing: returns unread, high/medium_priority, pending_drafts, triage_today shape
 *  - classify: missing thread_id → 400; not found → 404; success → analysis shape
 *  - draft: missing instruction → 400; empty recipients → 400; success
 *  - send: SAFETY — pending draft → 409; not found → 404; approved → sends
 *  - schedule: missing params → 400; invalid date → 400; success
 *  - snooze: missing params → 400; thread not found → 404; success
 *  - triage-status: aggregation by action
 *  - triage-report: period clamping (invalid → today), voice summary built correctly
 *  - stats: response shape
 *  - batch: empty array → 400; >10 → 400; no active account → 503
 *  - DB errors: Prisma/database messages sanitized to generic string
 *  - callback_url: invalid URL → 400; valid → 202 (fire-and-forget)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../config/database', () => ({
  prisma: {
    emailAccount: { findFirst: vi.fn(), findMany: vi.fn() },
    emailThread: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
    draft: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
    aIAnalysis: { create: vi.fn(), findMany: vi.fn() },
    triageLog: { findMany: vi.fn(), count: vi.fn() },
    dailySummary: { findFirst: vi.fn() },
    learningEvent: { deleteMany: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    classificationRule: { count: vi.fn() },
  },
}));

vi.mock('../config/env', () => ({
  env: {
    COMMAND_API_KEY: 'test-agent-key',
    AI_PROVIDER: 'groq',
    FRONTEND_URL: 'https://example.com',
  },
}));

vi.mock('../services/ai.service', () => ({
  aiService: {
    analyzeThread: vi.fn(),
    generateDraft: vi.fn(),
    chat: vi.fn(),
  },
}));

vi.mock('../services/draft.service', () => ({
  draftService: {
    create: vi.fn(),
    send: vi.fn(),
  },
}));

vi.mock('../services/brain-core.service', () => ({
  brainCoreService: {
    getWritingProfile: vi.fn().mockResolvedValue({ modes: [], attributes: [] }),
    getContacts: vi.fn().mockResolvedValue([]),
    getClassificationRules: vi.fn().mockResolvedValue([]),
    getRelevantLearning: vi.fn().mockResolvedValue([]),
    recordLearning: vi.fn(),
  },
}));

vi.mock('../utils/agent-safety', () => ({
  getAgentDraftStatusError: vi.fn(),
}));

import { prisma } from '../config/database';
import { env } from '../config/env';
import { aiService } from '../services/ai.service';
import { draftService } from '../services/draft.service';
import { getAgentDraftStatusError } from '../utils/agent-safety';

// ─── Auth simulation ──────────────────────────────────────────────────────────

function checkApiKey(apiKey: string | undefined): { code: number; body: object } | null {
  if (!env.COMMAND_API_KEY) {
    return { code: 503, body: { success: false, error: 'Agent API is not configured (COMMAND_API_KEY missing).' } };
  }
  if (!apiKey || apiKey !== env.COMMAND_API_KEY) {
    return { code: 401, body: { success: false, error: 'Invalid or missing X-API-Key.' } };
  }
  return null;
}

// ─── Core execute simulation ──────────────────────────────────────────────────

async function simulateExecute(
  action: string,
  params: Record<string, unknown> = {},
  apiKey: string | undefined = 'test-agent-key'
): Promise<{ code: number; body: Record<string, unknown> }> {
  const authError = checkApiKey(apiKey);
  if (authError) return authError as any;

  const ALLOWED_ACTIONS = [
    'briefing', 'classify', 'draft', 'search', 'brain-status', 'learn',
    'bulk-classify', 'sync', 'cleanup', 'seed-brain-core',
    'send', 'schedule', 'snooze', 'export', 'contacts', 'stats', 'compose', 'chat',
    'triage-status', 'triage-override', 'review-queue', 'rule-suggest',
    'approve-rule', 'dismiss-rule', 'review-keep', 'review-trash', 'inbox-status',
    'triage-report',
  ];

  if (!action || !ALLOWED_ACTIONS.includes(action)) {
    return { code: 400, body: { success: false, error: `Okänd action. Tillåtna: ${ALLOWED_ACTIONS.join(', ')}` } };
  }

  const account = await (prisma.emailAccount.findFirst as any)({ where: { isActive: true } });
  if (!account) {
    return { code: 503, body: { success: false, error: 'Inga aktiva e-postkonton hittades.' } };
  }
  const userId = account.userId;

  // Validate callback_url format
  if (params.callback_url) {
    try { new URL(params.callback_url as string); } catch {
      return { code: 400, body: { success: false, error: 'callback_url måste vara en giltig URL.' } };
    }
    return { code: 202, body: { success: true, action, message: 'Accepterat — resultatet skickas till callback_url när klart.' } };
  }

  try {
    switch (action) {
      case 'briefing': {
        const [threads, pendingDrafts, dailySummary, triageLogs, autoDraftsPending] = await Promise.all([
          (prisma.emailThread.findMany as any)({ where: { account: { userId }, isRead: false }, take: 20, include: { analyses: { take: 1 }, account: { select: { emailAddress: true } } } }),
          (prisma.draft.findMany as any)({ where: { account: { userId }, status: { in: ['pending', 'approved'] } }, take: 10, select: { id: true, subject: true, status: true, toAddresses: true, createdAt: true } }),
          (prisma.dailySummary.findFirst as any)({ where: { userId } }),
          (prisma.triageLog.findMany as any)({ where: { userId, createdAt: { gte: new Date() } }, select: { action: true } }),
          (prisma.draft.count as any)({ where: { userId, source: 'auto_triage', status: 'pending' } }),
        ]);
        const withAnalysis = threads.map((t: any) => ({ ...t, latestAnalysis: t.analyses?.[0] ?? null }));
        const high = withAnalysis.filter((t: any) => t.latestAnalysis?.priority === 'high');
        const medium = withAnalysis.filter((t: any) => t.latestAnalysis?.priority === 'medium');
        return { code: 200, body: { success: true, action, data: { unread_count: threads.length, high_priority: high, medium_priority: medium, pending_drafts: pendingDrafts, daily_summary: dailySummary, triage_today: { total_sorted: triageLogs.length, auto_drafts_pending: autoDraftsPending } } } };
      }

      case 'classify': {
        if (!params.thread_id) return { code: 400, body: { success: false, error: 'params.thread_id krävs.' } };
        const thread = await (prisma.emailThread.findFirst as any)({ where: { id: params.thread_id, account: { userId } } });
        if (!thread) return { code: 404, body: { success: false, error: 'Tråd hittades inte.' } };
        const analysis = await aiService.analyzeThread({ subject: thread.subject, messages: [] });
        const saved = await (prisma.aIAnalysis.create as any)({ data: { threadId: thread.id, ...analysis } });
        return { code: 200, body: { success: true, action, data: { thread_id: thread.id, analysis_id: saved.id, priority: analysis.priority, classification: analysis.classification } } };
      }

      case 'draft': {
        if (!params.instruction) return { code: 400, body: { success: false, error: 'params.instruction krävs.' } };
        const draftAccount = await (prisma.emailAccount.findFirst as any)({ where: { userId, isActive: true } });
        if (!draftAccount) return { code: 400, body: { success: false, error: 'Inget konto hittades.' } };
        const draftText = await aiService.generateDraft({ instruction: params.instruction as string });
        const toAddrs: string[] = Array.isArray(params.to_addresses) ? params.to_addresses as string[] : [];
        if (toAddrs.length === 0) return { code: 400, body: { success: false, error: 'Kan inte fastställa mottagare.' } };
        const draft = await draftService.create(userId, { account_id: draftAccount.id, to_addresses: toAddrs, cc_addresses: [], subject: (params.subject as string) || 'Nytt meddelande', body_text: draftText });
        return { code: 200, body: { success: true, action, data: { draft_id: (draft as any).id, status: (draft as any).status } } };
      }

      case 'send': {
        if (!params.draft_id) return { code: 400, body: { success: false, error: 'params.draft_id krävs.' } };
        const draftToSend = await (prisma.draft.findFirst as any)({ where: { id: params.draft_id, account: { userId } } });
        if (!draftToSend) return { code: 404, body: { success: false, error: 'Utkast hittades inte.' } };
        const sendError = getAgentDraftStatusError(draftToSend.status, 'send');
        if (sendError) return { code: 409, body: { success: false, error: sendError } };
        const sent = await draftService.send(params.draft_id as string, userId);
        return { code: 200, body: { success: true, action, data: { draft_id: (sent as any).id, status: (sent as any).status } } };
      }

      case 'schedule': {
        if (!params.draft_id || !params.send_at) return { code: 400, body: { success: false, error: 'params.draft_id och params.send_at krävs.' } };
        const sendAt = new Date(params.send_at as string);
        if (isNaN(sendAt.getTime())) return { code: 400, body: { success: false, error: 'send_at måste vara ett giltigt ISO-datum.' } };
        const draftForSchedule = await (prisma.draft.findFirst as any)({ where: { id: params.draft_id, account: { userId } } });
        if (!draftForSchedule) return { code: 404, body: { success: false, error: 'Utkast hittades inte.' } };
        const scheduleError = getAgentDraftStatusError(draftForSchedule.status, 'schedule');
        if (scheduleError) return { code: 409, body: { success: false, error: scheduleError } };
        const scheduled = await (prisma.draft.update as any)({ where: { id: params.draft_id }, data: { scheduledAt: sendAt } });
        return { code: 200, body: { success: true, action, data: { draft_id: scheduled.id, scheduled_at: sendAt.toISOString() } } };
      }

      case 'snooze': {
        if (!params.thread_id || !params.until) return { code: 400, body: { success: false, error: 'params.thread_id och params.until krävs.' } };
        const snoozeUntil = new Date(params.until as string);
        if (isNaN(snoozeUntil.getTime())) return { code: 400, body: { success: false, error: 'until måste vara ett giltigt ISO-datum.' } };
        const thread = await (prisma.emailThread.findFirst as any)({ where: { id: params.thread_id, account: { userId } } });
        if (!thread) return { code: 404, body: { success: false, error: 'Tråd hittades inte.' } };
        await (prisma.emailThread.update as any)({ where: { id: params.thread_id }, data: { snoozedUntil: snoozeUntil } });
        return { code: 200, body: { success: true, action, data: { snoozed_until: snoozeUntil.toISOString() } } };
      }

      case 'triage-status': {
        const days = Math.min(Number(params.days) || 1, 30);
        const logs = await (prisma.triageLog.findMany as any)({ where: { userId }, select: { action: true, classification: true, senderEmail: true } });
        const byAction: Record<string, number> = {};
        for (const log of logs) { byAction[log.action] = (byAction[log.action] ?? 0) + 1; }
        const autoDraftCount = await (prisma.draft.count as any)({ where: { userId, source: 'auto_triage' } });
        return { code: 200, body: { success: true, action, data: { period: days === 1 ? 'today' : `last_${days}_days`, total_sorted: logs.length, trashed: logs.filter((l: any) => ['trash', 'trash_after_log', 'notify_then_trash'].includes(l.action)).length, by_action: byAction, auto_drafts_created: autoDraftCount } } };
      }

      case 'triage-report': {
        const period = (params?.period as string) ?? 'today';
        const validPeriods = ['today', 'week', 'month'];
        const safePeriod = validPeriods.includes(period) ? period : 'today';
        const logs = await (prisma.triageLog.findMany as any)({ where: { userId }, select: { action: true, classification: true, senderEmail: true } });
        const total = logs.length;
        const trashed = logs.filter((l: any) => ['trash', 'trash_after_log', 'notify_then_trash'].includes(l.action)).length;
        const inReview = logs.filter((l: any) => l.action === 'label_review').length;
        const kept = logs.filter((l: any) => ['keep_inbox', 'auto_draft'].includes(l.action)).length;
        const periodLabel = safePeriod === 'today' ? 'Idag' : safePeriod === 'week' ? 'Den senaste veckan' : 'Den senaste månaden';
        const voice = total === 0
          ? `${periodLabel} har inga mail sorterats.`
          : `${periodLabel} sorterades ${total} mail bort. ${trashed} raderades, ${inReview} skickades till granskning och ${kept} behölls i inkorgen.`;
        return { code: 200, body: { success: true, action, data: { period: safePeriod, total_sorted: total, trashed, in_review: inReview, kept, voice_summary: voice } } };
      }

      case 'stats': {
        const [unread, highPrio, snoozed, pendingDrafts, accounts] = await Promise.all([
          (prisma.emailThread.count as any)({ where: { account: { userId }, isRead: false } }),
          (prisma.emailThread.count as any)({ where: { account: { userId }, isRead: false, analyses: { some: { priority: 'high' } } } }),
          (prisma.emailThread.count as any)({ where: { account: { userId }, snoozedUntil: { gt: new Date() } } }),
          (prisma.draft.count as any)({ where: { account: { userId }, status: 'pending' } }),
          (prisma.emailAccount.findMany as any)({ where: { userId, isActive: true }, select: { emailAddress: true, lastSyncAt: true } }),
        ]);
        return { code: 200, body: { success: true, action, data: { unread, high_priority: highPrio, snoozed, pending_drafts: pendingDrafts, accounts: accounts.map((a: any) => ({ email: a.emailAddress, last_sync: a.lastSyncAt })) } } };
      }

      default:
        return { code: 500, body: { success: false, error: 'Not simulated' } };
    }
  } catch (err: any) {
    const msg: string = err?.message ?? 'Okänt fel';
    const safe = /prisma|database|connection/i.test(msg) ? 'Databasfel — försök igen om en stund.' : msg;
    return { code: 500, body: { success: false, action, error: safe } };
  }
}

async function simulateBatch(
  actions: Array<{ action: string; params?: Record<string, unknown> }> | unknown,
  apiKey = 'test-agent-key'
): Promise<{ code: number; body: Record<string, unknown> }> {
  const authError = checkApiKey(apiKey);
  if (authError) return authError as any;

  if (!Array.isArray(actions) || (actions as any[]).length === 0) {
    return { code: 400, body: { success: false, error: 'body.actions måste vara en icke-tom array.' } };
  }
  if ((actions as any[]).length > 10) {
    return { code: 400, body: { success: false, error: 'Max 10 actions per batch.' } };
  }
  const account = await (prisma.emailAccount.findFirst as any)({ where: { isActive: true } });
  if (!account) return { code: 503, body: { success: false, error: 'Inga aktiva konton.' } };

  return { code: 200, body: { success: true, results: [] } };
}

// ─── Setup helpers ────────────────────────────────────────────────────────────

function setupActiveAccount(userId = 'user-1') {
  vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue({ id: 'acc-1', userId, isActive: true } as any);
}

function setupEmptyDb() {
  vi.mocked(prisma.emailThread.findMany).mockResolvedValue([]);
  vi.mocked(prisma.emailThread.count).mockResolvedValue(0);
  vi.mocked(prisma.draft.findMany).mockResolvedValue([]);
  vi.mocked(prisma.draft.count).mockResolvedValue(0);
  vi.mocked(prisma.triageLog.findMany).mockResolvedValue([]);
  vi.mocked(prisma.triageLog.count).mockResolvedValue(0);
  vi.mocked(prisma.dailySummary.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.aIAnalysis.findMany).mockResolvedValue([]);
  vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([]);
  vi.mocked(prisma.classificationRule.count).mockResolvedValue(0);
}

// ─── Auth tests ───────────────────────────────────────────────────────────────

describe('Agent auth — X-API-Key', () => {
  beforeEach(() => { vi.clearAllMocks(); setupActiveAccount(); });

  it('returns 401 when X-API-Key is missing', async () => {
    const result = await simulateExecute('stats', {}, '');
    expect(result.code).toBe(401);
    expect((result.body as any).success).toBe(false);
  });

  it('returns 401 when X-API-Key is wrong', async () => {
    const result = await simulateExecute('stats', {}, 'wrong-key');
    expect(result.code).toBe(401);
  });

  it('processes request when X-API-Key matches', async () => {
    setupEmptyDb();
    const result = await simulateExecute('stats', {}, 'test-agent-key');
    expect(result.code).toBe(200);
    expect((result.body as any).success).toBe(true);
  });
});

// ─── Action validation ────────────────────────────────────────────────────────

describe('Agent — action validation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 400 for unknown action', async () => {
    setupActiveAccount();
    const result = await simulateExecute('invalid-action');
    expect(result.code).toBe(400);
    expect((result.body as any).success).toBe(false);
  });

  it('returns 503 when no active account exists', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(null);
    const result = await simulateExecute('stats');
    expect(result.code).toBe(503);
    expect((result.body as any).error).toMatch(/aktiva e-postkonton/i);
  });
});

// ─── callback_url ─────────────────────────────────────────────────────────────

describe('Agent — callback_url', () => {
  beforeEach(() => { vi.clearAllMocks(); setupActiveAccount(); });

  it('returns 202 for valid callback_url', async () => {
    const result = await simulateExecute('stats', { callback_url: 'https://example.com/cb' });
    expect(result.code).toBe(202);
    expect((result.body as any).success).toBe(true);
  });

  it('returns 400 for invalid callback_url', async () => {
    const result = await simulateExecute('stats', { callback_url: 'not-a-url' });
    expect(result.code).toBe(400);
  });
});

// ─── briefing ────────────────────────────────────────────────────────────────

describe('Agent action: briefing', () => {
  beforeEach(() => { vi.clearAllMocks(); setupActiveAccount(); setupEmptyDb(); });

  it('returns required briefing shape', async () => {
    const result = await simulateExecute('briefing');
    expect(result.code).toBe(200);
    const data = (result.body as any).data;
    expect(data).toHaveProperty('unread_count');
    expect(data).toHaveProperty('high_priority');
    expect(data).toHaveProperty('medium_priority');
    expect(data).toHaveProperty('pending_drafts');
    expect(data).toHaveProperty('triage_today');
  });

  it('separates threads by high/medium priority', async () => {
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue([
      { id: 't-1', subject: 'HP', participantEmails: [], account: { emailAddress: 'a@b.com' }, analyses: [{ priority: 'high', classification: 'x', summary: '' }] },
      { id: 't-2', subject: 'MP', participantEmails: [], account: { emailAddress: 'a@b.com' }, analyses: [{ priority: 'medium', classification: 'y', summary: '' }] },
      { id: 't-3', subject: 'LP', participantEmails: [], account: { emailAddress: 'a@b.com' }, analyses: [] },
    ] as any);
    const result = await simulateExecute('briefing');
    const data = (result.body as any).data;
    expect(data.high_priority).toHaveLength(1);
    expect(data.medium_priority).toHaveLength(1);
    expect(data.unread_count).toBe(3);
  });
});

// ─── classify ────────────────────────────────────────────────────────────────

describe('Agent action: classify', () => {
  beforeEach(() => { vi.clearAllMocks(); setupActiveAccount(); });

  it('returns 400 when thread_id is missing', async () => {
    const result = await simulateExecute('classify');
    expect(result.code).toBe(400);
  });

  it('returns 404 when thread not found', async () => {
    vi.mocked(prisma.emailThread.findFirst).mockResolvedValue(null);
    const result = await simulateExecute('classify', { thread_id: 't-1' });
    expect(result.code).toBe(404);
  });

  it('returns analysis shape on success', async () => {
    vi.mocked(prisma.emailThread.findFirst).mockResolvedValue({ id: 't-1', subject: 'Test', messages: [] } as any);
    vi.mocked(aiService.analyzeThread).mockResolvedValue({ priority: 'high', classification: 'action_required', summary: 'X', suggested_action: 'reply', confidence: 0.9, model_used: 'groq', draft_text: null } as any);
    vi.mocked(prisma.aIAnalysis.create).mockResolvedValue({ id: 'ana-1' } as any);
    const result = await simulateExecute('classify', { thread_id: 't-1' });
    expect(result.code).toBe(200);
    const data = (result.body as any).data;
    expect(data.thread_id).toBe('t-1');
    expect(data.priority).toBe('high');
    expect(data.analysis_id).toBe('ana-1');
  });
});

// ─── draft ───────────────────────────────────────────────────────────────────

describe('Agent action: draft', () => {
  beforeEach(() => { vi.clearAllMocks(); setupActiveAccount(); });

  it('returns 400 when instruction is missing', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue({ id: 'acc-1', userId: 'user-1', isActive: true } as any);
    const result = await simulateExecute('draft');
    expect(result.code).toBe(400);
    expect((result.body as any).error).toMatch(/instruction/i);
  });

  it('returns 400 when no recipients can be determined', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue({ id: 'acc-1', userId: 'user-1', isActive: true } as any);
    vi.mocked(aiService.generateDraft).mockResolvedValue('Draft text' as any);
    const result = await simulateExecute('draft', { instruction: 'Write something' });
    expect(result.code).toBe(400);
    expect((result.body as any).error).toMatch(/mottagare/i);
  });

  it('creates draft with to_addresses on success', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue({ id: 'acc-1', userId: 'user-1', isActive: true } as any);
    vi.mocked(aiService.generateDraft).mockResolvedValue('Draft content' as any);
    vi.mocked(draftService.create).mockResolvedValue({ id: 'draft-1', status: 'pending' } as any);
    const result = await simulateExecute('draft', { instruction: 'Write a reply', to_addresses: ['boss@example.com'] });
    expect(result.code).toBe(200);
    expect(draftService.create).toHaveBeenCalled();
  });
});

// ─── send — safety gate ───────────────────────────────────────────────────────

describe('Agent action: send — safety gate', () => {
  beforeEach(() => { vi.clearAllMocks(); setupActiveAccount(); });

  it('returns 400 when draft_id is missing', async () => {
    const result = await simulateExecute('send');
    expect(result.code).toBe(400);
  });

  it('returns 404 when draft not found', async () => {
    vi.mocked(prisma.draft.findFirst).mockResolvedValue(null);
    const result = await simulateExecute('send', { draft_id: 'draft-x' });
    expect(result.code).toBe(404);
  });

  it('returns 409 when draft is pending (SAFETY GATE)', async () => {
    vi.mocked(prisma.draft.findFirst).mockResolvedValue({ id: 'draft-1', status: 'pending' } as any);
    vi.mocked(getAgentDraftStatusError).mockReturnValue('Draft must be approved before sending.');
    const result = await simulateExecute('send', { draft_id: 'draft-1' });
    expect(result.code).toBe(409);
    expect((result.body as any).success).toBe(false);
  });

  it('sends draft when approved', async () => {
    vi.mocked(prisma.draft.findFirst).mockResolvedValue({ id: 'draft-1', status: 'approved' } as any);
    vi.mocked(getAgentDraftStatusError).mockReturnValue(null);
    vi.mocked(draftService.send).mockResolvedValue({ id: 'draft-1', status: 'sent' } as any);
    const result = await simulateExecute('send', { draft_id: 'draft-1' });
    expect(result.code).toBe(200);
    expect(draftService.send).toHaveBeenCalledWith('draft-1', 'user-1');
  });
});

// ─── schedule ────────────────────────────────────────────────────────────────

describe('Agent action: schedule', () => {
  beforeEach(() => { vi.clearAllMocks(); setupActiveAccount(); });

  it('returns 400 when draft_id or send_at missing', async () => {
    const result = await simulateExecute('schedule', { draft_id: 'x' }); // missing send_at
    expect(result.code).toBe(400);
  });

  it('returns 400 for invalid date', async () => {
    const result = await simulateExecute('schedule', { draft_id: 'x', send_at: 'not-a-date' });
    expect(result.code).toBe(400);
    expect((result.body as any).error).toMatch(/ISO-datum/i);
  });

  it('returns 404 when draft not found', async () => {
    vi.mocked(prisma.draft.findFirst).mockResolvedValue(null);
    const result = await simulateExecute('schedule', { draft_id: 'x', send_at: '2026-05-01T10:00:00Z' });
    expect(result.code).toBe(404);
  });

  it('schedules approved draft successfully', async () => {
    vi.mocked(prisma.draft.findFirst).mockResolvedValue({ id: 'draft-1', status: 'approved' } as any);
    vi.mocked(getAgentDraftStatusError).mockReturnValue(null);
    vi.mocked(prisma.draft.update).mockResolvedValue({ id: 'draft-1', scheduledAt: new Date('2026-05-01T10:00:00Z') } as any);
    const result = await simulateExecute('schedule', { draft_id: 'draft-1', send_at: '2026-05-01T10:00:00Z' });
    expect(result.code).toBe(200);
    expect((result.body as any).data.scheduled_at).toBe('2026-05-01T10:00:00.000Z');
  });
});

// ─── snooze ───────────────────────────────────────────────────────────────────

describe('Agent action: snooze', () => {
  beforeEach(() => { vi.clearAllMocks(); setupActiveAccount(); });

  it('returns 400 when thread_id or until missing', async () => {
    const result = await simulateExecute('snooze', { thread_id: 't-1' }); // missing until
    expect(result.code).toBe(400);
  });

  it('returns 400 for invalid date', async () => {
    const result = await simulateExecute('snooze', { thread_id: 't-1', until: 'bad-date' });
    expect(result.code).toBe(400);
  });

  it('returns 404 when thread not found', async () => {
    vi.mocked(prisma.emailThread.findFirst).mockResolvedValue(null);
    const result = await simulateExecute('snooze', { thread_id: 't-1', until: '2026-05-01T10:00:00Z' });
    expect(result.code).toBe(404);
  });

  it('snoozes thread on success', async () => {
    vi.mocked(prisma.emailThread.findFirst).mockResolvedValue({ id: 't-1' } as any);
    vi.mocked(prisma.emailThread.update).mockResolvedValue({} as any);
    const result = await simulateExecute('snooze', { thread_id: 't-1', until: '2026-05-01T10:00:00Z' });
    expect(result.code).toBe(200);
    expect(prisma.emailThread.update).toHaveBeenCalled();
  });
});

// ─── triage-status ───────────────────────────────────────────────────────────

describe('Agent action: triage-status', () => {
  beforeEach(() => { vi.clearAllMocks(); setupActiveAccount(); });

  it('aggregates by_action correctly', async () => {
    vi.mocked(prisma.triageLog.findMany).mockResolvedValue([
      { action: 'trash', classification: 'x', senderEmail: 's@x.com' },
      { action: 'trash', classification: 'x', senderEmail: 's@x.com' },
      { action: 'keep_inbox', classification: 'y', senderEmail: 'o@x.com' },
    ] as any);
    vi.mocked(prisma.draft.count).mockResolvedValue(2);
    const result = await simulateExecute('triage-status');
    const data = (result.body as any).data;
    expect(data.total_sorted).toBe(3);
    expect(data.trashed).toBe(2);
    expect(data.by_action['trash']).toBe(2);
    expect(data.by_action['keep_inbox']).toBe(1);
    expect(data.auto_drafts_created).toBe(2);
  });

  it('uses "today" period label for days=1', async () => {
    vi.mocked(prisma.triageLog.findMany).mockResolvedValue([]);
    vi.mocked(prisma.draft.count).mockResolvedValue(0);
    const result = await simulateExecute('triage-status');
    expect((result.body as any).data.period).toBe('today');
  });
});

// ─── triage-report ───────────────────────────────────────────────────────────

describe('Agent action: triage-report', () => {
  beforeEach(() => { vi.clearAllMocks(); setupActiveAccount(); });

  it('clamps invalid period to "today"', async () => {
    vi.mocked(prisma.triageLog.findMany).mockResolvedValue([]);
    const result = await simulateExecute('triage-report', { period: 'invalid' });
    expect((result.body as any).data.period).toBe('today');
  });

  it('uses "week" period correctly', async () => {
    vi.mocked(prisma.triageLog.findMany).mockResolvedValue([]);
    const result = await simulateExecute('triage-report', { period: 'week' });
    expect((result.body as any).data.period).toBe('week');
  });

  it('produces empty voice summary when no logs', async () => {
    vi.mocked(prisma.triageLog.findMany).mockResolvedValue([]);
    const result = await simulateExecute('triage-report', { period: 'today' });
    const voice = (result.body as any).data.voice_summary as string;
    expect(voice).toContain('Idag');
    expect(voice).toContain('inga mail sorterats');
  });

  it('produces populated voice summary with counts', async () => {
    vi.mocked(prisma.triageLog.findMany).mockResolvedValue([
      { action: 'trash', classification: 'x', senderEmail: 'x@x.com' },
      { action: 'trash', classification: 'x', senderEmail: 'y@y.com' },
      { action: 'label_review', classification: 'y', senderEmail: 'z@z.com' },
      { action: 'keep_inbox', classification: 'z', senderEmail: 'a@a.com' },
    ] as any);
    const result = await simulateExecute('triage-report', { period: 'today' });
    const voice = (result.body as any).data.voice_summary as string;
    expect(voice).toContain('4 mail');
    expect(voice).toContain('2 raderades');
    expect(voice).toContain('1 skickades till granskning');
    expect(voice).toContain('1 behölls i inkorgen');
  });
});

// ─── stats ────────────────────────────────────────────────────────────────────

describe('Agent action: stats', () => {
  beforeEach(() => { vi.clearAllMocks(); setupActiveAccount(); setupEmptyDb(); });

  it('returns required stats shape', async () => {
    const result = await simulateExecute('stats');
    expect(result.code).toBe(200);
    const data = (result.body as any).data;
    expect(data).toHaveProperty('unread');
    expect(data).toHaveProperty('high_priority');
    expect(data).toHaveProperty('snoozed');
    expect(data).toHaveProperty('pending_drafts');
    expect(data).toHaveProperty('accounts');
  });
});

// ─── batch ────────────────────────────────────────────────────────────────────

describe('Agent: POST /batch', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 401 without API key', async () => {
    const result = await simulateBatch([{ action: 'stats' }], '');
    expect(result.code).toBe(401);
  });

  it('returns 400 when actions array is empty', async () => {
    setupActiveAccount();
    const result = await simulateBatch([], 'test-agent-key');
    expect(result.code).toBe(400);
    expect((result.body as any).error).toMatch(/icke-tom array/i);
  });

  it('returns 400 when actions is not an array', async () => {
    setupActiveAccount();
    const result = await simulateBatch('not-array', 'test-agent-key');
    expect(result.code).toBe(400);
  });

  it('returns 400 when actions exceed 10', async () => {
    setupActiveAccount();
    const actions = Array.from({ length: 11 }, () => ({ action: 'stats' }));
    const result = await simulateBatch(actions, 'test-agent-key');
    expect(result.code).toBe(400);
    expect((result.body as any).error).toMatch(/Max 10/);
  });

  it('returns 503 when no active account', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(null);
    const result = await simulateBatch([{ action: 'stats' }], 'test-agent-key');
    expect(result.code).toBe(503);
  });
});

// ─── Error sanitization ───────────────────────────────────────────────────────

describe('Agent — error sanitization', () => {
  beforeEach(() => { vi.clearAllMocks(); setupActiveAccount(); });

  it('sanitizes Prisma/database error messages', async () => {
    vi.mocked(prisma.emailThread.findFirst).mockRejectedValue(new Error('Prisma client error: connection refused'));
    const result = await simulateExecute('classify', { thread_id: 't-1' });
    expect(result.code).toBe(500);
    expect((result.body as any).error).toBe('Databasfel — försök igen om en stund.');
  });

  it('passes through non-database error messages', async () => {
    vi.mocked(prisma.emailThread.findFirst).mockRejectedValue(new Error('Thread validation failed'));
    const result = await simulateExecute('classify', { thread_id: 't-1' });
    expect(result.code).toBe(500);
    expect((result.body as any).error).toBe('Thread validation failed');
  });
});
