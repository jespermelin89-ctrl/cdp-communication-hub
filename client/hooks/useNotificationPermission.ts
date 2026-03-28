'use client';

import { useCallback, useEffect, useState } from 'react';

export type NotificationPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export function useNotificationPermission() {
  const [permission, setPermission] = useState<NotificationPermission>('unsupported');

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    setPermission(Notification.permission as NotificationPermission);
  }, []);

  const request = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result as NotificationPermission);
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
