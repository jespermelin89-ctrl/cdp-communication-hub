'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import TopBar from '@/components/TopBar';
import { api } from '@/lib/api';
import { useI18n, LOCALES, type Locale } from '@/lib/i18n';
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
  const [editForm, setEditForm] = useState({ display_name: '', label: '', color: '' });
  const [error, setError] = useState<string | null>(null);
  const { t, locale, setLocale } = useI18n();

  useEffect(() => {
    loadAll();
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
      console.error('Failed to load settings:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSetDefault(accountId: string) {
    try {
      await api.setDefaultAccount(accountId);
      await loadAll();
    } catch (err: any) {
      alert(`Failed: ${err.message}`);
    }
  }

  async function handleToggleActive(account: Account) {
    try {
      await api.updateAccount(account.id, { is_active: !account.isActive });
      await loadAll();
    } catch (err: any) {
      alert(`Failed: ${err.message}`);
    }
  }

  async function handleDeleteAccount(account: Account) {
    if (!confirm(t.settings.disconnectConfirm.replace('{email}', account.emailAddress))) return;
    try {
      await api.deleteAccount(account.id);
      await loadAll();
    } catch (err: any) {
      alert(`Failed: ${err.message}`);
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
    try {
      await api.updateAccount(editingAccount, {
        display_name: editForm.display_name || undefined,
        label: editForm.label || undefined,
        color: editForm.color || undefined,
      });
      setEditingAccount(null);
      await loadAll();
    } catch (err: any) {
      alert(`Failed: ${err.message}`);
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
                        ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700 hover:bg-gray-50'
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
                <h2 className="font-semibold text-gray-900">{t.settings.connectedAccounts}</h2>
                <Link href="/settings/accounts" className="text-xs text-brand-600 hover:text-brand-700 font-medium">
                  {t.settings.manageAll}
                </Link>
              </div>

              <div className="space-y-3">
                {accounts.map((account) => (
                  <div key={account.id} className="rounded-xl border border-gray-200 overflow-hidden">
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: account.color || (account.provider === 'gmail' ? '#EA4335' : '#6366F1') }}
                        />
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {account.displayName || account.emailAddress}
                          </div>
                          <div className="text-xs text-gray-500">
                            {account.emailAddress}
                            {account.label && <span className="ml-1.5 text-gray-400">({account.label})</span>}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {providerLabel(account.provider)}
                            {account.isDefault && (
                              <span className="ml-1.5 text-brand-600 font-medium">{t.settings.default}</span>
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
                          className="text-xs text-gray-500 hover:text-gray-700"
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
                      <div className="px-4 pb-4 pt-2 border-t border-gray-100 dark:border-gray-700 bg-gray-50">
                        <div className="grid grid-cols-3 gap-3 mb-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">{t.settings.displayName}</label>
                            <input
                              type="text"
                              value={editForm.display_name}
                              onChange={(e) => setEditForm((f) => ({ ...f, display_name: e.target.value }))}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                              placeholder={t.settings.optional}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">{t.settings.label}</label>
                            <input
                              type="text"
                              value={editForm.label}
                              onChange={(e) => setEditForm((f) => ({ ...f, label: e.target.value }))}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                              placeholder={t.settings.egWork}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">{t.settings.color}</label>
                            <input
                              type="color"
                              value={editForm.color}
                              onChange={(e) => setEditForm((f) => ({ ...f, color: e.target.value }))}
                              className="w-full h-[34px] rounded-lg border border-gray-200 cursor-pointer"
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
    </div>
  );
}
