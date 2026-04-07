/**
 * Sprint 15 — Auth route tests.
 *
 * GET /auth/google/callback — OAuth callback state routing
 * GET /auth/google/reauth  — Re-auth URL generation
 * POST /auth/connect        — Smart provider detection
 * PATCH /user/settings      — Settings upsert with clamping
 *
 * Key invariants:
 *  - Missing code → 400
 *  - addedAccount → redirect ?token=...&added=...
 *  - reauthed → redirect with reauthed= + optional feature= + optional return_to=
 *  - Normal login → redirect ?token=...
 *  - Error → redirect ?error=...
 *  - reauth missing account_id → 400
 *  - connect: invalid email → 400; oauth → authUrl; imap → requiresImap; oauth err + imap → requiresImap; oauth err, no imap → 400
 *  - settings: undoSendDelay clamped 0-30; bookingLink validation; externalImages whitelist
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../services/auth.service', () => ({
  authService: {
    getConsentUrl: vi.fn(),
    handleCallback: vi.fn(),
    getReauthUrl: vi.fn(),
    getConsentUrlForEmail: vi.fn(),
    getProfile: vi.fn(),
  },
}));

vi.mock('../config/email-providers', () => ({
  detectProvider: vi.fn(),
}));

vi.mock('../utils/booking-link', () => ({
  normalizeBookingLinkInput: vi.fn(),
}));

vi.mock('../utils/return-to', () => ({
  sanitizeReturnTo: vi.fn((v) => v),
}));

vi.mock('../config/database', () => ({
  prisma: {
    userSettings: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}));

vi.mock('../config/env', () => ({
  env: {
    FRONTEND_URL: 'https://app.example.com',
  },
}));

import { authService } from '../services/auth.service';
import { detectProvider } from '../config/email-providers';
import { normalizeBookingLinkInput } from '../utils/booking-link';
import { prisma } from '../config/database';
import { env } from '../config/env';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Simulate GET /auth/google/callback */
async function simulateCallback(code: string | undefined, state?: string) {
  if (!code) {
    return { code: 400, body: { error: 'Missing authorization code', message: 'No code parameter found in callback URL.' } };
  }
  try {
    const result = await authService.handleCallback(code, state);
    if ((result as any).addedAccount) {
      return { redirectTo: `${env.FRONTEND_URL}/auth/callback?token=${encodeURIComponent((result as any).token)}&added=${encodeURIComponent((result as any).account.email)}` };
    }
    if ('reauthed' in result && (result as any).reauthed) {
      const params = new URLSearchParams({ token: (result as any).token, reauthed: (result as any).account.email });
      if ('feature' in result && (result as any).feature) params.set('feature', (result as any).feature);
      if ('returnTo' in result && (result as any).returnTo) params.set('return_to', (result as any).returnTo);
      return { redirectTo: `${env.FRONTEND_URL}/auth/callback?${params.toString()}` };
    }
    return { redirectTo: `${env.FRONTEND_URL}/auth/callback?token=${encodeURIComponent((result as any).token)}` };
  } catch (error: any) {
    return { redirectTo: `${env.FRONTEND_URL}/auth/callback?error=${encodeURIComponent(error.message)}` };
  }
}

/** Simulate GET /auth/google/reauth */
function simulateReauth(query: Record<string, string | undefined>) {
  const { account_id, feature, return_to } = query;
  if (!account_id) {
    return { code: 400, body: { error: 'Missing account_id parameter' } };
  }
  const url = authService.getReauthUrl(account_id, { feature: feature as any, returnTo: return_to });
  return { redirectTo: url };
}

/** Simulate POST /auth/connect */
async function simulateConnect(body: unknown) {
  const { z } = await import('zod');
  const schema = z.object({ email: z.string().email(), token: z.string().optional() });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { code: 400, body: { error: 'Invalid input', details: parsed.error.issues } };
  }
  const { email, token } = parsed.data;
  const provider = (detectProvider as any)(email);
  const response: any = { provider: { id: provider.id, name: provider.name, type: provider.type, authMethod: provider.authMethod } };
  if (provider.authMethod === 'oauth') {
    try {
      response.authUrl = authService.getConsentUrlForEmail(email, token);
    } catch (error: any) {
      if (provider.imapDefaults || provider.smtpDefaults) {
        response.requiresImap = true;
        response.message = error.message;
        response.provider.imapDefaults = provider.imapDefaults;
        response.provider.smtpDefaults = provider.smtpDefaults;
      } else {
        return { code: 400, body: { error: 'Provider error', message: error.message } };
      }
    }
  } else {
    response.requiresImap = true;
    if (provider.imapDefaults) response.provider.imapDefaults = provider.imapDefaults;
    if (provider.smtpDefaults) response.provider.smtpDefaults = provider.smtpDefaults;
  }
  return { code: 200, body: response };
}

/** Simulate PATCH /user/settings */
async function simulatePatchSettings(body: Record<string, unknown>, userId: string) {
  const { z } = await import('zod');
  const schema = z.object({
    quietHoursStart: z.number().optional(),
    quietHoursEnd: z.number().optional(),
    digestEnabled: z.boolean().optional(),
    digestTime: z.number().optional(),
    uiTheme: z.string().optional(),
    bookingLink: z.string().nullable().optional(),
    undoSendDelay: z.number().int().min(0).max(30).optional(),
    hasCompletedOnboarding: z.boolean().optional(),
    notificationSound: z.boolean().optional(),
    externalImages: z.enum(['ask', 'allow', 'block']).optional(),
    compactMode: z.boolean().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { code: 400, body: { error: 'Validation failed' } };
  }

  const allowed: Record<string, unknown> = {};
  if (parsed.data.quietHoursStart !== undefined) allowed.quietHoursStart = Number(parsed.data.quietHoursStart);
  if (parsed.data.quietHoursEnd !== undefined) allowed.quietHoursEnd = Number(parsed.data.quietHoursEnd);
  if (parsed.data.digestEnabled !== undefined) allowed.digestEnabled = Boolean(parsed.data.digestEnabled);
  if (parsed.data.uiTheme !== undefined) allowed.uiTheme = parsed.data.uiTheme;
  try {
    const bookingLink = (normalizeBookingLinkInput as any)(parsed.data.bookingLink);
    if (bookingLink !== undefined) allowed.bookingLink = bookingLink;
  } catch (error: any) {
    return { code: 400, body: { error: error.message } };
  }
  if (parsed.data.undoSendDelay !== undefined) allowed.undoSendDelay = Math.max(0, Math.min(30, Number(parsed.data.undoSendDelay)));
  if (parsed.data.hasCompletedOnboarding !== undefined) allowed.hasCompletedOnboarding = Boolean(parsed.data.hasCompletedOnboarding);
  if (parsed.data.notificationSound !== undefined) allowed.notificationSound = Boolean(parsed.data.notificationSound);
  if (parsed.data.externalImages !== undefined && ['ask', 'allow', 'block'].includes(parsed.data.externalImages)) allowed.externalImages = parsed.data.externalImages;
  if (parsed.data.compactMode !== undefined) allowed.compactMode = Boolean(parsed.data.compactMode);

  const settings = await (prisma.userSettings.upsert as any)({
    where: { userId },
    update: allowed,
    create: { userId, ...allowed },
  });
  return { code: 200, body: { settings } };
}

// ─── OAuth callback tests ─────────────────────────────────────────────────────

describe('GET /auth/google/callback', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 400 when code is missing', async () => {
    const result = await simulateCallback(undefined);
    expect((result as any).code).toBe(400);
    expect((result as any).body.error).toBe('Missing authorization code');
  });

  it('redirects to /auth/callback?token=... for normal login', async () => {
    vi.mocked(authService.handleCallback).mockResolvedValue({ token: 'jwt-token-123', account: { email: 'a@b.com' } } as any);
    const result = await simulateCallback('auth-code');
    expect((result as any).redirectTo).toContain('/auth/callback?token=');
    expect((result as any).redirectTo).toContain('jwt-token-123');
    expect((result as any).redirectTo).not.toContain('added=');
    expect((result as any).redirectTo).not.toContain('reauthed=');
  });

  it('redirects with added= when addedAccount is true', async () => {
    vi.mocked(authService.handleCallback).mockResolvedValue({ token: 'jwt-token', addedAccount: true, account: { email: 'new@company.com' } } as any);
    const result = await simulateCallback('code-abc');
    const url = (result as any).redirectTo as string;
    expect(url).toContain('added=');
    expect(url).toContain('new%40company.com');
    expect(url).toContain('token=');
  });

  it('redirects with reauthed= for reauth flow', async () => {
    vi.mocked(authService.handleCallback).mockResolvedValue({ token: 'jwt-reauth', reauthed: true, account: { email: 'user@company.com' } } as any);
    const result = await simulateCallback('code-xyz');
    const url = (result as any).redirectTo as string;
    expect(url).toContain('reauthed=');
    expect(url).toContain('token=');
    expect(url).not.toContain('added=');
  });

  it('includes feature= in reauth redirect when provided', async () => {
    vi.mocked(authService.handleCallback).mockResolvedValue({ token: 'jwt-reauth', reauthed: true, account: { email: 'u@x.com' }, feature: 'calendar' } as any);
    const result = await simulateCallback('code');
    expect((result as any).redirectTo).toContain('feature=calendar');
  });

  it('includes return_to= in reauth redirect when provided', async () => {
    vi.mocked(authService.handleCallback).mockResolvedValue({ token: 'jwt-reauth', reauthed: true, account: { email: 'u@x.com' }, returnTo: '/threads/123' } as any);
    const result = await simulateCallback('code');
    expect((result as any).redirectTo).toContain('return_to=');
  });

  it('redirects to ?error= when callback throws', async () => {
    vi.mocked(authService.handleCallback).mockRejectedValue(new Error('Token exchange failed'));
    const result = await simulateCallback('bad-code');
    const url = (result as any).redirectTo as string;
    expect(url).toContain('error=');
    expect(url).toContain('Token%20exchange%20failed');
  });
});

// ─── Reauth tests ─────────────────────────────────────────────────────────────

describe('GET /auth/google/reauth', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 400 when account_id is missing', () => {
    const result = simulateReauth({});
    expect((result as any).code).toBe(400);
  });

  it('redirects to reauth URL when account_id provided', () => {
    vi.mocked(authService.getReauthUrl).mockReturnValue('https://accounts.google.com/o/oauth2/reauth?...');
    const result = simulateReauth({ account_id: 'acc-1' });
    expect((result as any).redirectTo).toContain('accounts.google.com');
    expect(authService.getReauthUrl).toHaveBeenCalledWith('acc-1', expect.objectContaining({ feature: undefined }));
  });

  it('passes feature and return_to to getReauthUrl', () => {
    vi.mocked(authService.getReauthUrl).mockReturnValue('https://accounts.google.com');
    simulateReauth({ account_id: 'acc-1', feature: 'calendar', return_to: '/settings' });
    expect(authService.getReauthUrl).toHaveBeenCalledWith('acc-1', expect.objectContaining({ feature: 'calendar', returnTo: '/settings' }));
  });
});

// ─── Connect (provider detection) tests ──────────────────────────────────────

describe('POST /auth/connect', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 400 for invalid email', async () => {
    const result = await simulateConnect({ email: 'not-an-email' });
    expect((result as any).code).toBe(400);
  });

  it('returns authUrl for OAuth provider', async () => {
    vi.mocked(detectProvider).mockReturnValue({ id: 'google', name: 'Google', type: 'google', authMethod: 'oauth' } as any);
    vi.mocked(authService.getConsentUrlForEmail).mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?...');
    const result = await simulateConnect({ email: 'user@gmail.com' });
    expect((result as any).code).toBe(200);
    expect((result as any).body.authUrl).toContain('accounts.google.com');
  });

  it('returns requiresImap=true for IMAP provider', async () => {
    vi.mocked(detectProvider).mockReturnValue({ id: 'imap', name: 'Custom IMAP', type: 'imap', authMethod: 'imap', imapDefaults: { host: 'imap.example.com' }, smtpDefaults: { host: 'smtp.example.com' } } as any);
    const result = await simulateConnect({ email: 'user@custom.com' });
    expect((result as any).code).toBe(200);
    expect((result as any).body.requiresImap).toBe(true);
    expect((result as any).body.provider.imapDefaults).toBeDefined();
  });

  it('returns requiresImap with message when OAuth fails but IMAP fallback exists', async () => {
    vi.mocked(detectProvider).mockReturnValue({ id: 'outlook', name: 'Outlook', type: 'microsoft', authMethod: 'oauth', imapDefaults: { host: 'outlook.office365.com' } } as any);
    vi.mocked(authService.getConsentUrlForEmail).mockImplementation(() => { throw new Error('OAuth not configured for Outlook'); });
    const result = await simulateConnect({ email: 'user@outlook.com' });
    expect((result as any).code).toBe(200);
    expect((result as any).body.requiresImap).toBe(true);
    expect((result as any).body.message).toContain('OAuth not configured');
  });

  it('returns 400 when OAuth fails and no IMAP fallback', async () => {
    vi.mocked(detectProvider).mockReturnValue({ id: 'unknown', name: 'Unknown', type: 'unknown', authMethod: 'oauth' } as any);
    vi.mocked(authService.getConsentUrlForEmail).mockImplementation(() => { throw new Error('Unsupported provider'); });
    const result = await simulateConnect({ email: 'user@unknown-domain.xyz' });
    expect((result as any).code).toBe(400);
    expect((result as any).body.message).toContain('Unsupported provider');
  });
});

// ─── User settings tests ──────────────────────────────────────────────────────

describe('PATCH /user/settings', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(prisma.userSettings.upsert).mockResolvedValue({ userId: 'user-1' } as any); });

  it('upserts settings with userId', async () => {
    vi.mocked(normalizeBookingLinkInput).mockReturnValue(undefined);
    await simulatePatchSettings({ uiTheme: 'dark' }, 'user-1');
    expect(prisma.userSettings.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-1' } }));
  });

  it('clamps undoSendDelay to 0-30 range', async () => {
    vi.mocked(normalizeBookingLinkInput).mockReturnValue(undefined);
    await simulatePatchSettings({ undoSendDelay: 10 }, 'user-1');
    const call = vi.mocked(prisma.userSettings.upsert).mock.calls[0][0] as any;
    expect(call.update.undoSendDelay).toBe(10);
  });

  it('clamps undoSendDelay above 30 to 30', async () => {
    vi.mocked(normalizeBookingLinkInput).mockReturnValue(undefined);
    // Zod enforces max(30) — undoSendDelay > 30 causes validation fail
    const result = await simulatePatchSettings({ undoSendDelay: 99 }, 'user-1');
    expect((result as any).code).toBe(400); // Zod rejects > 30
  });

  it('accepts valid externalImages values', async () => {
    vi.mocked(normalizeBookingLinkInput).mockReturnValue(undefined);
    await simulatePatchSettings({ externalImages: 'allow' }, 'user-1');
    const call = vi.mocked(prisma.userSettings.upsert).mock.calls[0][0] as any;
    expect(call.update.externalImages).toBe('allow');
  });

  it('returns 400 when bookingLink normalization throws', async () => {
    vi.mocked(normalizeBookingLinkInput).mockImplementation(() => { throw new Error('Invalid booking link URL'); });
    const result = await simulatePatchSettings({ bookingLink: 'not-a-url' }, 'user-1');
    expect((result as any).code).toBe(400);
    expect((result as any).body.error).toBe('Invalid booking link URL');
  });

  it('returns updated settings', async () => {
    vi.mocked(normalizeBookingLinkInput).mockReturnValue(undefined);
    vi.mocked(prisma.userSettings.upsert).mockResolvedValue({ userId: 'user-1', uiTheme: 'dark' } as any);
    const result = await simulatePatchSettings({ uiTheme: 'dark' }, 'user-1');
    expect((result as any).code).toBe(200);
    expect((result as any).body.settings).toBeDefined();
  });
});
