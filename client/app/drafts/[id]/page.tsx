'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import TopBar from '@/components/TopBar';
import StatusBadge from '@/components/StatusBadge';
import { api } from '@/lib/api';
import type { Draft } from '@/lib/types';

export default function DraftDetailPage() {
  const params = useParams();
  const router = useRouter();
  const draftId = params.id as string;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // Edit fields
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [toAddresses, setToAddresses] = useState('');

  useEffect(() => {
    loadDraft();
  }, [draftId]);

  async function loadDraft() {
    try {
      setLoading(true);
      const result = await api.getDraft(draftId);
      setDraft(result.draft);
      setSubject(result.draft.subject);
      setBodyText(result.draft.bodyText);
      setToAddresses(result.draft.toAddresses.join(', '));
    } catch (err: any) {
      console.error('Failed to load draft:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.updateDraft(draftId, {
        subject,
        body_text: bodyText,
        to_addresses: toAddresses.split(',').map((e) => e.trim()).filter(Boolean),
      });
      setEditMode(false);
      await loadDraft();
    } catch (err: any) {
      alert(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    try {
      await api.approveDraft(draftId);
      await loadDraft();
    } catch (err: any) {
      alert(`Approve failed: ${err.message}`);
    }
  }

  async function handleSend() {
    if (!confirm('Send this email now? This action cannot be undone.')) return;
    try {
      await api.sendDraft(draftId);
      await loadDraft();
    } catch (err: any) {
      alert(`Send failed: ${err.message}`);
    }
  }

  async function handleDiscard() {
    if (!confirm('Discard this draft?')) return;
    try {
      await api.discardDraft(draftId);
      router.push('/drafts');
    } catch (err: any) {
      alert(`Discard failed: ${err.message}`);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <TopBar />
        <div className="text-center py-12 text-gray-500">Loading draft...</div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="min-h-screen bg-gray-50">
        <TopBar />
        <div className="text-center py-12 text-gray-500">Draft not found.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700">
            &larr; Back
          </button>
          <StatusBadge status={draft.status} />
        </div>

        <div className="card">
          {/* Meta Info */}
          <div className="border-b border-gray-100 pb-4 mb-4 space-y-2">
            <div className="text-sm text-gray-500">
              <span className="font-medium text-gray-700">From:</span> {draft.account.emailAddress}
            </div>

            {editMode ? (
              <div>
                <label className="text-sm font-medium text-gray-700">To:</label>
                <input
                  type="text"
                  value={toAddresses}
                  onChange={(e) => setToAddresses(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  placeholder="email@example.com, ..."
                />
              </div>
            ) : (
              <div className="text-sm text-gray-500">
                <span className="font-medium text-gray-700">To:</span> {draft.toAddresses.join(', ')}
              </div>
            )}

            {draft.thread && (
              <div className="text-sm text-gray-500">
                <span className="font-medium text-gray-700">Thread:</span> {draft.thread.subject}
              </div>
            )}
          </div>

          {/* Subject */}
          {editMode ? (
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg font-medium text-gray-900 mb-4"
            />
          ) : (
            <h2 className="text-lg font-medium text-gray-900 mb-4">{draft.subject}</h2>
          )}

          {/* Body */}
          {editMode ? (
            <textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              rows={12}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 font-mono resize-y"
            />
          ) : (
            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {draft.bodyText}
            </div>
          )}

          {/* Error Message */}
          {draft.status === 'failed' && draft.errorMessage && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              Send failed: {draft.errorMessage}
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-3">
            {draft.status === 'pending' && (
              <>
                {editMode ? (
                  <>
                    <button onClick={handleSave} disabled={saving} className="btn-primary">
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button onClick={() => { setEditMode(false); loadDraft(); }} className="btn-secondary">
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setEditMode(true)} className="btn-secondary">
                      Edit
                    </button>
                    <button onClick={handleApprove} className="btn-primary">
                      Approve
                    </button>
                    <button onClick={handleDiscard} className="text-sm text-gray-400 hover:text-red-500 ml-auto">
                      Discard
                    </button>
                  </>
                )}
              </>
            )}

            {draft.status === 'approved' && (
              <button onClick={handleSend} className="btn-success">
                Send Now
              </button>
            )}

            {draft.status === 'sent' && (
              <div className="text-sm text-emerald-600">
                Sent at {new Date(draft.sentAt!).toLocaleString()}
                {draft.gmailMessageId && (
                  <span className="text-gray-400 ml-2">ID: {draft.gmailMessageId}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
