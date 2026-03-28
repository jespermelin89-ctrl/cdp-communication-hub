'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Brain, Pen, Tag, Users, RefreshCw, ChevronRight } from 'lucide-react';
import TopBar from '@/components/TopBar';
import { api } from '@/lib/api';

interface WritingMode {
  id: string;
  modeKey: string;
  description: string | null;
  examples: string[];
  isActive: boolean;
}

interface VoiceAttribute {
  id: string;
  attribute: string;
  value: string;
  strength: number | null;
}

interface ContactProfile {
  id: string;
  emailAddress: string;
  displayName: string | null;
  relationship: string | null;
  language: string | null;
  totalEmails: number;
  lastContactAt: string | null;
}

interface ClassificationRule {
  id: string;
  categoryKey: string;
  description: string | null;
  senderPatterns: string[];
  subjectPatterns: string[];
  isActive: boolean;
}

const RELATIONSHIP_COLORS: Record<string, string> = {
  lead: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  partner: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  client: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  personal: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  spam: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300',
  operational: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100 dark:border-gray-700">
        <Icon size={16} className="text-brand-500 shrink-0" />
        <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="px-5 py-8 text-center text-sm text-gray-400">
      <Brain size={28} strokeWidth={1.5} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
      {text}
    </div>
  );
}

export default function BrainCorePage() {
  const [modes, setModes] = useState<WritingMode[]>([]);
  const [attributes, setAttributes] = useState<VoiceAttribute[]>([]);
  const [contacts, setContacts] = useState<ContactProfile[]>([]);
  const [rules, setRules] = useState<ClassificationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [profileRes, contactsRes, rulesRes] = await Promise.all([
        api.getWritingProfile(),
        api.getContacts(),
        api.getClassificationRules(),
      ]);
      setModes(profileRes.profile?.modes ?? []);
      setAttributes(profileRes.profile?.attributes ?? []);
      setContacts(contactsRes.contacts ?? []);
      setRules(rulesRes.rules ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const notSeeded = !loading && !error && modes.length === 0 && attributes.length === 0 && rules.length === 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <TopBar />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Brain Core</h1>
            <p className="text-sm text-gray-400 mt-0.5">AI:ns skrivprofil, kontakter och klassificeringsregler</p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Uppdatera
          </button>
        </div>
        <div className="mb-6">
          <Link href="/settings" className="text-sm text-brand-600 hover:text-brand-700">
            ← Inställningar
          </Link>
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {notSeeded && (
          <div className="mb-6 px-4 py-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-800 dark:text-amber-300">
            <div className="font-semibold mb-1">Brain Core är inte seedad ännu</div>
            <p className="text-amber-700 dark:text-amber-400">
              Kör följande i Render Shell för att populera skrivprofil och klassificeringsregler:
            </p>
            <code className="block mt-2 px-3 py-2 bg-amber-100 dark:bg-amber-900/40 rounded-lg text-xs font-mono">
              npm run seed:brain-core
            </code>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <div className="w-7 h-7 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
              <span className="text-sm">Laddar Brain Core...</span>
            </div>
          </div>
        ) : (
          <div className="space-y-5">

            {/* Writing modes */}
            <Section icon={Pen} title={`Skrivlägen (${modes.length})`}>
              {modes.length === 0 ? (
                <EmptyState text="Inga skrivlägen konfigurerade" />
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {modes.map((mode) => (
                    <div key={mode.id} className="px-5 py-3.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{mode.modeKey}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${mode.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                          {mode.isActive ? 'Aktiv' : 'Inaktiv'}
                        </span>
                      </div>
                      {mode.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">{mode.description}</p>
                      )}
                      {mode.examples.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {mode.examples.slice(0, 4).map((ex, i) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 rounded-full border border-brand-100 dark:border-brand-900">
                              {ex}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Voice attributes */}
            <Section icon={Brain} title={`Röstattribut (${attributes.length})`}>
              {attributes.length === 0 ? (
                <EmptyState text="Inga röstattribut konfigurerade" />
              ) : (
                <div className="px-5 py-3 flex flex-wrap gap-2">
                  {attributes.map((attr) => (
                    <div key={attr.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{attr.attribute}</span>
                      <span className="text-[10px] text-gray-400">{attr.value}</span>
                      {attr.strength != null && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-full">
                          {Math.round(attr.strength * 100)}%
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Classification rules */}
            <Section icon={Tag} title={`Klassificeringsregler (${rules.length})`}>
              {rules.length === 0 ? (
                <EmptyState text="Inga klassificeringsregler konfigurerade" />
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {rules.map((rule) => (
                    <div key={rule.id} className="px-5 py-3.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{rule.categoryKey}</span>
                        <Link
                          href="/categories"
                          className="flex items-center gap-0.5 text-[10px] text-brand-600 hover:text-brand-700"
                        >
                          Redigera <ChevronRight size={10} />
                        </Link>
                      </div>
                      {rule.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{rule.description}</p>
                      )}
                      {rule.senderPatterns.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {rule.senderPatterns.slice(0, 5).map((p, i) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded font-mono">
                              {p}
                            </span>
                          ))}
                          {rule.senderPatterns.length > 5 && (
                            <span className="text-[10px] text-gray-400">+{rule.senderPatterns.length - 5} till</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Contacts */}
            <Section icon={Users} title={`Kontakter (${contacts.length})`}>
              {contacts.length === 0 ? (
                <EmptyState text="Inga kontakter ännu. Analysera trådar för att bygga upp kontaktprofiler." />
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {contacts.slice(0, 20).map((contact) => (
                    <div key={contact.id} className="flex items-center justify-between px-5 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-[10px] font-bold text-gray-600 dark:text-gray-300 shrink-0">
                          {(contact.displayName || contact.emailAddress).slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                            {contact.displayName || contact.emailAddress}
                          </div>
                          {contact.displayName && (
                            <div className="text-[10px] text-gray-400 truncate">{contact.emailAddress}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {contact.relationship && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${RELATIONSHIP_COLORS[contact.relationship] || 'bg-gray-100 text-gray-600'}`}>
                            {contact.relationship}
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400">{contact.totalEmails} mejl</span>
                      </div>
                    </div>
                  ))}
                  {contacts.length > 20 && (
                    <div className="px-5 py-2.5 text-xs text-gray-400 text-center">
                      + {contacts.length - 20} fler kontakter
                    </div>
                  )}
                </div>
              )}
            </Section>

          </div>
        )}
      </main>
    </div>
  );
}
