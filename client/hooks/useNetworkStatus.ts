'use client';

/**
 * useNetworkStatus — tracks browser online state + Render backend reachability.
 *
 * - online: browser's navigator.onLine (instant, no fetch)
 * - backendReachable: true after last /health ping succeeded
 * - renderColdStart: backend responded but took >5 s (Render free tier wake-up)
 */

import { useState, useEffect } from 'react';

export interface NetworkStatus {
  online: boolean;
  backendReachable: boolean;
  renderColdStart: boolean;
}

const PING_INTERVAL_MS = 60 * 1000; // 1 minute
const COLD_START_THRESHOLD_MS = 5000;

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    backendReachable: true,
    renderColdStart: false,
  });

  useEffect(() => {
    const goOnline = () =>
      setStatus((prev) => ({ ...prev, online: true }));
    const goOffline = () =>
      setStatus({ online: false, backendReachable: false, renderColdStart: false });

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    async function pingBackend() {
      if (!navigator.onLine) return;
      try {
        const start = Date.now();
        const res = await fetch('/api/v1/health', {
          signal: AbortSignal.timeout(12000),
        });
        const elapsed = Date.now() - start;
        setStatus({
          online: true,
          backendReachable: res.ok,
          renderColdStart: elapsed > COLD_START_THRESHOLD_MS,
        });
      } catch {
        setStatus((prev) => ({ ...prev, backendReachable: false }));
      }
    }

    // Initial ping (silent — don't block UI)
    pingBackend();
    const interval = setInterval(pingBackend, PING_INTERVAL_MS);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      clearInterval(interval);
    };
  }, []);

  return status;
}
