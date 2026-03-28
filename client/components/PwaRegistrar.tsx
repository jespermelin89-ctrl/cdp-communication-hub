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
        .then((_reg) => {
          // Service worker registered successfully
        })
        .catch((_err) => {
          // Service worker registration failed — app still works online
        });
    }
  }, []);

  return null;
}
