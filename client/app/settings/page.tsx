'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Brain, Settings2, ChevronRight, Activity, Search, LogOut, Download, BarChart3, FileText } from 'lucide-react';
import TopBar from '@/components/TopBar';
import ConfirmDialog from '@/components/ConfirmDialog';
import { api } from '@/lib/api';
import { useI18n, LOCALES, type Locale } from '@/lib/i18n';
import { useTheme, type Theme } from '@/components/ThemeProvider';
import type { User, Account } from '@/lib/types';

const FLAG_MAP: Record<Locale, string> = {
  sv: '🇸🇪',
  en: '🇬🇧',
  ru: '🇷🇺',
  es: '🇪🇸',
};

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingAccount, setEditingAccount] = useState<string | null>(null);
  const [disconnectAccount, setDisconnectAccount] = useState<Account | null>(null);
  const [editForm, setEditForm] = useState({ display_name: '', label: '', color: '' });
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { t, locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();

  // Quiet hours + digest settings
  const [quietStart, setQuietStart] = useState(22);
  const [quietEnd, setQuietEnd] = useState(7);
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [digestTime, setDigestTime] = useState(8);
  const [undoSendDelay, setUndoSendDelay] = useState(10);
  const [savingNotif, setSavingNotif] = useState(false);
  const [notifSaved, setNotifSaved] = useState(false);

  useEffect(() => {
    loadAll();
    api.getUserSettings().then((r) => {
      if (r.settings) {
        setQuietStart(r.settings.quietHoursStart ?? 22);
        setQuietEnd(r.settings.quietHoursEnd ?? 7);
        setDigestEnabled(r.settings.digestEnabled ?? false);
        setDigestTime(r.settings.digestTime ?? 8);
        setUndoSendDelay(r.settings.undoSendDelay ?? 10);
      }
    }).catch(() => {});
  }, []);

  async function loadAll() {
    try {
      const [profileRes, accountsRes] = await Promise.all([
        api.getProfile(),
        api.getAccounts(),
      ]);
      setUser(profileRes.user);
      setAccounts(accountsRes.accounts);
      setError(null);
    } catch (err: any) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to load settings:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSetDefault(accountId: string) {
    setActionError(null);
    try {
      await api.setDefaultAccount(accountId);
      await loadAll();
    } catch (err: any) {
      setActionError(`Failed: ${err.message}`);
    }
  }

  async function handleToggleActive(account: Account) {
    setActionError(null);
    try {
      await api.updateAccount(account.id, { is_active: !account.isActive });
      await loadAll();
    } catch (err: any) {
      setActionError(`Failed: ${err.message}`);
    }
  }

  function handleDeleteAccount(account: Account) {
    setDisconnectAccount(account);
  }

  async function executeDisconnect() {
    if (!disconnectAccount) return;
    const account = disconnectAccount;
    setDisconnectAccount(null);
    setActionError(null);
    try {
      await api.deleteAccount(account.id);
      await loadAll();
    } catch (err: any) {
      setActionError(`Misslyckades: ${err.message}`);
    }
  }

  async function saveNotifSettings() {
    setSavingNotif(true);
    try {
      await api.updateUserSettings({ quietHoursStart: quietStart, quietHoursEnd: quietEnd, digestEnabled, digestTime, undoSendDelay });
      setNotifSaved(true);
      setTimeout(() => setNotifSaved(false), 2500);
    } catch (err: any) {
      setActionError(`Misslyckades: ${err.message}`);
    } finally {
      setSavingNotif(false);
    }
  }

  function startEdit(account: Account) {
    setEditingAccount(account.id);
    setEditForm({
      display_name: account.displayName || '',
      label: account.label || '',
      color: account.color || '#6366F1',
    });
  }

  async function handleSaveEdit() {
    if (!editingAccount) return;
    setActionError(null);
    try {
      await api.updateAccount(editingAccount, {
        display_name: editForm.display_name || undefined,
        label: editForm.label || undefined,
        color: editForm.color || undefined,
      });
      setEditingAccount(null);
      await loadAll();
    } catch (err: any) {
      setActionError(`Failed: ${err.message}`);
    }
  }

  async function handleLogout() {
    api.clearToken();
    window.location.href = '/';
  }

  const providerLabel = (provider: string) => {
    switch (provider) {
      case 'gmail': return 'Gmail (OAuth)';
      case 'imap': return 'IMAP/SMTP';
      case 'microsoft': return 'Microsoft 365';
      default: return provider;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <TopBar />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">{t.settings.title}</h1>

        {actionError && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300">
            <span className="flex-1">{actionError}</span>
            <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-600 shrink-0">✕</button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-500">{t.common.loading}</div>
        ) : user ? (
          <div className="space-y-6">
            {/* Profile */}
            <div className="card">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">{t.settings.profile}</h2>
              <div className="space-y-2 text-sm">
                <div><span className="text-gray-500">{t.settings.name}:</span> {user.name || t.settings.notSet}</div>
                <div><span className="text-gray-500">{t.settings.email}:</span> {user.email}</div>
              </div>
            </div>

            {/* Appearance */}
            <div className="card">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">{t.settings.appearance}</h2>
              <div className="flex gap-2">
                {([
                  { value: 'light' as Theme, label: t.settings.themeLight, icon: '☀️' },
                  { value: 'dark' as Theme, label: t.settings.themeDark, icon: '🌙' },
                  { value: 'system' as Theme, label: t.settings.themeSystem, icon: '💻' },
                ]).map(({ value, label, icon }) => (
                  <button
                    key={value}
                    onClick={() => setTheme(value)}
                    className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                      theme === value
                        ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 ring-2 ring-violet-500/20'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span className="text-lg">{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Language Selection */}
            <div className="card">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">{t.settings.language}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {LOCALES.map((loc) => (
                  <button
                    key={loc}
                    onClick={() => setLocale(loc)}
                    className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border-2 transition-all ${
                      locale === loc
                        ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 shadow-sm'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span className="text-xl">{FLAG_MAP[loc]}</span>
                    <span className="text-sm font-medium">{t.languages[loc]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Connected Accounts */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-gray-900 dark:text-gray-100">{t.settings.connectedAccounts}</h2>
                <Link href="/settings/accounts" className="text-xs text-brand-600 hover:text-brand-700 font-medium">
                  {t.settings.manageAll}
                </Link>
              </div>

              <div className="space-y-3">
                {accounts.map((account) => (
                  <div key={account.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: account.color || (account.provider === 'gmail' ? '#EA4335' : '#6366F1') }}
                        />
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {account.displayName || account.emailAddress}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {account.emailAddress}
                            {account.label && <span className="ml-1.5 text-gray-400">({account.label})</span>}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {providerLabel(account.provider)}
                            {account.isDefault && (
                              <span className="ml-1.5 text-brand-600 dark:text-brand-400 font-medium">{t.settings.default}</span>
                            )}
                            {!account.isActive && (
                              <span className="ml-1.5 text-red-500 font-medium">{t.settings.disabled}</span>
                            )}
                            {account.syncError && (
                              <span className="ml-1.5 text-orange-500">{t.settings.syncError}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => startEdit(account)}
                          className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                          {t.settings.edit}
                        </button>
                        {!account.isDefault && (
                          <button
                            onClick={() => handleSetDefault(account.id)}
                            className="btn-secondary text-xs"
                          >
                            {t.settings.setDefault}
                          </button>
                        )}
                        <button
                          onClick={() => handleToggleActive(account)}
                          className={`text-xs ${account.isActive ? 'text-orange-500 hover:text-orange-700' : 'text-emerald-500 hover:text-emerald-700'}`}
                        >
                          {account.isActive ? t.settings.disable : t.settings.enable}
                        </button>
                        <button
                          onClick={() => handleDeleteAccount(account)}
                          className="text-xs text-red-400 hover:text-red-600"
                        >
                          {t.settings.remove}
                        </button>
                      </div>
                    </div>

                    {/* Inline edit panel */}
                    {editingAccount === account.id && (
                      <div className="px-4 pb-4 pt-2 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                        <div className="grid grid-cols-3 gap-3 mb-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{t.settings.displayName}</label>
                            <input
                              type="text"
                              value={editForm.display_name}
                              onChange={(e) => setEditForm((f) => ({ ...f, display_name: e.target.value }))}
                              className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                              placeholder={t.settings.optional}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{t.settings.label}</label>
                            <input
                              type="text"
                              value={editForm.label}
                              onChange={(e) => setEditForm((f) => ({ ...f, label: e.target.value }))}
                              className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                              placeholder={t.settings.egWork}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{t.settings.color}</label>
                            <input
                              type="color"
                              value={editForm.color}
                              onChange={(e) => setEditForm((f) => ({ ...f, color: e.target.value }))}
                              className="w-full h-[34px] rounded-lg border border-gray-200 dark:border-gray-600 cursor-pointer"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={handleSaveEdit} className="btn-primary text-xs">
                            {t.settings.save}
                          </button>
                          <button onClick={() => setEditingAccount(null)} className="btn-secondary text-xs">
                            {t.settings.cancel}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {accounts.length === 0 && (
                  <div className="text-center py-6 text-sm text-gray-500">
                    {t.settings.noAccounts}
                  </div>
                )}
              </div>
            </div>

            {/* Quick links */}
            <div className="card">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">{t.settings.advanced || 'Avancerat'}</h2>
              <div className="space-y-1">
                <Link
                  href="/settings/accounts"
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors group"
                >
                  <div className="flex items-center gap-2.5">
                    <Settings2 size={15} className="text-gray-400 group-hover:text-brand-500 transition-colors" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">E-postkonton</span>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500" />
                </Link>
                <Link
                  href="/settings/brain-core"
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors group"
                >
                  <div className="flex items-center gap-2.5">
                    <Brain size={15} className="text-gray-400 group-hover:text-brand-500 transition-colors" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Brain Core — Skrivprofil & AI</span>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500" />
                </Link>
                <Link
                  href="/analytics"
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors group"
                >
                  <div className="flex items-center gap-2.5">
                    <BarChart3 size={15} className="text-gray-400 group-hover:text-brand-500 transition-colors" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Statistik & Analys</span>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500" />
                </Link>
                <Link
                  href="/settings/templates"
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors group"
                >
                  <div className="flex items-center gap-2.5">
                    <FileText size={15} className="text-gray-400 group-hover:text-brand-500 transition-colors" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Mailmallar</span>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500" />
                </Link>
                <Link
                  href="/activity"
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors group"
                >
                  <div className="flex items-center gap-2.5">
                    <Activity size={15} className="text-gray-400 group-hover:text-brand-500 transition-colors" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Aktivitetslogg</span>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500" />
                </Link>
                <Link
                  href="/search"
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors group"
                >
                  <div className="flex items-center gap-2.5">
                    <Search size={15} className="text-gray-400 group-hover:text-brand-500 transition-colors" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Sök mail</span>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500" />
                </Link>
              </div>
            </div>

            {/* Notifications — quiet hours + digest */}
            <div className="card space-y-4">
              <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">{t.settings.notifications}</h2>

              {/* Quiet hours */}
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1.5">{t.settings.quietHours}</label>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">{t.settings.quietHoursFrom}</span>
                  <select
                    value={quietStart}
                    onChange={(e) => setQuietStart(Number(e.target.value))}
                    className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 outline-none"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                    ))}
                  </select>
                  <span className="text-sm text-gray-500">{t.settings.quietHoursTo}</span>
                  <select
                    value={quietEnd}
                    onChange={(e) => setQuietEnd(Number(e.target.value))}
                    className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 outline-none"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Digest */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={digestEnabled}
                    onChange={(e) => setDigestEnabled(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-brand-500 focus:ring-brand-500"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t.settings.digestEnabled}</span>
                </label>
                {digestEnabled && (
                  <div className="flex items-center gap-2 mt-2 ml-6">
                    <span className="text-sm text-gray-500">{t.settings.digestHint}</span>
                    <select
                      value={digestTime}
                      onChange={(e) => setDigestTime(Number(e.target.value))}
                      className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 outline-none"
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Undo send delay */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Ångra-fönster vid utskick: {undoSendDelay}s
                  <span className="text-xs text-gray-400 ml-2">(0 = skicka direkt)</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={30}
                  value={undoSendDelay}
                  onChange={(e) => setUndoSendDelay(Number(e.target.value))}
                  className="w-full accent-brand-500"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>0s</span><span>30s</span>
                </div>
              </div>

              <button
                onClick={saveNotifSettings}
                disabled={savingNotif}
                className="btn-primary text-sm"
              >
                {notifSaved ? t.settings.saved : savingNotif ? '...' : t.settings.save}
              </button>
            </div>

            {/* Data & Backup */}
            <div className="card space-y-3">
              <div>
                <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-1">{t.settings.dataBackup}</h2>
                <p className="text-xs text-gray-400 dark:text-gray-500">{t.settings.exportHint}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => window.open('/api/v1/threads/export?format=csv', '_blank')}
                  className="btn-secondary text-sm flex items-center gap-1.5"
                >
                  <Download size={14} />
                  {t.settings.exportMailCsv}
                </button>
                <button
                  onClick={() => window.open('/api/v1/threads/export?format=json', '_blank')}
                  className="btn-secondary text-sm flex items-center gap-1.5"
                >
                  <Download size={14} />
                  {t.settings.exportMailJson}
                </button>
                <button
                  onClick={() => window.open('/api/v1/brain-core/export', '_blank')}
                  className="btn-secondary text-sm flex items-center gap-1.5"
                >
                  <Brain size={14} />
                  {t.settings.exportBrainCore}
                </button>
              </div>
            </div>

            {/* Logout */}
            <div className="card">
              <button onClick={handleLogout} className="btn-danger text-sm">
                {t.settings.logOut}
              </button>
            </div>
          </div>
        ) : (
          <div className="card text-center py-8">
            <p className="text-gray-500">{t.settings.notAuthenticated}</p>
          </div>
        )}
      </main>

      <ConfirmDialog
        open={disconnectAccount !== null}
        title={`Koppla bort ${disconnectAccount?.emailAddress ?? ''}?`}
        description="Kontot kopplas bort från CDP Hub. Mailet påverkas inte i Gmail."
        confirmLabel="Koppla bort"
        cancelLabel="Avbryt"
        variant="danger"
        onConfirm={executeDisconnect}
        onCancel={() => setDisconnectAccount(null)}
      />
    </div>
  );
}
