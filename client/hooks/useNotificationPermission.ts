'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

export type NotificationPermission = 'default' | 'granted' | 'denied' | 'unsupported';

async function subscribeToPush(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) return;

  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return; // Already subscribed

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKey,
    });
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;

    await api.subscribePush({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    });
  } catch {
    // Push subscription is non-critical — swallow errors
  }
}

export function useNotificationPermission() {
  const [permission, setPermission] = useState<NotificationPermission>('unsupported');

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    setPermission(Notification.permission as NotificationPermission);

    // If already granted, ensure we have a push subscription
    if (Notification.permission === 'granted') {
      subscribeToPush();
    }
  }, []);

  const request = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result as NotificationPermission);

    if (result === 'granted') {
      await subscribeToPush();
    }

    return result;
  }, []);

  const notify = useCallback((title: string, body: string, url = '/') => {
    if (typeof window === 'undefined') return;
    // Prefer postMessage to SW controller for richer notifications
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SHOW_NOTIFICATION', title, body, url });
    } else if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icons/icon-192.png' });
    }
  }, []);

  return { permission, request, notify };
}
