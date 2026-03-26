'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
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
  const highPct = totalThreads > 0 ? Math.round((data!.overview.high_priority_threads / totalThreads) * 100) : 0;
  const medPct = totalThreads > 0 ? Math.round((data!.overview.medium_priority_threads / totalThreads) * 100) : 0;
  const lowPct = totalThreads > 0 ? Math.round((data!.overview.low_priority_threads / totalThreads) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar pendingCount={data?.overview.pending_drafts} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t.dashboard.title}</h1>
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
          <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 mb-6 text-sm">{error}</div>
        )}

        {data && (
          <>
            {/* Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <GradientCard
                label={t.dashboard.unread}
                value={data.overview.unread_threads}
                gradient="from-indigo-500 to-purple-600"
                icon="✉️"
                href="/inbox?unread=true"
              />
              <GradientCard
                label={t.dashboard.highPriority}
                value={data.overview.high_priority_threads}
                gradient="from-red-500 to-rose-600"
                icon="🔥"
                href="/inbox?priority=high"
              />
              <GradientCard
                label={t.dashboard.pendingDrafts}
                value={data.overview.pending_drafts}
                gradient="from-amber-400 to-orange-500"
                icon="📝"
                href="/drafts?status=pending"
              />
              <GradientCard
                label={t.dashboard.readyToSend}
                value={data.overview.approved_drafts}
                gradient="from-emerald-400 to-teal-500"
                icon="✅"
                href="/drafts?status=approved"
              />
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              <QuickActionCard
                icon="🔄"
                label={syncing ? t.inbox.syncing : t.inbox.syncAll}
                onClick={handleQuickSync}
                disabled={syncing}
                color="blue"
              />
              <QuickActionCard
                icon="🤖"
                label={t.dashboard.analyzeAll}
                href="/inbox"
                color="violet"
              />
              <QuickActionCard
                icon="📬"
                label={t.dashboard.goToInbox}
                href="/inbox"
                color="emerald"
              />
              <QuickActionCard
                icon="⚙️"
                label={t.nav.settings}
                href="/settings"
                color="gray"
              />
            </div>

            {/* Main Grid */}
            <div className="grid lg:grid-cols-3 gap-6 mb-6">
              {/* Pending Drafts */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-gray-900">{t.dashboard.draftsAwaitingAction}</h2>
                  <Link href="/drafts" className="text-xs text-brand-500 hover:text-brand-600 font-medium">
                    {t.dashboard.viewAll} →
                  </Link>
                </div>
                {data.drafts_preview.length === 0 ? (
                  <div className="text-center py-6">
                    <div className="text-3xl mb-2">✨</div>
                    <p className="text-gray-400 text-sm">{t.dashboard.noPendingDrafts}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.drafts_preview.slice(0, 5).map((draft) => (
                      <Link
                        key={draft.id}
                        href={`/drafts/${draft.id}`}
                        className="block p-3 rounded-xl border border-gray-100 hover:border-brand-200 hover:bg-brand-50/40 transition-all group"
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
              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                <h2 className="font-semibold text-gray-900 mb-4">{t.dashboard.prioritySummary}</h2>
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
                <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
                  <span>{t.dashboard.totalThreads}</span>
                  <span className="font-semibold text-gray-700">{totalThreads}</span>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                <h2 className="font-semibold text-gray-900 mb-4">{t.dashboard.recentActivity}</h2>
                {data.recent_actions.length === 0 ? (
                  <div className="text-center py-6">
                    <div className="text-3xl mb-2">📭</div>
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
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm mb-6">
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
              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
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
                      className="flex items-center gap-2.5 p-3 rounded-xl bg-gray-50 border border-gray-100"
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
  label: string; value: number; gradient: string; icon: string; href: string;
}) {
  return (
    <Link
      href={href}
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-5 text-white shadow-sm hover:shadow-lg transition-shadow`}
    >
      <div className="absolute top-3 right-4 text-2xl opacity-30">{icon}</div>
      <div className="text-4xl font-bold">{value}</div>
      <div className="text-sm mt-1 opacity-85">{label}</div>
    </Link>
  );
}

function QuickActionCard({
  icon, label, href, onClick, disabled, color
}: {
  icon: string; label: string; href?: string; onClick?: () => void; disabled?: boolean; color: string;
}) {
  const colorMap: Record<string, string> = {
    blue: 'hover:bg-blue-50 hover:border-blue-200 text-blue-700',
    violet: 'hover:bg-violet-50 hover:border-violet-200 text-violet-700',
    emerald: 'hover:bg-emerald-50 hover:border-emerald-200 text-emerald-700',
    gray: 'hover:bg-gray-100 hover:border-gray-300 text-gray-700',
  };
  const base = `flex flex-col items-center justify-center gap-2 py-4 rounded-2xl border border-gray-200 bg-white shadow-sm transition-all ${colorMap[color]} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`;

  if (href) {
    return (
      <Link href={href} className={base}>
        <span className="text-2xl">{icon}</span>
        <span className="text-xs font-medium text-center leading-tight">{label}</span>
      </Link>
    );
  }
  return (
    <button onClick={onClick} disabled={disabled} className={base}>
      <span className="text-2xl">{icon}</span>
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
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
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
    <div className={`flex items-start gap-3 p-3 rounded-xl border ${hasError ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50'}`}>
      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${dot}`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800 truncate">{account.emailAddress}</div>
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
  const icons: Record<string, string> = {
    draft_created: '📝',
    draft_approved: '✅',
    draft_sent: '📤',
    draft_discarded: '🗑️',
    analysis_run: '🤖',
    account_connected: '🔗',
    rule_created: '🏷️',
  };
  return <span className="text-base shrink-0">{icons[type] || '📋'}</span>;
}
