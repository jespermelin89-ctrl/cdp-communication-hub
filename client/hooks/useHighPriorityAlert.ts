'use client';

import { useEffect, useRef } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { useNotificationPermission } from './useNotificationPermission';

/**
 * Polls for high-priority threads every 60 s and fires a browser notification
 * when a new one appears (one that hasn't been seen in this session).
 */
export function useHighPriorityAlert() {
  const { permission, notify } = useNotificationPermission();
  const seenIds = useRef<Set<string>>(new Set());

  const { data } = useSWR(
    permission === 'granted' ? 'high-priority-alert' : null,
    () => api.getThreads({ limit: 50 } as any),
    { refreshInterval: 60_000, revalidateOnFocus: false }
  );

  useEffect(() => {
    if (!data?.threads) return;
    const highThreads = data.threads.filter((t: any) => t.priority === 'high' && !t.isRead);

    for (const thread of highThreads) {
      if (!seenIds.current.has(thread.id)) {
        seenIds.current.add(thread.id);
        // Skip on initial load (when set was empty before this batch)
        if (seenIds.current.size > highThreads.length) {
          notify(
            '🔴 Hög prioritet',
            thread.subject ?? '(inget ämne)',
            `/threads/${thread.id}`
          );
        }
      }
    }
    // Seed on first run
    if (seenIds.current.size === 0) {
      highThreads.forEach((t: any) => seenIds.current.add(t.id));
    }
  }, [data, notify]);
}
