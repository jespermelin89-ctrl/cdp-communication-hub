import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/database', () => ({
  prisma: {
    userSettings: { findUnique: vi.fn() },
    pushSubscription: { findMany: vi.fn() },
    actionLog: { findMany: vi.fn(), update: vi.fn() },
  },
}));

vi.mock('../config/env', () => ({
  env: {
    VAPID_SUBJECT: 'mailto:test@example.com',
    VAPID_PUBLIC_KEY: 'public-key',
    VAPID_PRIVATE_KEY: 'private-key',
  },
}));

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

import webpush from 'web-push';
import { prisma } from '../config/database';
import { sendDigest } from '../services/push.service';

const mockSettings = vi.mocked(prisma.userSettings.findUnique);
const mockSubscriptions = vi.mocked(prisma.pushSubscription.findMany);
const mockFindLogs = vi.mocked(prisma.actionLog.findMany);
const mockUpdateLog = vi.mocked(prisma.actionLog.update);
const mockSendNotification = vi.mocked(webpush.sendNotification);

describe('sendDigest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettings.mockResolvedValue({ digestEnabled: true } as any);
    mockSubscriptions.mockResolvedValue([
      { id: 'sub-1', endpoint: 'https://push.example.com', p256dh: 'p256dh', auth: 'auth' },
    ] as any);
    mockSendNotification.mockResolvedValue({ statusCode: 201 } as any);
    mockUpdateLog.mockResolvedValue({ id: 'log-1' } as any);
  });

  it('sends a digest for queued notifications that are not yet delivered', async () => {
    mockFindLogs.mockResolvedValue([
      { id: 'log-1', metadata: { body: 'Ny viktig tråd' } },
      { id: 'log-2', metadata: { body: 'Redan skickad', delivered: true } },
    ] as any);

    await sendDigest('user-1');

    expect(mockSendNotification).toHaveBeenCalledOnce();
    expect(mockUpdateLog).toHaveBeenCalledOnce();
    expect(mockUpdateLog).toHaveBeenCalledWith({
      where: { id: 'log-1' },
      data: {
        metadata: {
          body: 'Ny viktig tråd',
          delivered: true,
        },
      },
    });
  });

  it('does not send a digest when all queued notifications are already delivered', async () => {
    mockFindLogs.mockResolvedValue([
      { id: 'log-1', metadata: { body: 'Redan skickad', delivered: true } },
    ] as any);

    await sendDigest('user-1');

    expect(mockSendNotification).not.toHaveBeenCalled();
    expect(mockUpdateLog).not.toHaveBeenCalled();
  });
});
