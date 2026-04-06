'use client';

import { useEffect, useState } from 'react';
import TopBar from '@/components/TopBar';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Bot, Mail, CheckCircle, Archive, Brain, RefreshCw, AlertCircle } from 'lucide-react';
import EmptyState from '@/components/EmptyState';

function EventIcon({ type }: { type: string }) {
  if (type.includes('draft')) return <CheckCircle size={14} className="text-emerald-500" />;
  if (type.includes('archive') || type.includes('trash')) return <Archive size={14} className="text-amber-500" />;
  if (type.includes('analysis') || type.includes('classify')) return <Bot size={14} className="text-brand-500" />;
  if (type.includes('override') || type.includes('learning')) return <Brain size={14} className="text-violet-500" />;
  if (type.includes('sync')) return <RefreshCw size={14} className="text-blue-500" />;
  if (type.includes('high_priority') || type.includes('alert')) return <AlertCircle size={14} className="text-red-500" />;
  return <Mail size={14} className="text-gray-400" />;
}

export default function ActivityPage() {
  const { t } = useI18n();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const actionTypeLabels: Record<string, string> = {
    draft_created: t.activity.actionTypes.draft_created,
    draft_approved: t.activity.actionTypes.draft_approved,
    'draft:approved': t.activity.actionTypes.draft_approved,
    draft_sent: t.activity.actionTypes.draft_sent,
    draft_send_failed: t.activity.actionTypes.draft_send_failed,
    draft_discarded: t.activity.actionTypes.draft_discarded,
    analysis_run: t.activity.actionTypes.analysis_run,
    account_connected: t.activity.actionTypes.account_connected,
    account_disconnected: t.activity.actionTypes.account_disconnected,
    thread_archived: t.activity.actionTypes.thread_archived,
    thread_trashed: t.activity.actionTypes.thread_trashed,
    'classification:override': t.activity.actionTypes.classification_override,
    classification_override: t.activity.actionTypes.classification_override,
    'alert:high_priority': t.activity.actionTypes.alert_high_priority,
    alert_high_priority: t.activity.actionTypes.alert_high_priority,
    sync: t.activity.actionTypes.sync,
  };

  function formatEventType(type: string): string {
    return actionTypeLabels[type] ?? type.replace(/[_:]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function formatRelative(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return t.time.justNow;
    if (mins < 60) return t.time.minutesAgo.replace('{n}', String(mins));
    if (hours < 24) return t.time.hoursAgo.replace('{n}', String(hours));
    if (days === 1) return t.time.yesterday;
    return new Date(dateStr).toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' });
  }

  useEffect(() => {
    loadLogs(1);
  }, []);

  async function loadLogs(p: number) {
    try {
      const res = await api.getActionLogs({ page: p, limit: 30 });
      const newLogs = res.logs ?? [];
      setLogs((prev) => (p === 1 ? newLogs : [...prev, ...newLogs]));
      setHasMore(newLogs.length === 30);
      setPage(p);
    } catch {
      // Non-critical — show empty state
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20 sm:pb-0">
      <TopBar />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t.activity.title}</h1>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">{t.activity.subtitle}</p>
          </div>
          <button
            onClick={() => { setLoading(true); loadLogs(1); }}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        {loading && page === 1 ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <EmptyState
            icon={Brain}
            title={t.activity.noLogs}
            description={t.activity.noLogsDescription}
          />
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-5 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />

            <div className="space-y-1">
              {logs.map((log, i) => (
                <div key={log.id ?? i} className="relative flex items-start gap-4 pl-12 py-3">
                  {/* Icon bubble */}
                  <div className="absolute left-3 top-3.5 w-5 h-5 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-full flex items-center justify-center">
                    <EventIcon type={log.actionType ?? log.eventType ?? ''} />
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm text-gray-800 dark:text-gray-200 font-medium">
                        {formatEventType(log.actionType ?? log.eventType ?? '')}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                        {formatRelative(log.createdAt)}
                      </span>
                    </div>
                    {log.resourceId && (
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                        {log.resourceType}: {log.resourceId.slice(0, 12)}…
                      </div>
                    )}
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-mono bg-gray-50 dark:bg-gray-700/50 rounded-lg px-2.5 py-1.5 border border-gray-100 dark:border-gray-700 line-clamp-2">
                        {JSON.stringify(log.metadata).slice(0, 120)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {hasMore && (
              <div className="flex justify-center mt-6">
                <button
                  onClick={() => loadLogs(page + 1)}
                  disabled={loading}
                  className="btn-secondary text-sm"
                >
                  {loading ? '…' : t.activity.loadMore}
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
