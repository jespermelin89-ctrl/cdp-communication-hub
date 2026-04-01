'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { X } from 'lucide-react';

interface UndoSendToastProps {
  draftId: string;
  delaySeconds: number;
  onUndo: () => void;
  onSent: () => void;
  toastId: string | number;
}

export function UndoSendToast({ draftId, delaySeconds, onUndo, onSent, toastId }: UndoSendToastProps) {
  const [remaining, setRemaining] = useState(delaySeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        const next = r - 1;
        if (next <= 0) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          if (!cancelledRef.current) {
            toast.dismiss(toastId);
            onSent();
          }
        }
        return next;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  async function handleUndo() {
    cancelledRef.current = true;
    if (intervalRef.current) clearInterval(intervalRef.current);
    try {
      const res = await api.cancelSend(draftId);
      if (res.cancelled) {
        toast.dismiss(toastId);
        toast.success('Mail avbrutet — sparad som godkänt utkast');
        onUndo();
      } else {
        toast.error('För sent — mailet har redan skickats');
      }
    } catch {
      toast.error('Kunde inte avbryta utskicket');
    }
  }

  const pct = Math.max(0, ((delaySeconds - remaining) / delaySeconds) * 100);

  return (
    <div className="flex flex-col gap-2 min-w-[280px]">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Mail skickas om {remaining}s
        </span>
        <button
          onClick={handleUndo}
          className="flex items-center gap-1 px-3 py-1 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          Ångra
        </button>
      </div>
      {/* Progress bar */}
      <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-brand-500 transition-all duration-1000 ease-linear rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Show the undo-send toast and trigger delayed send.
 * Returns a promise that resolves when either sent or cancelled.
 */
export async function showUndoSendToast(draftId: string, delaySeconds: number): Promise<'sent' | 'cancelled'> {
  return new Promise((resolve) => {
    const toastId = toast.custom(
      (t) => (
        <UndoSendToast
          draftId={draftId}
          delaySeconds={delaySeconds}
          onUndo={() => resolve('cancelled')}
          onSent={() => resolve('sent')}
          toastId={t}
        />
      ),
      {
        duration: (delaySeconds + 2) * 1000,
        dismissible: false,
        position: 'bottom-center',
      }
    );
  });
}
