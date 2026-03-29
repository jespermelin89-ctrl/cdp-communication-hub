'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import TopBar from '@/components/TopBar';
import PriorityBadge from '@/components/PriorityBadge';
import { Search, X, Clock, ArrowLeft, SearchX } from 'lucide-react';
import { api } from '@/lib/api';
import EmptyState from '@/components/EmptyState';

const RECENT_KEY = 'cdp_recent_searches';
const MAX_RECENT = 8;

const SUGGESTIONS = [
  'is:unread',
  'priority:high',
  'has:draft',
  'from:forsakringskassan',
  'from:skatteverket',
];

function getRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch { return []; }
}

function saveRecent(query: string) {
  const prev = getRecent().filter(q => q !== query);
  localStorage.setItem(RECENT_KEY, JSON.stringify([query, ...prev].slice(0, MAX_RECENT)));
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState('');
  const [quickFilter, setQuickFilter] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    setRecent(getRecent());
    inputRef.current?.focus();
  }, []);

  async function doSearch(q: string) {
    if (!q.trim()) return;
    setQuery(q);
    setLoading(true);
    setSearched(true);
    saveRecent(q);
    setRecent(getRecent());
    try {
      const res = await api.getThreads({ search: q, limit: 30 });
      let threads = res.threads ?? [];
      if (priorityFilter) {
        threads = threads.filter((t: any) => t.latestAnalysis?.priority === priorityFilter);
      }
      if (quickFilter === 'unread') {
        threads = threads.filter((t: any) => !t.isRead);
      } else if (quickFilter === 'attachment') {
        threads = threads.filter((t: any) => t.messages?.some((m: any) => m.attachments?.length > 0));
      } else if (quickFilter === 'week') {
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        threads = threads.filter((t: any) => t.lastMessageAt && new Date(t.lastMessageAt).getTime() > weekAgo);
      }
      setResults(threads);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function clearRecent() {
    localStorage.removeItem(RECENT_KEY);
    setRecent([]);
  }

  const showSuggestions = !searched && query.length === 0;
  const showRecent = !searched && recent.length > 0 && query.length === 0;

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
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doSearch(query)}
              placeholder="Sök mail, avsändare, ämne..."
              className="w-full pl-10 pr-10 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
            {query && (
              <button
                onClick={() => { setQuery(''); setResults([]); setSearched(false); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <button
            onClick={() => doSearch(query)}
            disabled={loading || !query.trim()}
            className="btn-primary text-sm px-4 py-2.5"
          >
            Sök
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-5">
          {[
            { key: '', label: 'Alla prio' },
            { key: 'high', label: '🔴 Hög' },
            { key: 'medium', label: '🟡 Medium' },
            { key: 'low', label: '⚪ Låg' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setPriorityFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                priorityFilter === f.key
                  ? 'bg-brand-500 text-white border-brand-500'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {f.label}
            </button>
          ))}
          <div className="w-px bg-gray-200 dark:bg-gray-700 self-stretch mx-1" />
          {[
            { key: '', label: 'Alla' },
            { key: 'unread', label: '● Olästa' },
            { key: 'attachment', label: '📎 Med bilaga' },
            { key: 'week', label: '📅 Senaste veckan' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setQuickFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                quickFilter === f.key
                  ? 'bg-indigo-500 text-white border-indigo-500'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Recent searches */}
        {showRecent && (
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">Senaste sökningar</span>
              <button onClick={clearRecent} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">Rensa</button>
            </div>
            <div className="space-y-1">
              {recent.map(q => (
                <button
                  key={q}
                  onClick={() => doSearch(q)}
                  className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 hover:shadow-sm transition-all text-left"
                >
                  <Clock size={14} className="text-gray-400 shrink-0" />
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Suggestions */}
        {showSuggestions && (
          <div>
            <div className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Förslag</div>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => doSearch(s)}
                  className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full text-xs text-gray-600 dark:text-gray-300 hover:border-brand-300 dark:hover:border-brand-700 hover:text-brand-700 dark:hover:text-brand-300 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
          </div>
        )}

        {/* Results */}
        {!loading && searched && (
          <div>
            {results.length > 0 && (
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                {results.length} träffar för &quot;{query}&quot;
              </div>
            )}
            {results.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title={`Inga träffar för "${query}"`}
                description="Prova ett annat sökord eller filtrera på prioritet"
                action={{ label: 'Rensa sökning', onClick: () => { setQuery(''); setResults([]); setSearched(false); } }}
              />
            ) : (
            <div className="space-y-2">
              {results.map(thread => (
                <Link
                  key={thread.id}
                  href={`/threads/${thread.id}`}
                  className="flex items-start gap-3 p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm hover:border-brand-300 dark:hover:border-brand-700 hover:shadow-md transition-all group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-sm font-medium truncate ${!thread.isRead ? 'text-gray-900 dark:text-gray-100 font-semibold' : 'text-gray-700 dark:text-gray-300'}`}>
                        {thread.subject || '(Inget ämne)'}
                      </span>
                      {thread.latestAnalysis && <PriorityBadge priority={thread.latestAnalysis.priority} />}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 truncate">
                      {thread.participantEmails?.slice(0, 2).join(', ')}
                    </div>
                    {thread.snippet && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{thread.snippet}</div>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                    {thread.lastMessageAt ? new Date(thread.lastMessageAt).toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' }) : ''}
                  </div>
                </Link>
              ))}
            </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
