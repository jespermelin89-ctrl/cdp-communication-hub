'use client';

import { useState, useEffect, useCallback } from 'react';
import type { EmailThread } from './types';

// Track thread IDs we've already notified this session (module-level singleton)
const notifiedIds = new Set<string>();

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return 'denied' as NotificationPermission;
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  const notify = useCallback((title: string, body: string) => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    new Notification(title, { body, icon: '/icon-192.svg' });
  }, []);

  /**
   * Fires a browser notification for each high-priority unread thread
   * that hasn't been notified yet this session.
   */
  const notifyNewHighPriority = useCallback((threads: EmailThread[]) => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    const fresh = threads.filter(
      (t) => !t.isRead && t.latestAnalysis?.priority === 'high' && !notifiedIds.has(t.id)
    );

    for (const thread of fresh) {
      notifiedIds.add(thread.id);
      new Notification('Viktigt mejl', {
        body: thread.subject ?? '(Inget ämne)',
        icon: '/icon-192.svg',
        tag: thread.id, // deduplicates if already shown
      });
    }

    // Haptic feedback for high-priority alerts on mobile
    if (fresh.length > 0 && typeof navigator !== 'undefined') {
      navigator.vibrate?.([100, 50, 100]); // double pulse
    }
  }, []);

  return { permission, requestPermission, notify, notifyNewHighPriority };
}
