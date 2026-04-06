'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import TopBar from '@/components/TopBar';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { toast } from 'sonner';
import {
  Inbox,
  Trash2,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

type ReviewAction = 'keep' | 'trash' | 'create_rule';

const CLASSIFICATION_COLORS: Record<string, string> = {
  lead: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  partner: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  personal: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  spam: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300',
  operational: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  founder: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  outreach: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
};

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffH = (now.getTime() - d.getTime()) / 3600000;
  if (diffH < 1) return `${Math.floor(diffH * 60)}m sedan`;
  if (diffH < 24) return `${Math.floor(diffH)}h sedan`;
  return d.toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' });
}

export default function ReviewPage() {
  const { t } = useI18n();
  const { data, isLoading, error } = useSWR('review-queue', () => api.getReviewQueue(), {
    revalidateOnFocus: false,
  });

  const [deciding, setDeciding] = useState<Record<string, ReviewAction | null>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [suggestions, setSuggestions] = useState<Array<{
    id: string; senderPattern: string; suggestedAction: string; triggerCount: number;
  }>>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const confidenceLabel = (c: number) =>
    c >= 0.8 ? t.review.confidenceHigh : c >= 0.6 ? t.review.confidenceMedium : t.review.confidenceLow;
  const confidenceColor = (c: number) =>
    c >= 0.8 ? 'text-emerald-600 dark:text-emerald-400' : c >= 0.6 ? 'text-amber-600 dark:text-amber-400' : 'text-red-500';

  async function decide(threadId: string, action: ReviewAction) {
    setDeciding((p) => ({ ...p, [threadId]: action }));
    try {
      await api.decideReviewThread(threadId, action);
      const label =
        action === 'keep' ? t.review.toastKeep :
        action === 'trash' ? t.review.toastTrash :
        t.review.toastCreateRule;
      toast.success(label);
      mutate('review-queue');
    } catch {
      toast.error(t.review.toastError);
    } finally {
      setDeciding((p) => ({ ...p, [threadId]: null }));
    }
  }

  async function loadSuggestions() {
    setLoadingSuggestions(true);
    try {
      const res = await api.getPendingSuggestions();
      setSuggestions(res.suggestions ?? []);
      if ((res.suggestions ?? []).length === 0) toast(t.review.noSuggestions);
    } catch {
      toast.error(t.review.errorSuggestions);
    } finally {
      setLoadingSuggestions(false);
    }
  }

  async function acceptSuggestion(id: string) {
    try {
      await api.acceptRuleSuggestion(id);
      toast.success(t.review.ruleCreated);
      setSuggestions((s) => s.filter((x) => x.id !== id));
    } catch {
      toast.error(t.review.errorCreateRule);
    }
  }

  async function dismissSuggestion(id: string) {
    try {
      await api.dismissRuleSuggestion(id);
      setSuggestions((s) => s.filter((x) => x.id !== id));
      toast(t.review.suggestionDismissed);
    } catch {
      toast.error(t.review.errorDismiss);
    }
  }

  function toggleExpand(id: string) {
    setExpanded((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  const threads = data?.threads ?? [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <TopBar />

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t.review.title}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {t.review.subtitle}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadSuggestions}
              disabled={loadingSuggestions}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300 disabled:opacity-50"
            >
              <ShieldCheck size={14} />
              {loadingSuggestions ? t.common.loading : t.review.ruleSuggestions}
            </button>
            <button
              onClick={() => mutate('review-queue')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300"
            >
              <RefreshCw size={14} />
              {t.review.refresh}
            </button>
          </div>
        </div>

        {/* Rule suggestions panel */}
        {suggestions.length > 0 && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-medium">
              <ShieldCheck size={16} />
              {t.review.ruleSuggestionsHint.replace('{n}', String(suggestions.length))}
            </div>
            {suggestions.map((s) => (
              <div key={s.id} className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg px-4 py-3 border border-blue-100 dark:border-blue-800">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{s.senderPattern}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {s.suggestedAction} · {s.triggerCount} {t.review.hits}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => acceptSuggestion(s.id)}
                    className="px-3 py-1 text-xs bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
                  >
                    {t.review.accept}
                  </button>
                  <button
                    onClick={() => dismissSuggestion(s.id)}
                    className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    {t.review.dismiss}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* States */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 animate-pulse">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-2" />
                <div className="h-3 bg-gray-100 dark:bg-gray-600 rounded w-3/4" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300">
            <AlertCircle size={18} />
            {t.review.loadError}
          </div>
        )}

        {!isLoading && !error && threads.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-600">
            <CheckCircle2 size={48} className="mb-4 opacity-40" />
            <p className="text-lg font-medium">{t.review.emptyTitle}</p>
            <p className="text-sm mt-1">{t.review.emptyBody}</p>
          </div>
        )}

        {/* Thread list */}
        {threads.length > 0 && (
          <div className="space-y-3">
            {threads.map((thread) => {
              const isExpanded = expanded.has(thread.threadId);
              const isDeciding = !!deciding[thread.threadId];
              return (
                <div
                  key={thread.threadId}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden transition-shadow hover:shadow-sm"
                >
                  {/* Thread header */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                            {thread.subject ?? t.inbox.noSubject}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CLASSIFICATION_COLORS[thread.classification] ?? 'bg-gray-100 text-gray-600'}`}>
                            {thread.classification}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                          <span>{thread.senderEmail}</span>
                          <span>·</span>
                          <span className={confidenceColor(thread.confidence)}>
                            {t.review.confidence}: {confidenceLabel(thread.confidence)} ({Math.round(thread.confidence * 100)}%)
                          </span>
                          <span>·</span>
                          <span className="flex items-center gap-1"><Clock size={11} />{formatDate(thread.labeledAt)}</span>
                        </div>
                        {thread.snippet && (
                          <button
                            onClick={() => toggleExpand(thread.threadId)}
                            className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 mt-2 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                          >
                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            {isExpanded ? t.review.hidePreview : t.review.showPreview}
                          </button>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => decide(thread.threadId, 'keep')}
                          disabled={isDeciding}
                          title={t.review.keepTitle}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors disabled:opacity-50"
                        >
                          <Inbox size={13} />
                          {t.review.keep}
                        </button>
                        <button
                          onClick={() => decide(thread.threadId, 'create_rule')}
                          disabled={isDeciding}
                          title={t.review.createRuleTitle}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors disabled:opacity-50"
                        >
                          <ShieldCheck size={13} />
                          {t.review.createRule}
                        </button>
                        <button
                          onClick={() => decide(thread.threadId, 'trash')}
                          disabled={isDeciding}
                          title={t.review.trashTitle}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors disabled:opacity-50"
                        >
                          <Trash2 size={13} />
                          {t.review.trash}
                        </button>
                      </div>
                    </div>

                    {/* Snippet */}
                    {isExpanded && thread.snippet && (
                      <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-sm text-gray-600 dark:text-gray-300 border border-gray-100 dark:border-gray-600 italic">
                        {thread.snippet}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {threads.length > 0 && (
          <p className="text-center text-xs text-gray-400 dark:text-gray-600">
            {t.review.pendingCount.replace('{n}', String(threads.length))}
          </p>
        )}
      </main>
    </div>
  );
}
