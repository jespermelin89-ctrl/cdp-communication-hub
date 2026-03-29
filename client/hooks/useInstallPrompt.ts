'use client';

import { useState, useEffect } from 'react';

export function useInstallPrompt() {
  const [deferredPrompt, setDeferred] = useState<any>(null);
  const [isInstallable, setInstallable] = useState(false);

  useEffect(() => {
    function handler(e: Event) {
      e.preventDefault();
      setDeferred(e);
      setInstallable(true);
    }
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === 'accepted') setInstallable(false);
    setDeferred(null);
  }

  return { isInstallable, install };
}
