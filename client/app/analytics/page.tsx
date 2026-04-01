'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import TopBar from '@/components/TopBar';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { ChevronLeft, BarChart3, TrendingUp, Users, Bot, Clock } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const CHART_COLORS = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#6366F1'];

const CLASSIFICATION_COLORS: Record<string, string> = {
  lead: '#10B981',
  partner: '#3B82F6',
  personal: '#8B5CF6',
  spam: '#EF4444',
  operational: '#9CA3AF',
  founder: '#6366F1',
  outreach: '#F59E0B',
};

const PRIORITY_COLORS: Record<string, string> = {
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#10B981',
};

function StatCard({ label, value, icon, sub }: { label: string; value: string | number; icon: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-violet-500 dark:text-violet-400">{icon}</span>
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
      {sub && <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

export default function AnalyticsPage() {
  const { t } = useI18n();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    api.getAnalytics(days)
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <TopBar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/settings" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <ChevronLeft size={20} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <BarChart3 size={20} className="text-violet-500" />
              {t.analytics.title}
            </h1>
          </div>
          <div className="flex-1" />
          {/* Period selector */}
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
          >
            <option value={7}>7 {t.analytics.days}</option>
            <option value={30}>30 {t.analytics.days}</option>
            <option value={90}>90 {t.analytics.days}</option>
          </select>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-violet-500 rounded-full animate-spin" />
            <span className="ml-3 text-sm text-gray-500 dark:text-gray-400">{t.analytics.loading}</span>
          </div>
        )}

        {data && !loading && (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
              <StatCard
                label={t.analytics.totalReceived}
                value={data.totals?.received ?? 0}
                icon={<TrendingUp size={16} />}
              />
              <StatCard
                label={t.analytics.totalSent}
                value={data.totals?.sent ?? 0}
                icon={<TrendingUp size={16} />}
              />
              <StatCard
                label={t.analytics.totalAnalyzed}
                value={data.totals?.analyzed ?? 0}
                icon={<Bot size={16} />}
              />
              {data.avgResponseTimeHours !== null && data.avgResponseTimeHours !== undefined && (
                <StatCard
                  label={t.analytics.avgResponseTime}
                  value={`${Math.round(data.avgResponseTimeHours)}h`}
                  icon={<Clock size={16} />}
                />
              )}
              <StatCard
                label={t.analytics.activeFollowUps}
                value={data.activeFollowUps ?? 0}
                icon={<Clock size={16} />}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Mail volume line chart */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">{t.analytics.mailVolume}</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={data.mailPerDay ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: '#9CA3AF' }}
                      tickFormatter={(v) => v.slice(5)}
                    />
                    <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: '#D1D5DB' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="received" name={t.analytics.received} stroke="#8B5CF6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="sent" name={t.analytics.sent} stroke="#10B981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Classification donut */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">{t.analytics.classificationDistribution}</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={data.classificationDistribution ?? []}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                    >
                      {(data.classificationDistribution ?? []).map((entry: any, index: number) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={CLASSIFICATION_COLORS[entry.name] ?? CHART_COLORS[index % CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: 8, fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Priority distribution bar */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">{t.analytics.priorityDistribution}</h2>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.priorityDistribution ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: 8, fontSize: 12 }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {(data.priorityDistribution ?? []).map((entry: any, index: number) => (
                        <Cell key={index} fill={PRIORITY_COLORS[entry.name] ?? CHART_COLORS[index]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Top senders */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">
                  {t.analytics.topSenders}
                </h2>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={(data.topSenders ?? []).slice(0, 8)}
                    layout="vertical"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                    <YAxis
                      type="category"
                      dataKey="email"
                      width={120}
                      tick={{ fontSize: 10, fill: '#9CA3AF' }}
                      tickFormatter={(v) => v.length > 18 ? `${v.slice(0, 17)}…` : v}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: 8, fontSize: 12 }}
                    />
                    <Bar dataKey="count" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Amanda activity */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4 flex items-center gap-2">
                <Bot size={16} className="text-violet-500" />
                {t.analytics.amandaActivity}
              </h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-violet-600 dark:text-violet-400">{data.amanda?.aiClassifications ?? 0}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t.analytics.aiClassifications}</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{data.amanda?.generatedDrafts ?? 0}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t.analytics.generatedDrafts}</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{data.amanda?.learningEvents ?? 0}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t.analytics.learningEvents}</div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
