/**
 * Sprint 21 — SMTP Service + Brain-Core Webhook + Utility Tests
 *
 * Covers:
 *   smtp.service.ts              — getCredentials validation, sendEmail mail options, testConnection
 *   brain-core-webhook.service.ts — notifyBrainCore: no-op, success, HTTP error, network error, secret header
 *   utils/sanitize.ts            — sanitizeLabel, isValidEmail, sanitizeSearch
 *   utils/return-to.ts           — sanitizeReturnTo
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../config/database', () => ({
  prisma: {
    emailAccount: {
      findUniqueOrThrow: vi.fn(),
    },
  },
}));

vi.mock('../utils/encryption', () => ({
  decrypt: vi.fn((v: string) => `decrypted:${v}`),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(),
  },
}));

vi.mock('../config/env', () => ({
  env: {
    BRAIN_CORE_WEBHOOK_URL: '',
    BRAIN_CORE_WEBHOOK_SECRET: '',
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { prisma } from '../config/database';
import { smtpService } from '../services/smtp.service';
import { notifyBrainCore } from '../services/brain-core-webhook.service';
import { env } from '../config/env';
import nodemailer from 'nodemailer';
import { sanitizeLabel, isValidEmail, sanitizeSearch } from '../utils/sanitize';
import { sanitizeReturnTo } from '../utils/return-to';

// Shared transport mock — recreated in each beforeEach
let mockTransport: { sendMail: ReturnType<typeof vi.fn>; verify: ReturnType<typeof vi.fn> };

// ── SMTP Service Tests ────────────────────────────────────────────────────────

const BASE_ACCOUNT = {
  id: 'acc-1',
  provider: 'imap',
  emailAddress: 'user@company.com',
  displayName: 'Jane Doe',
  smtpHost: 'smtp.company.com',
  smtpPort: 587,
  smtpUseSsl: false,
  imapPasswordEncrypted: 'enc-secret',
};

describe('Sprint 21 — SMTP Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransport = {
      sendMail: vi.fn().mockResolvedValue({ messageId: '<test-id@mail.com>' }),
      verify: vi.fn().mockResolvedValue(true),
    };
    (nodemailer.createTransport as ReturnType<typeof vi.fn>).mockReturnValue(mockTransport);
  });

  // ── getCredentials (via sendEmail) ────────────────────────────────────────

  describe('getCredentials (tested via sendEmail)', () => {
    it('throws when account is not imap provider', async () => {
      (prisma.emailAccount.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...BASE_ACCOUNT,
        provider: 'gmail',
      });

      await expect(
        smtpService.sendEmail('acc-1', {
          to: ['a@b.com'],
          subject: 'Test',
          body: 'Hello',
        })
      ).rejects.toThrow('not an IMAP/SMTP account');
    });

    it('throws when smtpHost is missing', async () => {
      (prisma.emailAccount.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...BASE_ACCOUNT,
        smtpHost: null,
      });

      await expect(
        smtpService.sendEmail('acc-1', { to: ['a@b.com'], subject: 'Test', body: 'Hello' })
      ).rejects.toThrow('missing host, port, or password');
    });

    it('throws when imapPasswordEncrypted is missing', async () => {
      (prisma.emailAccount.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...BASE_ACCOUNT,
        imapPasswordEncrypted: null,
      });

      await expect(
        smtpService.sendEmail('acc-1', { to: ['a@b.com'], subject: 'Test', body: 'Hello' })
      ).rejects.toThrow('missing host, port, or password');
    });
  });

  // ── sendEmail — mail options ──────────────────────────────────────────────

  describe('sendEmail', () => {
    it('formats from field as "Name <email>" when displayName present', async () => {
      (prisma.emailAccount.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_ACCOUNT);

      await smtpService.sendEmail('acc-1', {
        to: ['recipient@b.com'],
        subject: 'Hello',
        body: 'Body text',
      });

      const mailOpts = mockTransport.sendMail.mock.calls[0][0];
      expect(mailOpts.from).toBe('"Jane Doe" <user@company.com>');
    });

    it('uses bare email as from field when displayName is absent', async () => {
      (prisma.emailAccount.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...BASE_ACCOUNT,
        displayName: null,
      });

      await smtpService.sendEmail('acc-1', {
        to: ['recipient@b.com'],
        subject: 'Hello',
        body: 'Body text',
      });

      const mailOpts = mockTransport.sendMail.mock.calls[0][0];
      expect(mailOpts.from).toBe('user@company.com');
    });

    it('joins multiple to addresses with comma', async () => {
      (prisma.emailAccount.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_ACCOUNT);

      await smtpService.sendEmail('acc-1', {
        to: ['a@x.com', 'b@y.com'],
        subject: 'Multi-recipient',
        body: 'Hello',
      });

      const mailOpts = mockTransport.sendMail.mock.calls[0][0];
      expect(mailOpts.to).toBe('a@x.com, b@y.com');
    });

    it('adds cc and bcc when provided', async () => {
      (prisma.emailAccount.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_ACCOUNT);

      await smtpService.sendEmail('acc-1', {
        to: ['a@x.com'],
        cc: ['cc@x.com', 'cc2@x.com'],
        bcc: ['bcc@secret.com'],
        subject: 'CC test',
        body: 'Hello',
      });

      const mailOpts = mockTransport.sendMail.mock.calls[0][0];
      expect(mailOpts.cc).toBe('cc@x.com, cc2@x.com');
      expect(mailOpts.bcc).toBe('bcc@secret.com');
    });

    it('omits cc/bcc fields when empty arrays', async () => {
      (prisma.emailAccount.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_ACCOUNT);

      await smtpService.sendEmail('acc-1', {
        to: ['a@x.com'],
        cc: [],
        bcc: [],
        subject: 'No CC',
        body: 'Hello',
      });

      const mailOpts = mockTransport.sendMail.mock.calls[0][0];
      expect(mailOpts.cc).toBeUndefined();
      expect(mailOpts.bcc).toBeUndefined();
    });

    it('sets inReplyTo and references headers when provided', async () => {
      (prisma.emailAccount.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_ACCOUNT);

      await smtpService.sendEmail('acc-1', {
        to: ['a@x.com'],
        subject: 'Re: Hello',
        body: 'Hello',
        inReplyTo: '<orig@mail.com>',
        references: '<orig@mail.com>',
      });

      const mailOpts = mockTransport.sendMail.mock.calls[0][0];
      expect(mailOpts.inReplyTo).toBe('<orig@mail.com>');
      expect(mailOpts.references).toBe('<orig@mail.com>');
    });

    it('decodes attachments from base64 to Buffer', async () => {
      (prisma.emailAccount.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_ACCOUNT);

      const base64Data = Buffer.from('hello world').toString('base64');
      await smtpService.sendEmail('acc-1', {
        to: ['a@x.com'],
        subject: 'With attachment',
        body: 'See attached',
        attachments: [{ filename: 'doc.pdf', mimeType: 'application/pdf', data: base64Data }],
      });

      const mailOpts = mockTransport.sendMail.mock.calls[0][0];
      expect(mailOpts.attachments[0].filename).toBe('doc.pdf');
      expect(mailOpts.attachments[0].contentType).toBe('application/pdf');
      expect(Buffer.isBuffer(mailOpts.attachments[0].content)).toBe(true);
    });

    it('includes HTML body when bodyHtml is provided', async () => {
      (prisma.emailAccount.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_ACCOUNT);

      await smtpService.sendEmail('acc-1', {
        to: ['a@x.com'],
        subject: 'HTML test',
        body: 'Plain text',
        bodyHtml: '<p>HTML content</p>',
      });

      const mailOpts = mockTransport.sendMail.mock.calls[0][0];
      expect(mailOpts.html).toBe('<p>HTML content</p>');
      expect(mailOpts.text).toBe('Plain text');
    });

    it('returns messageId from nodemailer result', async () => {
      (prisma.emailAccount.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(BASE_ACCOUNT);

      const result = await smtpService.sendEmail('acc-1', {
        to: ['a@x.com'],
        subject: 'Test',
        body: 'Hello',
      });

      expect(result.messageId).toBe('<test-id@mail.com>');
    });
  });

  // ── testConnection ────────────────────────────────────────────────────────

  describe('testConnection', () => {
    it('returns success: true on successful verify', async () => {
      const result = await smtpService.testConnection({
        host: 'smtp.example.com',
        port: 587,
        useSsl: false,
        user: 'user@example.com',
        password: 'secret',
      });

      expect(result).toEqual({ success: true });
    });

    it('returns success: false with error message on verify failure', async () => {
      mockTransport.verify.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await smtpService.testConnection({
        host: 'smtp.example.com',
        port: 587,
        useSsl: false,
        user: 'user@example.com',
        password: 'wrong-password',
      });

      expect(result).toEqual({ success: false, error: 'Connection refused' });
    });
  });
});

// ── Brain-Core Webhook Tests ──────────────────────────────────────────────────

describe('Sprint 21 — Brain-Core Webhook Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset global fetch mock
    vi.stubGlobal('fetch', vi.fn());
    // Reset env
    (env as any).BRAIN_CORE_WEBHOOK_URL = '';
    (env as any).BRAIN_CORE_WEBHOOK_SECRET = '';
    (env as any).BRAIN_CORE_ORGANIZATION_ID = '';
  });

  it('is a no-op when BRAIN_CORE_WEBHOOK_URL is not set', async () => {
    (env as any).BRAIN_CORE_WEBHOOK_URL = '';

    await notifyBrainCore({ type: 'triage.high_priority', data: { threadId: 't1' } });

    expect(fetch).not.toHaveBeenCalled();
  });

  it('posts to webhook URL with correct payload shape', async () => {
    (env as any).BRAIN_CORE_WEBHOOK_URL = 'https://brain.example.com/webhook';
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    await notifyBrainCore({ type: 'triage.completed', data: { processed: 5 } });

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toBe('https://brain.example.com/webhook');
    expect(fetchCall[1].method).toBe('POST');

    const body = JSON.parse(fetchCall[1].body);
    expect(body.event).toBe('triage.completed');
    expect(body.event_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(body.data).toEqual({ processed: 5 });
    expect(body.source).toBe('cdp-communication-hub');
    expect(body.contract_version).toBe('brain-core-webhook.v1');
    expect(body.context).toEqual({
      organization_id: null,
      user_id: null,
      account_id: null,
      thread_id: null,
      gmail_thread_id: null,
      draft_id: null,
    });
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('adds X-Webhook-Secret header when secret is configured', async () => {
    (env as any).BRAIN_CORE_WEBHOOK_URL = 'https://brain.example.com/webhook';
    (env as any).BRAIN_CORE_WEBHOOK_SECRET = 'my-secret-token';
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    await notifyBrainCore({ type: 'draft.ready', data: { draftId: 'd1' } });

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[1].headers['X-Webhook-Secret']).toBe('my-secret-token');
  });

  it('does NOT add X-Webhook-Secret when secret is not configured', async () => {
    (env as any).BRAIN_CORE_WEBHOOK_URL = 'https://brain.example.com/webhook';
    (env as any).BRAIN_CORE_WEBHOOK_SECRET = '';
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    await notifyBrainCore({ type: 'triage.high_priority', data: {} });

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[1].headers['X-Webhook-Secret']).toBeUndefined();
  });

  it('does NOT throw when HTTP response is not ok (warns only)', async () => {
    (env as any).BRAIN_CORE_WEBHOOK_URL = 'https://brain.example.com/webhook';
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 503 });

    await expect(
      notifyBrainCore({ type: 'triage.unknown_sender', data: {} })
    ).resolves.not.toThrow();
  });

  it('does NOT throw on network error (warns only)', async () => {
    (env as any).BRAIN_CORE_WEBHOOK_URL = 'https://brain.example.com/webhook';
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      notifyBrainCore({ type: 'triage.completed', data: {} })
    ).resolves.not.toThrow();
  });

  it('sends Content-Type: application/json', async () => {
    (env as any).BRAIN_CORE_WEBHOOK_URL = 'https://brain.example.com/webhook';
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    await notifyBrainCore({ type: 'triage.high_priority', data: {} });

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[1].headers['Content-Type']).toBe('application/json');
  });

  it('includes organization and entity context when provided', async () => {
    (env as any).BRAIN_CORE_WEBHOOK_URL = 'https://brain.example.com/webhook';
    (env as any).BRAIN_CORE_ORGANIZATION_ID = 'org-42';
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    await notifyBrainCore({
      type: 'draft.ready',
      context: {
        userId: 'user-42',
        accountId: 'acc-42',
        threadId: 'thread-42',
        gmailThreadId: 'gmail-42',
        draftId: 'draft-42',
      },
      data: { draft_id: 'draft-42' },
    });

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.context).toEqual({
      organization_id: 'org-42',
      user_id: 'user-42',
      account_id: 'acc-42',
      thread_id: 'thread-42',
      gmail_thread_id: 'gmail-42',
      draft_id: 'draft-42',
    });
  });

  it('preserves caller-supplied event_id for idempotent delivery', async () => {
    (env as any).BRAIN_CORE_WEBHOOK_URL = 'https://brain.example.com/webhook';
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    await notifyBrainCore({
      eventId: 'event-fixed-abc',
      type: 'triage.completed',
      data: { processed: 5 },
    });

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.event_id).toBe('event-fixed-abc');
  });
});

// ── Sanitize Utils Tests ──────────────────────────────────────────────────────

describe('Sprint 21 — utils/sanitize', () => {
  describe('sanitizeLabel', () => {
    it('uppercases ASCII letters', () => {
      expect(sanitizeLabel('inbox')).toBe('INBOX');
    });

    it('keeps digits', () => {
      expect(sanitizeLabel('label123')).toBe('LABEL123');
    });

    it('keeps hyphen and underscore', () => {
      expect(sanitizeLabel('my-label_2')).toBe('MY-LABEL_2');
    });

    it('keeps Swedish characters ÅÄÖåäö', () => {
      const result = sanitizeLabel('åland');
      expect(result).toMatch(/[ÅÄÖÆØÜ]/i);
    });

    it('removes spaces and special chars', () => {
      expect(sanitizeLabel('hello world!')).toBe('HELLOWORLD');
    });

    it('removes @ symbol (not in allowlist)', () => {
      expect(sanitizeLabel('no@sign')).toBe('NOSIGN');
    });

    it('truncates to 50 characters', () => {
      const long = 'A'.repeat(60);
      expect(sanitizeLabel(long)).toHaveLength(50);
    });

    it('preserves exactly 50 chars when input is exactly 50', () => {
      const fifty = 'A'.repeat(50);
      expect(sanitizeLabel(fifty)).toHaveLength(50);
    });
  });

  describe('isValidEmail', () => {
    it('returns true for standard email', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
    });

    it('returns true for email with subdomain', () => {
      expect(isValidEmail('user@mail.example.co.uk')).toBe(true);
    });

    it('returns true for email with plus-alias', () => {
      expect(isValidEmail('user+tag@example.com')).toBe(true);
    });

    it('returns false for missing @', () => {
      expect(isValidEmail('userexample.com')).toBe(false);
    });

    it('returns false for missing domain', () => {
      expect(isValidEmail('user@')).toBe(false);
    });

    it('returns false for missing TLD', () => {
      expect(isValidEmail('user@example')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isValidEmail('')).toBe(false);
    });

    it('trims whitespace before validation', () => {
      expect(isValidEmail('  user@example.com  ')).toBe(true);
    });
  });

  describe('sanitizeSearch', () => {
    it('strips control characters (\\x00-\\x1F)', () => {
      expect(sanitizeSearch('hello\x00world')).toBe('helloworld');
      expect(sanitizeSearch('test\x1Fquery')).toBe('testquery');
    });

    it('strips DEL character (\\x7F)', () => {
      expect(sanitizeSearch('bad\x7Finput')).toBe('badinput');
    });

    it('trims leading and trailing whitespace', () => {
      expect(sanitizeSearch('  hello  ')).toBe('hello');
    });

    it('truncates to 200 characters', () => {
      const long = 'a'.repeat(250);
      expect(sanitizeSearch(long)).toHaveLength(200);
    });

    it('preserves normal query text', () => {
      expect(sanitizeSearch('invoice from:alice@company.com')).toBe(
        'invoice from:alice@company.com'
      );
    });

    it('preserves Unicode (Swedish chars, emoji)', () => {
      const result = sanitizeSearch('sök årsredovisning 📎');
      expect(result).toContain('årsredovisning');
    });
  });
});

// ── return-to Utils Tests ─────────────────────────────────────────────────────

describe('Sprint 21 — utils/return-to', () => {
  describe('sanitizeReturnTo', () => {
    it('returns undefined when value is undefined', () => {
      expect(sanitizeReturnTo(undefined)).toBeUndefined();
    });

    it('returns undefined when value is empty string', () => {
      expect(sanitizeReturnTo('')).toBeUndefined();
    });

    it('returns the path when it starts with a single /', () => {
      expect(sanitizeReturnTo('/inbox')).toBe('/inbox');
    });

    it('returns the path for nested routes', () => {
      expect(sanitizeReturnTo('/settings/accounts')).toBe('/settings/accounts');
    });

    it('blocks // (protocol-relative URLs)', () => {
      expect(sanitizeReturnTo('//evil.com/phish')).toBeUndefined();
    });

    it('blocks http:// URLs', () => {
      expect(sanitizeReturnTo('http://evil.com')).toBeUndefined();
    });

    it('blocks https:// URLs', () => {
      expect(sanitizeReturnTo('https://evil.com/redirect')).toBeUndefined();
    });

    it('blocks relative paths without leading /', () => {
      expect(sanitizeReturnTo('inbox')).toBeUndefined();
    });
  });
});
