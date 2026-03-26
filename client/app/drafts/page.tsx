'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import TopBar from '@/components/TopBar';
import StatusBadge from '@/components/StatusBadge';
import { api } from '@/lib/api';
import type { Draft, DraftStatus } from '@/lib/types';

export default function DraftCenterPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DraftStatus | ''>('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadDrafts();
  }, [filter]);

  async function loadDrafts() {
    try {
      setLoading(true);
      const params: any = {};
      if (filter) params.status = filter;
      const result = await api.getDrafts(params);
      setDrafts(result.drafts);
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
      alert(`Approve failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSend(draftId: string) {
    if (!confirm('Are you sure you want to send this email?')) return;
    setActionLoading(draftId);
    try {
      await api.sendDraft(draftId);
      await loadDrafts();
    } catch (err: any) {
      alert(`Send failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDiscard(draftId: string) {
    if (!confirm('Discard this draft?')) return;
    setActionLoading(draftId);
    try {
      await api.discardDraft(draftId);
      await loadDrafts();
    } catch (err: any) {
      alert(`Discard failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  }

  const statusFilters: Array<{ value: DraftStatus | ''; label: string }> = [
    { value: '', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'sent', label: 'Sent' },
    { value: 'failed', label: 'Failed' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Draft Center</h1>
        </div>

        {/* Status Filters */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {statusFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                filter === f.value
                  ? 'bg-brand-500 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Drafts List */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading drafts...</div>
        ) : drafts.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-500">No drafts found.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {drafts.map((draft) => (
              <div
                key={draft.id}
                className="card flex flex-col sm:flex-row sm:items-center gap-4"
              >
                {/* Draft Info */}
                <Link href={`/drafts/${draft.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900 truncate">{draft.subject}</span>
                    <StatusBadge status={draft.status} />
                  </div>
                  <div className="text-sm text-gray-500 truncate">
                    To: {draft.toAddresses.join(', ')}
                  </div>
                  <div className="text-sm text-gray-400 truncate mt-0.5">
                    From: {draft.account.emailAddress} | {new Date(draft.createdAt).toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-600 mt-2 line-clamp-2">
                    {draft.bodyText.substring(0, 150)}...
                  </div>
                </Link>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {draft.status === 'pending' && (
                    <>
                      <Link href={`/drafts/${draft.id}`} className="btn-secondary text-sm">
                        Edit
                      </Link>
                      <button
                        onClick={() => handleApprove(draft.id)}
                        disabled={actionLoading === draft.id}
                        className="btn-primary text-sm"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleDiscard(draft.id)}
                        disabled={actionLoading === draft.id}
                        className="text-sm text-gray-400 hover:text-red-500"
                      >
                        Discard
                      </button>
                    </>
                  )}
                  {draft.status === 'approved' && (
                    <button
                      onClick={() => handleSend(draft.id)}
                      disabled={actionLoading === draft.id}
                      className="btn-success text-sm"
                    >
                      Send Now
                    </button>
                  )}
                  {draft.status === 'failed' && (
                    <span className="text-sm text-red-500">
                      {draft.errorMessage || 'Send failed'}
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
