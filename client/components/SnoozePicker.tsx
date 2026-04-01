'use client';

/**
 * SnoozePicker — Sprint 5
 *
 * Dropdown/popover with preset snooze times.
 * Calls onSnooze(isoDate) when a time is selected.
 */

import { useRef, useEffect, useState } from 'react';
import { Clock, Calendar } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

interface Props {
  onSnooze: (isoDate: string) => void;
  onClose: () => void;
}

function computeSnoozeDate(opt: {
  hoursFromNow?: number;
  tomorrowAt?: number;
  nextMondayAt?: number;
  weeksFromNow?: number;
}): string {
  const now = new Date();

  if (opt.hoursFromNow) {
    now.setHours(now.getHours() + opt.hoursFromNow);
    return now.toISOString();
  }
  if (opt.tomorrowAt !== undefined) {
    now.setDate(now.getDate() + 1);
    now.setHours(opt.tomorrowAt, 0, 0, 0);
    return now.toISOString();
  }
  if (opt.nextMondayAt !== undefined) {
    const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
    now.setDate(now.getDate() + daysUntilMonday);
    now.setHours(opt.nextMondayAt, 0, 0, 0);
    return now.toISOString();
  }
  if (opt.weeksFromNow) {
    now.setDate(now.getDate() + opt.weeksFromNow * 7);
    return now.toISOString();
  }
  return now.toISOString();
}

export default function SnoozePicker({ onSnooze, onClose }: Props) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState('');

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const presets = [
    {
      label: t.snooze?.laterToday ?? 'Senare idag',
      compute: () => computeSnoozeDate({ hoursFromNow: 3 }),
    },
    {
      label: t.snooze?.tomorrowMorning ?? 'Imorgon 08:00',
      compute: () => computeSnoozeDate({ tomorrowAt: 8 }),
    },
    {
      label: t.snooze?.nextMonday ?? 'Nästa måndag 08:00',
      compute: () => computeSnoozeDate({ nextMondayAt: 8 }),
    },
    {
      label: t.snooze?.nextWeek ?? 'Om 1 vecka',
      compute: () => computeSnoozeDate({ weeksFromNow: 1 }),
    },
  ];

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden min-w-[220px]"
    >
      {!showCustom ? (
        <>
          {presets.map(({ label, compute }) => (
            <button
              key={label}
              onClick={() => { onSnooze(compute()); onClose(); }}
              className="w-full text-left text-sm px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center gap-2 transition-colors"
            >
              <Clock size={13} className="text-gray-400 shrink-0" />
              {label}
            </button>
          ))}
          <button
            onClick={() => setShowCustom(true)}
            className="w-full text-left text-sm px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-brand-600 dark:text-brand-400 flex items-center gap-2 transition-colors border-t border-gray-100 dark:border-gray-700"
          >
            <Calendar size={13} className="shrink-0" />
            {t.snooze?.customDateTime ?? 'Välj datum & tid...'}
          </button>
        </>
      ) : (
        <div className="p-3">
          <input
            type="datetime-local"
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 outline-none mb-2"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setShowCustom(false)}
              className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              {t.settings?.cancel ?? 'Avbryt'}
            </button>
            <button
              disabled={!customValue}
              onClick={() => {
                if (customValue) {
                  onSnooze(new Date(customValue).toISOString());
                  onClose();
                }
              }}
              className="flex-1 text-sm px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium disabled:opacity-50 transition-colors"
            >
              {t.snooze?.snooze ?? 'Snooze'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
