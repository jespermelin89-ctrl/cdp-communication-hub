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

export default function CommandCenterPage() {
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar pendingCount={data?.overview.pending_drafts} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{t.dashboard.title}</h1>
          {data && data.accounts.length > 0 && (
            <div className="flex gap-2">
              {data.accounts.map((acc: Account) => (
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
          )}
        </div>

        {loading && (
          <div className="text-center py-12 text-gray-500">{t.dashboard.loading}</div>
        )}

        {error && (
          <div className="card border-red-200 bg-red-50 text-red-700 mb-6">{error}</div>
        )}

        {data && (
          <>
            {/* Overview Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <OverviewCard
                label={t.dashboard.pendingDrafts}
                value={data.overview.pending_drafts}
                color="amber"
                href="/drafts?status=pending"
              />
              <OverviewCard
                label={t.dashboard.readyToSend}
                value={data.overview.approved_drafts}
                color="blue"
                href="/drafts?status=approved"
              />
              <OverviewCard
                label={t.dashboard.highPriority}
                value={data.overview.high_priority_threads}
                color="red"
                href="/inbox?priority=high"
              />
              <OverviewCard
                label={t.dashboard.unread}
                value={data.overview.unread_threads}
                color="gray"
                href="/inbox?unread=true"
              />
            </div>

            {/* Three-column layout */}
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Pending Drafts Preview */}
              <div className="card">
                <h2 className="font-semibold text-gray-900 mb-4">{t.dashboard.draftsAwaitingAction}</h2>
                {data.drafts_preview.length === 0 ? (
                  <p className="text-gray-500 text-sm">{t.dashboard.noPendingDrafts}</p>
                ) : (
                  <div className="space-y-3">
                    {data.drafts_preview.map((draft) => (
                      <Link
                        key={draft.id}
                        href={`/drafts/${draft.id}`}
                        className="block p-3 rounded-lg border border-gray-100 hover:border-brand-200 hover:bg-brand-50/50 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-900 truncate">
                            {draft.subject}
                          </span>
                          <StatusBadge status={draft.status} />
                        </div>
                        <div className="text-xs text-gray-500">
                          {t.common.to}: {draft.toAddresses.join(', ')}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Categories Overview */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-gray-900">{t.dashboard.categories}</h2>
                  <Link href="/categories" className="text-xs text-brand-500 hover:text-brand-600">
                    {t.dashboard.manage}
                  </Link>
                </div>
                {categories.length === 0 ? (
                  <p className="text-gray-500 text-sm">{t.dashboard.categoriesEmpty}</p>
                ) : (
                  <div className="space-y-2">
                    {categories.map((cat: any) => (
                      <div key={cat.id} className="flex items-center justify-between py-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: cat.color || '#9CA3AF' }}
                          />
                          <span className="text-sm text-gray-700">{cat.icon} {cat.name}</span>
                        </div>
                        {cat._count?.rules > 0 && (
                          <span className="text-xs text-gray-400">{cat._count.rules} {t.dashboard.rules}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Activity */}
              <div className="card">
                <h2 className="font-semibold text-gray-900 mb-4">{t.dashboard.recentActivity}</h2>
                {data.recent_actions.length === 0 ? (
                  <p className="text-gray-500 text-sm">{t.dashboard.noRecentActivity}</p>
                ) : (
                  <div className="space-y-3">
                    {data.recent_actions.map((action, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm">
                        <ActionIcon type={action.actionType} />
                        <div className="flex-1 min-w-0">
                          <span className="text-gray-700">
                            {formatActionType(action.actionType)}
                          </span>
                          {action.metadata?.subject && (
                            <span className="text-gray-400 ml-1 truncate block text-xs">
                              {action.metadata?.subject}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {formatTime(action.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Priority Summary */}
            <div className="mt-6 card">
              <h2 className="font-semibold text-gray-900 mb-4">{t.dashboard.prioritySummary}</h2>
              <div className="flex items-center gap-8">
                <PriorityStat label={t.dashboard.high} count={data.overview.high_priority_threads} color="red" />
                <PriorityStat label={t.dashboard.medium} count={data.overview.medium_priority_threads} color="amber" />
                <PriorityStat label={t.dashboard.low} count={data.overview.low_priority_threads} color="emerald" />
                <div className="text-sm text-gray-500 ml-auto">
                  {data.overview.total_threads} {t.dashboard.threadsCached} {data.accounts.length} {data.accounts.length !== 1 ? t.dashboard.accounts : t.dashboard.account}
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function OverviewCard({ label, value, color, href }: {
  label: string; value: number; color: string; href: string;
}) {
  const colorMap: Record<string, string> = {
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    red: 'bg-red-50 border-red-200 text-red-900',
    gray: 'bg-gray-50 border-gray-200 text-gray-900',
  };
  return (
    <Link href={href} className={`rounded-xl border p-4 transition-shadow hover:shadow-md ${colorMap[color]}`}>
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-sm mt-1 opacity-75">{label}</div>
    </Link>
  );
}

function PriorityStat({ label, count, color }: { label: string; count: number; color: string }) {
  const dotColor: Record<string, string> = { red: 'bg-red-500', amber: 'bg-amber-500', emerald: 'bg-emerald-500' };
  return (
    <div className="flex items-center gap-2">
      <span className={`w-3 h-3 rounded-full ${dotColor[color]}`} />
      <span className="text-sm text-gray-700">{count} {label}</span>
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
  return <span className="text-lg">{icons[type] || '📋'}</span>;
}
