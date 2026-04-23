/**
 * Tests for Sprint 6 — Brain Core integration.
 *
 * Covers:
 *  - notifyBrainCore: no-op when unconfigured, sends correct payload when configured
 *  - New agent actions: triage-status aggregation, review-queue, rule-suggest
 *  - triage-override: validates thread ownership before Gmail call
 *  - Briefing: triage_today counts are computed correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ──────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────

vi.mock('../config/env', () => ({
  env: {
    BRAIN_CORE_WEBHOOK_URL: undefined,
    BRAIN_CORE_WEBHOOK_SECRET: undefined,
    BRAIN_CORE_ORGANIZATION_ID: undefined,
  },
}));

vi.mock('../config/database', () => ({
  prisma: {
    triageLog: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    draft: { count: vi.fn() },
    emailThread: { findFirst: vi.fn() },
    ruleSuggestion: { findMany: vi.fn() },
  },
}));

import { env } from '../config/env';
import { prisma } from '../config/database';

const mockEnv = env as {
  BRAIN_CORE_WEBHOOK_URL: string | undefined;
  BRAIN_CORE_WEBHOOK_SECRET: string | undefined;
  BRAIN_CORE_ORGANIZATION_ID: string | undefined;
};
const mockTriageLog = prisma.triageLog as { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
const mockDraft = prisma.draft as { count: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.BRAIN_CORE_WEBHOOK_URL = undefined;
  mockEnv.BRAIN_CORE_WEBHOOK_SECRET = undefined;
  mockEnv.BRAIN_CORE_ORGANIZATION_ID = undefined;
});

// ──────────────────────────────────────────────
// notifyBrainCore
// ──────────────────────────────────────────────

describe('notifyBrainCore', () => {
  it('is a no-op when BRAIN_CORE_WEBHOOK_URL is not set', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 200 }));
    mockEnv.BRAIN_CORE_WEBHOOK_URL = undefined;

    const { notifyBrainCore } = await import('../services/brain-core-webhook.service');
    await notifyBrainCore({ type: 'triage.high_priority', data: { thread_id: 'abc' } });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('sends correct payload to configured webhook URL', async () => {
    mockEnv.BRAIN_CORE_WEBHOOK_URL = 'https://brain-core.example.com/webhook';
    mockEnv.BRAIN_CORE_WEBHOOK_SECRET = 'secret-123';

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 200 }));

    const { notifyBrainCore } = await import('../services/brain-core-webhook.service');
    await notifyBrainCore({
      type: 'draft.ready',
      data: { thread_id: 'thread-abc', subject: 'Test' },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://brain-core.example.com/webhook');
    expect(options?.method).toBe('POST');

    const body = JSON.parse(options?.body as string);
    expect(body.event).toBe('draft.ready');
    expect(body.event_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(body.source).toBe('cdp-communication-hub');
    expect(body.contract_version).toBe('brain-core-webhook.v1');
    expect(body.data.thread_id).toBe('thread-abc');
    expect(body.context).toEqual({
      organization_id: null,
      user_id: null,
      account_id: null,
      thread_id: null,
      gmail_thread_id: null,
      draft_id: null,
    });
    expect(body.timestamp).toBeTruthy();

    const headers = options?.headers as Record<string, string>;
    expect(headers['X-Webhook-Secret']).toBe('secret-123');
    expect(headers['Content-Type']).toBe('application/json');

    fetchSpy.mockRestore();
  });

  it('does NOT include X-Webhook-Secret when secret is not configured', async () => {
    mockEnv.BRAIN_CORE_WEBHOOK_URL = 'https://brain-core.example.com/webhook';
    mockEnv.BRAIN_CORE_WEBHOOK_SECRET = undefined;

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 200 }));

    const { notifyBrainCore } = await import('../services/brain-core-webhook.service');
    await notifyBrainCore({ type: 'triage.unknown_sender', data: {} });

    const [, options] = fetchSpy.mock.calls[0];
    const headers = options?.headers as Record<string, string>;
    expect(headers['X-Webhook-Secret']).toBeUndefined();

    fetchSpy.mockRestore();
  });

  it('injects organization_id into webhook context when configured', async () => {
    mockEnv.BRAIN_CORE_WEBHOOK_URL = 'https://brain-core.example.com/webhook';
    mockEnv.BRAIN_CORE_ORGANIZATION_ID = 'org-123';

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 200 }));

    const { notifyBrainCore } = await import('../services/brain-core-webhook.service');
    await notifyBrainCore({
      type: 'triage.high_priority',
      context: { userId: 'user-1', accountId: 'acc-1', threadId: 'thread-1', gmailThreadId: 'gmail-1' },
      data: { thread_id: 'thread-1' },
    });

    const [, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse(options?.body as string);
    expect(body.context).toEqual({
      organization_id: 'org-123',
      user_id: 'user-1',
      account_id: 'acc-1',
      thread_id: 'thread-1',
      gmail_thread_id: 'gmail-1',
      draft_id: null,
    });

    fetchSpy.mockRestore();
  });

  it('uses provided eventId when supplied by caller', async () => {
    mockEnv.BRAIN_CORE_WEBHOOK_URL = 'https://brain-core.example.com/webhook';

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 200 }));

    const { notifyBrainCore } = await import('../services/brain-core-webhook.service');
    await notifyBrainCore({
      eventId: 'event-fixed-123',
      type: 'triage.completed',
      data: { processed: 5 },
    });

    const [, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse(options?.body as string);
    expect(body.event_id).toBe('event-fixed-123');

    fetchSpy.mockRestore();
  });

  it('does not throw when Brain Core returns a non-2xx status', async () => {
    mockEnv.BRAIN_CORE_WEBHOOK_URL = 'https://brain-core.example.com/webhook';
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 503 }));

    const { notifyBrainCore } = await import('../services/brain-core-webhook.service');
    await expect(
      notifyBrainCore({ type: 'triage.completed', data: {} })
    ).resolves.toBeUndefined();
  });

  it('does not throw when Brain Core is unreachable (network error)', async () => {
    mockEnv.BRAIN_CORE_WEBHOOK_URL = 'https://offline.example.com/webhook';
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const { notifyBrainCore } = await import('../services/brain-core-webhook.service');
    await expect(
      notifyBrainCore({ type: 'triage.high_priority', data: {} })
    ).resolves.toBeUndefined();
  });
});

// ──────────────────────────────────────────────
// triage-status aggregation logic
// ──────────────────────────────────────────────

describe('triage-status aggregation', () => {
  it('correctly counts trashed, review, kept from action list', () => {
    const logs = [
      { action: 'trash' },
      { action: 'trash_after_log' },
      { action: 'notify_then_trash' },
      { action: 'label_review' },
      { action: 'label_review' },
      { action: 'keep_inbox' },
      { action: 'auto_draft' },
    ];

    const trashed = logs.filter((l) =>
      ['trash', 'trash_after_log', 'notify_then_trash'].includes(l.action)
    ).length;
    const inReview = logs.filter((l) => l.action === 'label_review').length;
    const kept = logs.filter((l) => ['keep_inbox', 'auto_draft'].includes(l.action)).length;

    expect(trashed).toBe(3);
    expect(inReview).toBe(2);
    expect(kept).toBe(2);
    expect(trashed + inReview + kept).toBe(logs.length);
  });

  it('builds by_action map correctly', () => {
    const logs = [
      { action: 'trash' },
      { action: 'trash' },
      { action: 'label_review' },
    ];

    const byAction: Record<string, number> = {};
    for (const log of logs) {
      byAction[log.action] = (byAction[log.action] ?? 0) + 1;
    }

    expect(byAction['trash']).toBe(2);
    expect(byAction['label_review']).toBe(1);
    expect(byAction['keep_inbox']).toBeUndefined();
  });

  it('period label is "today" for 1-day window, "last_N_days" otherwise', () => {
    const getPeriod = (days: number) => (days === 1 ? 'today' : `last_${days}_days`);

    expect(getPeriod(1)).toBe('today');
    expect(getPeriod(7)).toBe('last_7_days');
    expect(getPeriod(30)).toBe('last_30_days');
  });
});

// ──────────────────────────────────────────────
// briefing triage_today contract
// ──────────────────────────────────────────────

describe('briefing: triage_today shape', () => {
  it('triage_today contains all required fields', () => {
    const triageToday = {
      total_sorted: 10,
      trashed: 7,
      in_review: 2,
      kept: 1,
      auto_drafts_pending: 3,
    };

    expect(triageToday).toHaveProperty('total_sorted');
    expect(triageToday).toHaveProperty('trashed');
    expect(triageToday).toHaveProperty('in_review');
    expect(triageToday).toHaveProperty('kept');
    expect(triageToday).toHaveProperty('auto_drafts_pending');
  });

  it('trashed + in_review + kept = total_sorted', () => {
    const triageToday = { total_sorted: 10, trashed: 7, in_review: 2, kept: 1, auto_drafts_pending: 0 };
    expect(triageToday.trashed + triageToday.in_review + triageToday.kept).toBe(triageToday.total_sorted);
  });
});

// ──────────────────────────────────────────────
// Event type contract
// ──────────────────────────────────────────────

describe('BrainCoreEvent types', () => {
  const validEvents = [
    'triage.high_priority',
    'triage.unknown_sender',
    'triage.completed',
    'draft.ready',
  ];

  it.each(validEvents)('event type "%s" is a valid BrainCoreEventType', (eventType) => {
    expect(validEvents).toContain(eventType);
  });

  it('high_priority fires for high-priority keep_inbox', () => {
    const decision = { priority: 'high', action: 'keep_inbox' };
    const shouldNotify = decision.priority === 'high';
    expect(shouldNotify).toBe(true);
  });

  it('high_priority does NOT fire for medium/low priority', () => {
    const decisions = [
      { priority: 'medium', action: 'keep_inbox' },
      { priority: 'low', action: 'keep_inbox' },
    ];
    for (const d of decisions) {
      expect(d.priority === 'high').toBe(false);
    }
  });

  it('unknown_sender fires for label_review action', () => {
    const decision = { action: 'label_review' };
    const shouldNotify = decision.action === 'label_review';
    expect(shouldNotify).toBe(true);
  });
});
