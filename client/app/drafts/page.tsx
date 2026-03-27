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
  pending: 'border-amber-200 bg-amber-50',
  approved: 'border-emerald-200 bg-emerald-50',
  sent: 'border-blue-200 bg-blue-50',
  failed: 'border-red-200 bg-red-50',
};

export default function DraftCenterPage() {
  const [allDrafts, setAllDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DraftStatus | ''>('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    loadDrafts();
  }, []);

  async function loadDrafts() {
    try {
      setLoading(true);
      // Load all drafts without filter so we can show counts
      const result = await api.getDrafts({});
      setAllDrafts(result.drafts);
    } catch (err: any) {
      console.error('Failed to load drafts:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(draftId: string) {
    setActionLoading(draftId);
    try {
      await api.approveDraft(draftId);
      await loadDrafts();
    } catch (err: any) {
      alert(`${t.drafts.approve} failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSend(draftId: string) {
    if (!confirm(t.drafts.confirmSend)) return;
    setActionLoading(draftId);
    try {
      await api.sendDraft(draftId);
      await loadDrafts();
    } catch (err: any) {
      alert(`${t.drafts.sendFailed}: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDiscard(draftId: string) {
    if (!confirm(t.drafts.confirmDiscard)) return;
    setActionLoading(draftId);
    try {
      await api.discardDraft(draftId);
      await loadDrafts();
    } catch (err: any) {
      alert(`${t.drafts.discard} failed: ${err.message}`);
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
    <div className="min-h-screen bg-gray-50">
      <TopBar pendingCount={counts['pending'] || 0} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{t.drafts.title}</h1>
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
                    ? (STATUS_COLORS[s] || 'bg-gray-50 border-gray-200') + ' shadow-sm'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="text-2xl mb-1">{STATUS_ICONS[s]}</div>
                <div className="text-2xl font-bold text-gray-900">{counts[s] || 0}</div>
                <div className="text-xs text-gray-500">{statusFilters.find((f) => f.value === s)?.label}</div>
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
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f.value && <span>{STATUS_ICONS[f.value]}</span>}
              <span>{f.label}</span>
              {f.value && counts[f.value] != null && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                  filter === f.value ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
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
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 text-center py-16">
            <div className="text-4xl mb-3">📝</div>
            <p className="text-gray-400 text-sm">{t.drafts.noDrafts}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleDrafts.map((draft) => (
              <div
                key={draft.id}
                className={`bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col sm:flex-row sm:items-center gap-4 p-4 ${
                  draft.status === 'pending' ? 'border-amber-200' :
                  draft.status === 'approved' ? 'border-emerald-200' :
                  draft.status === 'failed' ? 'border-red-200' : 'border-gray-200'
                }`}
              >
                {/* Draft info */}
                <Link href={`/drafts/${draft.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{STATUS_ICONS[draft.status]}</span>
                    <span className="font-semibold text-gray-900 truncate">{draft.subject}</span>
                    <StatusBadge status={draft.status} />
                  </div>
                  <div className="text-sm text-gray-500 truncate">
                    {t.common.to}: {draft.toAddresses.join(', ')}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {t.common.from}: {draft.account.emailAddress} · {new Date(draft.createdAt).toLocaleString()}
                  </div>
                  {draft.bodyText && (
                    <div className="text-sm text-gray-600 mt-2 line-clamp-2 leading-relaxed">
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
                        className="text-sm text-gray-400 hover:text-red-500"
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
                    <span className="text-sm text-red-500 max-w-[180px] truncate" title={draft.errorMessage || ''}>
                      {draft.errorMessage || t.drafts.sendFailed}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
