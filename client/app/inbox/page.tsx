'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import TopBar from '@/components/TopBar';
import PriorityBadge from '@/components/PriorityBadge';
import AccountBadge from '@/components/AccountBadge';
import { BadgeIcons } from '@/components/EmailBadges';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { EmailThread, Account } from '@/lib/types';

const CLASSIFICATION_COLORS: Record<string, string> = {
  lead: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
  partner: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
  personal: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800',
  spam: 'bg-red-100 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
  operational: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600',
  founder: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800',
  outreach: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800',
};

const PRIORITY_FILTER_COLORS: Record<string, string> = {
  high: 'bg-red-500 text-white border-red-500',
  medium: 'bg-amber-400 text-white border-amber-400',
  low: 'bg-emerald-400 text-white border-emerald-400',
};

const CLASSIFICATION_LABELS: Record<string, string> = {
  lead: 'Lead',
  partner: 'Partner',
  personal: 'Personal',
  spam: 'Spam',
  operational: 'Operational',
  founder: 'Founder',
  outreach: 'Outreach',
};

function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'nu';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return 'igår';
  if (diffDays < 7) return date.toLocaleDateString('sv-SE', { weekday: 'short' });
  return date.toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' });
}

export default function InboxPage() {
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [classificationFilter, setClassificationFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  const [analyzeErrors, setAnalyzeErrors] = useState<Map<string, string>>(new Map());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { t } = useI18n();

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    loadThreads();
  }, [selectedAccountId, priorityFilter, search]);

  async function loadAccounts() {
    try {
      const result = await api.getAccounts();
      setAccounts(result.accounts);
    } catch (err) {
      console.error('Failed to load accounts:', err);
    }
  }

  async function loadThreads() {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (selectedAccountId) params.account_id = selectedAccountId;
      if (priorityFilter) params.priority = priorityFilter;
      if (search) params.search = search;
      const result = await api.getThreads(params);
      setThreads(result.threads);
      setSelectedIds(new Set());
    } catch (err: any) {
      console.error('Failed to load threads:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const toSync = selectedAccountId
        ? accounts.filter((a) => a.id === selectedAccountId)
        : accounts.filter((a) => a.isActive);
      for (const account of toSync) {
        await api.syncThreads(account.id, 30);
      }
      await loadThreads();
    } catch (err: any) {
      console.error('Sync failed:', err);
    } finally {
      setSyncing(false);
    }
  }

  async function handleAnalyze(threadId: string) {
    setAnalyzingIds((prev) => new Set(prev).add(threadId));
    setAnalyzeErrors((prev) => { const next = new Map(prev); next.delete(threadId); return next; });
    try {
      await api.syncMessages(threadId);
      await api.analyzeThread(threadId);
      await loadThreads();
    } catch (err: any) {
      const msg: string = err?.message || 'Analysis failed';
      console.error(`Analyze thread ${threadId}:`, msg);
      setAnalyzeErrors((prev) => new Map(prev).set(threadId, msg));
    } finally {
      setAnalyzingIds((prev) => {
        const next = new Set(prev);
        next.delete(threadId);
        return next;
      });
    }
  }

  async function handleBulkAnalyze() {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await handleAnalyze(id);
    }
  }

  async function handleAnalyzeAllUnanalyzed() {
    const unanalyzed = threads.filter((t) => !t.latestAnalysis).map((t) => t.id);
    for (const id of unanalyzed) {
      await handleAnalyze(id);
    }
  }

  function toggleSelect(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === threads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(threads.map((th) => th.id)));
    }
  }

  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  const visibleThreads = classificationFilter
    ? threads.filter((th) => th.latestAnalysis?.classification === classificationFilter)
    : threads;

  const availableClassifications = Array.from(
    new Set(threads.map((th) => th.latestAnalysis?.classification).filter(Boolean))
  ) as string[];

  const unanalyzedCount = threads.filter((th) => !th.latestAnalysis).length;
  const analyzingAny = analyzingIds.size > 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <TopBar />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t.inbox.title}</h1>
            {!loading && (
              <p className="text-sm text-gray-400 mt-0.5">
                {visibleThreads.length} {t.inbox.messages}
                {unanalyzedCount > 0 && (
                  <span className="ml-2 text-amber-500 font-medium">
                    · {unanalyzedCount} {t.inbox.unanalyzed}
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!loading && unanalyzedCount > 0 && (
              <button
                onClick={handleAnalyzeAllUnanalyzed}
                disabled={analyzingAny}
                className="btn-secondary text-sm flex items-center gap-1.5"
                title={`Analysera ${unanalyzedCount} ej analyserade`}
              >
                {analyzingAny ? (
                  <span className="w-3.5 h-3.5 border border-gray-400 border-t-brand-500 rounded-full animate-spin" />
                ) : '🤖'}
                {t.inbox.analyze} ({unanalyzedCount})
              </button>
            )}
            <button
              onClick={handleSync}
              disabled={syncing}
              className="btn-primary text-sm flex items-center gap-2"
            >
              <span className={syncing ? 'animate-spin' : ''}>🔄</span>
              {syncing ? t.inbox.syncing : t.inbox.syncAll}
            </button>
          </div>
        </div>

        {/* Account Tabs */}
        {accounts.length > 1 && (
          <div className="flex gap-2 mb-4 flex-wrap">
            <AccountFilterTab
              active={!selectedAccountId}
              onClick={() => setSelectedAccountId('')}
              label={t.inbox.allAccounts}
            />
            {accounts.map((acc) => (
              <AccountFilterTab
                key={acc.id}
                active={selectedAccountId === acc.id}
                onClick={() => setSelectedAccountId(acc.id)}
                label={acc.label || acc.emailAddress.split('@')[0]}
                color={acc.color || (acc.provider === 'gmail' ? '#EA4335' : '#6366F1')}
                badges={acc.badges}
              />
            ))}
          </div>
        )}

        {/* Search + Filters Row */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input
              type="text"
              placeholder={t.inbox.searchPlaceholder}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') setSearch(searchInput); }}
              className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
          </div>
          <div className="flex gap-2 items-center shrink-0">
            {(['high', 'medium', 'low'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPriorityFilter(priorityFilter === p ? '' : p)}
                className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                  priorityFilter === p
                    ? PRIORITY_FILTER_COLORS[p]
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {p === 'high' ? '🔥' : p === 'medium' ? '🟡' : '🟢'} {t.dashboard[p]}
              </button>
            ))}
          </div>
        </div>

        {/* Classification Filter */}
        {availableClassifications.length > 0 && (
          <div className="flex gap-2 mb-5 flex-wrap">
            <button
              onClick={() => setClassificationFilter('')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                !classificationFilter
                  ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 border-gray-800 dark:border-gray-200'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {t.inbox.allAccounts}
            </button>
            {availableClassifications.map((cls) => (
              <button
                key={cls}
                onClick={() => setClassificationFilter(classificationFilter === cls ? '' : cls)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  classificationFilter === cls
                    ? (CLASSIFICATION_COLORS[cls] || 'bg-gray-100 text-gray-700 border-gray-200')
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {CLASSIFICATION_LABELS[cls] || cls}
              </button>
            ))}
          </div>
        )}

        {/* Bulk Actions Bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-xl">
            <span className="text-sm font-medium text-brand-700 dark:text-brand-300">
              {selectedIds.size} {t.inbox.selected}
            </span>
            <button
              onClick={handleBulkAnalyze}
              className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 underline"
            >
              🤖 {t.inbox.analyzeSelected}
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="ml-auto text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              ✕
            </button>
          </div>
        )}

        {/* Thread List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <div className="w-7 h-7 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
              <span className="text-sm">{t.inbox.loadingThreads}</span>
            </div>
          </div>
        ) : visibleThreads.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 text-center py-16 shadow-sm">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-gray-500 dark:text-gray-400 mb-4">{t.inbox.noThreads}</p>
            <button onClick={handleSync} className="btn-primary">
              {t.inbox.syncNow}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-2 px-1">
              <button
                onClick={toggleSelectAll}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {selectedIds.size === threads.length ? t.inbox.deselectAll : t.inbox.selectAll}
              </button>
            </div>

            <div className="space-y-2">
              {visibleThreads.map((thread) => {
                const acc = accountMap.get(thread.accountId);
                const isExpanded = expandedId === thread.id;
                const isSelected = selectedIds.has(thread.id);
                const isAnalyzing = analyzingIds.has(thread.id);
                const analyzeError = analyzeErrors.get(thread.id);
                const isUnread = !thread.isRead;

                // Best sender display: first participant that isn't from the account
                const accEmail = acc?.emailAddress.toLowerCase();
                const sender = thread.participantEmails.find(
                  (e) => e.toLowerCase() !== accEmail
                ) || thread.participantEmails[0] || '';
                const senderDisplay = sender.includes('<')
                  ? sender.match(/^([^<]+)/)?.[1]?.trim() || sender
                  : sender.split('@')[0];

                return (
                  <div
                    key={thread.id}
                    className={`bg-white dark:bg-gray-800 rounded-2xl border transition-all shadow-sm ${
                      isSelected
                        ? 'border-brand-300 dark:border-brand-700 ring-1 ring-brand-200 dark:ring-brand-800'
                        : isUnread
                        ? 'border-l-4 border-l-brand-500 border-gray-200 dark:border-gray-700'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    {/* Thread Row */}
                    <div className="flex items-start gap-3 p-4">
                      {/* Checkbox */}
                      <button
                        onClick={(e) => toggleSelect(thread.id, e)}
                        className={`mt-1 w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'bg-brand-500 border-brand-500 text-white'
                            : 'border-gray-300 dark:border-gray-600 hover:border-brand-400'
                        }`}
                      >
                        {isSelected && <span className="text-xs">✓</span>}
                      </button>

                      {/* Main Content */}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : thread.id)}
                        className="flex-1 min-w-0 text-left"
                      >
                        {/* Sender + time row */}
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <div className="flex items-center gap-2 min-w-0">
                            {accounts.length > 1 && acc && (
                              <>
                                <AccountBadge
                                  emailAddress={acc.emailAddress}
                                  provider={acc.provider}
                                  color={acc.color}
                                  label={acc.label}
                                />
                                <BadgeIcons badges={acc.badges || []} size="sm" />
                              </>
                            )}
                            <span className={`text-sm truncate ${isUnread ? 'font-bold text-gray-900 dark:text-gray-100' : 'font-medium text-gray-700 dark:text-gray-300'}`}>
                              {senderDisplay}
                            </span>
                          </div>
                          <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                            {formatRelativeTime(thread.lastMessageAt)}
                          </span>
                        </div>

                        {/* Subject + badges */}
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`text-sm truncate ${isUnread ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}`}>
                            {thread.subject || t.inbox.noSubject}
                          </span>
                          {thread.latestAnalysis && (
                            <>
                              <PriorityBadge priority={thread.latestAnalysis.priority} />
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                                  CLASSIFICATION_COLORS[thread.latestAnalysis.classification] || 'bg-gray-100 text-gray-600 border-gray-200'
                                }`}
                              >
                                {CLASSIFICATION_LABELS[thread.latestAnalysis.classification] || thread.latestAnalysis.classification}
                              </span>
                            </>
                          )}
                          {!thread.latestAnalysis && (
                            <span className="text-xs text-gray-400 dark:text-gray-500 border border-dashed border-gray-300 dark:border-gray-600 px-2 py-0.5 rounded-full">
                              {t.inbox.notAnalyzed}
                            </span>
                          )}
                        </div>

                        {/* Message count + snippet */}
                        <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">
                          {thread.messageCount} {t.inbox.messages}
                        </div>

                        {thread.latestAnalysis ? (
                          <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-1.5 mt-1 flex items-start gap-2">
                            <span className="text-gray-400 shrink-0">🤖</span>
                            <span className="line-clamp-2">
                              {isExpanded
                                ? thread.latestAnalysis.summary
                                : thread.latestAnalysis.summary.substring(0, 140) + (thread.latestAnalysis.summary.length > 140 ? '…' : '')}
                            </span>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400 dark:text-gray-500 truncate mt-1">
                            {thread.snippet}
                          </div>
                        )}
                      </button>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {!thread.latestAnalysis && (
                          <button
                            onClick={() => handleAnalyze(thread.id)}
                            disabled={isAnalyzing}
                            className="btn-secondary text-xs flex items-center gap-1"
                          >
                            {isAnalyzing ? (
                              <span className="w-3 h-3 border border-gray-400 border-t-brand-500 rounded-full animate-spin" />
                            ) : '🤖'}
                            {isAnalyzing ? '…' : t.inbox.analyze}
                          </button>
                        )}
                        {thread.latestAnalysis && (
                          <button
                            onClick={() => handleAnalyze(thread.id)}
                            disabled={isAnalyzing}
                            className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            title={t.inbox.analyze}
                          >
                            {isAnalyzing ? (
                              <span className="w-3 h-3 border border-gray-400 border-t-brand-500 rounded-full animate-spin inline-block" />
                            ) : '🔄'}
                          </button>
                        )}
                        <Link
                          href={`/threads/${thread.id}`}
                          className="btn-secondary text-xs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {t.inbox.open}
                        </Link>
                      </div>
                    </div>

                    {/* Inline analyze error */}
                    {analyzeError && (
                      <div className="mx-4 mb-3 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                        <span className="shrink-0">⚠️</span>
                        <span>{analyzeError}</span>
                        <button
                          onClick={() => setAnalyzeErrors((prev) => { const next = new Map(prev); next.delete(thread.id); return next; })}
                          className="ml-auto shrink-0 text-red-400 hover:text-red-600"
                        >✕</button>
                      </div>
                    )}

                    {/* Expanded Details */}
                    {isExpanded && thread.latestAnalysis && (
                      <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-4 bg-gray-50 dark:bg-gray-800/50 rounded-b-2xl">
                        <div className="grid sm:grid-cols-3 gap-4 text-xs">
                          <div>
                            <div className="font-medium text-gray-500 dark:text-gray-400 mb-1">{t.inbox.suggestedAction}</div>
                            <div className="text-gray-700 dark:text-gray-200 font-medium">{thread.latestAnalysis.suggestedAction.replace(/_/g, ' ')}</div>
                          </div>
                          <div>
                            <div className="font-medium text-gray-500 dark:text-gray-400 mb-1">{t.inbox.confidence}</div>
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 flex-1 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-brand-500 rounded-full"
                                  style={{ width: `${Math.round(thread.latestAnalysis.confidence * 100)}%` }}
                                />
                              </div>
                              <span className="text-gray-600 dark:text-gray-300">{Math.round(thread.latestAnalysis.confidence * 100)}%</span>
                            </div>
                          </div>
                          <div>
                            <div className="font-medium text-gray-500 dark:text-gray-400 mb-1">{t.inbox.model}</div>
                            <div className="text-gray-600 dark:text-gray-300">{thread.latestAnalysis.modelUsed}</div>
                          </div>
                        </div>
                        {thread.latestAnalysis.draftText && (
                          <div className="mt-3">
                            <div className="font-medium text-gray-500 dark:text-gray-400 text-xs mb-1">{t.inbox.draftSuggestion}</div>
                            <div className="text-xs text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700 line-clamp-4">
                              {thread.latestAnalysis.draftText}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function AccountFilterTab({
  active, onClick, label, color, badges
}: {
  active: boolean; onClick: () => void; label: string; color?: string; badges?: string[];
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-all inline-flex items-center gap-1.5 ${
        active
          ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100'
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
      }`}
    >
      {color && (
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
      )}
      {label}
      {badges && <BadgeIcons badges={badges} size="sm" />}
    </button>
  );
}
