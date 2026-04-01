'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import TopBar from '@/components/TopBar';
import ConfirmDialog from '@/components/ConfirmDialog';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { toast } from 'sonner';
import {
  Brain, PenLine, Tag, Users, Trash2, RefreshCw,
  ChevronLeft, CheckCircle, AlertCircle, Zap, Lightbulb, Wand2, Loader2
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line
} from 'recharts';

export default function BrainCorePage() {
  const { t } = useI18n();
  const [writingModes, setWritingModes] = useState<any[]>([]);
  const [voiceAttributes, setVoiceAttributes] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [cleanMsg, setCleanMsg] = useState<string | null>(null);
  const [cleanupConfirmOpen, setCleanupConfirmOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'modes' | 'rules' | 'contacts' | 'learning' | 'contactIntel'>('modes');

  // Learning insights
  const [insights, setInsights] = useState<any | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);

  // Voice test
  const [voiceTestMode, setVoiceTestMode] = useState('');
  const [voiceTestInput, setVoiceTestInput] = useState('');
  const [voiceTestResult, setVoiceTestResult] = useState<string | null>(null);
  const [voiceTesting, setVoiceTesting] = useState(false);

  useEffect(() => {
    Promise.all([
      api.getWritingProfile(),
      api.getClassificationRules(),
      api.getContacts(),
    ])
      .then(([profileRes, rulesRes, contactsRes]) => {
        setWritingModes(profileRes.profile?.modes ?? []);
        setVoiceAttributes(profileRes.profile?.attributes ?? []);
        setRules(rulesRes.rules ?? []);
        setContacts(contactsRes.contacts ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function executeCleanup() {
    setCleanupConfirmOpen(false);
    setCleaning(true);
    setCleanMsg(null);
    try {
      const result = await api.chatAsk('rensa test-data från learning events, behåll bara riktiga events');
      setCleanMsg(result.message);
    } catch (err: any) {
      setCleanMsg(`Fel: ${err.message}`);
    } finally {
      setCleaning(false);
    }
  }

  function handleCleanup() {
    setCleanupConfirmOpen(true);
  }

  useEffect(() => {
    if (activeTab === 'learning' || activeTab === 'contactIntel') {
      if (!insights) {
        setInsightsLoading(true);
        api.getLearningInsights()
          .then((d) => setInsights(d))
          .catch(() => {})
          .finally(() => setInsightsLoading(false));
      }
    }
  }, [activeTab, insights]);

  async function handleVoiceTest() {
    if (!voiceTestMode || !voiceTestInput.trim()) return;
    setVoiceTesting(true);
    setVoiceTestResult(null);
    try {
      const result = await api.testVoiceMode(voiceTestMode, voiceTestInput);
      setVoiceTestResult(result.preview);
    } catch (err: any) {
      toast.error(`Fel: ${err.message}`);
    } finally {
      setVoiceTesting(false);
    }
  }

  const TABS = [
    { key: 'modes' as const, label: t.brainInsights?.tabModes ?? 'Skrivstilar', icon: <PenLine size={14} />, count: writingModes.length },
    { key: 'rules' as const, label: 'Regler', icon: <Tag size={14} />, count: rules.length },
    { key: 'contacts' as const, label: t.brainInsights?.tabContacts ?? 'Kontakter', icon: <Users size={14} />, count: contacts.length },
    { key: 'learning' as const, label: t.brainInsights?.tabLearning ?? 'Inlärning', icon: <Lightbulb size={14} />, count: 0 },
    { key: 'contactIntel' as const, label: 'KI', icon: <Brain size={14} />, count: 0 },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20 sm:pb-0">
      <TopBar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/settings"
            className="p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ChevronLeft size={18} />
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center">
              <Brain size={18} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Brain Core</h1>
              <p className="text-xs text-gray-400 dark:text-gray-500">Skrivstilar, regler & kontakter</p>
            </div>
          </div>
        </div>

        {/* Stats row */}
        {!loading && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: 'Skrivstilar', value: writingModes.length, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/20' },
              { label: 'Regler', value: rules.length, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
              { label: 'Kontakter', value: contacts.length, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
            ].map((stat) => (
              <div key={stat.label} className={`${stat.bg} rounded-2xl p-4 text-center`}>
                <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                  activeTab === tab.key
                    ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* SKRIVSTILAR */}
            {activeTab === 'modes' && (
              <div className="space-y-3">
                {writingModes.length === 0 ? (
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 p-8 text-center">
                    <PenLine size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                    <p className="text-gray-500 dark:text-gray-400 text-sm">Inga skrivstilar seedade ännu</p>
                    <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">Kör <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">npm run seed:brain-core</code> i Render Shell</p>
                  </div>
                ) : (
                  writingModes.map((mode: any) => (
                    <div key={mode.id ?? mode.name} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <div className="font-semibold text-gray-900 dark:text-gray-100">{mode.name}</div>
                          {mode.description && (
                            <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{mode.description}</div>
                          )}
                        </div>
                        {mode.isDefault && (
                          <span className="shrink-0 text-xs px-2 py-0.5 bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-800 rounded-full font-medium">
                            Standard
                          </span>
                        )}
                      </div>
                      {mode.examples && mode.examples.length > 0 && (
                        <div className="mt-3">
                          <div className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Exempel</div>
                          <div className="space-y-1.5">
                            {mode.examples.slice(0, 2).map((ex: string, i: number) => (
                              <div key={i} className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2 border border-gray-100 dark:border-gray-700 italic">
                                "{ex}"
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}

                {/* Voice attributes */}
                {voiceAttributes.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Röstattribut</h3>
                    <div className="flex flex-wrap gap-2">
                      {voiceAttributes.map((attr: any) => (
                        <span
                          key={attr.id ?? attr.attribute}
                          className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-full text-xs font-medium"
                        >
                          {attr.attribute}
                          {attr.strength != null && (
                            <span className="ml-1 text-indigo-400">({Math.round(attr.strength * 10)}/10)</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* REGLER */}
            {activeTab === 'rules' && (
              <div className="space-y-3">
                {rules.length === 0 ? (
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 p-8 text-center">
                    <Tag size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                    <p className="text-gray-500 dark:text-gray-400 text-sm">Inga klassificeringsregler skapade</p>
                  </div>
                ) : (
                  rules.map((rule: any) => (
                    <div key={rule.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${rule.isActive !== false ? 'bg-emerald-400' : 'bg-gray-300 dark:bg-gray-600'}`} />
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{rule.name || rule.categoryKey}</div>
                            {rule.senderPatterns?.length > 0 && (
                              <div className="text-xs text-gray-400 dark:text-gray-500 truncate">
                                Avsändare: {rule.senderPatterns.slice(0, 2).join(', ')}
                                {rule.senderPatterns.length > 2 && ` +${rule.senderPatterns.length - 2}`}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                            rule.priority === 'high'
                              ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800'
                              : rule.priority === 'medium'
                              ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                              : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-600'
                          }`}>
                            {rule.priority || 'low'}
                          </span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            {rule.timesMatched ?? 0}× träff
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* KONTAKTER */}
            {activeTab === 'contacts' && (
              <div className="space-y-3">
                {contacts.length === 0 ? (
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 p-8 text-center">
                    <Users size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                    <p className="text-gray-500 dark:text-gray-400 text-sm">Inga kontakter inlärda ännu</p>
                    <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">Synca mail i inkorgen för att börja lära kontakter</p>
                  </div>
                ) : (
                  contacts
                    .sort((a: any, b: any) => (b.totalEmails ?? 0) - (a.totalEmails ?? 0))
                    .map((contact: any) => {
                      const initials = (contact.emailAddress ?? 'U').slice(0, 2).toUpperCase();
                      const colors = ['bg-violet-400', 'bg-blue-400', 'bg-emerald-400', 'bg-amber-400', 'bg-rose-400'];
                      let hash = 0;
                      for (const c of (contact.emailAddress ?? '')) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
                      const color = colors[hash % colors.length];
                      return (
                        <div key={contact.id ?? contact.emailAddress} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 ${color} rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0`}>
                              {initials}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                                {contact.displayName || contact.emailAddress}
                              </div>
                              {contact.displayName && (
                                <div className="text-xs text-gray-400 dark:text-gray-500 truncate">{contact.emailAddress}</div>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">{contact.totalEmails ?? 0}</div>
                              <div className="text-xs text-gray-400 dark:text-gray-500">mejl</div>
                            </div>
                          </div>
                          {(contact.relationship || contact.language || contact.notes) && (
                            <div className="mt-2.5 pt-2.5 border-t border-gray-100 dark:border-gray-700 flex items-center gap-2 flex-wrap">
                              {contact.relationship && (
                                <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full">
                                  {contact.relationship}
                                </span>
                              )}
                              {contact.language && (
                                <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full">
                                  {contact.language.toUpperCase()}
                                </span>
                              )}
                              {contact.notes && (
                                <span className="text-xs text-gray-400 dark:text-gray-500 truncate flex-1">{contact.notes}</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                )}
              </div>
            )}
          </>
        )}

        {/* Learning Insights tab */}
        {!loading && activeTab === 'learning' && (
          <>
            {insightsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={20} className="animate-spin text-violet-500" />
              </div>
            ) : insights ? (
              <div className="space-y-5">
                {/* Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
                    <div className="text-2xl font-bold text-violet-600 dark:text-violet-400">{insights.totalEvents}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t.brainInsights?.totalEvents ?? 'Totalt antal händelser'}</div>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{insights.byType?.length ?? 0}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Typer</div>
                  </div>
                </div>

                {/* Weekly trend */}
                {insights.weeklyTrend && insights.weeklyTrend.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">{t.brainInsights?.weeklyTrend ?? 'Veckoutveckling'}</h3>
                    <ResponsiveContainer width="100%" height={120}>
                      <LineChart data={insights.weeklyTrend}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9CA3AF' }} tickFormatter={(v: string) => v.slice(5)} />
                        <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                        <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: 8, fontSize: 11 }} />
                        <Line type="monotone" dataKey="count" stroke="#8B5CF6" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* By type */}
                {insights.byType && insights.byType.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">{t.brainInsights?.byType ?? 'Per typ'}</h3>
                    <ResponsiveContainer width="100%" height={150}>
                      <BarChart data={insights.byType.slice(0, 8)} layout="vertical">
                        <XAxis type="number" tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                        <YAxis type="category" dataKey="type" width={130} tick={{ fontSize: 10, fill: '#9CA3AF' }} tickFormatter={(v: string) => v.length > 20 ? `${v.slice(0, 19)}…` : v} />
                        <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: 8, fontSize: 11 }} />
                        <Bar dataKey="count" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Recent events */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">{t.brainInsights?.recentEvents ?? 'Senaste händelser'}</h3>
                  {insights.recentEvents?.length === 0 ? (
                    <p className="text-xs text-gray-400">{t.brainInsights?.noEvents ?? 'Inga händelser.'}</p>
                  ) : (
                    <div className="space-y-2">
                      {insights.recentEvents?.slice(0, 10).map((ev: any) => (
                        <div key={ev.id} className="flex items-center gap-2 text-xs">
                          <span className="text-gray-400 dark:text-gray-500 shrink-0">{new Date(ev.createdAt).toLocaleDateString('sv-SE')}</span>
                          <span className="text-violet-600 dark:text-violet-400 font-medium truncate">{ev.eventType}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Voice mode test */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-1.5">
                    <Wand2 size={14} className="text-violet-500" />
                    Testa skrivsätt
                  </h3>
                  <div className="space-y-2">
                    <select
                      value={voiceTestMode}
                      onChange={(e) => setVoiceTestMode(e.target.value)}
                      className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 outline-none"
                    >
                      <option value="">Välj skrivsätt...</option>
                      {writingModes.map((m: any) => (
                        <option key={m.modeKey} value={m.modeKey}>{m.name}</option>
                      ))}
                    </select>
                    <textarea
                      value={voiceTestInput}
                      onChange={(e) => setVoiceTestInput(e.target.value)}
                      placeholder={t.brainInsights?.testInstruction ?? 'Skriv ett testmeddelande...'}
                      rows={3}
                      className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 outline-none resize-none focus:ring-2 focus:ring-violet-400"
                    />
                    <button
                      onClick={handleVoiceTest}
                      disabled={voiceTesting || !voiceTestMode || !voiceTestInput.trim()}
                      className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium disabled:opacity-50 transition-colors"
                    >
                      {voiceTesting ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                      {voiceTesting ? (t.brainInsights?.generating ?? 'Genererar...') : (t.brainInsights?.testVoice ?? 'Testa')}
                    </button>
                    {voiceTestResult && (
                      <div className="mt-2 text-sm text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700 whitespace-pre-wrap">
                        {voiceTestResult}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400 py-8 text-center">Kunde inte ladda inlärningsinsikter.</p>
            )}
          </>
        )}

        {/* Contact Intelligence tab */}
        {!loading && activeTab === 'contactIntel' && (
          <>
            {insightsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={20} className="animate-spin text-violet-500" />
              </div>
            ) : insights?.topContacts ? (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4 flex items-center gap-1.5">
                  <Users size={14} className="text-violet-500" />
                  {t.brainInsights?.contactIntelligence ?? 'Kontaktintelligens'}
                </h3>
                <div className="space-y-3">
                  {insights.topContacts.map((c: any) => (
                    <div key={c.id} className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                      <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-violet-600 dark:text-violet-400">
                          {(c.displayName ?? c.emailAddress).slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                          {c.displayName ?? c.emailAddress}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.emailAddress}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-medium text-violet-600 dark:text-violet-400">{c.totalEmails} mail</div>
                        {c.preferredMode && (
                          <div className="text-xs text-gray-400">{c.preferredMode}</div>
                        )}
                        {c.lastContactAt && (
                          <div className="text-xs text-gray-400">{new Date(c.lastContactAt).toLocaleDateString('sv-SE')}</div>
                        )}
                      </div>
                    </div>
                  ))}
                  {insights.topContacts.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">Inga kontakter ännu.</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400 py-8 text-center">Laddar kontaktdata...</p>
            )}
          </>
        )}

        {/* Cleanup section */}
        <div className="mt-8 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-red-50 dark:bg-red-900/20 rounded-xl flex items-center justify-center shrink-0">
              <Trash2 size={16} className="text-red-500 dark:text-red-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-0.5">Rensa test-data</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                Ta bort test-learning events (prefix "test:"). Riktiga events behålls.
              </p>
              {cleanMsg && (
                <div className="mb-3 text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700">
                  {cleanMsg}
                </div>
              )}
              <button
                onClick={handleCleanup}
                disabled={cleaning}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
              >
                {cleaning ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {cleaning ? 'Rensar…' : 'Rensa test-data'}
              </button>
            </div>
          </div>
        </div>

        {/* Seed instructions */}
        <div className="mt-4 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-4">
          <div className="flex items-start gap-2.5">
            <Zap size={14} className="text-indigo-500 dark:text-indigo-400 mt-0.5 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-1">Brain Core inte seedat?</div>
              <div className="text-xs text-indigo-600 dark:text-indigo-400">
                Kör <code className="bg-indigo-100 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded font-mono">npm run seed:brain-core</code> en gång i Render Shell efter deploy för att ladda skrivstilar och röstattribut.
              </div>
            </div>
          </div>
        </div>
      </main>

      <ConfirmDialog
        open={cleanupConfirmOpen}
        title="Rensa test-data?"
        description="Rensar test-data från Brain Core learning events. Riktiga events behålls."
        confirmLabel="Rensa"
        cancelLabel="Avbryt"
        variant="warning"
        onConfirm={executeCleanup}
        onCancel={() => setCleanupConfirmOpen(false)}
      />
    </div>
  );
}
