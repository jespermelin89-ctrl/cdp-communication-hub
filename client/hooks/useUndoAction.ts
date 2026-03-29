'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';

export function useUndoAction() {
  const execute = useCallback(async (opts: {
    action: () => Promise<void>;
    undo: () => Promise<void>;
    message: string;
    undoLabel?: string;
    delay?: number;
  }) => {
    const { action, undo, message, undoLabel = 'Ångra', delay = 5000 } = opts;

    await action();

    toast(message, {
      duration: delay,
      action: {
        label: undoLabel,
        onClick: async () => {
          try {
            await undo();
            toast.success('Ångrad!');
          } catch {
            toast.error('Kunde inte ångra');
          }
        },
      },
    });
  }, []);

  return { execute };
}
