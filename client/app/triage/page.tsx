'use client';

import { useState } from 'react';
import useSWR from 'swr';
import TopBar from '@/components/TopBar';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  BarChart3,
  Trash2,
  Eye,
  Inbox,
  RefreshCw,
  AlertCircle,
  TrendingDown,
  Filter,
} from 'lucide-react';

type Period = 'today' | 'week' | 'month';

const ACTION_COLORS: Record<string, string> = {
  trash: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  trash_after_log: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  notify_then_trash: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  label_review: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  keep_inbox: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  auto_draft: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-4 ${color}`}>
      <div className="opacity-70">{icon}</div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs opacity-70 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function BarRow({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-600 dark:text-gray-400 w-28 shrink-0 truncate" title={label}>{label}</span>
      <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-brand-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-medium text-gray-700 dark:text-gray-300 w-8 text-right">{count}</span>
    </div>
  );
}

export default function TriagePage() {
  const { t } = useI18n();
  const [period, setPeriod] = useState<Period>('today');
  const [actionFilter, setActionFilter] = useState<string>('');

  const PERIOD_LABELS: Record<Period, string> = {
    today: t.triage.periodToday,
    week: t.triage.periodWeek,
    month: t.triage.periodMonth,
  };

  const ACTION_LABELS: Record<string, string> = {
    trash: t.triage.actionTrash,
    trash_after_log: t.triage.actionTrashAfterLog,
    notify_then_trash: t.triage.actionNotifyThenTrash,
    label_review: t.triage.actionLabelReview,
    keep_inbox: t.triage.actionKeepInbox,
    auto_draft: t.triage.actionAutoDraft,
  };

  const CLASSIFICATION_LABELS: Record<string, string> = {
    lead: t.triage.classLead,
    partner: t.triage.classPartner,
    personal: t.triage.classPersonal,
    spam: t.triage.classSpam,
    operational: t.triage.classOperational,
    founder: t.triage.classFounder,
    outreach: t.triage.classOutreach,
  };

  const swrKey = `triage-report-${period}-${actionFilter}`;
  const { data, isLoading, error, mutate } = useSWR(
    swrKey,
    () => api.getTriageReport(period, actionFilter || undefined),
    { revalidateOnFocus: false }
  );

  const total = data?.total ?? 0;
  const byAction = data?.by_action ?? {};
  const byClass = data?.by_classification ?? {};
  const bySender = data?.by_sender ?? [];
  const rows = data?.rows ?? [];

  const trashed = (byAction['trash'] ?? 0) + (byAction['trash_after_log'] ?? 0) + (byAction['notify_then_trash'] ?? 0);
  const inReview = byAction['label_review'] ?? 0;
  const kept = (byAction['keep_inbox'] ?? 0) + (byAction['auto_draft'] ?? 0);

  const maxSender = bySender[0]?.count ?? 1;
  const maxClass = Math.max(...Object.values(byClass), 1);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <TopBar />

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <BarChart3 size={22} className="text-brand-500" />
              {t.triage.title}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {t.triage.subtitle}
            </p>
          </div>
          <button
            onClick={() => mutate()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300"
          >
            <RefreshCw size={14} />
            {t.triage.refresh}
          </button>
        </div>

        {/* Period selector */}
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                period === p
                  ? 'bg-brand-500 text-white'
                  : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}

          {/* Action filter */}
          <div className="flex items-center gap-1.5 ml-auto">
            <Filter size={14} className="text-gray-400" />
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <option value="">{t.triage.allActions}</option>
              {Object.entries(ACTION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300">
            <AlertCircle size={18} />
            {t.triage.loadError}
          </div>
        )}

        {isLoading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && !error && (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard
                label={t.triage.statTotal}
                value={total}
                icon={<BarChart3 size={24} />}
                color="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100"
              />
              <StatCard
                label={t.triage.statTrashed}
                value={trashed}
                icon={<Trash2 size={24} />}
                color="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
              />
              <StatCard
                label={t.triage.statReview}
                value={inReview}
                icon={<Eye size={24} />}
                color="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"
              />
              <StatCard
                label={t.triage.statKept}
                value={kept}
                icon={<Inbox size={24} />}
                color="bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
              />
            </div>

            {total === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-600">
                <TrendingDown size={48} className="mb-4 opacity-40" />
                <p className="text-lg font-medium">{t.triage.noActivity} {PERIOD_LABELS[period].toLowerCase()}</p>
              </div>
            )}

            {total > 0 && (
              <div className="grid sm:grid-cols-2 gap-6">
                {/* By action */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                  <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">{t.triage.byAction}</h2>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(byAction).sort(([, a], [, b]) => b - a).map(([action, count]) => (
                      <div
                        key={action}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${ACTION_COLORS[action] ?? 'bg-gray-100 text-gray-600'}`}
                      >
                        <span>{ACTION_LABELS[action] ?? action}</span>
                        <span className="font-bold">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* By classification */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                  <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">{t.triage.byClassification}</h2>
                  <div className="space-y-2.5">
                    {Object.entries(byClass).sort(([, a], [, b]) => b - a).map(([cls, count]) => (
                      <BarRow
                        key={cls}
                        label={CLASSIFICATION_LABELS[cls] ?? cls}
                        count={count}
                        max={maxClass}
                      />
                    ))}
                  </div>
                </div>

                {/* Top senders */}
                {bySender.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                    <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">{t.triage.topSenders}</h2>
                    <div className="space-y-2.5">
                      {bySender.slice(0, 10).map(({ sender, count }) => (
                        <BarRow key={sender} label={sender} count={count} max={maxSender} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Detail rows */}
                {rows.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 sm:col-span-2">
                    <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">{t.triage.detailTable}</h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
                            <th className="text-left pb-2 font-medium">{t.triage.colSender}</th>
                            <th className="text-left pb-2 font-medium">{t.triage.colClassification}</th>
                            <th className="text-right pb-2 font-medium">{t.triage.colCount}</th>
                            <th className="text-left pb-2 pl-4 font-medium">{t.triage.colActions}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                          {rows.slice(0, 20).map((row, i) => (
                            <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                              <td className="py-2 pr-3 text-gray-700 dark:text-gray-300 max-w-[180px] truncate" title={row.sender}>
                                {row.sender}
                              </td>
                              <td className="py-2 pr-3">
                                <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                                  {CLASSIFICATION_LABELS[row.classification] ?? row.classification}
                                </span>
                              </td>
                              <td className="py-2 text-right font-medium text-gray-900 dark:text-gray-100">{row.count}</td>
                              <td className="py-2 pl-4">
                                <div className="flex flex-wrap gap-1">
                                  {Object.entries(row.actions).map(([a, n]) => (
                                    <span
                                      key={a}
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ACTION_COLORS[a] ?? 'bg-gray-100 text-gray-600'}`}
                                    >
                                      {ACTION_LABELS[a] ?? a} ×{n}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
