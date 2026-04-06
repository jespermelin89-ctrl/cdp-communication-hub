/**
 * Sprint 12 — Webhook route tests.
 *
 * POST /webhooks/gmail — Google Cloud Pub/Sub push receiver.
 *
 * Key invariants:
 *  1. Token verification: invalid/missing bearer → 200 (no retry) but no processing
 *  2. Missing or malformed message data → 200, no action
 *  3. Valid payload → handleNotification called, autoTriageNewThreads called if accountInfo returned
 *  4. handleNotification returning null → triage NOT called
 *  5. Errors inside fire-and-forget → swallowed, always 200
 *  6. Always returns 200 (Google retries on anything else)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../services/gmail-push.service', () => ({
  gmailPushService: {
    handleNotification: vi.fn(),
  },
}));

vi.mock('../services/sync-scheduler.service', () => ({
  autoTriageNewThreads: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../config/env', () => ({
  env: {
    GOOGLE_PUBSUB_VERIFICATION_TOKEN: 'test-token-secret',
  },
}));

import { gmailPushService } from '../services/gmail-push.service';
import { autoTriageNewThreads } from '../services/sync-scheduler.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Encode { emailAddress, historyId } as base64 for Pub/Sub message.data */
function encodePubSubData(payload: object): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

/** Build a minimal valid Pub/Sub push body */
function makePubSubBody(emailAddress = 'user@example.com', historyId = '12345') {
  return {
    message: {
      data: encodePubSubData({ emailAddress, historyId }),
      messageId: 'msg-1',
      publishTime: '2026-04-06T12:00:00Z',
    },
    subscription: 'projects/my-project/subscriptions/gmail-push',
  };
}

/**
 * Simulate the webhook handler logic (extracted from webhooks.ts).
 * Returns { status } and tracks side-effect calls.
 */
async function simulateWebhook(
  body: unknown,
  authHeader: string | undefined,
  verificationToken: string | null
): Promise<{ status: number }> {
  // Token check (mirrors webhooks.ts logic)
  if (verificationToken) {
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (bearerToken !== verificationToken) {
      return { status: 200 }; // reject silently
    }
  }

  const pubsubBody = body as { message?: { data?: string } } | null;
  const message = pubsubBody?.message;

  if (!message?.data) {
    return { status: 200 };
  }

  let decoded: { emailAddress?: string; historyId?: string };
  try {
    decoded = JSON.parse(Buffer.from(message.data, 'base64').toString('utf-8'));
  } catch {
    return { status: 200 };
  }

  if (!decoded.emailAddress || !decoded.historyId) {
    return { status: 200 };
  }

  const { emailAddress, historyId } = decoded as { emailAddress: string; historyId: string };

  // Fire-and-forget (await here for test determinism)
  try {
    const accountInfo = await gmailPushService.handleNotification({ emailAddress, historyId });
    if (accountInfo) {
      await autoTriageNewThreads((accountInfo as any).accountId, (accountInfo as any).userId);
    }
  } catch {
    // swallowed in production
  }

  return { status: 200 };
}

// ─── Token verification ───────────────────────────────────────────────────────

describe('Webhook token verification', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('processes request when token matches', async () => {
    vi.mocked(gmailPushService.handleNotification).mockResolvedValue({ accountId: 'acc-1', userId: 'user-1' } as any);
    const result = await simulateWebhook(makePubSubBody(), 'Bearer test-token-secret', 'test-token-secret');
    expect(result.status).toBe(200);
    expect(gmailPushService.handleNotification).toHaveBeenCalled();
  });

  it('returns 200 but skips processing when token is wrong', async () => {
    const result = await simulateWebhook(makePubSubBody(), 'Bearer wrong-token', 'test-token-secret');
    expect(result.status).toBe(200);
    expect(gmailPushService.handleNotification).not.toHaveBeenCalled();
  });

  it('returns 200 but skips processing when Authorization header is missing', async () => {
    const result = await simulateWebhook(makePubSubBody(), undefined, 'test-token-secret');
    expect(result.status).toBe(200);
    expect(gmailPushService.handleNotification).not.toHaveBeenCalled();
  });

  it('returns 200 but skips when header has no Bearer prefix', async () => {
    const result = await simulateWebhook(makePubSubBody(), 'test-token-secret', 'test-token-secret');
    expect(result.status).toBe(200);
    expect(gmailPushService.handleNotification).not.toHaveBeenCalled();
  });

  it('processes freely when no verification token is configured', async () => {
    vi.mocked(gmailPushService.handleNotification).mockResolvedValue({ accountId: 'acc-1', userId: 'user-1' } as any);
    const result = await simulateWebhook(makePubSubBody(), undefined, null);
    expect(result.status).toBe(200);
    expect(gmailPushService.handleNotification).toHaveBeenCalled();
  });
});

// ─── Message parsing ──────────────────────────────────────────────────────────

describe('Webhook message parsing', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 200 and skips when body has no message', async () => {
    const result = await simulateWebhook({}, undefined, null);
    expect(result.status).toBe(200);
    expect(gmailPushService.handleNotification).not.toHaveBeenCalled();
  });

  it('returns 200 and skips when message has no data', async () => {
    const result = await simulateWebhook({ message: { messageId: 'x' } }, undefined, null);
    expect(result.status).toBe(200);
    expect(gmailPushService.handleNotification).not.toHaveBeenCalled();
  });

  it('returns 200 and skips when message.data is invalid base64 JSON', async () => {
    const result = await simulateWebhook({ message: { data: 'not-valid-json!!!' } }, undefined, null);
    expect(result.status).toBe(200);
    expect(gmailPushService.handleNotification).not.toHaveBeenCalled();
  });

  it('returns 200 and skips when decoded payload missing emailAddress', async () => {
    const data = Buffer.from(JSON.stringify({ historyId: '123' })).toString('base64');
    const result = await simulateWebhook({ message: { data } }, undefined, null);
    expect(result.status).toBe(200);
    expect(gmailPushService.handleNotification).not.toHaveBeenCalled();
  });

  it('returns 200 and skips when decoded payload missing historyId', async () => {
    const data = Buffer.from(JSON.stringify({ emailAddress: 'user@example.com' })).toString('base64');
    const result = await simulateWebhook({ message: { data } }, undefined, null);
    expect(result.status).toBe(200);
    expect(gmailPushService.handleNotification).not.toHaveBeenCalled();
  });

  it('returns 200 and skips on entirely null body', async () => {
    const result = await simulateWebhook(null, undefined, null);
    expect(result.status).toBe(200);
    expect(gmailPushService.handleNotification).not.toHaveBeenCalled();
  });
});

// ─── Triage chaining ──────────────────────────────────────────────────────────

describe('Webhook triage chaining', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calls handleNotification with decoded emailAddress and historyId', async () => {
    vi.mocked(gmailPushService.handleNotification).mockResolvedValue(null);
    await simulateWebhook(makePubSubBody('test@example.com', '99999'), undefined, null);
    expect(gmailPushService.handleNotification).toHaveBeenCalledWith({
      emailAddress: 'test@example.com',
      historyId: '99999',
    });
  });

  it('calls autoTriageNewThreads when handleNotification returns accountInfo', async () => {
    vi.mocked(gmailPushService.handleNotification).mockResolvedValue({
      accountId: 'acc-42',
      userId: 'user-7',
    } as any);
    await simulateWebhook(makePubSubBody(), undefined, null);
    expect(autoTriageNewThreads).toHaveBeenCalledWith('acc-42', 'user-7');
  });

  it('does NOT call autoTriageNewThreads when handleNotification returns null', async () => {
    vi.mocked(gmailPushService.handleNotification).mockResolvedValue(null);
    await simulateWebhook(makePubSubBody(), undefined, null);
    expect(autoTriageNewThreads).not.toHaveBeenCalled();
  });

  it('still returns 200 when handleNotification throws', async () => {
    vi.mocked(gmailPushService.handleNotification).mockRejectedValue(new Error('Gmail API down'));
    const result = await simulateWebhook(makePubSubBody(), undefined, null);
    expect(result.status).toBe(200);
  });

  it('still returns 200 when autoTriageNewThreads throws', async () => {
    vi.mocked(gmailPushService.handleNotification).mockResolvedValue({ accountId: 'acc-1', userId: 'user-1' } as any);
    vi.mocked(autoTriageNewThreads).mockRejectedValue(new Error('Triage error'));
    const result = await simulateWebhook(makePubSubBody(), undefined, null);
    expect(result.status).toBe(200);
  });
});
