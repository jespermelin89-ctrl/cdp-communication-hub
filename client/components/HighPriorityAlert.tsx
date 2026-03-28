'use client';

import { useHighPriorityAlert } from '@/hooks/useHighPriorityAlert';

/**
 * Invisible component — just mounts the polling hook.
 * Dynamically imported with ssr: false in layout.tsx.
 */
export default function HighPriorityAlert() {
  useHighPriorityAlert();
  return null;
}
