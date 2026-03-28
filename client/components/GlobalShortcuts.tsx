'use client';

import { useRouter } from 'next/navigation';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useChatContext } from '@/lib/chat-context';

/**
 * Invisible component — registers global keyboard shortcuts.
 * Dynamically imported with ssr: false in layout.tsx.
 */
export default function GlobalShortcuts() {
  const router = useRouter();
  const { setIsOpen: setChatOpen } = useChatContext();

  useKeyboardShortcuts({
    'cmd+k': () => setChatOpen(true),
    'cmd+n': () => router.push('/compose'),
    'cmd+shift+m': () => router.push('/inbox'),
    'cmd+shift+d': () => router.push('/drafts'),
    'cmd+shift+b': () => router.push('/settings/brain-core'),
    '/': () => router.push('/search'),
    '?': () => window.dispatchEvent(new CustomEvent('cdp:shortcuts-help')),
  });

  return null;
}
