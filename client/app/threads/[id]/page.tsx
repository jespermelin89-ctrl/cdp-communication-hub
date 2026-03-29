'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import TopBar from '@/components/TopBar';
import ConfirmDialog from '@/components/ConfirmDialog';
import PriorityBadge from '@/components/PriorityBadge';
import { Archive, Trash2, Bot, MailOpen, UserCircle2, PenLine, ChevronDown, ChevronUp, Check, Zap, Send, CornerDownLeft, MailX, Forward, Star, Paperclip, Download, Tag, X, Clock } from 'lucide-react';
import { sanitizeHtml } from '@/lib/sanitize-html';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { EmailThread, AIAnalysis } from '@/lib/types';

const CLASSIFICATION_COLORS: Record<string, string> = {
  lead: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
  partner: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
  personal: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800',
  spam: 'bg-red-100 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
  operational: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600',
  founder: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800',
  outreach: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800',
};

const CLASSIFICATION_LABELS: Record<string, string> = {
  lead: 'Lead', partner: 'Partner', personal: 'Personal',
  spam: 'Spam', operational: 'Operational', founder: 'Founder', outreach: 'Outreach',
};

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function initials(email: string): string {
  const name = email.split('@')[0];
  return name.slice(0, 2).toUpperCase();
}

function avatarColor(email: string): string {
  const colors = ['bg-violet-400', 'bg-blue-400', 'bg-emerald-400', 'bg-amber-400', 'bg-rose-400', 'bg-indigo-400'];
  let hash = 0;
  for (const c of email) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return colors[hash % colors.length];
}

export default function ThreadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const threadId = params.id as string;
  const { t } = useI18n();

  // Prev/next navigation from inbox thread list stored in sessionStorage
  const threadList = useMemo<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = sessionStorage.getItem('cdp-thread-list');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, []);
  const currentIndex = threadList.indexOf(threadId);
  const prevId = currentIndex > 0 ? threadList[currentIndex - 1] : null;
  const nextId = currentIndex < threadList.length - 1 ? threadList[currentIndex + 1] : null;

  const { data: threadData, isLoading: loading, mutate: mutateThread } = useSWR(
    threadId ? `/threads/${threadId}` : null,
    () => api.getThread(threadId),
    { revalidateOnFocus: true }
  );
  const thread = threadData?.thread ?? null;

  const [analyzing, setAnalyzing] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [snoozing, setSnoozing] = useState(false);
  const [markingUnread, setMarkingUnread] = useState(false);
  const [starring, setStarring] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [draftInstruction, setDraftInstruction] = useState('');
  const [syncingMessages, setSyncingMessages] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [trashConfirmOpen, setTrashConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quickReply, setQuickReply] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [contact, setContact] = useState<any>(null);

  // Writing modes for draft generation
  const [writingModes, setWritingModes] = useState<any[]>([]);
  const [selectedMode, setSelectedMode] = useState('');

  // Labels
  const [threadLabels, setThreadLabels] = useState<string[]>([]);
  const [labelInput, setLabelInput] = useState('');
  const [savingLabels, setSavingLabels] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Classification override
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overridePriority, setOverridePriority] = useState('');
  const [overrideClassification, setOverrideClassification] = useState('');
  const [overriding, setOverriding] = useState(false);
  const [overrideSaved, setOverrideSaved] = useState(false);

  // Load writing profile once per threadId
  useEffect(() => {
    api.getWritingProfile().then((r) => {
      const modes = r.profile?.modes ?? [];
      setWritingModes(modes);
      if (modes.length > 0) setSelectedMode(modes[0].name ?? '');
    }).catch(() => {});
  }, [threadId]);

  // Side-effects that depend on the loaded thread
  useEffect(() => {
    if (!thread) return;
    if (!thread.isRead) {
      api.markThreadAsRead(threadId).catch(() => {});
    }
    loadContactForThread(thread);
    // Sync custom labels (exclude Gmail system labels)
    const custom = (thread.labels ?? []).filter((l: string) => !['INBOX','UNREAD','STARRED','SENT','DRAFT','SPAM','TRASH','IMPORTANT'].includes(l));
    setThreadLabels(custom);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.id]);

  async function loadContactForThread(thread: any) {
    try {
      const accountEmail = thread.account?.emailAddress;
      // Find the first message sender that isn't the account owner
      const externalSender = thread.messages?.find((m: any) => m.fromAddress !== accountEmail)?.fromAddress;
      if (!externalSender) return;
      const res = await api.getContacts();
      const match = (res.contacts ?? []).find((c: any) => c.emailAddress === externalSender);
      if (match) setContact(match);
    } catch {
      // silently ignore — contact panel is optional
    }
  }

  async function handleSyncMessages() {
    setError(null);
    setSyncingMessages(true);
    try {
      await api.syncMessages(threadId);
      await mutateThread();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncingMessages(false);
    }
  }

  async function handleAnalyze() {
    setError(null);
    setAnalyzing(true);
    try {
      await api.syncMessages(threadId);
      await api.analyzeThread(threadId);
      await mutateThread();
      toast.success('Analys klar');
    } catch (err: any) {
      setError(`Analysis failed: ${err.message}`);
      toast.error('Analys misslyckades');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleArchive() {
    setArchiving(true);
    try {
      await api.archiveThread(threadId);
      api.recordLearning('thread_archived', { thread_id: threadId }, 'thread', threadId).catch(() => {});
      toast.success('Tråd arkiverad');
      router.push('/inbox');
    } catch (err: any) {
      setError(`Arkivering misslyckades: ${err.message}`);
      setArchiving(false);
    }
  }

  async function handleToggleStar() {
    if (!thread) return;
    const isStarred = thread.labels?.includes('STARRED');
    setStarring(true);
    try {
      if (isStarred) {
        await api.unstarThread(threadId);
        toast.success('Stjärna borttagen');
      } else {
        await api.starThread(threadId);
        toast.success('Stjärnmärkt');
      }
      await mutateThread();
    } catch {
      toast.error('Kunde inte ändra stjärnmärkning');
    } finally {
      setStarring(false);
    }
  }

  async function handleMarkUnread() {
    setMarkingUnread(true);
    try {
      await api.markThreadAsUnread(threadId);
      toast.success('Markerad som oläst');
      router.push('/inbox');
    } catch {
      toast.error('Kunde inte markera som oläst');
    } finally {
      setMarkingUnread(false);
    }
  }

  async function handleRestore() {
    try {
      await api.restoreThread(threadId);
      toast.success(t.thread.restoreSuccess);
      await mutateThread();
    } catch {
      toast.error('Kunde inte återställa tråden');
    }
  }

  async function handleDownloadAttachment(msg: any, att: any) {
    const key = `${msg.id}:${att.attachmentId}`;
    setDownloadingId(key);
    try {
      const blob = await api.downloadAttachment(threadId, msg.gmailMessageId ?? msg.id, att.attachmentId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.filename || 'attachment';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Kunde inte ladda ner bilagan');
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleAddLabel(label: string) {
    const trimmed = label.trim();
    if (!trimmed || threadLabels.includes(trimmed)) return;
    const next = [...threadLabels, trimmed];
    setSavingLabels(true);
    try {
      await api.updateThread(threadId, { labels: [...(thread?.labels ?? []).filter((l: string) => ['INBOX','UNREAD','STARRED','SENT','DRAFT','SPAM','TRASH','IMPORTANT'].includes(l)), ...next] });
      setThreadLabels(next);
      setLabelInput('');
      await mutateThread();
    } catch {
      toast.error('Kunde inte spara etikett');
    } finally {
      setSavingLabels(false);
    }
  }

  async function handleRemoveLabel(label: string) {
    const next = threadLabels.filter(l => l !== label);
    setSavingLabels(true);
    try {
      await api.updateThread(threadId, { labels: [...(thread?.labels ?? []).filter((l: string) => ['INBOX','UNREAD','STARRED','SENT','DRAFT','SPAM','TRASH','IMPORTANT'].includes(l)), ...next] });
      setThreadLabels(next);
      await mutateThread();
    } catch {
      toast.error('Kunde inte ta bort etikett');
    } finally {
      setSavingLabels(false);
    }
  }

  function handleTrash() {
    setTrashConfirmOpen(true);
  }

  async function executeTrash() {
    setTrashConfirmOpen(false);
    try {
      await api.trashThread(threadId);
      api.recordLearning('thread_trashed', { thread_id: threadId }, 'thread', threadId).catch(() => {});
      router.push('/inbox');
    } catch (err: any) {
      setError(`Flytt till papperskorgen misslyckades: ${err.message}`);
    }
  }

  async function handleGenerateDraft() {
    if (!draftInstruction.trim()) return;
    setError(null);
    setGeneratingDraft(true);
    try {
      const modePrefix = selectedMode ? `[Skrivsätt: ${selectedMode}] ` : '';
      const result = await api.generateDraft({
        account_id: thread!.account.id!,
        thread_id: threadId,
        instruction: `${modePrefix}${draftInstruction}`,
      });
      setDraftInstruction('');
      toast.success('Utkast skapat — granska i Utkast');
      router.push(`/drafts/${result.draft.id}`);
    } catch (err: any) {
      setError(`Generate draft failed: ${err.message}`);
      toast.error('Kunde inte skapa utkast');
    } finally {
      setGeneratingDraft(false);
    }
  }

  async function handleQuickReply() {
    if (!quickReply.trim() || !thread) return;
    setSendingReply(true);
    try {
      const modePrefix = selectedMode ? `[Skrivsätt: ${selectedMode}] ` : '';
      const result = await api.generateDraft({
        account_id: thread.account.id!,
        thread_id: threadId,
        instruction: `${modePrefix}Svara kort: ${quickReply}`,
      });
      setQuickReply('');
      toast.success('Utkast skapat — granska innan du skickar');
      router.push(`/drafts/${result.draft.id}`);
    } catch {
      toast.error('Kunde inte skapa svar');
    } finally {
      setSendingReply(false);
    }
  }

  async function handleOverrideClassification() {
    if (!overridePriority && !overrideClassification) return;
    setOverriding(true);
    try {
      await api.recordLearning(
        'classification:override',
        {
          thread_id: threadId,
          subject: thread?.subject,
          original_priority: analysis?.priority,
          original_classification: analysis?.classification,
          new_priority: overridePriority || analysis?.priority,
          new_classification: overrideClassification || analysis?.classification,
        },
        'thread',
        threadId
      );
      setOverrideSaved(true);
      setOverrideOpen(false);
      setTimeout(() => setOverrideSaved(false), 3000);
    } catch (err: any) {
      setError(`Kunde inte spara klassificering: ${err.message}`);
    } finally {
      setOverriding(false);
    }
  }

  function computeSnoozeDate(opt: { hours?: number; tomorrow9?: boolean; nextMonday?: boolean; days?: number }): string {
    const now = new Date();
    if (opt.hours) {
      now.setHours(now.getHours() + opt.hours);
      return now.toISOString();
    }
    if (opt.tomorrow9) {
      now.setDate(now.getDate() + 1);
      now.setHours(9, 0, 0, 0);
      return now.toISOString();
    }
    if (opt.nextMonday) {
      const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
      now.setDate(now.getDate() + daysUntilMonday);
      now.setHours(9, 0, 0, 0);
      return now.toISOString();
    }
    if (opt.days) {
      now.setDate(now.getDate() + opt.days);
      return now.toISOString();
    }
    return now.toISOString();
  }

  async function handleSnooze(until: string) {
    setSnoozing(true);
    setSnoozeOpen(false);
    try {
      await api.snoozeThread(threadId, until);
      toast.success(t.thread.snoozeSuccess);
      await mutateThread();
    } catch {
      toast.error('Kunde inte snooze tråden');
    } finally {
      setSnoozing(false);
    }
  }

  async function handleUnsnooze() {
    setSnoozing(true);
    try {
      await api.unsnoozeThread(threadId);
      toast.success(t.thread.unsnoozeSuccess);
      await mutateThread();
    } catch {
      toast.error('Kunde inte avbryta snooze');
    } finally {
      setSnoozing(false);
    }
  }

  // Close snooze dropdown on outside click
  useEffect(() => {
    if (!snoozeOpen) return;
    function close(e: MouseEvent) {
      const target = e.target as Element;
      if (!target.closest('[data-snooze-dropdown]')) setSnoozeOpen(false);
    }
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [snoozeOpen]);

  // j/k/u keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'j' && nextId) router.push(`/threads/${nextId}`);
      if (e.key === 'k' && prevId) router.push(`/threads/${prevId}`);
      if (e.key === 'u' || e.key === 'Escape') router.push('/inbox');
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [nextId, prevId, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <TopBar />
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <div className="w-7 h-7 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
            <span className="text-sm">{t.thread.loading}</span>
          </div>
        </div>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <TopBar />
        <div className="text-center py-24 text-gray-400">{t.thread.notFound}</div>
      </div>
    );
  }

  const analysis = thread.latestAnalysis as AIAnalysis | null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <TopBar />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Back + prev/next nav */}
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={() => router.push('/inbox')}
            className="text-sm text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 inline-flex items-center gap-1"
          >
            {t.thread.back}
          </button>
          {threadList.length > 0 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => prevId && router.push(`/threads/${prevId}`)}
                disabled={!prevId}
                title={`${t.thread.prevThread} (k)`}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronUp size={18} className="text-gray-500 dark:text-gray-400" />
              </button>
              <span className="text-xs text-gray-400 tabular-nums">
                {currentIndex + 1} / {threadList.length}
              </span>
              <button
                onClick={() => nextId && router.push(`/threads/${nextId}`)}
                disabled={!nextId}
                title={`${t.thread.nextThread} (j)`}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronDown size={18} className="text-gray-500 dark:text-gray-400" />
              </button>
            </div>
          )}
        </div>

        {/* Inline error */}
        {error && (
          <div className="mb-5 flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300">
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 shrink-0">✕</button>
          </div>
        )}

        {/* Snooze banner */}
        {(thread as any).snoozedUntil && new Date((thread as any).snoozedUntil) > new Date() && (
          <div className="mb-4 flex items-center justify-between px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
            <span className="text-sm text-amber-700 dark:text-amber-300">
              {t.thread.snoozedUntil}: {new Date((thread as any).snoozedUntil).toLocaleString('sv-SE')}
            </span>
            <button onClick={handleUnsnooze} className="text-sm font-medium text-amber-700 dark:text-amber-300 hover:underline ml-4 shrink-0">
              {t.thread.unsnooze}
            </button>
          </div>
        )}

        {/* Trash banner */}
        {thread.labels?.includes('TRASH') && (
          <div className="mb-4 flex items-center justify-between px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
            <span className="text-sm text-amber-700 dark:text-amber-300">{t.thread.inTrash}</span>
            <button onClick={handleRestore} className="text-sm font-medium text-amber-700 dark:text-amber-300 hover:underline ml-4 shrink-0">
              {t.thread.restore}
            </button>
          </div>
        )}

        {/* Thread title */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-snug">
              {thread.subject || '(No Subject)'}
            </h1>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <span className="text-sm text-gray-400">
                {thread.messageCount} {t.thread.messages} · {thread.account.emailAddress}
              </span>
              {analysis && (
                <>
                  <PriorityBadge priority={analysis.priority} />
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${CLASSIFICATION_COLORS[analysis.classification] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                    {CLASSIFICATION_LABELS[analysis.classification] || analysis.classification}
                  </span>
                </>
              )}
            </div>
          </div>
          {/* Header actions */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {/* Reply — full compose with context */}
            <button
              onClick={() => router.push(`/compose?reply=${threadId}`)}
              className="btn-primary text-sm flex items-center gap-1.5"
            >
              <CornerDownLeft size={14} />
              Svara
            </button>
            {/* Forward */}
            <button
              onClick={() => router.push(`/compose?forward=${threadId}`)}
              className="btn-secondary text-sm flex items-center gap-1.5"
            >
              <Forward size={14} />
              Vidarebefordra
            </button>
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="btn-secondary text-sm flex items-center gap-1.5"
            >
              {analyzing ? <span className="w-3.5 h-3.5 border border-gray-400 border-t-brand-500 rounded-full animate-spin" /> : <Bot size={14} />}
              {analyzing ? t.thread.analyzing : t.thread.runAnalysis}
            </button>
            <button
              onClick={handleArchive}
              disabled={archiving}
              className="btn-secondary text-sm flex items-center gap-1.5"
            >
              {archiving ? <span className="w-3.5 h-3.5 border border-gray-400 border-t-brand-500 rounded-full animate-spin" /> : <Archive size={14} />}
              Arkivera
            </button>
            {/* Snooze dropdown */}
            <div className="relative" data-snooze-dropdown>
              {(thread as any).snoozedUntil && new Date((thread as any).snoozedUntil) > new Date() ? (
                <button
                  onClick={handleUnsnooze}
                  disabled={snoozing}
                  className="btn-secondary text-sm flex items-center gap-1.5 border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400"
                >
                  <Clock size={14} />
                  {t.thread.unsnooze}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setSnoozeOpen((s) => !s)}
                    disabled={snoozing}
                    className="btn-secondary text-sm flex items-center gap-1.5"
                  >
                    <Clock size={14} />
                    {t.thread.snooze}
                  </button>
                  {snoozeOpen && (
                    <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden min-w-[180px]">
                      {[
                        { label: t.thread.snooze1h, opt: { hours: 1 } },
                        { label: t.thread.snooze3h, opt: { hours: 3 } },
                        { label: t.thread.snoozeTomorrow, opt: { tomorrow9: true as const } },
                        { label: t.thread.snoozeNextMonday, opt: { nextMonday: true as const } },
                        { label: t.thread.snooze1w, opt: { days: 7 } },
                      ].map(({ label, opt }) => (
                        <button
                          key={label}
                          onClick={() => handleSnooze(computeSnoozeDate(opt))}
                          className="w-full text-left text-sm px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            {/* Star toggle */}
            <button
              onClick={handleToggleStar}
              disabled={starring}
              title={thread.labels?.includes('STARRED') ? 'Ta bort stjärna' : 'Stjärnmärk'}
              className={`btn-secondary text-sm flex items-center gap-1.5 ${
                thread.labels?.includes('STARRED') ? 'border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400' : ''
              }`}
            >
              {starring
                ? <span className="w-3.5 h-3.5 border border-gray-400 border-t-brand-500 rounded-full animate-spin" />
                : <Star size={14} className={thread.labels?.includes('STARRED') ? 'fill-amber-400' : ''} />}
              {thread.labels?.includes('STARRED') ? 'Stjärnmärkt' : 'Stjärnmärk'}
            </button>
            {/* Mark as unread — goes back to inbox with thread showing as unread */}
            <button
              onClick={handleMarkUnread}
              disabled={markingUnread}
              title="Markera som oläst"
              className="btn-secondary text-sm flex items-center gap-1.5"
            >
              {markingUnread ? <span className="w-3.5 h-3.5 border border-gray-400 border-t-brand-500 rounded-full animate-spin" /> : <MailX size={14} />}
              Oläst
            </button>
            <button
              onClick={handleTrash}
              className="text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <Trash2 size={14} />
              Radera
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Messages — 2/3 */}
          <div className="lg:col-span-2 space-y-4">
            {thread.messages && thread.messages.length > 0 ? (
              thread.messages.map((msg: any) => (
                <div key={msg.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 dark:border-gray-700">
                    <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold ${avatarColor(msg.fromAddress)}`}>
                      {initials(msg.fromAddress)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{msg.fromAddress}</div>
                      <div className="text-xs text-gray-400 dark:text-gray-500 truncate">
                        {t.common.to}: {msg.toAddresses.slice(0, 2).join(', ')}
                        {msg.toAddresses.length > 2 && ` +${msg.toAddresses.length - 2}`}
                        {msg.ccAddresses.length > 0 && ` · Cc: ${msg.ccAddresses[0]}`}
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                      {new Date(msg.receivedAt).toLocaleString()}
                    </span>
                  </div>
                  {msg.bodyHtml ? (
                    <div
                      className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed overflow-auto max-h-[600px] [&_a]:text-brand-600 [&_a]:underline [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_h1]:text-base [&_h1]:font-bold [&_h2]:text-sm [&_h2]:font-bold [&_strong]:font-semibold [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:text-gray-500 [&_img]:max-w-full"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(msg.bodyHtml) }}
                    />
                  ) : (
                    <div className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                      {msg.bodyText || '(No text content)'}
                    </div>
                  )}
                  {/* Attachment pills */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="px-5 pb-4 flex flex-wrap gap-2 border-t border-gray-100 dark:border-gray-700 pt-3">
                      {msg.attachments.map((att: any, i: number) => {
                        const key = `${msg.id}:${att.attachmentId}`;
                        const isDownloading = downloadingId === key;
                        return (
                        <button
                          key={i}
                          onClick={() => handleDownloadAttachment(msg, att)}
                          disabled={isDownloading}
                          title={`Ladda ner ${att.filename}`}
                          className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-xs text-gray-600 dark:text-gray-300 hover:border-brand-300 dark:hover:border-brand-700 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors disabled:opacity-60"
                        >
                          {isDownloading
                            ? <span className="w-3 h-3 border border-gray-400 border-t-brand-500 rounded-full animate-spin shrink-0" />
                            : <Paperclip size={12} className="text-gray-400 shrink-0" />}
                          <span className="truncate max-w-[200px]">{att.filename || 'Bilaga'}</span>
                          {att.size > 0 && (
                            <span className="text-gray-400 shrink-0">{formatFileSize(att.size)}</span>
                          )}
                          <Download size={11} className="text-gray-400 shrink-0 ml-0.5" />
                        </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm text-center py-12">
                <div className="flex justify-center mb-2 text-gray-300 dark:text-gray-600"><MailOpen size={36} /></div>
                <p className="text-gray-400 text-sm mb-4">{t.thread.noMessages}</p>
                <button
                  onClick={handleSyncMessages}
                  disabled={syncingMessages}
                  className="btn-primary text-sm"
                >
                  {syncingMessages ? '…' : t.thread.syncMessages}
                </button>
              </div>
            )}

            {/* Quick inline reply */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <Send size={14} className="text-gray-400" />
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Snabbsvar</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={quickReply}
                  onChange={(e) => setQuickReply(e.target.value)}
                  placeholder="Skriv ett snabbt svar..."
                  className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && quickReply.trim()) {
                      e.preventDefault();
                      handleQuickReply();
                    }
                  }}
                />
                <button
                  onClick={handleQuickReply}
                  disabled={!quickReply.trim() || sendingReply}
                  className="btn-primary text-sm px-4 shrink-0"
                >
                  {sendingReply ? '...' : 'Skicka'}
                </button>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                Skapar ett utkast — du granskar och godkänner innan det skickas
              </p>
            </div>

            {/* Generate Reply Draft */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-brand-200 dark:border-brand-800 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                <PenLine size={14} className="text-brand-500" />
                {t.thread.generateDraft}
              </h3>

              {/* Writing mode selector */}
              {writingModes.length > 0 && (
                <div className="mb-3">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5 block">
                    Skrivsätt
                  </label>
                  <div className="relative">
                    <select
                      value={selectedMode}
                      onChange={(e) => setSelectedMode(e.target.value)}
                      className="w-full appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                    >
                      <option value="">Inget skrivsätt</option>
                      {writingModes.map((mode: any) => (
                        <option key={mode.id ?? mode.name} value={mode.name}>
                          {mode.name}{mode.description ? ` — ${mode.description}` : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              )}

              {/* Quick reply presets */}
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {[
                  'Svara kort och bekräftande',
                  'Be om mer information',
                  'Tacka nej artigt',
                  'Vidarebefordra till rätt person',
                ].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setDraftInstruction(preset)}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                      draftInstruction === preset
                        ? 'bg-brand-50 dark:bg-brand-900/20 border-brand-300 dark:border-brand-700 text-brand-700 dark:text-brand-300'
                        : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <textarea
                value={draftInstruction}
                onChange={(e) => setDraftInstruction(e.target.value)}
                placeholder={t.thread.draftPlaceholder}
                rows={3}
                className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 resize-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none mb-3"
              />
              <button
                onClick={handleGenerateDraft}
                disabled={generatingDraft || !draftInstruction.trim()}
                className="btn-primary text-sm"
              >
                {generatingDraft ? t.thread.generating : t.thread.generate}
              </button>
            </div>
          </div>

          {/* Sidebar — 1/3 */}
          <div className="space-y-4">
            {/* Custom Labels */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Tag size={12} />
                Etiketter
              </h3>
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {threadLabels.map((label) => (
                  <span key={label} className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-full text-xs text-brand-700 dark:text-brand-300">
                    {label}
                    <button
                      onClick={() => handleRemoveLabel(label)}
                      disabled={savingLabels}
                      className="text-brand-400 hover:text-brand-600 dark:hover:text-brand-200 ml-0.5"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
                {threadLabels.length === 0 && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">Inga etiketter</span>
                )}
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={labelInput}
                  onChange={e => setLabelInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && labelInput.trim()) { e.preventDefault(); handleAddLabel(labelInput); } }}
                  placeholder="Lägg till etikett..."
                  maxLength={32}
                  className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-1 focus:ring-brand-500 outline-none"
                />
                <button
                  onClick={() => handleAddLabel(labelInput)}
                  disabled={!labelInput.trim() || savingLabels}
                  className="px-2.5 py-1.5 text-xs btn-primary rounded-lg"
                >
                  +
                </button>
              </div>
            </div>

            {/* AI Analysis */}
            {analysis ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">{t.thread.aiAnalysis}</h3>
                <div className="space-y-3">
                  <div>
                    <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{t.thread.summary}</div>
                    <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{analysis.summary}</div>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <div>
                      <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{t.thread.type}</div>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${CLASSIFICATION_COLORS[analysis.classification] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                        {CLASSIFICATION_LABELS[analysis.classification] || analysis.classification}
                      </span>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{t.dashboard.prioritySummary.split(' ')[0]}</div>
                      <PriorityBadge priority={analysis.priority} />
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{t.inbox.suggestedAction}</div>
                    <span className="text-xs font-medium text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/20 px-2 py-0.5 rounded-full border border-brand-200 dark:border-brand-800">
                      {analysis.suggestedAction.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">{t.inbox.confidence}</div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-500 rounded-full"
                          style={{ width: `${Math.round(analysis.confidence * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{Math.round(analysis.confidence * 100)}%</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400">{analysis.modelUsed}</div>

                  {/* Classification override */}
                  <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                    {overrideSaved ? (
                      <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                        <Check size={12} />
                        Korrigering sparad — AI lär sig
                      </div>
                    ) : overrideOpen ? (
                      <div className="space-y-2">
                        <div className="relative">
                          <select
                            value={overridePriority}
                            onChange={(e) => setOverridePriority(e.target.value)}
                            className="w-full appearance-none pl-2.5 pr-7 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-brand-500 outline-none"
                          >
                            <option value="">Prioritet oförändrad</option>
                            <option value="high">Hög</option>
                            <option value="medium">Medium</option>
                            <option value="low">Låg</option>
                          </select>
                          <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        </div>
                        <div className="relative">
                          <select
                            value={overrideClassification}
                            onChange={(e) => setOverrideClassification(e.target.value)}
                            className="w-full appearance-none pl-2.5 pr-7 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-brand-500 outline-none"
                          >
                            <option value="">Typ oförändrad</option>
                            <option value="lead">Lead</option>
                            <option value="partner">Partner</option>
                            <option value="personal">Personal</option>
                            <option value="operational">Operational</option>
                            <option value="founder">Founder</option>
                            <option value="outreach">Outreach</option>
                            <option value="spam">Spam</option>
                          </select>
                          <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleOverrideClassification}
                            disabled={overriding || (!overridePriority && !overrideClassification)}
                            className="flex-1 px-2.5 py-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                          >
                            {overriding ? '…' : 'Spara'}
                          </button>
                          <button
                            onClick={() => setOverrideOpen(false)}
                            className="px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-lg transition-colors"
                          >
                            Avbryt
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setOverrideOpen(true); setOverridePriority(''); setOverrideClassification(''); }}
                        className="text-xs text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                      >
                        Korrigera klassificering →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 text-center">
                <div className="flex justify-center mb-2 text-gray-300 dark:text-gray-600"><Bot size={36} /></div>
                <p className="text-sm text-gray-400 mb-4">{t.thread.noAnalysis}</p>
                <button
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="btn-primary text-sm w-full"
                >
                  {analyzing ? t.thread.analyzing : t.thread.runAnalysis}
                </button>
              </div>
            )}

            {/* Draft suggestion from analysis */}
            {analysis?.draftText && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
                <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">{t.inbox.draftSuggestion}</div>
                <div className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 rounded-xl px-3 py-2.5 border border-gray-100 dark:border-gray-700 leading-relaxed">
                  {analysis.draftText}
                </div>
              </div>
            )}

            {/* Contact profile */}
            {contact && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <UserCircle2 size={14} className="text-gray-400" />
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Kontaktprofil</h3>
                </div>
                <div className="flex items-center gap-2.5 mb-3">
                  <div className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold ${avatarColor(contact.emailAddress)}`}>
                    {initials(contact.emailAddress)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {contact.displayName || contact.emailAddress}
                    </div>
                    {contact.displayName && (
                      <div className="text-xs text-gray-400 truncate">{contact.emailAddress}</div>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5 text-xs">
                  {contact.relationship && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Relation</span>
                      <span className={`px-2 py-0.5 rounded-full font-medium ${CLASSIFICATION_COLORS[contact.relationship] || 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                        {contact.relationship}
                      </span>
                    </div>
                  )}
                  {contact.language && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Språk</span>
                      <span className="text-gray-700 dark:text-gray-300">{contact.language.toUpperCase()}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Totalt mejl</span>
                    <span className="text-gray-700 dark:text-gray-300">{contact.totalEmails}</span>
                  </div>
                  {contact.lastContactAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Senast kontakt</span>
                      <span className="text-gray-700 dark:text-gray-300">
                        {new Date(contact.lastContactAt).toLocaleDateString('sv-SE')}
                      </span>
                    </div>
                  )}
                  {contact.notes && (
                    <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 text-gray-500 dark:text-gray-400 leading-relaxed">
                      {contact.notes}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Pending drafts for thread */}
            {thread.drafts && thread.drafts.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">{t.thread.draftsForThread}</h3>
                <div className="space-y-2">
                  {thread.drafts.map((draft: any) => (
                    <a
                      key={draft.id}
                      href={`/drafts/${draft.id}`}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-gray-100 dark:border-gray-700 hover:border-brand-200 dark:hover:border-brand-700 hover:bg-brand-50/30 dark:hover:bg-brand-900/20 transition-all text-sm"
                    >
                      <span className="font-medium text-gray-800 dark:text-gray-200 truncate">{draft.subject}</span>
                      <span className={`text-xs ml-2 shrink-0 px-2 py-0.5 rounded-full ${
                        draft.status === 'approved'
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                          : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                      }`}>
                        {draft.status}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <ConfirmDialog
        open={trashConfirmOpen}
        title="Flytta till papperskorgen?"
        description="Mejlet flyttas till papperskorgen i Gmail och kan återställas inom 30 dagar."
        confirmLabel="Flytta till papperskorgen"
        cancelLabel="Avbryt"
        variant="danger"
        onConfirm={executeTrash}
        onCancel={() => setTrashConfirmOpen(false)}
      />
    </div>
  );
}
