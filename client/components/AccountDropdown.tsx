'use client';

/**
 * AccountDropdown — Clickable account pill with dropdown showing type, members, AI handling.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { User, Users, Share2, Bot, RefreshCw, Settings, ChevronDown } from 'lucide-react';
import type { Account } from '@/lib/types';

const AI_HANDLING_LABELS: Record<string, string> = {
  normal: 'Hantera normalt',
  separate: 'Separera team-mejl',
  notify_only: 'Notifiera bara',
};

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  personal: 'Personlig',
  team: 'Team',
  shared: 'Delad inkorg',
};

interface Props {
  account: Account;
  selected: boolean;
  onSelect: () => void;
  onSync?: () => void;
}

export default function AccountDropdown({ account, selected, onSelect, onSync }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const dotColor = account.color || (account.provider === 'gmail' ? '#EA4335' : '#6366F1');

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const TypeIcon = account.accountType === 'team' ? Users
    : account.accountType === 'shared' ? Share2
    : User;

  return (
    <div ref={ref} className="relative">
      {/* Trigger pill */}
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); onSelect(); }}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
          selected
            ? 'bg-brand-500 text-white shadow-sm'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
        }`}
      >
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: selected ? 'rgba(255,255,255,0.7)' : dotColor }}
        />
        <span>{account.label || account.emailAddress.split('@')[0]}</span>
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-64 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-lg p-3 text-sm">
          {/* Header */}
          <div className="flex items-start gap-2.5 pb-3 border-b border-gray-100 dark:border-gray-700">
            <div
              className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold"
              style={{ backgroundColor: dotColor }}
            >
              {account.emailAddress.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900 dark:text-gray-100 truncate text-xs">{account.emailAddress}</div>
              {account.label && <div className="text-[10px] text-gray-400">{account.label}</div>}
            </div>
          </div>

          {/* Account type */}
          <div className="py-2.5 border-b border-gray-100 dark:border-gray-700 space-y-2">
            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
              <TypeIcon size={13} className="text-gray-400 shrink-0" />
              <span className="font-medium text-gray-500 dark:text-gray-400 w-20 shrink-0">Kontotyp</span>
              <span>{ACCOUNT_TYPE_LABELS[account.accountType] || account.accountType}</span>
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
              <Bot size={13} className="text-gray-400 shrink-0" />
              <span className="font-medium text-gray-500 dark:text-gray-400 w-20 shrink-0">AI-beteende</span>
              <span>{AI_HANDLING_LABELS[account.aiHandling] || account.aiHandling}</span>
            </div>
          </div>

          {/* Team members */}
          {account.teamMembers && account.teamMembers.length > 0 && (
            <div className="py-2.5 border-b border-gray-100 dark:border-gray-700">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Hanteras av</div>
              {account.teamMembers.map((m) => (
                <div key={m} className="text-xs text-gray-600 dark:text-gray-300 truncate">{m}</div>
              ))}
            </div>
          )}

          {/* Quick actions */}
          <div className="pt-2.5 flex items-center gap-2">
            {onSync && (
              <button
                onClick={(e) => { e.stopPropagation(); onSync(); setOpen(false); }}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <RefreshCw size={11} /> Synka nu
              </button>
            )}
            <Link
              href={`/settings/accounts`}
              onClick={() => setOpen(false)}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <Settings size={11} /> Inställningar
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
