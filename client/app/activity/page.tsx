'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import TopBar from '@/components/TopBar';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

interface ActionLog {
  id: string;
  actionType: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, any>;
  createdAt: string;
  user: { email: string; name: string | null };
}

const ACTION_ICONS: Record<string, string> = {
  draft_created: '✏️',
  draft_approved: '✅',
  draft_sent: '📤',
  draft_send_failed: '❌',
  draft_discarded: '🗑️',
  analysis_run: '🤖',
  account_connected: '🔗',
  account_disconnected: '🔌',
};

const ACTION_COLORS: Record<string, string> = {
  draft_created: 'bg-blue-50 border-blue-200 text-blue-700',
  draft_approved: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  draft_sent: 'bg-teal-50 border-teal-200 text-teal-700',
  draft_send_failed: 'bg-red-50 border-red-200 text-red-700',
  draft_discarded: 'bg-gray-50 border-gray-200 text-gray-500',
  analysis_run: 'bg-violet-50 border-violet-200 text-violet-700',
  account_connected: 'bg-brand-50 border-brand-200 text-brand-700',
  account_disconnected: 'bg-orange-50 border-orange-200 text-orange-700',
};

const ALL_ACTION_TYPES = [
  'draft_created', 'draft_approved', 'draft_sent', 'draft_send_failed',
  'draft_discarded', 'analysis_run', 'account_connected', 'account_disconnected',
] as const;

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s sedan`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m sedan`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h sedan`;
  return new Date(dateStr).toLocaleDateString();
}

function metaSummary(log: ActionLog): string | null {
  const m = log.metadata || {};
  if (log.actionType === 'draft_sent' && m.subject) return `"${m.subject}"`;
  if (log.actionType === 'draft_created' && m.subject) return `"${m.subject}"`;
  if (log.actionType === 'draft_approved' && m.subject) return `"${m.subject}"`;
  if (log.actionType === 'draft_send_failed' && m.error) return m.error;
  if (log.actionType === 'analysis_run' && m.classification) return m.classification;
  if (log.actionType === 'account_connected' && m.email) return m.email;
  if (log.actionType === 'account_disconnected' && m.email) return m.email;
  return null;
}

function targetLink(log: ActionLog): { href: string; label: string } | null {
  if (!log.targetId) return null;
  if (log.targetType === 'draft') return { href: `/drafts/${log.targetId}`, label: 'Öppna utkast' };
  if (log.targetType === 'thread') return { href: `/threads/${log.targetId}`, label: 'Öppna tråd' };
  return null;
}

export default function ActivityPage() {
  const { t } = useI18n();
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<string>('');

  const LIMIT = 30;

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      const result = await api.getActionLogs({ page, limit: LIMIT });
      // client-side filter if needed (API doesn't support action_type filter yet in the route params)
      const allLogs = result.logs as ActionLog[];
      const filtered = filter ? allLogs.filter((l) => l.actionType === filter) : allLogs;
      setLogs(filtered);
      setTotalPages(result.pagination.totalPages);
      setTotal(result.pagination.total);
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Reset to page 1 on filter change
  function handleFilter(type: string) {
    setFilter(type);
    setPage(1);
  }

  const actionLabel = (type: string): string => {
    return (t.activity.actionTypes as Record<string, string>)[type] || type;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">{t.activity.title}</h1>
          <p className="text-sm text-gray-400 mt-1">{t.activity.subtitle}</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {(['draft_sent', 'draft_approved', 'analysis_run', 'draft_send_failed'] as const).map((type) => {
            const count = logs.filter((l) => l.actionType === type).length;
            return (
              <button
                key={type}
                onClick={() => handleFilter(filter === type ? '' : type)}
                className={`rounded-2xl border px-4 py-3 text-left transition-all ${
                  filter === type
                    ? ACTION_COLORS[type] + ' shadow-sm'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="text-2xl mb-1">{ACTION_ICONS[type]}</div>
                <div className="text-lg font-bold text-gray-900">{count}</div>
                <div className="text-xs text-gray-500 leading-tight">{actionLabel(type)}</div>
              </button>
            );
          })}
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-2 flex-wrap mb-5">
          <span className="text-xs text-gray-400 font-medium">{t.activity.filterLabel}:</span>
          <button
            onClick={() => handleFilter('')}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              filter === '' ? 'bg-brand-500 text-white border-brand-500' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t.activity.all}
          </button>
          {ALL_ACTION_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => handleFilter(filter === type ? '' : type)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filter === type
                  ? 'bg-brand-500 text-white border-brand-500'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {ACTION_ICONS[type]} {actionLabel(type)}
            </button>
          ))}
        </div>

        {/* Log list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <div className="w-7 h-7 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
              <span className="text-sm">{t.activity.loading}</span>
            </div>
          </div>
        ) : logs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 text-center py-16">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-gray-400 text-sm">{t.activity.noLogs}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => {
              const meta = metaSummary(log);
              const link = targetLink(log);
              const colorClass = ACTION_COLORS[log.actionType] || 'bg-gray-50 border-gray-200 text-gray-600';

              return (
                <div
                  key={log.id}
                  className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-3.5 flex items-center gap-4"
                >
                  {/* Icon */}
                  <span className="text-xl shrink-0 w-8 text-center">
                    {ACTION_ICONS[log.actionType] || '📌'}
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${colorClass}`}>
                        {actionLabel(log.actionType)}
                      </span>
                      {meta && (
                        <span className="text-sm text-gray-700 truncate">{meta}</span>
                      )}
                    </div>
                    {link && (
                      <Link
                        href={link.href}
                        className="text-xs text-brand-600 hover:text-brand-700 mt-0.5 inline-block"
                      >
                        {link.label} →
                      </Link>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div className="shrink-0 text-right">
                    <div className="text-xs text-gray-400">{relativeTime(log.createdAt)}</div>
                    <div className="text-xs text-gray-300">{new Date(log.createdAt).toLocaleTimeString()}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-secondary text-sm disabled:opacity-40"
            >
              ←
            </button>
            <span className="text-sm text-gray-500">
              {t.activity.page} {page} {t.activity.of} {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="btn-secondary text-sm disabled:opacity-40"
            >
              →
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
