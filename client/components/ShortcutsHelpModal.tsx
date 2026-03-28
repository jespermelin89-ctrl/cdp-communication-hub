'use client';

import { useEffect, useState } from 'react';
import { X, Keyboard } from 'lucide-react';

interface ShortcutGroup {
  label: string;
  shortcuts: { keys: string[]; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: 'Navigering',
    shortcuts: [
      { keys: ['⌘', 'N'], description: 'Nytt meddelande' },
      { keys: ['⌘', '⇧', 'M'], description: 'Gå till Inkorg' },
      { keys: ['⌘', '⇧', 'D'], description: 'Gå till Utkast' },
      { keys: ['⌘', '⇧', 'B'], description: 'Gå till Brain Core' },
      { keys: ['/'], description: 'Sök' },
    ],
  },
  {
    label: 'Inkorg',
    shortcuts: [
      { keys: ['J'], description: 'Nästa tråd' },
      { keys: ['K'], description: 'Föregående tråd' },
      { keys: ['E'], description: 'Arkivera markerad tråd' },
      { keys: ['A'], description: 'Analysera markerad tråd' },
    ],
  },
  {
    label: 'Skriva',
    shortcuts: [
      { keys: ['⌘', '↩'], description: 'Skicka (öppnar bekräftelse)' },
      { keys: ['⌘', 'S'], description: 'Spara utkast' },
      { keys: ['Esc'], description: 'Tillbaka / Avbryt' },
    ],
  },
  {
    label: 'Övrigt',
    shortcuts: [
      { keys: ['⌘', 'K'], description: 'Öppna AI-chatten (Amanda)' },
      { keys: ['?'], description: 'Visa kortkommandohjälp' },
    ],
  },
];

export default function ShortcutsHelpModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('cdp:shortcuts-help', handler);
    return () => window.removeEventListener('cdp:shortcuts-help', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Keyboard size={18} className="text-brand-500" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Kortkommandon</h2>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Shortcut groups */}
        <div className="p-6 space-y-6">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.label}>
              <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
                {group.label}
              </h3>
              <div className="space-y-2">
                {group.shortcuts.map(({ keys, description }) => (
                  <div key={description} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 dark:text-gray-300">{description}</span>
                    <div className="flex items-center gap-1">
                      {keys.map((k, i) => (
                        <kbd
                          key={i}
                          className="inline-flex items-center justify-center min-w-[26px] h-6 px-1.5 text-[11px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-md border border-gray-200 dark:border-gray-700 shadow-sm font-mono"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-2xl">
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center">Tryck <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-[10px]">Esc</kbd> eller klicka utanför för att stänga</p>
        </div>
      </div>
    </div>
  );
}
