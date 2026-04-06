'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import TopBar from '@/components/TopBar';
import PriorityBadge from '@/components/PriorityBadge';
import { Search, X, Clock, ArrowLeft, SearchX, Filter, ChevronDown, ChevronUp, Paperclip, Bookmark, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import EmptyState from '@/components/EmptyState';
import { useI18n } from '@/lib/i18n';
import type { Account } from '@/lib/types';

export default function SearchPage() {
  const router = useRouter();
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);

  // Search state
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterHasAttachment, setFilterHasAttachment] = useState(false);
  const [filterClassification, setFilterClassification] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterAccountId, setFilterAccountId] = useState('');

  // History
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Accounts (for dropdown)
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Save as view
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [savingView, setSavingView] = useState(false);

  const CLASSIFICATION_LABELS: Record<string, string> = {
    lead: t.triage.classLead,
    partner: t.triage.classPartner,
    personal: t.triage.classPersonal,
    spam: t.triage.classSpam,
    operational: t.triage.classOperational,
    founder: t.triage.classFounder,
    outreach: t.triage.classOutreach,
  };

  function formatRelativeTime(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const diffDays = Math.floor((Date.now() - date.getTime()) / 86400000);
    if (diffDays === 0) return t.notifications.today;
    if (diffDays === 1) return t.notifications.yesterday;
    if (diffDays < 7) return date.toLocaleDateString('sv-SE', { weekday: 'short' });
    return date.toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' });
  }

  useEffect(() => {
    inputRef.current?.focus();
    loadHistory();
    api.getAccounts().then((r) => setAccounts(r.accounts)).catch(() => {});
  }, []);

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const res = await api.getSearchHistory();
      setHistory(res.history ?? []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  function activeFilterChips(): string[] {
    const chips: string[] = [];
    if (filterFrom) chips.push(t.search.chipFrom.replace('{value}', filterFrom));
    if (filterTo) chips.push(t.search.chipTo.replace('{value}', filterTo));
    if (filterDateFrom) chips.push(t.search.chipDateFrom.replace('{value}', filterDateFrom));
    if (filterDateTo) chips.push(t.search.chipDateTo.replace('{value}', filterDateTo));
    if (filterHasAttachment) chips.push(t.search.filterHasAttachment);
    if (filterClassification) chips.push(t.search.chipType.replace('{value}', CLASSIFICATION_LABELS[filterClassification] ?? filterClassification));
    if (filterPriority) chips.push(t.search.chipPriority.replace('{value}', filterPriority));
    if (filterAccountId) chips.push(t.search.chipAccount.replace('{value}', accounts.find(a => a.id === filterAccountId)?.emailAddress ?? filterAccountId));
    return chips;
  }

  function clearFilters() {
    setFilterFrom(''); setFilterTo(''); setFilterDateFrom(''); setFilterDateTo('');
    setFilterHasAttachment(false); setFilterClassification(''); setFilterPriority(''); setFilterAccountId('');
  }

  async function doSearch(q?: string, histEntry?: any) {
    const searchQ = q ?? query;
    setLoading(true);
    setSearched(true);
    try {
      const params: any = {
        q: searchQ || undefined,
        from: filterFrom || undefined,
        to: filterTo || undefined,
        dateFrom: filterDateFrom || undefined,
        dateTo: filterDateTo || undefined,
        hasAttachment: filterHasAttachment || undefined,
        classification: filterClassification || undefined,
        priority: filterPriority || undefined,
        accountId: filterAccountId || undefined,
        limit: 30,
      };
      // Use history entry filters if provided
      if (histEntry?.filters) {
        Object.assign(params, histEntry.filters);
      }
      const res = await api.advancedSearch(params);
      setResults(res.threads ?? []);
      setTotal(res.total);
      await loadHistory(); // Refresh history after search
    } catch {
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteHistory(id: string) {
    try {
      await api.deleteSearchHistoryEntry(id);
      setHistory((prev) => prev.filter((h) => h.id !== id));
    } catch {
      toast.error(t.search.errorDelete);
    }
  }

  async function handleClearHistory() {
    try {
      await api.clearSearchHistory();
      setHistory([]);
      toast.success(t.search.historyCleaned);
    } catch {
      toast.error(t.search.errorClearHistory);
    }
  }

  async function handleSaveAsView() {
    if (!newViewName.trim()) return;
    setSavingView(true);
    try {
      const filters: Record<string, any> = {};
      if (query) filters.search = query;
      if (filterPriority) filters.priority = filterPriority;
      if (filterClassification) filters.classification = filterClassification;
      if (filterHasAttachment) filters.hasAttachment = true;
      if (filterFrom) filters.from = filterFrom;
      if (filterTo) filters.to = filterTo;
      if (filterDateFrom) filters.dateFrom = filterDateFrom;
      if (filterDateTo) filters.dateTo = filterDateTo;
      if (filterAccountId) filters.accountId = filterAccountId;
      await api.createSavedView({ name: newViewName.trim(), filters });
      setSaveViewOpen(false);
      setNewViewName('');
      toast.success(t.search.viewSaved);
    } catch {
      toast.error(t.search.errorSaveView);
    } finally {
      setSavingView(false);
    }
  }

  const chips = activeFilterChips();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20 sm:pb-0">
      <TopBar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {/* Search bar */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.back()} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doSearch(); }}
              placeholder={t.search.placeholder}
              className="w-full pl-10 pr-10 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
            {query && (
              <button
                onClick={() => { setQuery(''); setResults([]); setSearched(false); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters((f) => !f)}
            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
              showFilters || chips.length > 0
                ? 'bg-brand-50 dark:bg-brand-900/20 border-brand-200 dark:border-brand-700 text-brand-700 dark:text-brand-300'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <Filter size={14} />
            {t.search.filter}
            {chips.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-brand-500 text-white text-xs flex items-center justify-center">{chips.length}</span>
            )}
            {showFilters ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          <button
            onClick={() => doSearch()}
            disabled={loading}
            className="btn-primary text-sm px-4 py-2.5"
          >
            {t.search.button}
          </button>
        </div>

        {/* Advanced filter panel */}
        {showFilters && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 mb-4 shadow-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t.search.filterFrom}</label>
                <input
                  type="text"
                  value={filterFrom}
                  onChange={(e) => setFilterFrom(e.target.value)}
                  placeholder={t.search.filterPlaceholderFrom}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t.search.filterTo}</label>
                <input
                  type="text"
                  value={filterTo}
                  onChange={(e) => setFilterTo(e.target.value)}
                  placeholder={t.search.filterPlaceholderTo}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t.search.filterDateFrom}</label>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t.search.filterDateTo}</label>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t.search.filterCategory}</label>
                <select
                  value={filterClassification}
                  onChange={(e) => setFilterClassification(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <option value="">{t.search.filterAllCategories}</option>
                  {Object.entries(CLASSIFICATION_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t.search.filterPriority}</label>
                <select
                  value={filterPriority}
                  onChange={(e) => setFilterPriority(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <option value="">{t.search.filterAllPriorities}</option>
                  <option value="high">{t.dashboard.high}</option>
                  <option value="medium">{t.dashboard.medium}</option>
                  <option value="low">{t.dashboard.low}</option>
                </select>
              </div>
              {accounts.length > 0 && (
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t.search.filterAccount}</label>
                  <select
                    value={filterAccountId}
                    onChange={(e) => setFilterAccountId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <option value="">{t.search.filterAllAccounts}</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>{acc.emailAddress}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterHasAttachment}
                    onChange={(e) => setFilterHasAttachment(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-400"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1">
                    <Paperclip size={13} /> {t.search.filterHasAttachment}
                  </span>
                </label>
              </div>
            </div>
            {chips.length > 0 && (
              <button
                onClick={clearFilters}
                className="mt-3 text-xs text-red-500 dark:text-red-400 hover:underline"
              >
                {t.search.clearFilters}
              </button>
            )}
          </div>
        )}

        {/* Active filter chips */}
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {chips.map((chip, i) => (
              <span key={i} className="flex items-center gap-1 px-2.5 py-1 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 text-xs rounded-full border border-brand-200 dark:border-brand-700">
                {chip}
              </span>
            ))}
          </div>
        )}

        {/* Save as view button */}
        {searched && (chips.length > 0 || query) && (
          <div className="mb-4">
            {saveViewOpen ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newViewName}
                  onChange={(e) => setNewViewName(e.target.value)}
                  placeholder={t.search.viewNamePlaceholder}
                  className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-violet-300 dark:border-violet-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-violet-400"
                  autoFocus
                />
                <button
                  onClick={handleSaveAsView}
                  disabled={savingView || !newViewName.trim()}
                  className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded-lg disabled:opacity-50"
                >
                  {t.search.save}
                </button>
                <button onClick={() => setSaveViewOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm px-2">
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={() => setSaveViewOpen(true)}
                className="flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400 hover:underline"
              >
                <Bookmark size={12} />
                {t.search.saveAsView}
              </button>
            )}
          </div>
        )}

        {/* Search history — show when not searched yet */}
        {!searched && !loading && (
          <div>
            {history.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                    {t.search.recentSearches}
                  </span>
                  <button
                    onClick={handleClearHistory}
                    className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                  >
                    {t.search.clearAll}
                  </button>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden shadow-sm">
                  {history.slice(0, 10).map((entry) => (
                    <div key={entry.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700">
                      <Clock size={14} className="text-gray-400 shrink-0" />
                      <button
                        onClick={() => { setQuery(entry.query); doSearch(entry.query, entry); }}
                        className="flex-1 text-left text-sm text-gray-700 dark:text-gray-300 truncate"
                      >
                        {entry.query || t.search.emptyQuery}
                        {entry.resultCount !== null && (
                          <span className="ml-2 text-xs text-gray-400">{t.search.results.replace('{n}', String(entry.resultCount))}</span>
                        )}
                      </button>
                      <button
                        onClick={() => handleDeleteHistory(entry.id)}
                        className="p-1 text-gray-300 hover:text-red-400 dark:text-gray-600 dark:hover:text-red-400 shrink-0 transition-colors"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {searched && (
          <>
            {loading ? (
              <div className="space-y-2">
                {[1,2,3].map((i) => (
                  <div key={i} className="h-20 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 animate-pulse" />
                ))}
              </div>
            ) : results.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title={t.search.noResults}
                description={t.search.noResultsDescription}
              />
            ) : (
              <>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                  {t.search.results.replace('{n}', String(total))}
                </p>
                <div className="space-y-2">
                  {results.map((thread) => (
                    <Link
                      key={thread.id}
                      href={`/threads/${thread.id}`}
                      className="block bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 hover:border-brand-300 dark:hover:border-brand-600 transition-colors shadow-sm p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={`text-sm font-medium truncate ${!thread.isRead ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>
                              {thread.participantEmails[0] ?? '?'}
                            </span>
                            {thread.latestAnalysis && (
                              <PriorityBadge priority={thread.latestAnalysis.priority} />
                            )}
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{thread.subject || t.inbox.noSubject}</p>
                          {thread.snippet && (
                            <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{thread.snippet}</p>
                          )}
                        </div>
                        <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                          {formatRelativeTime(thread.lastMessageAt)}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
