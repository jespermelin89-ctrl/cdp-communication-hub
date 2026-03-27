'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import TopBar from '@/components/TopBar';
import StatusBadge from '@/components/StatusBadge';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { Draft, DraftStatus } from '@/lib/types';

const STATUS_ICONS: Record<string, string> = {
  pending: '⏳',
  approved: '✅',
  sent: '📤',
  failed: '❌',
  discarded: '🗑️',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20',
  approved: 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20',
  sent: 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20',
  failed: 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20',
};

export default function DraftCenterPage() {
  const [allDrafts, setAllDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DraftStatus | ''>('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const { t } = useI18n();

  useEffect(() => {
    loadDrafts();
  }, []);

  async function loadDrafts() {
    try {
      setLoading(true);
      const result = await api.getDrafts({});
      setAllDrafts(result.drafts);
    } catch (err: any) {
      console.error('Failed to load drafts:', err);
    } finally {
      setLoading(false);
    }
  }

  function setError(id: string, msg: string) {
    setErrors((prev) => new Map(prev).set(id, msg));
  }

  function clearError(id: string) {
    setErrors((prev) => { const m = new Map(prev); m.delete(id); return m; });
  }

  async function handleApprove(draftId: string) {
    clearError(draftId);
    setActionLoading(draftId);
    try {
      await api.approveDraft(draftId);
      await loadDrafts();
    } catch (err: any) {
      setError(draftId, `${t.drafts.approve} failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSend(draftId: string) {
    if (!confirm(t.drafts.confirmSend)) return;
    clearError(draftId);
    setActionLoading(draftId);
    try {
      await api.sendDraft(draftId);
      await loadDrafts();
    } catch (err: any) {
      setError(draftId, `${t.drafts.sendFailed}: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDiscard(draftId: string) {
    if (!confirm(t.drafts.confirmDiscard)) return;
    clearError(draftId);
    setActionLoading(draftId);
    try {
      await api.discardDraft(draftId);
      await loadDrafts();
    } catch (err: any) {
      setError(draftId, `${t.drafts.discard} failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  }

  // Count by status
  const counts: Record<string, number> = {};
  for (const d of allDrafts) {
    counts[d.status] = (counts[d.status] || 0) + 1;
  }

  const visibleDrafts = filter ? allDrafts.filter((d) => d.status === filter) : allDrafts;

  const statusFilters: Array<{ value: DraftStatus | ''; label: string }> = [
    { value: '', label: t.drafts.all },
    { value: 'pending', label: t.drafts.pending },
    { value: 'approved', label: t.drafts.approved },
    { value: 'sent', label: t.drafts.sent },
    { value: 'failed', label: t.drafts.failed },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <TopBar pendingCount={counts['pending'] || 0} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t.drafts.title}</h1>
        </div>

        {/* Stat cards */}
        {!loading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {(['pending', 'approved', 'sent', 'failed'] as DraftStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(filter === s ? '' : s)}
                className={`rounded-2xl border px-4 py-3 text-left transition-all ${
                  filter === s
                    ? (STATUS_COLORS[s] || 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700') + ' shadow-sm'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="text-2xl mb-1">{STATUS_ICONS[s]}</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{counts[s] || 0}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{statusFilters.find((f) => f.value === s)?.label}</div>
              </button>
            ))}
          </div>
        )}

        {/* Filter pills */}
        <div className="flex gap-2 mb-5 overflow-x-auto">
          {statusFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                filter === f.value
                  ? 'bg-brand-500 text-white'
                  : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {f.value && <span>{STATUS_ICONS[f.value]}</span>}
              <span>{f.label}</span>
              {f.value && counts[f.value] != null && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                  filter === f.value ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                }`}>
                  {counts[f.value] || 0}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Drafts list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <div className="w-7 h-7 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
              <span className="text-sm">{t.drafts.loadingDrafts}</span>
            </div>
          </div>
        ) : visibleDrafts.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 text-center py-16 px-6">
            <div className="text-4xl mb-3">📝</div>
            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium mb-2">{t.drafts.noDrafts}</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm mb-5 max-w-sm mx-auto">{t.drafts.noDraftsHint}</p>
            <Link
              href="/inbox"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {t.drafts.goToInbox}
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleDrafts.map((draft) => (
              <div key={draft.id} className="flex flex-col">
                <div
                  className={`bg-white dark:bg-gray-800 rounded-2xl border shadow-sm overflow-hidden flex flex-col sm:flex-row sm:items-center gap-4 p-4 ${
                    draft.status === 'pending' ? 'border-amber-200 dark:border-amber-800' :
                    draft.status === 'approved' ? 'border-emerald-200 dark:border-emerald-800' :
                    draft.status === 'failed' ? 'border-red-200 dark:border-red-800' : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  {/* Draft info */}
                  <Link href={`/drafts/${draft.id}`} className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{STATUS_ICONS[draft.status]}</span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">{draft.subject}</span>
                      <StatusBadge status={draft.status} />
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                      {t.common.to}: {draft.toAddresses.join(', ')}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {t.common.from}: {draft.account.emailAddress} · {new Date(draft.createdAt).toLocaleString()}
                    </div>
                    {draft.bodyText && (
                      <div className="text-sm text-gray-600 dark:text-gray-300 mt-2 line-clamp-2 leading-relaxed">
                        {draft.bodyText.substring(0, 160)}…
                      </div>
                    )}
                  </Link>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {draft.status === 'pending' && (
                      <>
                        <Link href={`/drafts/${draft.id}`} className="btn-secondary text-sm">
                          {t.drafts.edit}
                        </Link>
                        <button
                          onClick={() => handleApprove(draft.id)}
                          disabled={actionLoading === draft.id}
                          className="btn-primary text-sm"
                        >
                          {actionLoading === draft.id ? '…' : t.drafts.approve}
                        </button>
                        <button
                          onClick={() => handleDiscard(draft.id)}
                          disabled={actionLoading === draft.id}
                          className="text-sm text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
                        >
                          {t.drafts.discard}
                        </button>
                      </>
                    )}
                    {draft.status === 'approved' && (
                      <button
                        onClick={() => handleSend(draft.id)}
                        disabled={actionLoading === draft.id}
                        className="btn-success text-sm"
                      >
                        {actionLoading === draft.id ? '…' : t.drafts.sendNow}
                      </button>
                    )}
                    {draft.status === 'failed' && (
                      <span className="text-sm text-red-500 dark:text-red-400 max-w-[180px] truncate" title={draft.errorMessage || ''}>
                        {draft.errorMessage || t.drafts.sendFailed}
                      </span>
                    )}
                  </div>
                </div>

                {/* Inline error */}
                {errors.get(draft.id) && (
                  <div className="flex items-center justify-between mt-1 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400">
                    <span>{errors.get(draft.id)}</span>
                    <button onClick={() => clearError(draft.id)} className="ml-2 text-red-400 hover:text-red-600 text-xs">✕</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
