'use client';

/**
 * useEventStream — Sprint 4
 *
 * Connects to SSE /events/stream?token={jwt}.
 * Auto-reconnects with exponential backoff (1s, 2s, 4s, max 30s).
 * Parses events and triggers SWR revalidation.
 * Returns connection status for UI indicator.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { mutate } from 'swr';
import { api } from '@/lib/api';

export type StreamStatus = 'connecting' | 'connected' | 'disconnected';

const BACKOFF_STEPS = [1000, 2000, 4000, 8000, 16000, 30000];

export function useEventStream(): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef(0);
  const unmountedRef = useRef(false);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;

    const token = api.getToken();
    if (!token) {
      setStatus('disconnected');
      return;
    }

    // Check SSE support
    if (typeof EventSource === 'undefined') {
      // Fallback: poll every 30s
      const interval = setInterval(() => {
        mutate((key: string) => key?.startsWith('/threads'));
      }, 30_000);
      return () => clearInterval(interval);
    }

    setStatus('connecting');
    const url = `/api/v1/events/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('connected', () => {
      setStatus('connected');
      retryRef.current = 0;
    });

    es.addEventListener('thread:new', (e: MessageEvent) => {
      try {
        // Revalidate thread list
        mutate((key: unknown) => typeof key === 'string' && key.startsWith('/threads'));
      } catch {
        // ignore
      }
    });

    es.addEventListener('thread:updated', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data?.threadId) {
          mutate(`/threads/${data.threadId}`);
        }
        mutate((key: unknown) => typeof key === 'string' && key.startsWith('/threads'));
      } catch {
        // ignore
      }
    });

    es.addEventListener('draft:status', (e: MessageEvent) => {
      try {
        mutate((key: unknown) => typeof key === 'string' && key.startsWith('/drafts'));
      } catch {
        // ignore
      }
    });

    es.addEventListener('sync:complete', () => {
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/threads'));
    });

    es.addEventListener('thread:unsnoozed', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data?.threadId) {
          mutate(`/threads/${data.threadId}`);
        }
        mutate((key: unknown) => typeof key === 'string' && key.startsWith('/threads'));
      } catch {
        // ignore
      }
    });

    es.onerror = () => {
      es.close();
      esRef.current = null;
      if (unmountedRef.current) return;
      setStatus('disconnected');

      const delay = BACKOFF_STEPS[Math.min(retryRef.current, BACKOFF_STEPS.length - 1)];
      retryRef.current++;
      setTimeout(connect, delay);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    unmountedRef.current = false;
    connect();
    return () => {
      unmountedRef.current = true;
      esRef.current?.close();
      esRef.current = null;
    };
  }, [connect]);

  return status;
}
