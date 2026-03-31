/**
 * Tests for IMAP sync message counting.
 *
 * These tests mock Prisma + ImapFlow so no DB/network is needed.
 * They verify that repeated syncs do not inflate thread.messageCount
 * when the message already exists in the cache.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockClient, mockPrisma, mockDecrypt } = vi.hoisted(() => ({
  mockClient: {
    connect: vi.fn(),
    getMailboxLock: vi.fn(),
    search: vi.fn(),
    fetch: vi.fn(),
    download: vi.fn(),
    logout: vi.fn(),
    list: vi.fn(),
  },
  mockPrisma: {
    emailAccount: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    emailThread: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    emailMessage: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
  mockDecrypt: vi.fn(),
}));

vi.mock('../config/database', () => ({
  prisma: mockPrisma,
}));

vi.mock('../utils/encryption', () => ({
  decrypt: mockDecrypt,
}));

vi.mock('imapflow', () => ({
  ImapFlow: class {
    constructor() {
      return mockClient;
    }
  },
}));

vi.mock('mailparser', () => ({
  simpleParser: vi.fn().mockResolvedValue({ text: '' }),
}));

import { ImapService } from '../services/imap.service';
import { prisma } from '../config/database';

const imapService = new ImapService();
const mockEmailAccount = vi.mocked(prisma.emailAccount);
const mockEmailThread = vi.mocked(prisma.emailThread);
const mockEmailMessage = vi.mocked(prisma.emailMessage);

function asAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) yield item;
    },
  };
}

function buildFetchedMessage() {
  return {
    seq: 1,
    uid: 123,
    envelope: {
      subject: 'Re: Status update',
      from: [{ name: 'Partner', address: 'partner@example.com' }],
      to: [{ address: 'jesper@example.com' }],
      cc: [],
    },
    headers: new Map([['message-id', '<msg-123@example.com>']]),
    internalDate: new Date('2026-03-30T10:00:00.000Z'),
    flags: new Set<string>(),
  };
}

describe('ImapService.fetchMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockDecrypt.mockReturnValue('secret-password');
    mockEmailAccount.findUniqueOrThrow.mockResolvedValue({
      id: 'account-1',
      provider: 'imap',
      emailAddress: 'jesper@example.com',
      imapHost: 'imap.example.com',
      imapPort: 993,
      imapUseSsl: true,
      imapPasswordEncrypted: 'encrypted',
    } as any);
    mockEmailAccount.update.mockResolvedValue({} as any);

    mockClient.connect.mockResolvedValue(undefined);
    mockClient.getMailboxLock.mockResolvedValue({ release: vi.fn() });
    mockClient.search.mockResolvedValue([123]);
    mockClient.fetch.mockReturnValue(asAsyncIterable([buildFetchedMessage()]));
    mockClient.download.mockResolvedValue({ content: undefined });
    mockClient.logout.mockResolvedValue(undefined);

    mockEmailMessage.upsert.mockResolvedValue({} as any);
  });

  it('does not increment messageCount when the message is already cached', async () => {
    mockEmailThread.findFirst.mockResolvedValue({
      id: 'thread-1',
      accountId: 'account-1',
      subject: 'Status update',
      lastMessageAt: new Date('2026-03-29T10:00:00.000Z'),
      participantEmails: ['partner@example.com', 'jesper@example.com'],
      messageCount: 4,
      isRead: true,
    } as any);
    mockEmailMessage.findUnique.mockResolvedValue({ id: 'existing-message' } as any);
    mockEmailThread.update.mockResolvedValue({} as any);

    await imapService.fetchMessages('account-1', { limit: 1 });

    const updateCall = mockEmailThread.update.mock.calls[0]?.[0];
    expect(updateCall).toBeDefined();
    expect(updateCall.data).not.toHaveProperty('messageCount');
  });

  it('increments messageCount when syncing a new message into an existing thread', async () => {
    mockEmailThread.findFirst.mockResolvedValue({
      id: 'thread-1',
      accountId: 'account-1',
      subject: 'Status update',
      lastMessageAt: new Date('2026-03-29T10:00:00.000Z'),
      participantEmails: ['partner@example.com', 'jesper@example.com'],
      messageCount: 4,
      isRead: false,
    } as any);
    mockEmailMessage.findUnique.mockResolvedValue(null);
    mockEmailThread.update.mockResolvedValue({} as any);

    await imapService.fetchMessages('account-1', { limit: 1 });

    const updateCall = mockEmailThread.update.mock.calls[0]?.[0];
    expect(updateCall).toBeDefined();
    expect(updateCall.data.messageCount).toEqual({ increment: 1 });
  });

  it('fetches the latest message UIDs instead of the oldest ones', async () => {
    mockClient.search.mockResolvedValue([101, 102, 103, 104]);
    mockClient.fetch.mockReturnValue(asAsyncIterable([]));

    await imapService.fetchMessages('account-1', { limit: 2 });

    expect(mockClient.fetch).toHaveBeenCalledWith(
      [103, 104],
      expect.objectContaining({
        envelope: true,
        uid: true,
      }),
      { uid: true }
    );
  });
});
