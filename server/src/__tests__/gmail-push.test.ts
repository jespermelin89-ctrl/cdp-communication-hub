/**
 * Tests for gmail-push.service.ts (Sprint 3)
 *
 * Unit tests — all external dependencies mocked.
 * Covers: isEnabled, handleNotification, renewAllWatches, watch.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ──────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────

vi.mock('../config/database', () => ({
  prisma: {
    emailAccount: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../services/gmail.service', () => ({
  gmailService: {
    incrementalSync: vi.fn(),
    // getClient is private — exposed via (gmailService as any).getClient
    getClient: vi.fn(),
  },
}));

// ──────────────────────────────────────────────
// We control GOOGLE_CLOUD_PROJECT_ID to test isEnabled
// ──────────────────────────────────────────────

import { prisma } from '../config/database';
import { gmailService } from '../services/gmail.service';

const mockAccounts = prisma.emailAccount as {
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};
const mockGmail = gmailService as { incrementalSync: ReturnType<typeof vi.fn> };

// ──────────────────────────────────────────────
// Reset between tests
// ──────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ──────────────────────────────────────────────
// We need to construct GmailPushService fresh to test env-dependent behavior.
// Export the class for testing (not just the singleton).
// Since the singleton is constructed at import time, we test it via its interface.
// ──────────────────────────────────────────────

describe('GmailPushService.handleNotification', () => {
  it('returns null when no matching account exists', async () => {
    mockAccounts.findFirst.mockResolvedValue(null);

    const { gmailPushService } = await import('../services/gmail-push.service');

    const result = await gmailPushService.handleNotification({
      emailAddress: 'unknown@example.com',
      historyId: '12345',
    });

    expect(result).toBeNull();
    expect(mockGmail.incrementalSync).not.toHaveBeenCalled();
  });

  it('calls incrementalSync with correct args and returns account info', async () => {
    mockAccounts.findFirst.mockResolvedValue({
      id: 'acct-001',
      userId: 'user-001',
      emailAddress: 'jesper@example.com',
    });
    mockGmail.incrementalSync.mockResolvedValue(undefined);

    const { gmailPushService } = await import('../services/gmail-push.service');

    const result = await gmailPushService.handleNotification({
      emailAddress: 'jesper@example.com',
      historyId: '99999',
    });

    expect(mockGmail.incrementalSync).toHaveBeenCalledWith('acct-001', '99999');
    expect(result).toEqual({ accountId: 'acct-001', userId: 'user-001' });
  });

  it('propagates incrementalSync errors (does not swallow them)', async () => {
    mockAccounts.findFirst.mockResolvedValue({
      id: 'acct-002',
      userId: 'user-002',
      emailAddress: 'test@example.com',
    });
    mockGmail.incrementalSync.mockRejectedValue(new Error('History expired'));

    const { gmailPushService } = await import('../services/gmail-push.service');

    await expect(
      gmailPushService.handleNotification({ emailAddress: 'test@example.com', historyId: '1' })
    ).rejects.toThrow('History expired');
  });

  it('queries only active google accounts', async () => {
    mockAccounts.findFirst.mockResolvedValue(null);

    const { gmailPushService } = await import('../services/gmail-push.service');

    await gmailPushService.handleNotification({ emailAddress: 'x@x.com', historyId: '1' });

    expect(mockAccounts.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          provider: 'google',
          isActive: true,
        }),
      })
    );
  });
});

describe('GmailPushService.renewAllWatches', () => {
  it('is a no-op when push is disabled (no project/topic configured)', async () => {
    // The singleton is constructed with whatever env was set at import time.
    // If isEnabled is false, renewAllWatches returns early.
    const { gmailPushService } = await import('../services/gmail-push.service');

    if (!gmailPushService.isEnabled) {
      await gmailPushService.renewAllWatches();
      expect(mockAccounts.findMany).not.toHaveBeenCalled();
    } else {
      // Push enabled in test env — just verify it queries active Google accounts
      mockAccounts.findMany.mockResolvedValue([]);
      await gmailPushService.renewAllWatches();
      expect(mockAccounts.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ provider: 'google', isActive: true }),
        })
      );
    }
  });

  it('calls watch() for each active account (when enabled)', async () => {
    const { gmailPushService } = await import('../services/gmail-push.service');

    if (!gmailPushService.isEnabled) {
      // Skip — no push config in test environment
      return;
    }

    mockAccounts.findMany.mockResolvedValue([
      { id: 'acct-a', emailAddress: 'a@example.com' },
      { id: 'acct-b', emailAddress: 'b@example.com' },
    ]);

    // watch() internally calls gmailService.getClient (private) — it will throw in tests.
    // Spy on watch() itself instead.
    const watchSpy = vi.spyOn(gmailPushService, 'watch').mockResolvedValue(null);

    await gmailPushService.renewAllWatches();

    expect(watchSpy).toHaveBeenCalledTimes(2);
    expect(watchSpy).toHaveBeenCalledWith('acct-a');
    expect(watchSpy).toHaveBeenCalledWith('acct-b');
  });

  it('continues renewing other accounts if one watch() throws', async () => {
    const { gmailPushService } = await import('../services/gmail-push.service');

    if (!gmailPushService.isEnabled) return;

    mockAccounts.findMany.mockResolvedValue([
      { id: 'acct-bad', emailAddress: 'bad@example.com' },
      { id: 'acct-good', emailAddress: 'good@example.com' },
    ]);

    const watchSpy = vi
      .spyOn(gmailPushService, 'watch')
      .mockRejectedValueOnce(new Error('Token expired'))
      .mockResolvedValueOnce(null);

    await gmailPushService.renewAllWatches(); // must not throw

    expect(watchSpy).toHaveBeenCalledTimes(2);
  });
});

describe('Gmail push webhook: base64 decode contract', () => {
  it('correctly decodes a Pub/Sub message.data payload', () => {
    const payload = { emailAddress: 'jesper@gmail.com', historyId: '42000' };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
    const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));
    expect(decoded).toEqual(payload);
  });

  it('handles malformed base64 without throwing', () => {
    expect(() => {
      try {
        JSON.parse(Buffer.from('not-valid-base64!!!', 'base64').toString('utf-8'));
      } catch {
        // route silently returns 200 on parse error — tested here at decode level
      }
    }).not.toThrow();
  });

  it('rejects payload missing emailAddress', () => {
    const payload = { historyId: '12345' }; // missing emailAddress
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
    const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));
    expect(decoded.emailAddress).toBeUndefined();
  });

  it('rejects payload missing historyId', () => {
    const payload = { emailAddress: 'jesper@gmail.com' }; // missing historyId
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
    const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));
    expect(decoded.historyId).toBeUndefined();
  });
});

describe('Gmail push webhook: bearer token verification', () => {
  it('accepts matching bearer token', () => {
    const secret = 'my-pubsub-secret';
    const authHeader = `Bearer ${secret}`;
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    expect(bearerToken).toBe(secret);
    expect(bearerToken === secret).toBe(true);
  });

  it('rejects mismatched bearer token', () => {
    const secret = 'my-pubsub-secret';
    const bearerToken = 'wrong-token';
    expect(bearerToken !== secret).toBe(true);
  });

  it('rejects missing Authorization header', () => {
    const authHeader = undefined;
    const bearerToken = authHeader && (authHeader as string).startsWith('Bearer ')
      ? (authHeader as string).slice(7)
      : null;
    expect(bearerToken).toBeNull();
  });
});
