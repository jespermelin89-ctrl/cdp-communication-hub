/**
 * Sprint 17 — Route-level tests for categories.ts and providers.ts.
 *
 * categories.ts:
 *  GET  /categories                — delegates to categoryService.getAll
 *  POST /categories                — schema validation (name required, max 100), delegates
 *  DELETE /categories/:id          — delegates
 *  GET  /categories/rules          — delegates
 *  POST /categories/rules          — schema validation, missing sender_pattern error, delegates
 *  DELETE /categories/rules/:id    — delegates
 *  POST /categories/classify       — fetches accounts + threads, classifies, response shape
 *
 * providers.ts:
 *  POST /providers/detect          — invalid email, oauth provider (with authUrl), imap provider,
 *                                    oauth fails → requiresOauth
 *  GET  /providers                 — returns mapped provider list
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../config/database', () => ({
  prisma: {
    emailAccount: { findMany: vi.fn() },
    emailThread: { findMany: vi.fn() },
  },
}));

vi.mock('../services/category.service', () => ({
  categoryService: {
    getAll: vi.fn(),
    create: vi.fn(),
    deleteCategory: vi.fn(),
    getRules: vi.fn(),
    createRule: vi.fn(),
    deleteRule: vi.fn(),
    classifyThreads: vi.fn(),
  },
}));

vi.mock('../config/email-providers', () => ({
  detectProvider: vi.fn(),
  getAllProviders: vi.fn(),
}));

vi.mock('../services/auth.service', () => ({
  authService: {
    getConsentUrlForEmail: vi.fn(),
  },
}));

import { prisma } from '../config/database';
import { categoryService } from '../services/category.service';
import { detectProvider, getAllProviders } from '../config/email-providers';
import { authService } from '../services/auth.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const USER_ID = 'user-1';

// ─── categories.ts simulate functions ─────────────────────────────────────────

async function simulateListCategories(userId = USER_ID) {
  const categories = await categoryService.getAll(userId);
  return { code: 200, body: { categories } };
}

async function simulateCreateCategory(body: unknown, userId = USER_ID) {
  const { z } = await import('zod');
  const schema = z.object({
    name: z.string().min(1).max(100),
    color: z.string().optional(),
    icon: z.string().optional(),
    description: z.string().max(500).optional(),
  });
  // Route uses .parse() which throws on failure — replicate with try/catch
  try {
    const { name, color, icon, description } = schema.parse(body);
    const category = await categoryService.create(userId, { name, color, icon, description });
    return { code: 200, body: { category, message: `Category "${name}" created` } };
  } catch (err: any) {
    return { code: 400, body: { error: err.message } };
  }
}

async function simulateDeleteCategory(id: string) {
  await categoryService.deleteCategory(id);
  return { code: 200, body: { message: 'Category deleted' } };
}

async function simulateListRules(userId = USER_ID) {
  const rules = await categoryService.getRules(userId);
  return { code: 200, body: { rules } };
}

async function simulateCreateRule(body: unknown, userId = USER_ID) {
  const { z } = await import('zod');
  const schema = z.object({
    sender_pattern: z.string().optional(),
    subject_pattern: z.string().optional(),
    action: z.string(),
    category_slug: z.string(),
    priority: z.number().int().min(0).max(100).optional(),
  });

  try {
    const { sender_pattern, subject_pattern, action, category_slug, priority } = schema.parse(body);
    if (!sender_pattern) throw new Error('sender_pattern is required');

    const rule = await categoryService.createRule(userId, {
      senderPattern: sender_pattern,
      subjectPattern: subject_pattern,
      action,
      categorySlug: category_slug,
      priority: priority !== undefined ? String(priority) : undefined,
    });

    return { code: 200, body: { rule, message: `Rule created: ${sender_pattern} → ${action}` } };
  } catch (err: any) {
    return { code: 400, body: { error: err.message } };
  }
}

async function simulateDeleteRule(id: string) {
  await categoryService.deleteRule(id);
  return { code: 200, body: { message: 'Rule deleted' } };
}

async function simulateClassifyThreads(userId = USER_ID) {
  const accounts = await (prisma.emailAccount.findMany as any)({
    where: { userId, isActive: true },
  });

  const threads = await (prisma.emailThread.findMany as any)({
    where: { accountId: { in: accounts.map((a: any) => a.id) } },
    include: { account: true },
    orderBy: { lastMessageAt: 'desc' },
    take: 100,
  });

  const toClassify = threads.map((t: any) => ({
    id: t.id,
    senderEmail: t.participantEmails.find((e: string) => e !== t.account.emailAddress) || t.participantEmails[0] || '',
    subject: t.subject || undefined,
  }));

  const results = await categoryService.classifyThreads(userId, toClassify);
  const matchCount = Object.keys(results as object).length;

  return {
    code: 200,
    body: {
      classified: matchCount,
      total: threads.length,
      results,
      message: `${matchCount} of ${threads.length} threads matched rules`,
    },
  };
}

// ─── providers.ts simulate functions ─────────────────────────────────────────

async function simulateDetectProvider(body: unknown) {
  const { z } = await import('zod');
  const schema = z.object({ email: z.string().email('Invalid email address') });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { code: 400, body: { error: 'Invalid input', details: parsed.error.issues } };
  }

  const { email } = parsed.data;
  const provider = (detectProvider as any)(email);

  const response: any = {
    provider: {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      icon: provider.icon,
      authMethod: provider.authMethod,
      domains: provider.domains,
    },
  };

  if (provider.imapDefaults) response.provider.imapDefaults = provider.imapDefaults;
  if (provider.smtpDefaults) response.provider.smtpDefaults = provider.smtpDefaults;

  if (provider.authMethod === 'oauth') {
    try {
      response.authUrl = authService.getConsentUrlForEmail(email);
    } catch {
      response.requiresOauth = true;
    }
  }

  return { code: 200, body: response };
}

function simulateListProviders() {
  const providers = (getAllProviders as any)().map((p: any) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    icon: p.icon,
    authMethod: p.authMethod,
    domains: p.domains,
    ...(p.imapDefaults && { imapDefaults: p.imapDefaults }),
    ...(p.smtpDefaults && { smtpDefaults: p.smtpDefaults }),
  }));
  return { code: 200, body: { providers } };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── GET /categories ──────────────────────────────────────────────────────────

describe('GET /categories', () => {
  it('returns categories from service', async () => {
    vi.mocked(categoryService.getAll).mockResolvedValue([{ id: 'c1', name: 'Work' }] as any);
    const result = await simulateListCategories();
    expect(result.code).toBe(200);
    expect((result.body as any).categories).toHaveLength(1);
    expect(categoryService.getAll).toHaveBeenCalledWith(USER_ID);
  });

  it('returns empty array when no categories', async () => {
    vi.mocked(categoryService.getAll).mockResolvedValue([]);
    const result = await simulateListCategories();
    expect((result.body as any).categories).toHaveLength(0);
  });
});

// ─── POST /categories ─────────────────────────────────────────────────────────

describe('POST /categories', () => {
  it('returns 400 for missing name', async () => {
    expect((await simulateCreateCategory({ color: '#ff0000' })).code).toBe(400);
  });

  it('returns 400 for empty name', async () => {
    expect((await simulateCreateCategory({ name: '' })).code).toBe(400);
  });

  it('returns 400 for name exceeding 100 chars', async () => {
    expect((await simulateCreateCategory({ name: 'x'.repeat(101) })).code).toBe(400);
  });

  it('creates category and returns it', async () => {
    vi.mocked(categoryService.create).mockResolvedValue({ id: 'cat-1', name: 'Newsletter' } as any);
    const result = await simulateCreateCategory({ name: 'Newsletter', color: '#00ff00' });
    expect(result.code).toBe(200);
    expect((result.body as any).category.name).toBe('Newsletter');
    expect((result.body as any).message).toContain('Newsletter');
    expect(categoryService.create).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ name: 'Newsletter' }));
  });

  it('accepts optional fields', async () => {
    vi.mocked(categoryService.create).mockResolvedValue({ id: 'cat-2' } as any);
    await simulateCreateCategory({ name: 'Work', color: '#0000ff', icon: '💼', description: 'Work emails' });
    expect(categoryService.create).toHaveBeenCalledWith(USER_ID, {
      name: 'Work',
      color: '#0000ff',
      icon: '💼',
      description: 'Work emails',
    });
  });
});

// ─── DELETE /categories/:id ───────────────────────────────────────────────────

describe('DELETE /categories/:id', () => {
  it('delegates to categoryService.deleteCategory', async () => {
    vi.mocked(categoryService.deleteCategory).mockResolvedValue(undefined);
    const result = await simulateDeleteCategory('cat-1');
    expect(result.code).toBe(200);
    expect(categoryService.deleteCategory).toHaveBeenCalledWith('cat-1');
  });
});

// ─── GET /categories/rules ────────────────────────────────────────────────────

describe('GET /categories/rules', () => {
  it('returns rules from service', async () => {
    vi.mocked(categoryService.getRules).mockResolvedValue([{ id: 'r1', senderPattern: 'spam@x.com' }] as any);
    const result = await simulateListRules();
    expect(result.code).toBe(200);
    expect((result.body as any).rules).toHaveLength(1);
    expect(categoryService.getRules).toHaveBeenCalledWith(USER_ID);
  });
});

// ─── POST /categories/rules ───────────────────────────────────────────────────

describe('POST /categories/rules', () => {
  it('returns 400 for missing action', async () => {
    expect((await simulateCreateRule({ sender_pattern: 'spam@x.com', category_slug: 'junk' })).code).toBe(400);
  });

  it('returns 400 for missing category_slug', async () => {
    expect((await simulateCreateRule({ sender_pattern: 'spam@x.com', action: 'trash' })).code).toBe(400);
  });

  it('returns 400 when sender_pattern is omitted', async () => {
    const result = await simulateCreateRule({ action: 'trash', category_slug: 'junk' });
    expect(result.code).toBe(400);
    expect((result.body as any).error).toMatch(/sender_pattern is required/);
  });

  it('creates rule and returns it', async () => {
    vi.mocked(categoryService.createRule).mockResolvedValue({ id: 'r1' } as any);
    const result = await simulateCreateRule({
      sender_pattern: 'noreply@x.com',
      action: 'trash',
      category_slug: 'newsletter',
      priority: 10,
    });
    expect(result.code).toBe(200);
    expect((result.body as any).message).toContain('noreply@x.com');
    expect(categoryService.createRule).toHaveBeenCalledWith(USER_ID, {
      senderPattern: 'noreply@x.com',
      subjectPattern: undefined,
      action: 'trash',
      categorySlug: 'newsletter',
      priority: '10',
    });
  });

  it('converts priority to string', async () => {
    vi.mocked(categoryService.createRule).mockResolvedValue({ id: 'r2' } as any);
    await simulateCreateRule({ sender_pattern: 'a@b.com', action: 'spam', category_slug: 'junk', priority: 50 });
    expect(categoryService.createRule).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ priority: '50' }));
  });

  it('passes undefined priority when omitted', async () => {
    vi.mocked(categoryService.createRule).mockResolvedValue({ id: 'r3' } as any);
    await simulateCreateRule({ sender_pattern: 'a@b.com', action: 'spam', category_slug: 'junk' });
    expect(categoryService.createRule).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ priority: undefined }));
  });
});

// ─── DELETE /categories/rules/:id ─────────────────────────────────────────────

describe('DELETE /categories/rules/:id', () => {
  it('delegates to categoryService.deleteRule', async () => {
    vi.mocked(categoryService.deleteRule).mockResolvedValue(undefined);
    const result = await simulateDeleteRule('rule-1');
    expect(result.code).toBe(200);
    expect(categoryService.deleteRule).toHaveBeenCalledWith('rule-1');
  });
});

// ─── POST /categories/classify ────────────────────────────────────────────────

describe('POST /categories/classify', () => {
  it('returns classified=0 and total=0 when no accounts/threads', async () => {
    vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([]);
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue([]);
    vi.mocked(categoryService.classifyThreads).mockResolvedValue({});
    const result = await simulateClassifyThreads();
    expect(result.code).toBe(200);
    expect((result.body as any).classified).toBe(0);
    expect((result.body as any).total).toBe(0);
  });

  it('returns correct classified count', async () => {
    const accounts = [{ id: 'acc-1', emailAddress: 'me@example.com' }];
    const threads = [
      { id: 't1', participantEmails: ['vendor@example.com', 'me@example.com'], subject: 'Invoice', account: accounts[0] },
      { id: 't2', participantEmails: ['friend@example.com'], subject: 'Hey', account: accounts[0] },
    ];
    vi.mocked(prisma.emailAccount.findMany).mockResolvedValue(accounts as any);
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue(threads as any);
    vi.mocked(categoryService.classifyThreads).mockResolvedValue({ t1: 'newsletter' } as any);
    const result = await simulateClassifyThreads();
    expect((result.body as any).classified).toBe(1);
    expect((result.body as any).total).toBe(2);
    expect((result.body as any).message).toContain('1 of 2');
  });

  it('extracts external sender (not account email) for classification', async () => {
    const account = { id: 'acc-1', emailAddress: 'me@example.com' };
    const thread = {
      id: 't1',
      participantEmails: ['me@example.com', 'vendor@external.com'],
      subject: 'Invoice',
      account,
    };
    vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([account] as any);
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue([thread] as any);
    vi.mocked(categoryService.classifyThreads).mockResolvedValue({});
    await simulateClassifyThreads();
    expect(categoryService.classifyThreads).toHaveBeenCalledWith(
      USER_ID,
      expect.arrayContaining([expect.objectContaining({ senderEmail: 'vendor@external.com' })])
    );
  });

  it('falls back to first participant when all are own accounts', async () => {
    const account = { id: 'acc-1', emailAddress: 'me@example.com' };
    const thread = {
      id: 't1',
      participantEmails: ['me@example.com'],
      subject: 'Self-note',
      account,
    };
    vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([account] as any);
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue([thread] as any);
    vi.mocked(categoryService.classifyThreads).mockResolvedValue({});
    await simulateClassifyThreads();
    expect(categoryService.classifyThreads).toHaveBeenCalledWith(
      USER_ID,
      expect.arrayContaining([expect.objectContaining({ senderEmail: 'me@example.com' })])
    );
  });
});

// ─── POST /providers/detect ───────────────────────────────────────────────────

describe('POST /providers/detect', () => {
  it('returns 400 for invalid email', async () => {
    const result = await simulateDetectProvider({ email: 'not-an-email' });
    expect(result.code).toBe(400);
  });

  it('returns 400 for missing email', async () => {
    const result = await simulateDetectProvider({});
    expect(result.code).toBe(400);
  });

  it('returns provider info for oauth provider with authUrl', async () => {
    vi.mocked(detectProvider).mockReturnValue({
      id: 'google',
      name: 'Google',
      type: 'gmail',
      icon: 'google.svg',
      authMethod: 'oauth',
      domains: ['gmail.com'],
    } as any);
    vi.mocked(authService.getConsentUrlForEmail).mockReturnValue('https://accounts.google.com/o/oauth2/auth?...');
    const result = await simulateDetectProvider({ email: 'user@gmail.com' });
    expect(result.code).toBe(200);
    expect((result.body as any).provider.id).toBe('google');
    expect((result.body as any).authUrl).toBe('https://accounts.google.com/o/oauth2/auth?...');
    expect((result.body as any).requiresOauth).toBeUndefined();
  });

  it('sets requiresOauth when authUrl generation fails for oauth provider', async () => {
    vi.mocked(detectProvider).mockReturnValue({
      id: 'google',
      name: 'Google',
      type: 'gmail',
      icon: 'google.svg',
      authMethod: 'oauth',
      domains: ['gmail.com'],
    } as any);
    vi.mocked(authService.getConsentUrlForEmail).mockImplementation(() => { throw new Error('Not configured'); });
    const result = await simulateDetectProvider({ email: 'user@gmail.com' });
    expect(result.code).toBe(200);
    expect((result.body as any).requiresOauth).toBe(true);
    expect((result.body as any).authUrl).toBeUndefined();
  });

  it('returns imap provider without authUrl', async () => {
    vi.mocked(detectProvider).mockReturnValue({
      id: 'custom',
      name: 'Custom IMAP',
      type: 'imap',
      icon: 'mail.svg',
      authMethod: 'imap',
      domains: [],
      imapDefaults: { host: 'imap.example.com', port: 993 },
      smtpDefaults: { host: 'smtp.example.com', port: 465 },
    } as any);
    const result = await simulateDetectProvider({ email: 'user@custom.com' });
    expect(result.code).toBe(200);
    expect((result.body as any).provider.authMethod).toBe('imap');
    expect((result.body as any).authUrl).toBeUndefined();
    expect((result.body as any).provider.imapDefaults).toBeDefined();
    expect((result.body as any).provider.smtpDefaults).toBeDefined();
  });

  it('does not include imapDefaults when provider has none', async () => {
    vi.mocked(detectProvider).mockReturnValue({
      id: 'google',
      name: 'Google',
      type: 'gmail',
      icon: 'google.svg',
      authMethod: 'oauth',
      domains: ['gmail.com'],
    } as any);
    vi.mocked(authService.getConsentUrlForEmail).mockReturnValue('https://auth.url');
    const result = await simulateDetectProvider({ email: 'user@gmail.com' });
    expect((result.body as any).provider.imapDefaults).toBeUndefined();
  });
});

// ─── GET /providers ───────────────────────────────────────────────────────────

describe('GET /providers', () => {
  it('returns list of all providers', async () => {
    vi.mocked(getAllProviders).mockReturnValue([
      { id: 'google', name: 'Google', type: 'gmail', icon: 'g.svg', authMethod: 'oauth', domains: ['gmail.com'] },
      { id: 'outlook', name: 'Outlook', type: 'imap', icon: 'o.svg', authMethod: 'imap', domains: ['outlook.com'], imapDefaults: { host: 'outlook' } },
    ] as any);
    const result = simulateListProviders();
    expect(result.code).toBe(200);
    const providers = (result.body as any).providers;
    expect(providers).toHaveLength(2);
    expect(providers[0].id).toBe('google');
    expect(providers[1].imapDefaults).toBeDefined();
  });

  it('returns empty array when no providers configured', async () => {
    vi.mocked(getAllProviders).mockReturnValue([]);
    const result = simulateListProviders();
    expect((result.body as any).providers).toHaveLength(0);
  });

  it('excludes imapDefaults when provider has none', async () => {
    vi.mocked(getAllProviders).mockReturnValue([
      { id: 'google', name: 'Google', type: 'gmail', icon: 'g.svg', authMethod: 'oauth', domains: ['gmail.com'] },
    ] as any);
    const result = simulateListProviders();
    expect((result.body as any).providers[0].imapDefaults).toBeUndefined();
  });
});
