'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Mail, AlertTriangle, FileText, CheckCircle, RefreshCw, Brain, Inbox, Settings,
  AlertCircle, Info, Lightbulb, Sparkles, Send, Trash2, Bot, Link2, Tag,
  MailOpen,
} from 'lucide-react';
import TopBar from '@/components/TopBar';
import StatusBadge from '@/components/StatusBadge';
import AccountBadge from '@/components/AccountBadge';
import AddEmailAccount from '@/components/AddEmailAccount';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { CommandCenterData, Account } from '@/lib/types';

export default function DashboardPage() {
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [dailySummary, setDailySummary] = useState<any | null>(null);
  const [dailySummaryLoading, setDailySummaryLoading] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [cmdResult, catResult] = await Promise.all([
        api.getCommandCenter(),
        api.getCategories().catch(() => ({ categories: [] })),
      ]);
      setData(cmdResult);
      setCategories(catResult.categories || []);
      // Auto-fetch AI summary for default account if not cached
      const defaultAcc = cmdResult.accounts?.find((a: Account) => a.isDefault) ?? cmdResult.accounts?.[0];
      if (defaultAcc) {
        const cached = sessionStorage.getItem(`ai_summary_${defaultAcc.id}`);
        if (cached) {
          setAiSummary(cached);
        } else {
          fetchAiSummary(defaultAcc.id);
        }
      }
      // Load Brain Core daily summary
      fetchDailySummary();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAiSummary(accountId: string) {
    setSummaryLoading(true);
    try {
      const result = await api.summarizeInbox(accountId);
      const summary = result.summary || '';
      setAiSummary(summary);
      sessionStorage.setItem(`ai_summary_${accountId}`, summary);
    } catch {
      // Non-critical — fail silently
    } finally {
      setSummaryLoading(false);
    }
  }

  function refreshSummary() {
    const defaultAcc = data?.accounts?.find((a: Account) => a.isDefault) ?? data?.accounts?.[0];
    if (!defaultAcc) return;
    sessionStorage.removeItem(`ai_summary_${defaultAcc.id}`);
    fetchAiSummary(defaultAcc.id);
  }

  async function fetchDailySummary() {
    setDailySummaryLoading(true);
    try {
      const result = await api.getDailySummary();
      setDailySummary(result.summary);
    } catch {
      // Non-critical
    } finally {
      setDailySummaryLoading(false);
    }
  }

  async function regenerateDailySummary() {
    setDailySummaryLoading(true);
    try {
      const result = await api.regenerateDailySummary();
      setDailySummary(result.summary);
    } catch {
      // Non-critical
    } finally {
      setDailySummaryLoading(false);
    }
  }

  async function handleQuickSync() {
    if (!data?.accounts?.length) return;
    setSyncing(true);
    try {
      for (const acc of data.accounts.filter((a: Account) => a.isActive)) {
        await api.syncThreads(acc.id, 30);
      }
      await loadData();
    } catch (err: any) {
      alert(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }

  if (!api.isAuthenticated()) {
    return <AddEmailAccount onSuccess={() => window.location.reload()} />;
  }

  function formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60000) return t.time.justNow;
    if (diff < 3600000) return t.time.minutesAgo.replace('{n}', String(Math.floor(diff / 60000)));
    if (diff < 86400000) return t.time.hoursAgo.replace('{n}', String(Math.floor(diff / 3600000)));
    return date.toLocaleDateString();
  }

  function formatActionType(type: string): string {
    const key = type as keyof typeof t.actions;
    return t.actions[key] || type;
  }

  const totalThreads = data?.overview.total_threads ?? 0;
  const unanalyzed = data?.overview.unanalyzed_threads ?? 0;
  const analyzedThreads = totalThreads - unanalyzed;
  const highPct = analyzedThreads > 0 ? Math.round((data!.overview.high_priority_threads / analyzedThreads) * 100) : 0;
  const medPct = analyzedThreads > 0 ? Math.round((data!.overview.medium_priority_threads / analyzedThreads) * 100) : 0;
  const lowPct = analyzedThreads > 0 ? Math.round((data!.overview.low_priority_threads / analyzedThreads) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <TopBar pendingCount={data?.overview.pending_drafts} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t.dashboard.title}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {data
                ? `${data.overview.total_threads} ${t.dashboard.threadsCached} ${data.accounts.length} ${data.accounts.length !== 1 ? t.dashboard.accounts : t.dashboard.account}`
                : t.dashboard.loading}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {data?.accounts?.map((acc: Account) => (
              <AccountBadge
                key={acc.id}
                emailAddress={acc.emailAddress}
                provider={acc.provider}
                color={acc.color}
                label={acc.label}
                size="md"
              />
            ))}
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <div className="w-8 h-8 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
              <span className="text-sm">{t.dashboard.loading}</span>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 px-4 py-3 mb-6 text-sm">{error}</div>
        )}

        {data && (
          <>
            {/* Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <GradientCard
                label={t.dashboard.unread}
                value={data.overview.unread_threads}
                gradient="from-indigo-500 to-purple-600"
                icon={<Mail size={28} />}
                href="/inbox?unread=true"
              />
              <GradientCard
                label={t.dashboard.highPriority}
                value={data.overview.high_priority_threads}
                gradient="from-red-500 to-rose-600"
                icon={<AlertTriangle size={28} />}
                href="/inbox?priority=high"
              />
              <GradientCard
                label={t.dashboard.pendingDrafts}
                value={data.overview.pending_drafts}
                gradient="from-amber-400 to-orange-500"
                icon={<FileText size={28} />}
                href="/drafts?status=pending"
              />
              <GradientCard
                label={t.dashboard.readyToSend}
                value={data.overview.approved_drafts}
                gradient="from-emerald-400 to-teal-500"
                icon={<CheckCircle size={28} />}
                href="/drafts?status=approved"
              />
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              <QuickActionCard
                icon={<RefreshCw size={22} strokeWidth={1.75} />}
                label={syncing ? t.inbox.syncing : t.inbox.syncAll}
                onClick={handleQuickSync}
                disabled={syncing}
                color="blue"
              />
              <QuickActionCard
                icon={<Bot size={22} strokeWidth={1.75} />}
                label={t.dashboard.analyzeAll}
                href="/inbox"
                color="violet"
              />
              <QuickActionCard
                icon={<Inbox size={22} strokeWidth={1.75} />}
                label={t.dashboard.goToInbox}
                href="/inbox"
                color="emerald"
              />
              <QuickActionCard
                icon={<Settings size={22} strokeWidth={1.75} />}
                label={t.nav.settings}
                href="/settings"
                color="gray"
              />
            </div>

            {/* AI Inbox Summary */}
            {(summaryLoading || aiSummary) && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Bot size={16} className="text-violet-500" />
                    {t.dashboard.aiSummary}
                  </h2>
                  <button
                    onClick={refreshSummary}
                    disabled={summaryLoading}
                    className="text-xs text-brand-500 hover:text-brand-600 font-medium disabled:opacity-50"
                  >
                    {summaryLoading ? '...' : t.dashboard.aiSummaryRefresh}
                  </button>
                </div>
                {summaryLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <div className="w-3 h-3 border border-gray-300 border-t-brand-500 rounded-full animate-spin" />
                    {t.dashboard.aiSummaryLoading}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{aiSummary}</p>
                )}
              </div>
            )}

            {/* Brain Core Daily Summary */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <Brain size={16} className="text-brand-500" />
                  {t.brainCore.dailySummary}
                </h2>
                <button
                  onClick={regenerateDailySummary}
                  disabled={dailySummaryLoading}
                  className="text-xs text-brand-500 hover:text-brand-600 font-medium disabled:opacity-50"
                >
                  {dailySummaryLoading ? t.brainCore.generating : t.brainCore.regenerate}
                </button>
              </div>

              {dailySummaryLoading && !dailySummary && (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-4 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
                  ))}
                </div>
              )}

              {!dailySummaryLoading && !dailySummary && (
                <button
                  onClick={fetchDailySummary}
                  className="text-sm text-gray-400 hover:text-brand-500 transition-colors"
                >
                  {t.brainCore.noSummary}
                </button>
              )}

              {dailySummary && (
                <div className="space-y-4">
                  {/* Stats row */}
                  <div className="flex gap-4 text-sm">
                    <span className="text-blue-600 font-medium">{dailySummary.totalNew} {t.brainCore.totalNew}</span>
                    <span className="text-amber-600 font-medium">{dailySummary.totalUnread} {t.brainCore.totalUnread}</span>
                    <span className="text-gray-400">{dailySummary.totalAutoSorted} {t.brainCore.totalAutoSorted}</span>
                  </div>

                  {/* Needs Reply */}
                  {Array.isArray(dailySummary.needsReply) && dailySummary.needsReply.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                        <AlertCircle size={12} /> {t.brainCore.needsReply} ({dailySummary.needsReply.length})
                      </div>
                      <div className="space-y-1.5">
                        {dailySummary.needsReply.slice(0, 5).map((item: any, i: number) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span className="text-gray-700 dark:text-gray-300 truncate flex-1 mr-2">
                              {item.subject || '(No subject)'}
                            </span>
                            {item.priority && (
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                item.priority === 'high' ? 'bg-red-100 text-red-700' :
                                item.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                                {item.priority}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Good to Know */}
                  {Array.isArray(dailySummary.goodToKnow) && dailySummary.goodToKnow.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                        <Info size={12} /> {t.brainCore.goodToKnow} ({dailySummary.goodToKnow.length})
                      </div>
                      <div className="space-y-1">
                        {dailySummary.goodToKnow.slice(0, 3).map((item: any, i: number) => (
                          <div key={i} className="text-sm text-gray-600 dark:text-gray-400 truncate">
                            {item.subject || '(No subject)'}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recommendation */}
                  {dailySummary.recommendation && (
                    <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                      <div className="text-xs font-semibold text-brand-600 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                        <Lightbulb size={12} /> {t.brainCore.recommendation}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                        {dailySummary.recommendation}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Main Grid */}
            <div className="grid lg:grid-cols-3 gap-6 mb-6">
              {/* Pending Drafts */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-gray-900">{t.dashboard.draftsAwaitingAction}</h2>
                  <Link href="/drafts" className="text-xs text-brand-500 hover:text-brand-600 font-medium">
                    {t.dashboard.viewAll} →
                  </Link>
                </div>
                {data.drafts_preview.length === 0 ? (
                  <div className="text-center py-6">
                    <div className="flex justify-center mb-2"><Sparkles size={28} strokeWidth={1.5} className="text-gray-300 dark:text-gray-600" /></div>
                    <p className="text-gray-400 text-sm">{t.dashboard.noPendingDrafts}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.drafts_preview.slice(0, 5).map((draft) => (
                      <Link
                        key={draft.id}
                        href={`/drafts/${draft.id}`}
                        className="block p-3 rounded-xl border border-gray-100 dark:border-gray-700 hover:border-brand-200 hover:bg-brand-50/40 transition-all group"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-900 truncate group-hover:text-brand-700">
                            {draft.subject}
                          </span>
                          <StatusBadge status={draft.status} />
                        </div>
                        <div className="text-xs text-gray-400 truncate">
                          {t.common.to}: {draft.toAddresses.join(', ')}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Priority Distribution */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">{t.dashboard.prioritySummary}</h2>
                <div className="space-y-3">
                  <PriorityBar
                    label={t.dashboard.high}
                    count={data.overview.high_priority_threads}
                    pct={highPct}
                    color="bg-red-500"
                    textColor="text-red-600"
                  />
                  <PriorityBar
                    label={t.dashboard.medium}
                    count={data.overview.medium_priority_threads}
                    pct={medPct}
                    color="bg-amber-400"
                    textColor="text-amber-600"
                  />
                  <PriorityBar
                    label={t.dashboard.low}
                    count={data.overview.low_priority_threads}
                    pct={lowPct}
                    color="bg-emerald-400"
                    textColor="text-emerald-600"
                  />
                </div>
                {unanalyzed > 0 && (
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <Link href="/inbox" className="flex items-center gap-1.5 text-amber-600 hover:text-amber-700">
                      <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                      {unanalyzed} {t.inbox.notAnalyzed}
                    </Link>
                    <Link href="/inbox" className="text-brand-500 hover:text-brand-600 font-medium">
                      {t.dashboard.analyzeAll} →
                    </Link>
                  </div>
                )}
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-xs text-gray-400">
                  <span>{t.dashboard.totalThreads}</span>
                  <span className="font-semibold text-gray-700">{totalThreads}</span>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">{t.dashboard.recentActivity}</h2>
                {data.recent_actions.length === 0 ? (
                  <div className="text-center py-6">
                    <div className="flex justify-center mb-2"><MailOpen size={28} strokeWidth={1.5} className="text-gray-300 dark:text-gray-600" /></div>
                    <p className="text-gray-400 text-sm">{t.dashboard.noRecentActivity}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.recent_actions.slice(0, 8).map((action, i) => (
                      <div key={i} className="flex items-start gap-3 text-sm">
                        <ActionIcon type={action.actionType} />
                        <div className="flex-1 min-w-0">
                          <span className="text-gray-700 font-medium">
                            {formatActionType(action.actionType)}
                          </span>
                          {action.metadata?.subject && (
                            <span className="text-gray-400 block text-xs truncate">
                              {action.metadata.subject}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">
                          {formatTime(action.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Accounts Sync Status */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">{t.dashboard.syncStatus}</h2>
                <button
                  onClick={handleQuickSync}
                  disabled={syncing}
                  className="text-xs font-medium text-brand-500 hover:text-brand-600 disabled:opacity-50"
                >
                  {syncing ? t.inbox.syncing : t.inbox.syncAll}
                </button>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.accounts.map((acc: Account) => (
                  <AccountSyncCard key={acc.id} account={acc} formatTime={formatTime} t={t} />
                ))}
              </div>
            </div>

            {/* Categories */}
            {categories.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-gray-900">{t.dashboard.categories}</h2>
                  <Link href="/categories" className="text-xs text-brand-500 hover:text-brand-600 font-medium">
                    {t.dashboard.manage} →
                  </Link>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {categories.map((cat: any) => (
                    <div
                      key={cat.id}
                      className="flex items-center gap-2.5 p-3 rounded-xl bg-gray-50 border border-gray-100 dark:border-gray-700"
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: cat.color || '#9CA3AF' }}
                      />
                      <span className="text-sm text-gray-700 truncate">
                        {cat.icon} {cat.name}
                      </span>
                      {cat._count?.rules > 0 && (
                        <span className="ml-auto text-xs text-gray-400 shrink-0">{cat._count.rules}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ——— Sub-components ———

function GradientCard({
  label, value, gradient, icon, href
}: {
  label: string; value: number; gradient: string; icon: React.ReactNode; href: string;
}) {
  return (
    <Link
      href={href}
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-5 text-white shadow-sm hover:shadow-lg transition-shadow`}
    >
      <div className="absolute top-3 right-4 opacity-30">{icon}</div>
      <div className="text-4xl font-bold">{value}</div>
      <div className="text-sm mt-1 opacity-85">{label}</div>
    </Link>
  );
}

function QuickActionCard({
  icon, label, href, onClick, disabled, color
}: {
  icon: React.ReactNode; label: string; href?: string; onClick?: () => void; disabled?: boolean; color: string;
}) {
  const colorMap: Record<string, string> = {
    blue: 'hover:bg-blue-50 hover:border-blue-200 text-blue-700',
    violet: 'hover:bg-violet-50 hover:border-violet-200 text-violet-700',
    emerald: 'hover:bg-emerald-50 hover:border-emerald-200 text-emerald-700',
    gray: 'hover:bg-gray-100 hover:border-gray-300 text-gray-700',
  };
  const base = `flex flex-col items-center justify-center gap-2 py-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm transition-all ${colorMap[color]} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`;

  if (href) {
    return (
      <Link href={href} className={base}>
        {icon}
        <span className="text-xs font-medium text-center leading-tight">{label}</span>
      </Link>
    );
  }
  return (
    <button onClick={onClick} disabled={disabled} className={base}>
      {icon}
      <span className="text-xs font-medium text-center leading-tight">{label}</span>
    </button>
  );
}

function PriorityBar({
  label, count, pct, color, textColor
}: {
  label: string; count: number; pct: number; color: string; textColor: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className={`font-medium ${textColor}`}>{label}</span>
        <span className="text-gray-500">{count} ({pct}%)</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function AccountSyncCard({
  account, formatTime, t
}: {
  account: Account; formatTime: (d: string) => string; t: any;
}) {
  const hasError = !!account.syncError;
  const dot = hasError ? 'bg-red-500' : account.isActive ? 'bg-emerald-400' : 'bg-gray-300';

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border ${hasError ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20' : 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'}`}>
      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${dot}`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{account.emailAddress}</div>
        {account.label && (
          <div className="text-xs text-gray-400">{account.label}</div>
        )}
        {hasError ? (
          <div className="text-xs text-red-600 mt-0.5 truncate">{t.settings.syncError}: {account.syncError}</div>
        ) : (
          <div className="text-xs text-gray-400 mt-0.5">
            {account.lastSyncAt ? formatTime(account.lastSyncAt) : '—'}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionIcon({ type }: { type: string }) {
  const p = { size: 16, strokeWidth: 1.75 };
  if (type === 'draft_created') return <FileText {...p} className="text-blue-500 shrink-0" />;
  if (type === 'draft_approved') return <CheckCircle {...p} className="text-emerald-500 shrink-0" />;
  if (type === 'draft_sent') return <Send {...p} className="text-teal-500 shrink-0" />;
  if (type === 'draft_discarded') return <Trash2 {...p} className="text-gray-400 shrink-0" />;
  if (type === 'analysis_run') return <Bot {...p} className="text-violet-500 shrink-0" />;
  if (type === 'account_connected') return <Link2 {...p} className="text-brand-500 shrink-0" />;
  if (type === 'rule_created') return <Tag {...p} className="text-orange-400 shrink-0" />;
  return <FileText {...p} className="text-gray-400 shrink-0" />;
}
