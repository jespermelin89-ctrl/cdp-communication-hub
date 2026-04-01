/**
 * Tests for the Draft approval state machine and safety gate.
 *
 * These tests mock Prisma and emailProviderFactory so no DB/network is needed.
 * They verify the critical invariants:
 *   1. Drafts always start as 'pending'
 *   2. Only 'pending' drafts can be approved
 *   3. Only 'approved' drafts can be sent (THE SAFETY GATE)
 *   4. 'sent' drafts cannot be discarded
 *   5. Error during send → status becomes 'failed'
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted — factories cannot reference variables declared later.
// Use inline vi.fn() in the factory, then import the mocked module to get references.

vi.mock('../config/database', () => ({
  prisma: {
    draft: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    emailAccount: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../services/email-provider.factory', () => ({
  emailProviderFactory: {
    sendEmail: vi.fn(),
    getLastMessageId: vi.fn(),
  },
}));

vi.mock('../services/action-log.service', () => ({
  actionLogService: {
    log: vi.fn().mockResolvedValue(undefined),
    logInTransaction: vi.fn().mockResolvedValue(undefined),
  },
}));

import { DraftService } from '../services/draft.service';
import { emailProviderFactory } from '../services/email-provider.factory';
import { prisma } from '../config/database';

// Typed references to the mock functions
const mockDraft = vi.mocked(prisma.draft);
const mockEmailAccount = vi.mocked(prisma.emailAccount);
const mockTransaction = vi.mocked(prisma.$transaction);

const draftService = new DraftService();
const USER_ID = 'user-123';
const DRAFT_ID = 'draft-abc';
const ACCOUNT_ID = 'account-xyz';

// ──────────────────────────────────────────────
// Draft creation
// ──────────────────────────────────────────────

describe('DraftService.create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates draft with status pending', async () => {
    mockEmailAccount.findFirst.mockResolvedValue({ signature: null });
    mockDraft.create.mockResolvedValue({
      id: DRAFT_ID,
      status: 'pending',
      subject: 'Test',
      toAddresses: ['a@b.com'],
      account: { emailAddress: 'sender@test.com' },
      thread: null,
    });

    const result = await draftService.create(USER_ID, {
      account_id: ACCOUNT_ID,
      to_addresses: ['a@b.com'],
      subject: 'Test',
      body_text: 'Hello',
      cc_addresses: [],
      bcc_addresses: ['hidden@test.com'],
    });

    expect(result.status).toBe('pending');
    expect(mockDraft.create).toHaveBeenCalledOnce();
    const createCall = mockDraft.create.mock.calls[0][0];
    expect(createCall.data.status).toBe('pending');
    expect(createCall.data.bccAddresses).toEqual(['hidden@test.com']);
  });

  it('appends signature when account has one', async () => {
    mockEmailAccount.findFirst.mockResolvedValue({ signature: 'Best,\nJesper' });
    mockDraft.create.mockResolvedValue({
      id: DRAFT_ID,
      status: 'pending',
      subject: 'Test',
      toAddresses: ['a@b.com'],
      account: { emailAddress: 'sender@test.com' },
      thread: null,
    });

    await draftService.create(USER_ID, {
      account_id: ACCOUNT_ID,
      to_addresses: ['a@b.com'],
      subject: 'Test',
      body_text: 'Hello',
      cc_addresses: [],
      bcc_addresses: [],
    });

    const createCall = mockDraft.create.mock.calls[0][0];
    expect(createCall.data.bodyText).toContain('Best,\nJesper');
    expect(createCall.data.bodyText).toContain('\n\n--\n');
  });

  it('does not append signature when account has none', async () => {
    mockEmailAccount.findFirst.mockResolvedValue({ signature: null });
    mockDraft.create.mockResolvedValue({
      id: DRAFT_ID,
      status: 'pending',
      subject: 'Test',
      toAddresses: ['a@b.com'],
      account: { emailAddress: 'sender@test.com' },
      thread: null,
    });

    await draftService.create(USER_ID, {
      account_id: ACCOUNT_ID,
      to_addresses: ['a@b.com'],
      subject: 'Test',
      body_text: 'Hello',
      cc_addresses: [],
      bcc_addresses: [],
    });

    const createCall = mockDraft.create.mock.calls[0][0];
    expect(createCall.data.bodyText).toBe('Hello');
  });
});

// ──────────────────────────────────────────────
// Draft approval
// ──────────────────────────────────────────────

describe('DraftService.approve', () => {
  beforeEach(() => vi.clearAllMocks());

  it('approves a pending draft successfully', async () => {
    mockDraft.findFirst.mockResolvedValue({ id: DRAFT_ID, status: 'pending', userId: USER_ID });
    mockDraft.update.mockResolvedValue({
      id: DRAFT_ID,
      status: 'approved',
      subject: 'Test',
      toAddresses: ['a@b.com'],
      account: { emailAddress: 'sender@test.com' },
    });

    const result = await draftService.approve(DRAFT_ID, USER_ID);
    expect(result.status).toBe('approved');

    const updateCall = mockDraft.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe('approved');
    expect(updateCall.data.approvedAt).toBeInstanceOf(Date);
  });

  it('throws when approving an already approved draft', async () => {
    mockDraft.findFirst.mockResolvedValue({ id: DRAFT_ID, status: 'approved' });

    await expect(draftService.approve(DRAFT_ID, USER_ID)).rejects.toThrow(
      "Cannot approve draft with status 'approved'"
    );
  });

  it('throws when approving a sent draft', async () => {
    mockDraft.findFirst.mockResolvedValue({ id: DRAFT_ID, status: 'sent' });

    await expect(draftService.approve(DRAFT_ID, USER_ID)).rejects.toThrow(
      "Cannot approve draft with status 'sent'"
    );
  });

  it('throws when draft not found', async () => {
    mockDraft.findFirst.mockResolvedValue(null);

    await expect(draftService.approve(DRAFT_ID, USER_ID)).rejects.toThrow('Draft not found');
  });
});

// ──────────────────────────────────────────────
// Draft send — THE CRITICAL SAFETY GATE
// ──────────────────────────────────────────────

describe('DraftService.send — safety gate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('BLOCKS sending a pending draft (safety gate enforced)', async () => {
    // Transaction executes the callback immediately
    mockTransaction.mockImplementation(async (fn: any) => {
      const txMock = {
        draft: {
          findFirst: vi.fn().mockResolvedValue({
            id: DRAFT_ID,
            status: 'pending',   // ← NOT approved
            userId: USER_ID,
            account: { emailAddress: 'from@test.com' },
            thread: null,
            toAddresses: ['to@test.com'],
            ccAddresses: [],
            bccAddresses: [],
            subject: 'Test',
            bodyText: 'Hello',
          }),
          update: vi.fn(),
        },
      };
      return fn(txMock);
    });

    await expect(draftService.send(DRAFT_ID, USER_ID)).rejects.toThrow('SECURITY');
    await expect(draftService.send(DRAFT_ID, USER_ID)).rejects.toThrow("status 'pending'");
  });

  it('BLOCKS sending a discarded draft', async () => {
    mockTransaction.mockImplementation(async (fn: any) => {
      const txMock = {
        draft: {
          findFirst: vi.fn().mockResolvedValue({
            id: DRAFT_ID,
            status: 'discarded',
            userId: USER_ID,
            account: { emailAddress: 'from@test.com' },
            thread: null,
            toAddresses: ['to@test.com'],
            ccAddresses: [],
            bccAddresses: [],
            subject: 'Test',
            bodyText: 'Hello',
          }),
          update: vi.fn(),
        },
      };
      return fn(txMock);
    });

    await expect(draftService.send(DRAFT_ID, USER_ID)).rejects.toThrow('SECURITY');
  });

  it('BLOCKS sending an already sent draft', async () => {
    mockTransaction.mockImplementation(async (fn: any) => {
      const txMock = {
        draft: {
          findFirst: vi.fn().mockResolvedValue({
            id: DRAFT_ID,
            status: 'sent',
            userId: USER_ID,
            account: { emailAddress: 'from@test.com' },
            thread: null,
            toAddresses: ['to@test.com'],
            ccAddresses: [],
            bccAddresses: [],
            subject: 'Test',
            bodyText: 'Hello',
          }),
          update: vi.fn(),
        },
      };
      return fn(txMock);
    });

    await expect(draftService.send(DRAFT_ID, USER_ID)).rejects.toThrow('SECURITY');
  });

  it('throws when draft not found', async () => {
    mockTransaction.mockImplementation(async (fn: any) => {
      const txMock = {
        draft: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
      };
      return fn(txMock);
    });

    await expect(draftService.send(DRAFT_ID, USER_ID)).rejects.toThrow('Draft not found');
  });

  it('sends an approved draft and marks as sent', async () => {
    const mockUpdate = vi.fn().mockResolvedValue({ id: DRAFT_ID, status: 'sent' });

    mockTransaction.mockImplementation(async (fn: any) => {
      const txMock = {
        draft: {
          findFirst: vi.fn().mockResolvedValue({
            id: DRAFT_ID,
            status: 'approved',   // ← correctly approved
            userId: USER_ID,
            accountId: ACCOUNT_ID,
            account: { emailAddress: 'from@test.com' },
            thread: null,
            toAddresses: ['to@test.com'],
            ccAddresses: [],
            bccAddresses: ['hidden@test.com'],
            subject: 'Test',
            bodyText: 'Hello',
          }),
          update: mockUpdate,
        },
      };
      return fn(txMock);
    });

    (emailProviderFactory.sendEmail as any).mockResolvedValue({ messageId: 'gmail-msg-123' });

    const result = await draftService.send(DRAFT_ID, USER_ID);
    expect(result.status).toBe('sent');
    expect(emailProviderFactory.sendEmail).toHaveBeenCalledWith(
      ACCOUNT_ID,
      expect.objectContaining({
        bcc: ['hidden@test.com'],
      })
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'sent', gmailMessageId: 'gmail-msg-123', scheduledAt: null }),
      })
    );
  });

  it('marks as failed and throws when send fails', async () => {
    const mockUpdate = vi.fn().mockResolvedValue({ id: DRAFT_ID, status: 'failed' });

    mockTransaction.mockImplementation(async (fn: any) => {
      const txMock = {
        draft: {
          findFirst: vi.fn().mockResolvedValue({
            id: DRAFT_ID,
            status: 'approved',
            userId: USER_ID,
            accountId: ACCOUNT_ID,
            account: { emailAddress: 'from@test.com' },
            thread: null,
            toAddresses: ['to@test.com'],
            ccAddresses: [],
            bccAddresses: ['hidden@test.com'],
            subject: 'Test',
            bodyText: 'Hello',
          }),
          update: mockUpdate,
        },
      };
      return fn(txMock);
    });

    (emailProviderFactory.sendEmail as any).mockRejectedValue(new Error('Gmail API error'));

    await expect(draftService.send(DRAFT_ID, USER_ID)).rejects.toThrow('Gmail API error');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed', scheduledAt: null }),
      })
    );
  });
});

// ──────────────────────────────────────────────
// Draft discard
// ──────────────────────────────────────────────

describe('DraftService.discard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('discards a pending draft', async () => {
    mockDraft.findFirst.mockResolvedValue({ id: DRAFT_ID, status: 'pending', subject: 'Test' });
    mockDraft.update.mockResolvedValue({ id: DRAFT_ID, status: 'discarded', subject: 'Test' });

    const result = await draftService.discard(DRAFT_ID, USER_ID);
    expect(result.status).toBe('discarded');
  });

  it('discards an approved draft', async () => {
    mockDraft.findFirst.mockResolvedValue({ id: DRAFT_ID, status: 'approved', subject: 'Test' });
    mockDraft.update.mockResolvedValue({ id: DRAFT_ID, status: 'discarded', subject: 'Test' });

    const result = await draftService.discard(DRAFT_ID, USER_ID);
    expect(result.status).toBe('discarded');
  });

  it('blocks discarding a sent draft', async () => {
    mockDraft.findFirst.mockResolvedValue({ id: DRAFT_ID, status: 'sent', subject: 'Test' });

    await expect(draftService.discard(DRAFT_ID, USER_ID)).rejects.toThrow(
      'Cannot discard a draft that has already been sent.'
    );
  });

  it('blocks discarding an already discarded draft', async () => {
    mockDraft.findFirst.mockResolvedValue({ id: DRAFT_ID, status: 'discarded', subject: 'Test' });

    await expect(draftService.discard(DRAFT_ID, USER_ID)).rejects.toThrow(
      'Draft is already discarded.'
    );
  });

  it('throws when draft not found', async () => {
    mockDraft.findFirst.mockResolvedValue(null);

    await expect(draftService.discard(DRAFT_ID, USER_ID)).rejects.toThrow('Draft not found');
  });
});

// ──────────────────────────────────────────────
// Draft update
// ──────────────────────────────────────────────

describe('DraftService.update', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows updating a pending draft', async () => {
    mockDraft.findFirst.mockResolvedValue({ id: DRAFT_ID, status: 'pending' });
    mockDraft.update.mockResolvedValue({ id: DRAFT_ID, status: 'pending', subject: 'New subject', account: { emailAddress: 'x@y.com' } });

    await expect(draftService.update(DRAFT_ID, USER_ID, { subject: 'New subject' })).resolves.not.toThrow();
  });

  it('persists bcc updates on a pending draft', async () => {
    mockDraft.findFirst.mockResolvedValue({ id: DRAFT_ID, status: 'pending' });
    mockDraft.update.mockResolvedValue({
      id: DRAFT_ID,
      status: 'pending',
      bccAddresses: ['hidden@test.com'],
      account: { emailAddress: 'x@y.com' },
    });

    await draftService.update(DRAFT_ID, USER_ID, { bcc_addresses: ['hidden@test.com'] });

    expect(mockDraft.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bccAddresses: ['hidden@test.com'],
        }),
      })
    );
  });

  it('blocks updating an approved draft', async () => {
    mockDraft.findFirst.mockResolvedValue({ id: DRAFT_ID, status: 'approved' });

    await expect(draftService.update(DRAFT_ID, USER_ID, { subject: 'Sneaky change' })).rejects.toThrow(
      "Cannot edit draft with status 'approved'"
    );
  });

  it('blocks updating a sent draft', async () => {
    mockDraft.findFirst.mockResolvedValue({ id: DRAFT_ID, status: 'sent' });

    await expect(draftService.update(DRAFT_ID, USER_ID, { subject: 'Sneaky change' })).rejects.toThrow(
      "Cannot edit draft with status 'sent'"
    );
  });
});
