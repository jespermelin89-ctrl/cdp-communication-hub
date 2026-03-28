'use client';

/**
 * PWA Install Banner — shown once on mobile when the browser supports install prompts.
 * Dismissed state is persisted in localStorage (never shown again after dismiss).
 * Hidden when already running as standalone PWA.
 */

import { useState, useEffect } from 'react';
import { Smartphone, X, Download } from 'lucide-react';

const DISMISS_KEY = 'cdp-pwa-banner-dismissed-v1';

export default function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Already dismissed or already installed as standalone
    if (localStorage.getItem(DISMISS_KEY)) return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  }

  async function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setVisible(false);
        localStorage.setItem(DISMISS_KEY, '1');
      }
    } catch {
      // user cancelled
    }
    setDeferredPrompt(null);
  }

  if (!visible) return null;

  return (
    // Only show on narrow screens — desktop doesn't need this banner
    <div className="fixed bottom-0 left-0 right-0 z-40 sm:hidden px-4 pb-safe-bottom">
      <div
        className="mb-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl p-4 flex items-center gap-3"
        role="banner"
      >
        <div className="w-10 h-10 bg-brand-100 dark:bg-brand-900/40 rounded-xl flex items-center justify-center shrink-0">
          <Smartphone size={20} className="text-brand-600 dark:text-brand-400" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Installera CDP Hub
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Snabbare åtkomst direkt från hemskärmen
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={install}
            className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
          >
            <Download size={12} />
            Installera
          </button>
          <button
            onClick={dismiss}
            aria-label="Stäng"
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
