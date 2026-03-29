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

export async function sendPushToUser(
  userId: string,
  payload: {
    title: string;
    body: string;
    url?: string;
    icon?: string;
  }
): Promise<void> {
  ensureVapid();
  if (!vapidConfigured) return; // VAPID not configured — silently skip

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
