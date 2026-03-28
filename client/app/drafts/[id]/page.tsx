'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import TopBar from '@/components/TopBar';
import ConfirmDialog from '@/components/ConfirmDialog';
import StatusBadge from '@/components/StatusBadge';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { Draft } from '@/lib/types';

const STATUS_BANNERS: Record<string, string> = {
  pending: 'border-amber-200 dark:border-amber-800',
  approved: 'border-emerald-200 dark:border-emerald-800',
  sent: 'border-blue-200 dark:border-blue-800',
  failed: 'border-red-200 dark:border-red-800',
  discarded: 'border-gray-200 dark:border-gray-700',
};

export default function DraftDetailPage() {
  const params = useParams();
  const router = useRouter();
  const draftId = params.id as string;
  const { t } = useI18n();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actioning, setActioning] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [toAddresses, setToAddresses] = useState('');
  const [autoSavedAt, setAutoSavedAt] = useState<Date | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    } catch {
      // Show not-found state
    } finally {
      setLoading(false);
    }
  }

  // Auto-save: debounce 30s after last keystroke while in edit mode
  useEffect(() => {
    if (!editMode || !draft) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      try {
        await api.updateDraft(draftId, {
          subject,
          body_text: bodyText,
          to_addresses: toAddresses.split(',').map((e) => e.trim()).filter(Boolean),
        });
        setAutoSavedAt(new Date());
      } catch {
        // silent — user can still manually save
      }
    }, 30000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, bodyText, toAddresses, editMode]);

  async function handleSave() {
    setError(null);
    setSaving(true);
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    try {
      await api.updateDraft(draftId, {
        subject,
        body_text: bodyText,
        to_addresses: toAddresses.split(',').map((e) => e.trim()).filter(Boolean),
      });
      setAutoSavedAt(null);
      setEditMode(false);
      await loadDraft();
    } catch (err: any) {
      setError(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    setError(null);
    setActioning(true);
    try {
      await api.approveDraft(draftId);
      api.recordLearning('draft_approved', { draft_id: draftId }, 'draft', draftId).catch(() => {});
      await loadDraft();
    } catch (err: any) {
      setError(`Approve failed: ${err.message}`);
    } finally {
      setActioning(false);
    }
  }

  async function executeSend() {
    setSendConfirmOpen(false);
    setError(null);
    setActioning(true);
    try {
      await api.sendDraft(draftId);
      await loadDraft();
    } catch (err: any) {
      setError(`Misslyckades att skicka: ${err.message}`);
    } finally {
      setActioning(false);
    }
  }

  function handleSend() {
    setSendConfirmOpen(true);
  }

  async function executeDiscard() {
    setDiscardConfirmOpen(false);
    setError(null);
    setActioning(true);
    try {
      await api.discardDraft(draftId);
      api.recordLearning('draft_discarded', { draft_id: draftId }, 'draft', draftId).catch(() => {});
      router.push('/drafts');
    } catch (err: any) {
      setError(`Misslyckades att kasta: ${err.message}`);
      setActioning(false);
    }
  }

  function handleDiscard() {
    setDiscardConfirmOpen(true);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <TopBar />
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <div className="w-7 h-7 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
            <span className="text-sm">{t.draftDetail.loading}</span>
          </div>
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <TopBar />
        <div className="text-center py-24 text-gray-400">{t.draftDetail.notFound}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <TopBar />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Header row */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.back()}
            className="text-sm text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          >
            {t.draftDetail.back}
          </button>
          <div className="flex items-center gap-3">
            {editMode && (
              <span className="text-xs text-brand-600 font-medium bg-brand-50 dark:bg-brand-900/20 px-2 py-0.5 rounded-full border border-brand-200 dark:border-brand-800">
                {t.draftDetail.editMode}
              </span>
            )}
            <StatusBadge status={draft.status} />
          </div>
        </div>

        {/* Inline error */}
        {error && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300">
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 shrink-0">✕</button>
          </div>
        )}

        {/* Main card */}
        <div className={`bg-white dark:bg-gray-800 rounded-2xl border shadow-sm overflow-hidden ${STATUS_BANNERS[draft.status] || 'border-gray-200 dark:border-gray-700'}`}>
          {/* Metadata strip */}
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 space-y-2 text-sm">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-medium text-gray-400 w-12 shrink-0">{t.common.from}</span>
              <span className="text-gray-700 dark:text-gray-300">{draft.account.emailAddress}</span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-xs font-medium text-gray-400 w-12 shrink-0">{t.common.to}</span>
              {editMode ? (
                <input
                  type="text"
                  value={toAddresses}
                  onChange={(e) => setToAddresses(e.target.value)}
                  className="flex-1 px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  placeholder="email@example.com, ..."
                />
              ) : (
                <span className="text-gray-700 dark:text-gray-300">{draft.toAddresses.join(', ')}</span>
              )}
            </div>

            {draft.thread && (
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-medium text-gray-400 w-12 shrink-0">{t.draftDetail.thread}</span>
                {draft.threadId ? (
                  <Link href={`/threads/${draft.threadId}`} className="text-brand-600 hover:text-brand-700 truncate">
                    {draft.thread.subject || '(No Subject)'}
                  </Link>
                ) : (
                  <span className="text-gray-600 dark:text-gray-400 truncate">{draft.thread.subject}</span>
                )}
              </div>
            )}
          </div>

          {/* Subject */}
          <div className="px-6 pt-5">
            {editMode ? (
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl font-semibold text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 text-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            ) : (
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{draft.subject}</h2>
            )}
          </div>

          {/* Body */}
          <div className="px-6 py-4">
            {editMode ? (
              <>
                <textarea
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  rows={14}
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 font-mono resize-y focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                />
                <div className="flex items-center justify-between mt-1.5 text-xs text-gray-400">
                  <span>
                    {bodyText.length} tecken · {bodyText.trim() ? bodyText.trim().split(/\s+/).length : 0} ord
                  </span>
                  {autoSavedAt && (
                    <span className="text-emerald-500">
                      {t.draftDetail.autoSaved} {autoSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                {draft.bodyText}
              </div>
            )}
          </div>

          {/* Send error */}
          {draft.status === 'failed' && draft.errorMessage && (
            <div className="mx-6 mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300">
              {draft.errorMessage}
            </div>
          )}

          {/* Sent confirmation */}
          {draft.status === 'sent' && draft.sentAt && (
            <div className="mx-6 mb-4 px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl text-sm text-emerald-700 dark:text-emerald-300">
              {t.draftDetail.sentAt}: {new Date(draft.sentAt).toLocaleString()}
              {draft.gmailMessageId && (
                <span className="text-emerald-500 ml-2 text-xs">· {draft.gmailMessageId}</span>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="px-6 pb-6 pt-2 border-t border-gray-100 dark:border-gray-700 flex flex-wrap items-center gap-3">
            {draft.status === 'pending' && (
              editMode ? (
                <>
                  <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
                    {saving ? t.draftDetail.saving : t.draftDetail.saveChanges}
                  </button>
                  <button
                    onClick={() => { setEditMode(false); loadDraft(); }}
                    className="btn-secondary text-sm"
                  >
                    {t.settings.cancel}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setEditMode(true)} className="btn-secondary text-sm">
                    {t.drafts.edit}
                  </button>
                  <button onClick={handleApprove} disabled={actioning} className="btn-primary text-sm">
                    {t.drafts.approve}
                  </button>
                  <button
                    onClick={handleDiscard}
                    disabled={actioning}
                    className="ml-auto text-sm text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
                  >
                    {t.drafts.discard}
                  </button>
                </>
              )
            )}

            {draft.status === 'approved' && (
              <button onClick={handleSend} disabled={actioning} className="btn-success text-sm">
                {t.drafts.sendNow}
              </button>
            )}
          </div>
        </div>

        {/* Timestamps */}
        <div className="mt-4 text-xs text-gray-400 text-right">
          {new Date(draft.createdAt).toLocaleString()}
          {draft.approvedAt && (
            <span className="ml-3">· {t.drafts.approved}: {new Date(draft.approvedAt).toLocaleString()}</span>
          )}
        </div>
      </main>

      {/* Send confirmation */}
      <ConfirmDialog
        open={sendConfirmOpen}
        title="Skicka mail?"
        description="Mailet skickas direkt via Gmail. Det går inte att ångra."
        confirmLabel="Skicka"
        cancelLabel="Avbryt"
        variant="warning"
        onConfirm={executeSend}
        onCancel={() => setSendConfirmOpen(false)}
      />

      {/* Discard confirmation */}
      <ConfirmDialog
        open={discardConfirmOpen}
        title="Kasta utkast?"
        description="Utkastet markeras som kastat och kan inte återställas."
        confirmLabel="Kasta"
        cancelLabel="Avbryt"
        variant="danger"
        onConfirm={executeDiscard}
        onCancel={() => setDiscardConfirmOpen(false)}
      />
    </div>
  );
}
