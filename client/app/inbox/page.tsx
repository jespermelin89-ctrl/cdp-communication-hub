'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import TopBar from '@/components/TopBar';
import PriorityBadge from '@/components/PriorityBadge';
import AccountBadge from '@/components/AccountBadge';
import { BadgeIcons } from '@/components/EmailBadges';
import { api } from '@/lib/api';
import type { EmailThread, Account } from '@/lib/types';

export default function InboxPage() {
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    loadThreads();
  }, [selectedAccountId]);

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
      const params: any = {};
      if (selectedAccountId) params.account_id = selectedAccountId;
      if (search) params.search = search;
      const result = await api.getThreads(params);
      setThreads(result.threads);
    } catch (err: any) {
      console.error('Failed to load threads:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      // Sync all active accounts (or selected one)
      const toSync = selectedAccountId
        ? accounts.filter((a) => a.id === selectedAccountId)
        : accounts.filter((a) => a.isActive);

      for (const account of toSync) {
        await api.syncThreads(account.id, 30);
      }
      await loadThreads();
    } catch (err: any) {
      alert(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }

  async function handleAnalyze(threadId: string) {
    try {
      await api.syncMessages(threadId);
      const result = await api.analyzeThread(threadId);
      alert(result.message);
      await loadThreads();
    } catch (err: any) {
      alert(`Analysis failed: ${err.message}`);
    }
  }

  // Build a lookup for account colors/labels
  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Inbox</h1>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="btn-primary text-sm"
          >
            {syncing ? 'Syncing...' : 'Sync All'}
          </button>
        </div>

        {/* Account Filter Tabs */}
        {accounts.length > 1 && (
          <div className="flex gap-2 mb-4 flex-wrap">
            <button
              onClick={() => setSelectedAccountId('')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                !selectedAccountId
                  ? 'bg-brand-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All Accounts
            </button>
            {accounts.map((acc) => (
              <button
                key={acc.id}
                onClick={() => setSelectedAccountId(acc.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${
                  selectedAccountId === acc.id
                    ? 'bg-brand-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: acc.color || (acc.provider === 'gmail' ? '#EA4335' : '#6366F1') }}
                />
                {acc.label || acc.emailAddress.split('@')[0]}
                <BadgeIcons badges={acc.badges || []} size="sm" />
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search threads..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadThreads()}
            className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
          />
        </div>

        {/* Thread List */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading threads...</div>
        ) : threads.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-500 mb-4">No threads found. Sync your accounts to get started.</p>
            <button onClick={handleSync} className="btn-primary">
              Sync Now
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {threads.map((thread) => {
              const acc = accountMap.get(thread.accountId);
              return (
                <div
                  key={thread.id}
                  className={`card flex flex-col sm:flex-row sm:items-start gap-3 ${
                    !thread.isRead ? 'border-l-4 border-l-brand-500' : ''
                  }`}
                >
                  <Link href={`/threads/${thread.id}`} className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {/* Account badge */}
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
                      <span className={`text-sm truncate ${!thread.isRead ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                        {thread.subject || '(No Subject)'}
                      </span>
                      {thread.latestAnalysis && (
                        <PriorityBadge priority={thread.latestAnalysis.priority} />
                      )}
                    </div>

                    <div className="text-xs text-gray-500 truncate mb-1">
                      {thread.participantEmails.slice(0, 3).join(', ')}
                      {thread.participantEmails.length > 3 && ` +${thread.participantEmails.length - 3}`}
                      <span className="mx-1.5">|</span>
                      {thread.messageCount} messages
                      <span className="mx-1.5">|</span>
                      {thread.lastMessageAt && new Date(thread.lastMessageAt).toLocaleString()}
                    </div>

                    {thread.latestAnalysis ? (
                      <div className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1 mt-1">
                        <span className="font-medium">AI:</span> {thread.latestAnalysis.summary.substring(0, 120)}...
                        <span className="ml-2 text-gray-400">
                          [{thread.latestAnalysis.classification}]
                        </span>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400 truncate mt-1">
                        {thread.snippet}
                      </div>
                    )}
                  </Link>

                  <div className="flex items-center gap-2 shrink-0">
                    {!thread.latestAnalysis && (
                      <button
                        onClick={() => handleAnalyze(thread.id)}
                        className="btn-secondary text-xs"
                      >
                        Analyze
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
