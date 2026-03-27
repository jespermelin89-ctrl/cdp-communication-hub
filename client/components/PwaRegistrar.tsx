'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker for PWA offline support.
 * Must be a client component — rendered in layout.tsx.
 */
export default function PwaRegistrar() {
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      process.env.NODE_ENV === 'production'
    ) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          console.log('[PWA] Service worker registered:', reg.scope);
        })
        .catch((err) => {
          console.warn('[PWA] Service worker registration failed:', err);
        });
    }
  }, []);

  return null;
}
