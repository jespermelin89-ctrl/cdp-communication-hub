'use client';

import { useEffect } from 'react';

type ShortcutMap = Record<string, () => void>;

/**
 * Bind keyboard shortcuts at the window level.
 * Shortcuts are ignored when focus is on an interactive element (input/textarea/select).
 *
 * Key format: optional modifiers joined with '+', then the key (lowercase).
 * Examples: 'cmd+k', 'cmd+shift+m', '/', 'escape'
 */
export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName ?? '';
      // Don't intercept while typing in an input/textarea
      if (['INPUT', 'TEXTAREA', 'SELECT', 'CONTENTEDITABLE'].includes(tag)) return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      const parts: string[] = [];
      if (e.metaKey || e.ctrlKey) parts.push('cmd');
      if (e.shiftKey) parts.push('shift');
      if (e.altKey) parts.push('alt');
      parts.push(e.key.toLowerCase());
      const combo = parts.join('+');

      if (shortcuts[combo]) {
        e.preventDefault();
        shortcuts[combo]();
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts]);
}
