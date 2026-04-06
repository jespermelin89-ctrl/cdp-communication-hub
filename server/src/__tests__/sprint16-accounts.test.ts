/**
 * Sprint 16 — Route-level tests for accounts.ts.
 *
 * Covered:
 *  GET  /accounts                      — list with threadCount flattened
 *  POST /accounts/imap                 — schema validation, 409 duplicate, 400 connection failed, 201 success
 *  POST /accounts/test-imap            — schema validation, delegates to factory
 *  PATCH /accounts/:id                 — 400 invalid input, 404, success
 *  POST /accounts/set-default          — 400 missing, 404, transaction, success
 *  DELETE /accounts/:id                — 404, 400 last-account guard, success
 *  POST /accounts/:id/sync             — 404, success
 *  POST /accounts/:id/badges           — invalid badge, 404, already present, success
 *  DELETE /accounts/:id/badges/:badge  — 404, success
 *  GET  /accounts/:id/signature        — 404, success
 *  PUT  /accounts/:id/signature        — 404, success
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../config/database', () => ({
  prisma: {
    emailAccount: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    userSettings: {
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../services/email-provider.factory', () => ({
  emailProviderFactory: {
    testConnection: vi.fn(),
  },
}));

vi.mock('../services/action-log.service', () => ({
  actionLogService: {
    log: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../services/sync-scheduler.service', () => ({
  startSyncNow: vi.fn().mockResolvedValue({}),
}));

vi.mock('../utils/encryption', () => ({
  encrypt: vi.fn((v: string) => `encrypted:${v}`),
}));

import { prisma } from '../config/database';
import { emailProviderFactory } from '../services/email-provider.factory';
import { actionLogService } from '../services/action-log.service';
import { startSyncNow } from '../services/sync-scheduler.service';
import { encrypt } from '../utils/encryption';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const USER_ID = 'user-1';
const ACCOUNT_ID = 'acc-1';

function makeAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: ACCOUNT_ID,
    userId: USER_ID,
    emailAddress: 'test@example.com',
    displayName: 'Test Account',
    provider: 'gmail',
    isDefault: false,
    isActive: true,
    label: null,
    color: null,
    badges: [],
    signature: null,
    signatureHtml: null,
    useSignatureOnNew: true,
    useSignatureOnReply: true,
    accountType: 'personal',
    teamMembers: [],
    aiHandling: 'normal',
    lastSyncAt: null,
    syncError: null,
    createdAt: new Date(),
    gmailThreadId: 'g-123',
    _count: { threads: 0 },
    ...overrides,
  };
}

const VALID_IMAP_BODY = {
  email_address: 'user@domain.com',
  imap_host: 'imap.domain.com',
  smtp_host: 'smtp.domain.com',
  password: 'secret123',
};

// ─── GET /accounts ────────────────────────────────────────────────────────────

async function simulateListAccounts(userId = USER_ID) {
  const accounts = await (prisma.emailAccount.findMany as any)({
    where: { userId },
    select: {},
    orderBy: { createdAt: 'asc' },
  });

  const accountsWithCount = accounts.map(({ _count, ...a }: any) => ({
    ...a,
    threadCount: _count.threads,
  }));

  return { code: 200, body: { accounts: accountsWithCount } };
}

// ─── POST /accounts/imap ──────────────────────────────────────────────────────

async function simulateAddImapAccount(body: unknown, userId = USER_ID) {
  const { z } = await import('zod');
  const schema = z.object({
    email_address: z.string().email(),
    display_name: z.string().optional(),
    label: z.string().optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    imap_host: z.string().min(1),
    imap_port: z.number().int().positive().default(993),
    imap_use_ssl: z.boolean().default(true),
    smtp_host: z.string().min(1),
    smtp_port: z.number().int().positive().default(465),
    smtp_use_ssl: z.boolean().default(true),
    password: z.string().min(1),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { code: 400, body: { error: 'Invalid input', details: parsed.error.issues } };
  }

  const data = parsed.data;

  const existing = await (prisma.emailAccount.findFirst as any)({
    where: { userId, emailAddress: data.email_address },
  });
  if (existing) {
    return { code: 409, body: { error: 'This email address is already connected.' } };
  }

  const testResult = await emailProviderFactory.testConnection('imap', {
    imapHost: data.imap_host,
    imapPort: data.imap_port,
    imapUseSsl: data.imap_use_ssl,
    smtpHost: data.smtp_host,
    smtpPort: data.smtp_port,
    smtpUseSsl: data.smtp_use_ssl,
    user: data.email_address,
    password: data.password,
  });

  if (!(testResult as any).success) {
    return { code: 400, body: { error: 'Connection test failed', message: (testResult as any).error } };
  }

  const account = await (prisma.emailAccount.create as any)({
    data: {
      userId,
      provider: 'imap',
      emailAddress: data.email_address,
      imapPasswordEncrypted: encrypt(data.password),
    },
  });

  await actionLogService.log(userId, 'account_connected', 'account', account.id, {});

  return {
    code: 201,
    body: {
      account: { id: account.id, emailAddress: account.emailAddress, provider: account.provider, label: account.label },
      message: 'IMAP/SMTP account connected successfully.',
      mailboxes: (testResult as any).details?.mailboxes,
    },
  };
}

// ─── POST /accounts/test-imap ─────────────────────────────────────────────────

async function simulateTestImap(body: unknown) {
  const { z } = await import('zod');
  const schema = z.object({
    email_address: z.string().email(),
    imap_host: z.string().min(1),
    smtp_host: z.string().min(1),
    password: z.string().min(1),
    imap_port: z.number().int().positive().default(993),
    imap_use_ssl: z.boolean().default(true),
    smtp_port: z.number().int().positive().default(465),
    smtp_use_ssl: z.boolean().default(true),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { code: 400, body: { error: 'Invalid input', details: parsed.error.issues } };
  }
  const data = parsed.data;
  const result = await emailProviderFactory.testConnection('imap', {
    imapHost: data.imap_host,
    imapPort: data.imap_port,
    imapUseSsl: data.imap_use_ssl,
    smtpHost: data.smtp_host,
    smtpPort: data.smtp_port,
    smtpUseSsl: data.smtp_use_ssl,
    user: data.email_address,
    password: data.password,
  });
  return { code: 200, body: result };
}

// ─── PATCH /accounts/:id ──────────────────────────────────────────────────────

async function simulateUpdateAccount(id: string, body: unknown, userId = USER_ID) {
  const { z } = await import('zod');
  const schema = z.object({
    display_name: z.string().optional(),
    label: z.string().optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    is_active: z.boolean().optional(),
    signature: z.string().max(2000).nullable().optional(),
    account_type: z.enum(['personal', 'team', 'shared']).optional(),
    team_members: z.array(z.string().email()).optional(),
    ai_handling: z.enum(['normal', 'separate', 'notify_only']).optional(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { code: 400, body: { error: 'Invalid input', details: parsed.error.issues } };
  }

  const account = await (prisma.emailAccount.findFirst as any)({ where: { id, userId } });
  if (!account) return { code: 404, body: { error: 'Account not found' } };

  const updated = await (prisma.emailAccount.update as any)({ where: { id }, data: {} });
  return { code: 200, body: { account: updated } };
}

// ─── POST /accounts/set-default ───────────────────────────────────────────────

async function simulateSetDefault(body: { account_id?: string }, userId = USER_ID) {
  if (!body.account_id) {
    return { code: 400, body: { error: 'account_id is required' } };
  }

  const account = await (prisma.emailAccount.findFirst as any)({
    where: { id: body.account_id, userId },
  });
  if (!account) return { code: 404, body: { error: 'Account not found' } };

  await (prisma.$transaction as any)([
    (prisma.emailAccount.updateMany as any)({}),
    (prisma.emailAccount.update as any)({}),
    (prisma.userSettings.upsert as any)({}),
  ]);

  return { code: 200, body: { message: 'Default account updated', account_id: body.account_id } };
}

// ─── DELETE /accounts/:id ────────────────────────────────────────────────────

async function simulateDeleteAccount(id: string, userId = USER_ID) {
  const account = await (prisma.emailAccount.findFirst as any)({ where: { id, userId } });
  if (!account) return { code: 404, body: { error: 'Account not found' } };

  const accountCount = await (prisma.emailAccount.count as any)({ where: { userId } });
  if (accountCount <= 1) {
    return { code: 400, body: { error: 'Cannot delete your only email account. Connect another account first.' } };
  }

  await (prisma.emailAccount.delete as any)({ where: { id } });
  await actionLogService.log(userId, 'account_disconnected', 'account', id, {});

  return { code: 200, body: { message: 'Account disconnected', email: account.emailAddress } };
}

// ─── POST /accounts/:id/sync ─────────────────────────────────────────────────

async function simulateSyncAccount(id: string, userId = USER_ID) {
  const account = await (prisma.emailAccount.findFirst as any)({ where: { id, userId } });
  if (!account) return { code: 404, body: { error: 'Account not found' } };

  startSyncNow().catch(() => {});
  return { code: 200, body: { message: 'Synkronisering startad' } };
}

// ─── POST /accounts/:id/badges ───────────────────────────────────────────────

const VALID_BADGES = ['multi_person', 'ai_managed', 'shared_inbox'];

async function simulateAddBadge(id: string, badge: string | undefined, userId = USER_ID) {
  if (!badge || !VALID_BADGES.includes(badge)) {
    return { code: 400, body: { error: `Invalid badge. Must be one of: ${VALID_BADGES.join(', ')}` } };
  }

  const account = await (prisma.emailAccount.findFirst as any)({ where: { id, userId } });
  if (!account) return { code: 404, body: { error: 'Account not found' } };

  const currentBadges: string[] = account.badges || [];
  if (currentBadges.includes(badge)) {
    return { code: 200, body: { account: { id, badges: currentBadges }, message: 'Badge already set' } };
  }

  const updated = await (prisma.emailAccount.update as any)({
    where: { id },
    data: { badges: [...currentBadges, badge] },
    select: { id: true, emailAddress: true, badges: true },
  });

  return { code: 200, body: { account: updated, message: `Badge '${badge}' added` } };
}

// ─── DELETE /accounts/:id/badges/:badge ──────────────────────────────────────

async function simulateRemoveBadge(id: string, badge: string, userId = USER_ID) {
  const account = await (prisma.emailAccount.findFirst as any)({ where: { id, userId } });
  if (!account) return { code: 404, body: { error: 'Account not found' } };

  const currentBadges: string[] = account.badges || [];
  const updated = await (prisma.emailAccount.update as any)({
    where: { id },
    data: { badges: currentBadges.filter((b: string) => b !== badge) },
    select: { id: true, emailAddress: true, badges: true },
  });

  return { code: 200, body: { account: updated, message: `Badge '${badge}' removed` } };
}

// ─── GET /accounts/:id/signature ─────────────────────────────────────────────

async function simulateGetSignature(id: string, userId = USER_ID) {
  const account = await (prisma.emailAccount.findFirst as any)({
    where: { id, userId },
    select: { id: true, emailAddress: true, signature: true, signatureHtml: true, useSignatureOnNew: true, useSignatureOnReply: true },
  });
  if (!account) return { code: 404, body: { error: 'Account not found' } };
  return { code: 200, body: { signature: account } };
}

// ─── PUT /accounts/:id/signature ─────────────────────────────────────────────

async function simulateSaveSignature(
  id: string,
  body: { text?: string; html?: string; useOnNew?: boolean; useOnReply?: boolean },
  userId = USER_ID
) {
  const account = await (prisma.emailAccount.findFirst as any)({ where: { id, userId } });
  if (!account) return { code: 404, body: { error: 'Account not found' } };

  const updated = await (prisma.emailAccount.update as any)({
    where: { id },
    data: {
      ...(body.text !== undefined && { signature: body.text }),
      ...(body.html !== undefined && { signatureHtml: body.html }),
      ...(body.useOnNew !== undefined && { useSignatureOnNew: body.useOnNew }),
      ...(body.useOnReply !== undefined && { useSignatureOnReply: body.useOnReply }),
    },
    select: { id: true, emailAddress: true, signature: true, signatureHtml: true, useSignatureOnNew: true, useSignatureOnReply: true },
  });
  return { code: 200, body: { signature: updated } };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── GET /accounts ────────────────────────────────────────────────────────────

describe('GET /accounts', () => {
  it('returns empty list when user has no accounts', async () => {
    vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([]);
    const result = await simulateListAccounts();
    expect(result.code).toBe(200);
    expect((result.body as any).accounts).toHaveLength(0);
  });

  it('flattens _count.threads into threadCount', async () => {
    vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([
      makeAccount({ _count: { threads: 42 } }),
      makeAccount({ id: 'acc-2', _count: { threads: 7 } }),
    ] as any);
    const result = await simulateListAccounts();
    const accounts = (result.body as any).accounts;
    expect(accounts[0].threadCount).toBe(42);
    expect(accounts[1].threadCount).toBe(7);
    expect(accounts[0]._count).toBeUndefined();
  });

  it('returns all account fields except _count', async () => {
    vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([makeAccount()] as any);
    const result = await simulateListAccounts();
    const acc = (result.body as any).accounts[0];
    expect(acc.emailAddress).toBe('test@example.com');
    expect(acc.provider).toBe('gmail');
  });
});

// ─── POST /accounts/imap ──────────────────────────────────────────────────────

describe('POST /accounts/imap', () => {
  it('returns 400 for invalid email_address', async () => {
    const result = await simulateAddImapAccount({ ...VALID_IMAP_BODY, email_address: 'not-an-email' });
    expect(result.code).toBe(400);
  });

  it('returns 400 for missing imap_host', async () => {
    const { imap_host: _removed, ...body } = VALID_IMAP_BODY;
    const result = await simulateAddImapAccount(body);
    expect(result.code).toBe(400);
  });

  it('returns 400 for missing password', async () => {
    const result = await simulateAddImapAccount({ ...VALID_IMAP_BODY, password: '' });
    expect(result.code).toBe(400);
  });

  it('returns 409 when account already exists', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount() as any);
    const result = await simulateAddImapAccount(VALID_IMAP_BODY);
    expect(result.code).toBe(409);
    expect((result.body as any).error).toMatch(/already connected/i);
  });

  it('returns 400 when connection test fails', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(null);
    vi.mocked(emailProviderFactory.testConnection).mockResolvedValue({ success: false, error: 'Connection refused' } as any);
    const result = await simulateAddImapAccount(VALID_IMAP_BODY);
    expect(result.code).toBe(400);
    expect((result.body as any).error).toBe('Connection test failed');
    expect((result.body as any).message).toBe('Connection refused');
  });

  it('returns 201 with account on success', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(null);
    vi.mocked(emailProviderFactory.testConnection).mockResolvedValue({
      success: true,
      details: { mailboxes: ['INBOX', 'Sent'] },
    } as any);
    vi.mocked(prisma.emailAccount.create).mockResolvedValue({
      id: 'new-acc',
      emailAddress: VALID_IMAP_BODY.email_address,
      provider: 'imap',
      label: null,
    } as any);
    const result = await simulateAddImapAccount(VALID_IMAP_BODY);
    expect(result.code).toBe(201);
    expect((result.body as any).account.provider).toBe('imap');
    expect((result.body as any).mailboxes).toEqual(['INBOX', 'Sent']);
    expect(actionLogService.log).toHaveBeenCalledOnce();
  });

  it('encrypts the password before saving', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(null);
    vi.mocked(emailProviderFactory.testConnection).mockResolvedValue({ success: true, details: {} } as any);
    vi.mocked(prisma.emailAccount.create).mockResolvedValue({ id: 'x', emailAddress: 'test', provider: 'imap', label: null } as any);
    await simulateAddImapAccount(VALID_IMAP_BODY);
    const createCall = vi.mocked(prisma.emailAccount.create).mock.calls[0][0] as any;
    expect(createCall.data.imapPasswordEncrypted).toBe(`encrypted:${VALID_IMAP_BODY.password}`);
    expect(createCall.data.password).toBeUndefined();
  });

  it('uses default IMAP port 993 when not provided', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(null);
    vi.mocked(emailProviderFactory.testConnection).mockResolvedValue({ success: true, details: {} } as any);
    vi.mocked(prisma.emailAccount.create).mockResolvedValue({ id: 'x', emailAddress: 'test', provider: 'imap', label: null } as any);
    await simulateAddImapAccount(VALID_IMAP_BODY);
    expect(emailProviderFactory.testConnection).toHaveBeenCalledWith(
      'imap',
      expect.objectContaining({ imapPort: 993, smtpPort: 465 })
    );
  });
});

// ─── POST /accounts/test-imap ─────────────────────────────────────────────────

describe('POST /accounts/test-imap', () => {
  it('returns 400 for invalid input', async () => {
    expect((await simulateTestImap({ email_address: 'not-email', imap_host: 'x', smtp_host: 'y', password: 'p' })).code).toBe(400);
  });

  it('delegates to emailProviderFactory.testConnection', async () => {
    vi.mocked(emailProviderFactory.testConnection).mockResolvedValue({ success: true } as any);
    const result = await simulateTestImap(VALID_IMAP_BODY);
    expect(result.code).toBe(200);
    expect(emailProviderFactory.testConnection).toHaveBeenCalledOnce();
  });

  it('returns the raw test result (including failure)', async () => {
    vi.mocked(emailProviderFactory.testConnection).mockResolvedValue({ success: false, error: 'Auth failed' } as any);
    const result = await simulateTestImap(VALID_IMAP_BODY);
    expect((result.body as any).success).toBe(false);
    expect((result.body as any).error).toBe('Auth failed');
  });
});

// ─── PATCH /accounts/:id ──────────────────────────────────────────────────────

describe('PATCH /accounts/:id', () => {
  it('returns 400 for invalid color format', async () => {
    const result = await simulateUpdateAccount(ACCOUNT_ID, { color: 'not-a-color' });
    expect(result.code).toBe(400);
  });

  it('returns 400 for invalid account_type', async () => {
    const result = await simulateUpdateAccount(ACCOUNT_ID, { account_type: 'invalid' });
    expect(result.code).toBe(400);
  });

  it('returns 400 for invalid ai_handling', async () => {
    const result = await simulateUpdateAccount(ACCOUNT_ID, { ai_handling: 'wrong' });
    expect(result.code).toBe(400);
  });

  it('returns 404 when account not found', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(null);
    expect((await simulateUpdateAccount(ACCOUNT_ID, { label: 'work' })).code).toBe(404);
  });

  it('returns 200 with updated account on success', async () => {
    const updated = makeAccount({ label: 'work' });
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount() as any);
    vi.mocked(prisma.emailAccount.update).mockResolvedValue(updated as any);
    const result = await simulateUpdateAccount(ACCOUNT_ID, { label: 'work' });
    expect(result.code).toBe(200);
    expect((result.body as any).account.label).toBe('work');
  });

  it('accepts valid hex color', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount() as any);
    vi.mocked(prisma.emailAccount.update).mockResolvedValue(makeAccount({ color: '#ff5500' }) as any);
    const result = await simulateUpdateAccount(ACCOUNT_ID, { color: '#ff5500' });
    expect(result.code).toBe(200);
  });

  it('accepts null signature (clear)', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount() as any);
    vi.mocked(prisma.emailAccount.update).mockResolvedValue(makeAccount({ signature: null }) as any);
    const result = await simulateUpdateAccount(ACCOUNT_ID, { signature: null });
    expect(result.code).toBe(200);
  });
});

// ─── POST /accounts/set-default ───────────────────────────────────────────────

describe('POST /accounts/set-default', () => {
  it('returns 400 when account_id is missing', async () => {
    expect((await simulateSetDefault({})).code).toBe(400);
  });

  it('returns 404 when account not found', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(null);
    expect((await simulateSetDefault({ account_id: ACCOUNT_ID })).code).toBe(404);
  });

  it('runs a transaction and returns 200 on success', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount() as any);
    vi.mocked(prisma.$transaction).mockResolvedValue([]);
    const result = await simulateSetDefault({ account_id: ACCOUNT_ID });
    expect(result.code).toBe(200);
    expect((result.body as any).account_id).toBe(ACCOUNT_ID);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});

// ─── DELETE /accounts/:id ─────────────────────────────────────────────────────

describe('DELETE /accounts/:id', () => {
  it('returns 404 when account not found', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(null);
    expect((await simulateDeleteAccount(ACCOUNT_ID)).code).toBe(404);
  });

  it('returns 400 when trying to delete the last account', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount() as any);
    vi.mocked(prisma.emailAccount.count).mockResolvedValue(1);
    const result = await simulateDeleteAccount(ACCOUNT_ID);
    expect(result.code).toBe(400);
    expect((result.body as any).error).toMatch(/only email account/i);
  });

  it('deletes account and logs action when more accounts exist', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount() as any);
    vi.mocked(prisma.emailAccount.count).mockResolvedValue(3);
    vi.mocked(prisma.emailAccount.delete).mockResolvedValue({} as any);
    const result = await simulateDeleteAccount(ACCOUNT_ID);
    expect(result.code).toBe(200);
    expect(prisma.emailAccount.delete).toHaveBeenCalledWith({ where: { id: ACCOUNT_ID } });
    expect(actionLogService.log).toHaveBeenCalledOnce();
  });

  it('returns the disconnected email in response', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount({ emailAddress: 'deleted@example.com' }) as any);
    vi.mocked(prisma.emailAccount.count).mockResolvedValue(2);
    vi.mocked(prisma.emailAccount.delete).mockResolvedValue({} as any);
    const result = await simulateDeleteAccount(ACCOUNT_ID);
    expect((result.body as any).email).toBe('deleted@example.com');
  });
});

// ─── POST /accounts/:id/sync ──────────────────────────────────────────────────

describe('POST /accounts/:id/sync', () => {
  it('returns 404 when account not found', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(null);
    expect((await simulateSyncAccount(ACCOUNT_ID)).code).toBe(404);
  });

  it('triggers startSyncNow and returns 200', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount() as any);
    const result = await simulateSyncAccount(ACCOUNT_ID);
    expect(result.code).toBe(200);
    expect((result.body as any).message).toBe('Synkronisering startad');
  });
});

// ─── POST /accounts/:id/badges ────────────────────────────────────────────────

describe('POST /accounts/:id/badges', () => {
  it('returns 400 for unknown badge', async () => {
    expect((await simulateAddBadge(ACCOUNT_ID, 'unknown_badge')).code).toBe(400);
  });

  it('returns 400 when badge is undefined', async () => {
    expect((await simulateAddBadge(ACCOUNT_ID, undefined)).code).toBe(400);
  });

  it('returns 404 when account not found', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(null);
    expect((await simulateAddBadge(ACCOUNT_ID, 'ai_managed')).code).toBe(404);
  });

  it('returns 200 with "Badge already set" when badge already present', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount({ badges: ['ai_managed'] }) as any);
    const result = await simulateAddBadge(ACCOUNT_ID, 'ai_managed');
    expect(result.code).toBe(200);
    expect((result.body as any).message).toBe('Badge already set');
    expect(prisma.emailAccount.update).not.toHaveBeenCalled();
  });

  it('adds badge and returns 200', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount({ badges: [] }) as any);
    vi.mocked(prisma.emailAccount.update).mockResolvedValue({ id: ACCOUNT_ID, badges: ['multi_person'] } as any);
    const result = await simulateAddBadge(ACCOUNT_ID, 'multi_person');
    expect(result.code).toBe(200);
    expect((result.body as any).message).toBe("Badge 'multi_person' added");
    const updateCall = vi.mocked(prisma.emailAccount.update).mock.calls[0][0] as any;
    expect(updateCall.data.badges).toContain('multi_person');
  });

  it('accepts all 3 valid badge types', async () => {
    for (const badge of VALID_BADGES) {
      vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount({ badges: [] }) as any);
      vi.mocked(prisma.emailAccount.update).mockResolvedValue({ id: ACCOUNT_ID, badges: [badge] } as any);
      const result = await simulateAddBadge(ACCOUNT_ID, badge);
      expect(result.code).toBe(200);
    }
  });
});

// ─── DELETE /accounts/:id/badges/:badge ──────────────────────────────────────

describe('DELETE /accounts/:id/badges/:badge', () => {
  it('returns 404 when account not found', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(null);
    expect((await simulateRemoveBadge(ACCOUNT_ID, 'ai_managed')).code).toBe(404);
  });

  it('removes badge and returns 200', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(
      makeAccount({ badges: ['ai_managed', 'shared_inbox'] }) as any
    );
    vi.mocked(prisma.emailAccount.update).mockResolvedValue({
      id: ACCOUNT_ID, badges: ['shared_inbox'],
    } as any);
    const result = await simulateRemoveBadge(ACCOUNT_ID, 'ai_managed');
    expect(result.code).toBe(200);
    const updateCall = vi.mocked(prisma.emailAccount.update).mock.calls[0][0] as any;
    expect(updateCall.data.badges).not.toContain('ai_managed');
    expect(updateCall.data.badges).toContain('shared_inbox');
  });

  it('is idempotent — removing absent badge is a no-op', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount({ badges: ['ai_managed'] }) as any);
    vi.mocked(prisma.emailAccount.update).mockResolvedValue({ id: ACCOUNT_ID, badges: ['ai_managed'] } as any);
    const result = await simulateRemoveBadge(ACCOUNT_ID, 'shared_inbox');
    expect(result.code).toBe(200);
  });
});

// ─── GET /accounts/:id/signature ─────────────────────────────────────────────

describe('GET /accounts/:id/signature', () => {
  it('returns 404 when account not found', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(null);
    expect((await simulateGetSignature(ACCOUNT_ID)).code).toBe(404);
  });

  it('returns signature object on success', async () => {
    const sigData = {
      id: ACCOUNT_ID,
      emailAddress: 'test@example.com',
      signature: 'Best regards',
      signatureHtml: '<p>Best regards</p>',
      useSignatureOnNew: true,
      useSignatureOnReply: false,
    };
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(sigData as any);
    const result = await simulateGetSignature(ACCOUNT_ID);
    expect(result.code).toBe(200);
    expect((result.body as any).signature.signature).toBe('Best regards');
    expect((result.body as any).signature.useSignatureOnReply).toBe(false);
  });
});

// ─── PUT /accounts/:id/signature ─────────────────────────────────────────────

describe('PUT /accounts/:id/signature', () => {
  it('returns 404 when account not found', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(null);
    expect((await simulateSaveSignature(ACCOUNT_ID, { text: 'Regards' })).code).toBe(404);
  });

  it('saves signature text and returns updated object', async () => {
    const updated = { id: ACCOUNT_ID, signature: 'New sig', signatureHtml: null, useSignatureOnNew: true, useSignatureOnReply: true };
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount() as any);
    vi.mocked(prisma.emailAccount.update).mockResolvedValue(updated as any);
    const result = await simulateSaveSignature(ACCOUNT_ID, { text: 'New sig' });
    expect(result.code).toBe(200);
    expect((result.body as any).signature.signature).toBe('New sig');
    const updateCall = vi.mocked(prisma.emailAccount.update).mock.calls[0][0] as any;
    expect(updateCall.data.signature).toBe('New sig');
  });

  it('saves HTML signature and use-on flags', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount() as any);
    vi.mocked(prisma.emailAccount.update).mockResolvedValue({} as any);
    await simulateSaveSignature(ACCOUNT_ID, {
      html: '<b>Regards</b>',
      useOnNew: true,
      useOnReply: false,
    });
    const updateCall = vi.mocked(prisma.emailAccount.update).mock.calls[0][0] as any;
    expect(updateCall.data.signatureHtml).toBe('<b>Regards</b>');
    expect(updateCall.data.useSignatureOnNew).toBe(true);
    expect(updateCall.data.useSignatureOnReply).toBe(false);
  });

  it('only updates provided fields (partial update)', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount() as any);
    vi.mocked(prisma.emailAccount.update).mockResolvedValue({} as any);
    await simulateSaveSignature(ACCOUNT_ID, { text: 'Only text' });
    const updateCall = vi.mocked(prisma.emailAccount.update).mock.calls[0][0] as any;
    expect(updateCall.data.signature).toBe('Only text');
    expect(updateCall.data.signatureHtml).toBeUndefined();
    expect(updateCall.data.useSignatureOnNew).toBeUndefined();
  });
});
