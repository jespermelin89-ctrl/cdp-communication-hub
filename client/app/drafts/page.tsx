'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import TopBar from '@/components/TopBar';
import StatusBadge from '@/components/StatusBadge';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Clock, CheckCircle, Send, XCircle, Trash2, FileText, ChevronDown, Inbox as InboxIcon } from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import { toast } from 'sonner';
import type { Draft, DraftStatus } from '@/lib/types';

function StatusIcon({ status, size = 18 }: { status: string; size?: number }) {
  const props = { size, strokeWidth: 1.75 };
  if (status === 'pending') return <Clock {...props} className="text-amber-500" />;
  if (status === 'approved') return <CheckCircle {...props} className="text-emerald-500" />;
  if (status === 'sent') return <Send {...props} className="text-blue-500" />;
  if (status === 'failed') return <XCircle {...props} className="text-red-500" />;
  if (status === 'discarded') return <Trash2 {...props} className="text-gray-400" />;
  return <FileText {...props} className="text-gray-400" />;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20',
  approved: 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20',
  sent: 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20',
  failed: 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20',
};

export default function DraftCenterPage() {
  const [filter, setFilter] = useState<DraftStatus | ''>('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { t } = useI18n();
  const { data: draftData, isLoading: loading, mutate: mutateDrafts } = useSWR(
    '/drafts',
    () => api.getDrafts({}),
    { refreshInterval: 30000, revalidateOnFocus: true }
  );
  const allDrafts: Draft[] = draftData?.drafts ?? [];

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
      api.recordLearning('draft_approved', { draft_id: draftId }, 'draft', draftId).catch(() => {});
      toast.success('Utkast godkänt — redo att skickas');
      await mutateDrafts();
    } catch (err: any) {
      setError(draftId, `${t.drafts.approve} failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleBulkApprove() {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    for (const id of selectedIds) {
      try {
        await api.approveDraft(id);
        api.recordLearning('draft_approved', { draft_id: id }, 'draft', id).catch(() => {});
      } catch {
        // continue with remaining
      }
    }
    setSelectedIds(new Set());
    setBulkLoading(false);
    await mutateDrafts();
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAllPending() {
    const pendingIds = visibleDrafts.filter((d) => d.status === 'pending').map((d) => d.id);
    setSelectedIds(new Set(pendingIds));
  }

  async function handleSend(draftId: string) {
    if (!confirm(t.drafts.confirmSend)) return;
    clearError(draftId);
    setActionLoading(draftId);
    try {
      await api.sendDraft(draftId);
      toast.success('Mail skickat!');
      await mutateDrafts();
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
      await mutateDrafts();
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
          {/* Bulk approve bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 dark:text-gray-400">{selectedIds.size} valda</span>
              <button
                onClick={handleBulkApprove}
                disabled={bulkLoading}
                className="btn-primary text-sm flex items-center gap-1.5"
              >
                {bulkLoading
                  ? <span className="w-3.5 h-3.5 border border-white/40 border-t-white rounded-full animate-spin" />
                  : <CheckCircle size={14} />}
                Godkänn valda
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                Avmarkera
              </button>
            </div>
          )}
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
                <div className="mb-1"><StatusIcon status={s} size={22} /></div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{counts[s] || 0}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{statusFilters.find((f) => f.value === s)?.label}</div>
              </button>
            ))}
          </div>
        )}

        {/* Filter pills */}
        <div className="flex items-center gap-2 mb-5 overflow-x-auto">
          {filter === 'pending' || filter === '' ? (
            <button
              onClick={selectAllPending}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Markera alla
            </button>
          ) : null}
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
              {f.value && <StatusIcon status={f.value} size={14} />}
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
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-300 dark:border-gray-600">
            <EmptyState
              icon={FileText}
              title={t.drafts.noDrafts}
              description={t.drafts.noDraftsHint}
              action={{ label: t.drafts.goToInbox, onClick: () => window.location.href = '/inbox' }}
            />
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
                  {/* Checkbox for pending */}
                  {draft.status === 'pending' && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(draft.id)}
                      onChange={() => toggleSelect(draft.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-brand-500 accent-brand-500 cursor-pointer"
                    />
                  )}
                  {/* Draft info */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === draft.id ? null : draft.id)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <StatusIcon status={draft.status} size={16} />
                      <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">{draft.subject}</span>
                      <StatusBadge status={draft.status} />
                      <ChevronDown
                        size={14}
                        className={`shrink-0 text-gray-400 ml-auto transition-transform ${expandedId === draft.id ? 'rotate-180' : ''}`}
                      />
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                      {t.common.to}: {draft.toAddresses.join(', ')}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {t.common.from}: {draft.account.emailAddress} · {new Date(draft.createdAt).toLocaleString()}
                    </div>
                    {draft.bodyText && expandedId !== draft.id && (
                      <div className="text-sm text-gray-600 dark:text-gray-300 mt-2 line-clamp-2 leading-relaxed">
                        {draft.bodyText.substring(0, 160)}…
                      </div>
                    )}
                    {/* Expanded preview */}
                    {expandedId === draft.id && draft.bodyText && (
                      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                        <div className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 rounded-xl px-4 py-3 whitespace-pre-wrap leading-relaxed border border-gray-100 dark:border-gray-700 max-h-48 overflow-y-auto">
                          {draft.bodyText}
                        </div>
                      </div>
                    )}
                  </div>

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
