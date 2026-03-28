'use client';

import { useEffect, useRef } from 'react';
import { AlertTriangle, Info, Trash2, X } from 'lucide-react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ICON_MAP = {
  danger: Trash2,
  warning: AlertTriangle,
  info: Info,
};

const COLOR_MAP = {
  danger: {
    icon: 'text-red-500',
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-100 dark:border-red-800',
    btn: 'bg-red-600 hover:bg-red-700 text-white',
  },
  warning: {
    icon: 'text-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    border: 'border-amber-100 dark:border-amber-800',
    btn: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  info: {
    icon: 'text-brand-500',
    bg: 'bg-brand-50 dark:bg-brand-900/20',
    border: 'border-brand-100 dark:border-brand-800',
    btn: 'bg-brand-600 hover:bg-brand-700 text-white',
  },
};

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Bekräfta',
  cancelLabel = 'Avbryt',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const colors = COLOR_MAP[variant];
  const Icon = ICON_MAP[variant];

  // Focus trap
  useEffect(() => {
    if (!open) return;
    // Focus cancel by default for dangerous actions, confirm for info
    const el = variant === 'info' ? confirmRef.current : cancelRef.current;
    el?.focus();

    function trap(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
      if (e.key !== 'Tab') return;
      const els = [cancelRef.current, confirmRef.current].filter(Boolean) as HTMLElement[];
      const idx = els.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? (idx - 1 + els.length) % els.length : (idx + 1) % els.length;
      e.preventDefault();
      els[next]?.focus();
    }
    window.addEventListener('keydown', trap);
    return () => window.removeEventListener('keydown', trap);
  }, [open, variant, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className={`relative w-full max-w-sm rounded-2xl border bg-white dark:bg-gray-800 shadow-xl p-5 ${colors.border}`}>
        {/* Close */}
        <button
          onClick={onCancel}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Stäng"
        >
          <X size={16} />
        </button>

        {/* Icon + title */}
        <div className="flex items-start gap-3 mb-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${colors.bg}`}>
            <Icon size={18} className={colors.icon} />
          </div>
          <div>
            <h2
              id="confirm-dialog-title"
              className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-snug"
            >
              {title}
            </h2>
            {description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                {description}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            ref={cancelRef}
            onClick={onCancel}
            disabled={loading}
            className="btn-secondary text-sm"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            disabled={loading}
            className={`text-sm px-4 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${colors.btn}`}
          >
            {loading ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Väntar…
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
