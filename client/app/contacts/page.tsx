'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Users, Mail, ChevronDown, ChevronUp, Check, X } from 'lucide-react';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

interface Contact {
  id: string;
  emailAddress: string;
  displayName: string | null;
  relationship: string | null;
  preferredMode: string | null;
  language: string | null;
  notes: string | null;
  totalEmails: number;
  lastContactAt: string | null;
}

interface Thread {
  id: string;
  subject: string | null;
  lastMessageAt: string | null;
  messageCount: number;
  isRead: boolean;
}

export default function ContactsPage() {
  const router = useRouter();
  const { t } = useI18n();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Record<string, Thread[]>>({});
  const [loadingThreads, setLoadingThreads] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Contact>>({});
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  useEffect(() => {
    loadContacts();
  }, [debouncedSearch]);

  async function loadContacts() {
    setLoading(true);
    try {
      const result = await api.getContacts(debouncedSearch || undefined);
      setContacts(result.contacts);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function handleExpand(contact: Contact) {
    if (expandedId === contact.id) {
      setExpandedId(null);
      setEditing(null);
      return;
    }
    setExpandedId(contact.id);
    setEditing(null);

    if (!threads[contact.id]) {
      setLoadingThreads(contact.id);
      try {
        const result = await api.getContactThreads(contact.id);
        setThreads((prev) => ({ ...prev, [contact.id]: result.threads }));
      } catch {
        setThreads((prev) => ({ ...prev, [contact.id]: [] }));
      } finally {
        setLoadingThreads(null);
      }
    }
  }

  function startEdit(contact: Contact) {
    setEditing(contact.id);
    setEditData({
      displayName: contact.displayName ?? '',
      relationship: contact.relationship ?? '',
      preferredMode: contact.preferredMode ?? '',
      language: contact.language ?? '',
      notes: contact.notes ?? '',
    });
  }

  async function saveEdit(contactId: string) {
    setSaving(true);
    try {
      const result = await api.updateContact(contactId, {
        displayName: editData.displayName ?? undefined,
        relationship: editData.relationship ?? undefined,
        preferredMode: editData.preferredMode ?? undefined,
        language: editData.language ?? undefined,
        notes: editData.notes ?? undefined,
      });
      setContacts((prev) => prev.map((c) => (c.id === contactId ? { ...c, ...result.contact } : c)));
      setEditing(null);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return t.contacts.never;
    return new Date(dateStr).toLocaleDateString();
  }

  const RELATIONSHIP_OPTIONS = Object.entries(t.contacts.relationships);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      <TopBar />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Users size={22} className="text-brand-500" />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t.contacts.title}</h1>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.contacts.search}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
          />
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-gray-400 text-sm">
            <div className="w-5 h-5 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
            {t.contacts.loading}
          </div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">{t.contacts.noContacts}</div>
        ) : (
          <div className="space-y-2">
            {contacts.map((contact) => {
              const isExpanded = expandedId === contact.id;
              const isEditing = editing === contact.id;

              return (
                <div
                  key={contact.id}
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden"
                >
                  {/* Row */}
                  <button
                    onClick={() => handleExpand(contact)}
                    className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                  >
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 dark:text-brand-400 font-semibold text-sm shrink-0">
                      {(contact.displayName ?? contact.emailAddress).charAt(0).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                        {contact.displayName ?? contact.emailAddress}
                      </div>
                      {contact.displayName && (
                        <div className="text-xs text-gray-400 truncate">{contact.emailAddress}</div>
                      )}
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="text-xs text-gray-400">
                        {contact.totalEmails} {t.contacts.emails}
                      </div>
                      {contact.relationship && (
                        <div className="text-xs text-brand-600 dark:text-brand-400 capitalize mt-0.5">
                          {(t.contacts.relationships as Record<string, string>)[contact.relationship] ?? contact.relationship}
                        </div>
                      )}
                    </div>

                    {isExpanded ? (
                      <ChevronUp size={16} className="text-gray-400 shrink-0" />
                    ) : (
                      <ChevronDown size={16} className="text-gray-400 shrink-0" />
                    )}
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 dark:border-gray-700 px-5 py-4 space-y-4">
                      {/* Actions */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => router.push(`/compose?to=${encodeURIComponent(contact.emailAddress)}`)}
                          className="flex items-center gap-1.5 text-xs btn-secondary py-1.5 px-3"
                        >
                          <Mail size={12} />
                          {t.contacts.sendMail}
                        </button>
                        {!isEditing && (
                          <button
                            onClick={() => startEdit(contact)}
                            className="text-xs btn-secondary py-1.5 px-3"
                          >
                            {t.contacts.editContact}
                          </button>
                        )}
                      </div>

                      {/* Edit form */}
                      {isEditing ? (
                        <div className="space-y-3">
                          {(
                            [
                              { key: 'displayName', label: t.contacts.displayName, type: 'text' },
                              { key: 'preferredMode', label: t.contacts.preferredMode, type: 'text' },
                              { key: 'language', label: t.contacts.language, type: 'text' },
                            ] as const
                          ).map(({ key, label }) => (
                            <div key={key}>
                              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
                              <input
                                type="text"
                                value={(editData as any)[key] ?? ''}
                                onChange={(e) => setEditData((d) => ({ ...d, [key]: e.target.value }))}
                                className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 outline-none"
                              />
                            </div>
                          ))}

                          <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t.contacts.relationship}</label>
                            <select
                              value={editData.relationship ?? ''}
                              onChange={(e) => setEditData((d) => ({ ...d, relationship: e.target.value }))}
                              className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 outline-none"
                            >
                              <option value="">—</option>
                              {RELATIONSHIP_OPTIONS.map(([val, label]) => (
                                <option key={val} value={val}>{label as string}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t.contacts.notes}</label>
                            <textarea
                              value={editData.notes ?? ''}
                              onChange={(e) => setEditData((d) => ({ ...d, notes: e.target.value }))}
                              rows={3}
                              className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 outline-none resize-none"
                            />
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={() => saveEdit(contact.id)}
                              disabled={saving}
                              className="flex items-center gap-1 btn-primary text-xs py-1.5 px-3"
                            >
                              <Check size={12} />
                              {t.contacts.save}
                            </button>
                            <button
                              onClick={() => setEditing(null)}
                              className="flex items-center gap-1 btn-secondary text-xs py-1.5 px-3"
                            >
                              <X size={12} />
                              {t.contacts.cancel}
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Read-only detail */
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                          <span className="text-gray-400">{t.contacts.lastContact}</span>
                          <span className="text-gray-700 dark:text-gray-300">{formatDate(contact.lastContactAt)}</span>
                          {contact.relationship && (
                            <>
                              <span className="text-gray-400">{t.contacts.relationship}</span>
                              <span className="text-gray-700 dark:text-gray-300 capitalize">
                                {(t.contacts.relationships as Record<string, string>)[contact.relationship] ?? contact.relationship}
                              </span>
                            </>
                          )}
                          {contact.notes && (
                            <>
                              <span className="text-gray-400">{t.contacts.notes}</span>
                              <span className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{contact.notes}</span>
                            </>
                          )}
                        </div>
                      )}

                      {/* Recent threads */}
                      <div>
                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{t.contacts.recentThreads}</div>
                        {loadingThreads === contact.id ? (
                          <div className="text-xs text-gray-400">Laddar...</div>
                        ) : (threads[contact.id] ?? []).length === 0 ? (
                          <div className="text-xs text-gray-400">{t.contacts.noThreads}</div>
                        ) : (
                          <div className="space-y-1">
                            {(threads[contact.id] ?? []).map((thread) => (
                              <button
                                key={thread.id}
                                onClick={() => router.push(`/threads/${thread.id}`)}
                                className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                              >
                                {!thread.isRead && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />
                                )}
                                <span className="flex-1 text-xs text-gray-700 dark:text-gray-300 truncate">
                                  {thread.subject ?? '(Inget ämne)'}
                                </span>
                                {thread.lastMessageAt && (
                                  <span className="text-xs text-gray-400 shrink-0">
                                    {new Date(thread.lastMessageAt).toLocaleDateString()}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
