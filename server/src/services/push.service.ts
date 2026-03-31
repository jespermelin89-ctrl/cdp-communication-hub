/**
 * Web Push Notification Service
 *
 * Sends push notifications to subscribed browsers via VAPID.
 * Automatically cleans up expired subscriptions (HTTP 410 Gone).
 */

import webpush from 'web-push';
import { prisma } from '../config/database';
import { env } from '../config/env';

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;

  webpush.setVapidDetails(
    env.VAPID_SUBJECT!,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );
  vapidConfigured = true;
}

export type PushPayload = { title: string; body: string; url?: string; icon?: string };

async function sendPushDirect(userId: string, payload: PushPayload): Promise<void> {
  ensureVapid();
  if (!vapidConfigured) return;

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return;

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ ...payload, icon: payload.icon ?? '/icons/icon-192.png' }),
      )
    )
  );

  // Clean up expired subscriptions (410 Gone)
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'rejected' && (r.reason as any)?.statusCode === 410) {
      await prisma.pushSubscription
        .delete({ where: { id: subs[i].id } })
        .catch(() => {});
    }
  }
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  // Check quiet hours
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  if (settings?.quietHoursStart != null && settings?.quietHoursEnd != null) {
    const hour = new Date().getHours();
    const start = settings.quietHoursStart;
    const end = settings.quietHoursEnd;
    const isQuiet = start > end
      ? (hour >= start || hour < end)
      : (hour >= start && hour < end);

    if (isQuiet) {
      // Queue for digest instead of sending immediately
      await prisma.actionLog.create({
        data: {
          userId,
          actionType: 'notification_queued',
          targetType: 'push',
          targetId: null,
          metadata: payload as any,
        },
      });
      return;
    }
  }

  await sendPushDirect(userId, payload);
}

/**
 * Send a morning digest of queued notifications to a user.
 * Called by the scheduler at digestTime.
 */
export async function sendDigest(userId: string): Promise<void> {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  if (!settings?.digestEnabled) return;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const queued = await prisma.actionLog.findMany({
    where: {
      userId,
      actionType: 'notification_queued',
      createdAt: { gte: since },
      metadata: { path: ['delivered'], equals: true }, // exclude already-delivered
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  // Find ones NOT yet delivered
  const pending = queued.filter((q) => !(q.metadata as any)?.delivered);
  if (pending.length === 0) return;

  const summary = pending.length === 1
    ? (pending[0].metadata as any)?.body ?? 'Du har ett missat meddelande'
    : `Du har ${pending.length} missade notiser sedan igår kväll`;

  await sendPushDirect(userId, {
    title: 'Morgondigest',
    body: summary,
    url: '/notifications',
  });

  // Mark all as delivered
  await prisma.actionLog.updateMany({
    where: { id: { in: pending.map((q) => q.id) } },
    data: { metadata: { delivered: true } as any },
  });
}
