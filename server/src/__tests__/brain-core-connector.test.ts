import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/database', () => ({
  prisma: {
    emailAccount: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    emailThread: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    draft: {
      count: vi.fn(),
    },
    triageLog: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../services/draft.service', () => ({
  draftService: {
    create: vi.fn(),
    getById: vi.fn(),
    approve: vi.fn(),
    send: vi.fn(),
  },
}));

vi.mock('../services/gmail.service', () => ({
  gmailService: {
    markAsRead: vi.fn(),
    archiveThread: vi.fn(),
  },
}));

import { prisma } from '../config/database';
import { draftService } from '../services/draft.service';
import {
  createConnectorDraft,
  getConnectorClassifiedSummary,
  listConnectorThreads,
  toConnectorResponseError,
} from '../services/brain-core-connector.service';

const USER_ID = 'user-123';

describe('brain-core connector service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps thread lists to the BrainCore connector format and keeps pagination in meta', async () => {
    const lastMessageAt = new Date('2026-04-10T08:00:00.000Z');
    const createdAt = new Date('2026-04-09T08:00:00.000Z');

    vi.mocked(prisma.emailThread.findMany).mockResolvedValue([
      {
        id: 'thread-1',
        accountId: 'acc-1',
        gmailThreadId: 'gmail-thread-1',
        subject: 'Budget review',
        snippet: 'Need your approval',
        participantEmails: ['ceo@example.com'],
        labels: ['INBOX', 'STARRED'],
        messageCount: 4,
        isRead: false,
        isSentByUser: false,
        lastMessageAt,
        createdAt,
        account: { id: 'acc-1', emailAddress: 'owner@example.com', provider: 'gmail' },
        analyses: [{
          summary: 'High-priority request from the CEO',
          classification: 'partner',
          priority: 'high',
          suggestedAction: 'reply',
          confidence: 0.98,
        }],
      },
    ] as any);
    vi.mocked(prisma.emailThread.count).mockResolvedValue(1);

    const result = await listConnectorThreads(USER_ID, {
      page: 1,
      limit: 25,
      mailbox: 'inbox',
    });

    expect(result.threads).toEqual([
      expect.objectContaining({
        id: 'thread-1',
        accountId: 'acc-1',
        accountEmail: 'owner@example.com',
        subject: 'Budget review',
        from: 'ceo@example.com',
        fromEmail: 'ceo@example.com',
        unread: true,
        important: true,
        messageCount: 4,
        lastMessageAt: lastMessageAt.toISOString(),
        aiAnalysis: expect.objectContaining({
          summary: 'High-priority request from the CEO',
          classification: 'partner',
          priority: 'high',
          suggestedAction: 'reply',
        }),
      }),
    ]);
    expect(result.meta.pagination).toEqual({
      page: 1,
      limit: 25,
      total: 1,
      totalPages: 1,
      hasMore: false,
      nextCursor: null,
    });
  });

  it('creates drafts with account resolution from thread ownership', async () => {
    vi.mocked(prisma.emailThread.findFirst).mockResolvedValue({
      id: 'thread-1',
      accountId: 'acc-thread',
    } as any);
    vi.mocked(draftService.create).mockResolvedValue({
      id: 'draft-1',
      accountId: 'acc-thread',
      threadId: 'thread-1',
      toAddresses: ['ceo@example.com'],
      ccAddresses: [],
      bccAddresses: [],
      subject: 'Re: Budget review',
      bodyText: 'I will take this today.',
      bodyHtml: null,
      status: 'pending',
      source: 'manual',
      createdAt: new Date('2026-04-10T10:00:00.000Z'),
      approvedAt: null,
      sentAt: null,
      account: { emailAddress: 'owner@example.com' },
    } as any);

    const result = await createConnectorDraft(USER_ID, {
      threadId: 'thread-1',
      to: ['ceo@example.com'],
      cc: [],
      bcc: [],
      subject: 'Re: Budget review',
      body: 'I will take this today.',
    });

    expect(draftService.create).toHaveBeenCalledWith(USER_ID, expect.objectContaining({
      account_id: 'acc-thread',
      thread_id: 'thread-1',
      to_addresses: ['ceo@example.com'],
      body_text: 'I will take this today.',
    }));
    expect(result).toEqual(expect.objectContaining({
      id: 'draft-1',
      accountId: 'acc-thread',
      threadId: 'thread-1',
      to: ['ceo@example.com'],
      subject: 'Re: Budget review',
      body: 'I will take this today.',
      status: 'pending',
    }));
  });

  it('fails fast when a draft omits account_id and multiple active accounts exist', async () => {
    vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([
      { id: 'acc-1' },
      { id: 'acc-2' },
    ] as any);

    await expect(createConnectorDraft(USER_ID, {
      to: ['ceo@example.com'],
      cc: [],
      bcc: [],
      subject: 'Hello',
      body: 'Text',
    })).rejects.toThrow('account_id is required when multiple active accounts exist');
  });

  it('maps classified summary items with snippets from cached threads', async () => {
    vi.mocked(prisma.triageLog.count)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(3);
    vi.mocked(prisma.triageLog.findMany)
      .mockResolvedValueOnce([
        {
          threadId: 'thread-attention',
          subject: 'Need approval',
          senderEmail: 'ops@example.com',
          classification: 'operational',
        },
      ] as any)
      .mockResolvedValueOnce([
        {
          threadId: 'thread-urgent',
          subject: 'Production issue',
          senderEmail: 'render@example.com',
          classification: 'operational',
        },
      ] as any);
    vi.mocked(prisma.emailThread.findMany).mockResolvedValue([
      { id: 'thread-attention', snippet: 'Follow up this afternoon' },
      { id: 'thread-urgent', snippet: 'Crash in production' },
    ] as any);

    const result = await getConnectorClassifiedSummary(USER_ID);

    expect(result.total_unread).toBe(7);
    expect(result.spam_archived).toBe(3);
    expect(result.need_attention).toEqual([
      {
        thread_id: 'thread-attention',
        subject: 'Need approval',
        from: 'ops@example.com',
        classification: 'operational',
        snippet: 'Follow up this afternoon',
      },
    ]);
    expect(result.urgent).toEqual([
      {
        thread_id: 'thread-urgent',
        subject: 'Production issue',
        from: 'render@example.com',
        classification: 'operational',
        snippet: 'Crash in production',
      },
    ]);
    expect(result.since).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('normalizes connector errors into http-safe responses', async () => {
    vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([
      { id: 'acc-1' },
      { id: 'acc-2' },
    ] as any);

    try {
      await createConnectorDraft(USER_ID, {
        to: ['ceo@example.com'],
        cc: [],
        bcc: [],
        subject: 'Hello',
        body: 'Text',
      });
      throw new Error('Expected createConnectorDraft to throw');
    } catch (error) {
      expect(toConnectorResponseError(error)).toEqual({
        statusCode: 400,
        message: 'account_id is required when multiple active accounts exist',
      });
    }
  });
});
