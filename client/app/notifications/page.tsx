'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { AlertCircle, Bot, FileText, CheckCircle, Archive, Bell, Trash2, RefreshCw } from 'lucide-react';
import TopBar from '@/components/TopBar';
import EmptyState from '@/components/EmptyState';
import { api } from '@/lib/api';
import type { Account } from '@/lib/types';

// ── Types ─────────────────────────────────────────────────────────────────────
interface ActionLog {
  id: string;
  actionType: string;
  details?: any;
  createdAt: string;
}

/** Deterministic hue from email string. */
function emailColor(email: string): string {
  const hue = [...email].reduce((h, c) => (h * 31 + c.charCodeAt(0)) & 0xffff, 0) % 360;
  return `hsl(${hue}, 60%, 50%)`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function iconForType(type: string) {
  if (type.includes('high_priority') || type.includes('alert')) return { Icon: AlertCircle, color: 'text-red-500' };
  if (type.includes('classif') || type.includes('analyz')) return { Icon: Bot, color: 'text-blue-500' };
  if (type.includes('draft')) return { Icon: FileText, color: 'text-amber-500' };
  if (type.includes('archive')) return { Icon: Archive, color: 'text-gray-400' };
  if (type.includes('trash')) return { Icon: Trash2, color: 'text-red-400' };
  if (type.includes('sync')) return { Icon: RefreshCw, color: 'text-brand-500' };
  return { Icon: CheckCircle, color: 'text-emerald-500' };
}

function labelForLog(log: ActionLog): string {
  const d = log.details ?? {};
  switch (log.actionType) {
    case 'thread_archived': return `Tråd arkiverad: "${d.subject ?? d.thread_id ?? '–'}"`;
    case 'thread_trashed':  return `Tråd raderad: "${d.subject ?? d.thread_id ?? '–'}"`;
    case 'draft:approved':  return `Utkast godkänt: "${d.subject ?? '–'}"`;
    case 'draft:sent':      return `Mail skickat: "${d.subject ?? '–'}"`;
    case 'classification:override':
      return `Klassificering ändrad: "${d.subject ?? '–'}" → ${d.new_classification ?? ''} / ${d.new_priority ?? ''}`;
    default:
      return log.actionType.replace(/_/g, ' ').replace(/:/g, ' — ');
  }
}

function hrefForLog(log: ActionLog): string | null {
  const d = log.details ?? {};
  if (d.thread_id) return `/threads/${d.thread_id}`;
  if (d.draft_id) return `/drafts/${d.draft_id}`;
  return null;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'nu';
  if (diffMins < 60) return `${diffMins} min sedan`;
  if (diffHours < 24) return `${diffHours}h sedan`;
  if (diffDays === 1) return 'igår';
  if (diffDays < 7) return date.toLocaleDateString('sv-SE', { weekday: 'long' });
  return date.toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' });
}

function groupByDay(logs: ActionLog[]): { label: string; logs: ActionLog[] }[] {
  const groups: Record<string, ActionLog[]> = {};
  const now = new Date();

  for (const log of logs) {
    const date = new Date(log.createdAt);
    const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
    let label: string;
    if (diffDays === 0) label = 'Idag';
    else if (diffDays === 1) label = 'Igår';
    else if (diffDays < 7) label = date.toLocaleDateString('sv-SE', { weekday: 'long' });
    else label = date.toLocaleDateString('sv-SE', { month: 'long', day: 'numeric' });

    if (!groups[label]) groups[label] = [];
    groups[label].push(log);
  }

  return Object.entries(groups).map(([label, logs]) => ({ label, logs }));
}

const LAST_SEEN_KEY = 'notifications_last_seen';

// ── Page ──────────────────────────────────────────────────────────────────────
export default function NotificationsPage() {
  const [accountFilter, setAccountFilter] = useState<string>('');

  const { data, isLoading, mutate } = useSWR(
    'action-logs-50',
    () => api.getActionLogs({ limit: 50 }),
    { revalidateOnFocus: true }
  );

  // Fetch accounts to show per-account filter (only if >1)
  const { data: accountsData } = useSWR(
    'notif-accounts',
    () => api.getAccounts(),
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
  const accounts: Account[] = (accountsData as any)?.accounts ?? [];

  const allLogs: ActionLog[] = data?.logs ?? [];

  // Filter by account if selected
  const logs = accountFilter
    ? allLogs.filter((l) => {
        const email: string = l.details?.account_email ?? l.details?.accountEmail ?? '';
        return email === accountFilter;
      })
    : allLogs;

  const groups = groupByDay(logs);

  // Mark as seen when page is opened
  useEffect(() => {
    localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <TopBar />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Notiser</h1>
            <p className="text-sm text-gray-400 mt-0.5">Aktivitetslogg — senaste 50 händelser</p>
          </div>
          <button
            onClick={() => mutate()}
            className="btn-secondary text-sm flex items-center gap-1.5"
          >
            <RefreshCw size={13} />
            Uppdatera
          </button>
        </div>

        {/* Per-account filter — only shown when >1 account */}
        {accounts.length > 1 && (
          <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
            <button
              onClick={() => setAccountFilter('')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                accountFilter === ''
                  ? 'bg-brand-500 text-white'
                  : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              Alla konton
            </button>
            {accounts.map((acc) => (
              <button
                key={acc.id}
                onClick={() => setAccountFilter(acc.emailAddress)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  accountFilter === acc.emailAddress
                    ? 'bg-brand-500 text-white'
                    : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: acc.color ?? emailColor(acc.emailAddress) }}
                />
                <span className="max-w-[120px] truncate">{acc.emailAddress}</span>
              </button>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-7 h-7 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
            <EmptyState
              icon={Bell}
              title="Inga notiser ännu"
              description="Händelser som arkivering, klassificering och utkast visas här"
            />
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map(({ label, logs: groupLogs }) => (
              <div key={label}>
                <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 px-1">
                  {label}
                </h2>
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
                  {groupLogs.map((log) => {
                    const { Icon, color } = iconForType(log.actionType);
                    const href = hrefForLog(log);
                    const text = labelForLog(log);
                    const time = formatRelativeTime(log.createdAt);

                    const logAccountEmail: string | null =
                      log.details?.account_email ?? log.details?.accountEmail ?? null;
                    const logAccount = logAccountEmail
                      ? accounts.find((a) => a.emailAddress === logAccountEmail) ?? null
                      : null;

                    const inner = (
                      <div className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <div className={`mt-0.5 shrink-0 ${color}`}>
                          <Icon size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{text}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-gray-400 dark:text-gray-500">{time}</p>
                            {logAccountEmail && (
                              <span className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: logAccount?.color ?? emailColor(logAccountEmail) }}
                                />
                                <span className="max-w-[100px] truncate">{logAccountEmail}</span>
                              </span>
                            )}
                          </div>
                        </div>
                        {href && (
                          <span className="text-xs text-brand-500 shrink-0 self-center">→</span>
                        )}
                      </div>
                    );

                    return href ? (
                      <Link key={log.id} href={href}>{inner}</Link>
                    ) : (
                      <div key={log.id}>{inner}</div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
