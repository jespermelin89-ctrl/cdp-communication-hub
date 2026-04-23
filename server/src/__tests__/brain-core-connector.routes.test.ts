import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/env', () => ({
  env: {
    COMMAND_API_KEY: 'connector-key',
  },
}));

vi.mock('../config/database', () => ({
  prisma: {
    emailAccount: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../middleware/auth.middleware', () => ({
  authMiddleware: vi.fn(async (request: { userId?: string; userEmail?: string }) => {
    request.userId = 'jwt-user';
    request.userEmail = 'jwt@example.com';
  }),
}));

vi.mock('../services/brain-core-connector.service', () => ({
  BRAIN_CORE_CONNECTOR_CONTRACT: 'brain-core-connector.v1',
  getConnectorHealth: vi.fn(),
  getConnectorInboxSummary: vi.fn(),
  listConnectorThreads: vi.fn(),
  getConnectorThread: vi.fn(),
  markConnectorThreadRead: vi.fn(),
  archiveConnectorThread: vi.fn(),
  getConnectorTriageStatus: vi.fn(),
  getConnectorClassifiedSummary: vi.fn(),
  createConnectorDraft: vi.fn(),
  getConnectorDraft: vi.fn(),
  approveConnectorDraft: vi.fn(),
  sendConnectorDraft: vi.fn(),
  toConnectorResponseError: vi.fn((error: unknown) => ({
    statusCode: 500,
    message: error instanceof Error ? error.message : 'Unknown error',
  })),
}));

import { prisma } from '../config/database';
import { authMiddleware } from '../middleware/auth.middleware';
import { brainCoreConnectorRoutes } from '../routes/brain-core-connector';
import {
  createConnectorDraft,
  getConnectorInboxSummary,
  listConnectorThreads,
} from '../services/brain-core-connector.service';

describe('brain-core connector routes', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(brainCoreConnectorRoutes, { prefix: '/api/v1' });
  });

  afterEach(async () => {
    await app.close();
  });

  it('serves thread lists with connector success envelope and pagination meta', async () => {
    vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([{ userId: 'user-1' }] as any);
    vi.mocked(listConnectorThreads).mockResolvedValue({
      threads: [
        {
          id: 'thread-1',
          subject: 'Budget review',
          unread: true,
        },
      ],
      meta: {
        mailbox: 'inbox',
        pagination: {
          page: 1,
          limit: 25,
          total: 1,
          totalPages: 1,
          hasMore: false,
          nextCursor: null,
        },
      },
    } as any);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/connectors/brain-core/threads?page=1&limit=25',
      headers: {
        'x-api-key': 'connector-key',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(vi.mocked(listConnectorThreads)).toHaveBeenCalledWith('user-1', expect.objectContaining({
      page: 1,
      limit: 25,
    }));
    expect(response.json()).toEqual({
      success: true,
      contract_version: 'brain-core-connector.v1',
      data: [
        {
          id: 'thread-1',
          subject: 'Budget review',
          unread: true,
        },
      ],
      meta: {
        mailbox: 'inbox',
        pagination: {
          page: 1,
          limit: 25,
          total: 1,
          totalPages: 1,
          hasMore: false,
          nextCursor: null,
        },
      },
    });
  });

  it('accepts draft aliases and returns created connector draft', async () => {
    vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([{ userId: 'user-1' }] as any);
    vi.mocked(createConnectorDraft).mockResolvedValue({
      id: 'draft-1',
      accountId: 'acc-1',
      threadId: '11111111-1111-4111-8111-111111111111',
      to: ['ceo@example.com'],
      cc: [],
      bcc: [],
      subject: 'Re: Budget review',
      body: 'I will get back today.',
      status: 'pending',
      createdAt: '2026-04-10T10:00:00.000Z',
    } as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/connectors/brain-core/drafts',
      headers: {
        'x-api-key': 'connector-key',
        'content-type': 'application/json',
      },
      payload: {
        threadId: '11111111-1111-4111-8111-111111111111',
        to: ['ceo@example.com'],
        subject: 'Re: Budget review',
        body: 'I will get back today.',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(vi.mocked(createConnectorDraft)).toHaveBeenCalledWith('user-1', {
      accountId: undefined,
      threadId: '11111111-1111-4111-8111-111111111111',
      to: ['ceo@example.com'],
      cc: [],
      bcc: [],
      subject: 'Re: Budget review',
      body: 'I will get back today.',
      bodyHtml: undefined,
    });
    expect(response.json()).toEqual({
      success: true,
      contract_version: 'brain-core-connector.v1',
      data: {
        id: 'draft-1',
        accountId: 'acc-1',
        threadId: '11111111-1111-4111-8111-111111111111',
        to: ['ceo@example.com'],
        cc: [],
        bcc: [],
        subject: 'Re: Budget review',
        body: 'I will get back today.',
        status: 'pending',
        createdAt: '2026-04-10T10:00:00.000Z',
      },
    });
  });

  it('requires X-Account-Id when API key context is ambiguous', async () => {
    vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([
      { userId: 'user-1' },
      { userId: 'user-2' },
    ] as any);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/connectors/brain-core/inbox-summary',
      headers: {
        'x-api-key': 'connector-key',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      success: false,
      contract_version: 'brain-core-connector.v1',
      error: 'Ambiguous API key context. Provide X-Account-Id for connector routes.',
    });
    expect(vi.mocked(getConnectorInboxSummary)).not.toHaveBeenCalled();
  });

  it('falls back to JWT auth path when no API key is supplied', async () => {
    vi.mocked(getConnectorInboxSummary).mockResolvedValue({
      unreadCount: 4,
      recentThreads: [],
    } as any);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/connectors/brain-core/inbox-summary',
    });

    expect(response.statusCode).toBe(200);
    expect(authMiddleware).toHaveBeenCalled();
    expect(vi.mocked(getConnectorInboxSummary)).toHaveBeenCalledWith('jwt-user', 10);
  });
});
