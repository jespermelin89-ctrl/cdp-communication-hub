'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Mail, Settings, Inbox, Info } from 'lucide-react';
import TopBar from '@/components/TopBar';
import AddEmailAccount from '@/components/AddEmailAccount';
import { BadgeIcons, BadgeContextMenu, BadgeManager } from '@/components/EmailBadges';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { Account } from '@/lib/types';

export default function AccountsSettingsPage() {
  const { t } = useI18n();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [editingAccount, setEditingAccount] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    display_name: '',
    label: '',
    color: '',
    signature: '',
    account_type: 'personal' as 'personal' | 'team' | 'shared',
    ai_handling: 'normal' as 'normal' | 'separate' | 'notify_only',
    team_members: '',
  });
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    try {
      setLoading(true);
      const result = await api.getAccounts();
      setAccounts(result.accounts);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSetDefault(accountId: string) {
    setActionLoading(true);
    try {
      await api.setDefaultAccount(accountId);
      await loadAccounts();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleToggleActive(account: Account) {
    setActionLoading(true);
    try {
      await api.updateAccount(account.id, { is_active: !account.isActive });
      await loadAccounts();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteAccount(account: Account) {
    if (!confirm(t.settings.disconnectConfirm.replace('{email}', account.emailAddress))) return;
    setActionLoading(true);
    try {
      await api.deleteAccount(account.id);
      await loadAccounts();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  function startEdit(account: Account) {
    setEditingAccount(account.id);
    setEditForm({
      display_name: account.displayName || '',
      label: account.label || '',
      color: account.color || '#6366F1',
      signature: account.signature || '',
      account_type: account.accountType || 'personal',
      ai_handling: account.aiHandling || 'normal',
      team_members: (account.teamMembers || []).join(', '),
    });
  }

  async function handleSaveEdit() {
    if (!editingAccount) return;
    setActionLoading(true);
    try {
      await api.updateAccount(editingAccount, {
        display_name: editForm.display_name || undefined,
        label: editForm.label || undefined,
        color: editForm.color || undefined,
        signature: editForm.signature || null,
        account_type: editForm.account_type,
        ai_handling: editForm.ai_handling,
        team_members: editForm.team_members
          ? editForm.team_members.split(',').map((e) => e.trim()).filter(Boolean)
          : [],
      });
      setEditingAccount(null);
      await loadAccounts();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  function handleBadgesChanged(accountId: string, newBadges: string[]) {
    setAccounts((prev) =>
      prev.map((a) => (a.id === accountId ? { ...a, badges: newBadges } : a))
    );
  }

  const providerLabel = (provider: string) => {
    const map: Record<string, string> = {
      gmail: t.accounts.gmail,
      imap: t.accounts.imap,
      microsoft: t.accounts.microsoft,
    };
    return map[provider] || provider;
  };

  const providerIcon = (provider: string) => {
    if (provider === 'gmail') return <Mail size={16} className="text-red-400" />;
    if (provider === 'imap') return <Settings size={16} className="text-gray-400" />;
    return <Inbox size={16} className="text-blue-400" />;
  };

  if (showAddAccount) {
    return (
      <AddEmailAccount
        onSuccess={() => { setShowAddAccount(false); loadAccounts(); }}
        onCancel={() => setShowAddAccount(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <TopBar />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t.accounts.title}</h1>
            <p className="text-sm text-gray-400 mt-0.5">{t.accounts.subtitle}</p>
          </div>
          <button
            onClick={() => setShowAddAccount(true)}
            className="btn-primary text-sm"
          >
            {t.accounts.addAccount}
          </button>
        </div>

        <div className="mb-6">
          <Link href="/settings" className="text-sm text-brand-600 hover:text-brand-700">
            {t.accounts.back}
          </Link>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 px-4 py-3 mb-6 text-sm">
            {error}
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3 text-gray-400">
                <div className="w-7 h-7 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
                <span className="text-sm">{t.accounts.loading}</span>
              </div>
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-16">
              <div className="flex justify-center mb-3"><Inbox size={40} strokeWidth={1.5} className="text-gray-300 dark:text-gray-600" /></div>
              <p className="text-gray-400 text-sm mb-4">{t.accounts.noAccounts}</p>
              <button onClick={() => setShowAddAccount(true)} className="btn-primary text-sm">
                {t.accounts.connectFirst}
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {accounts.map((account) => (
                <BadgeContextMenu
                  key={account.id}
                  accountId={account.id}
                  currentBadges={account.badges || []}
                  onBadgesChanged={(badges) => handleBadgesChanged(account.id, badges)}
                >
                  <div>
                    {/* Account row */}
                    <div className="flex items-center justify-between px-5 py-4">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <span className="text-2xl shrink-0">{providerIcon(account.provider)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-gray-900">
                              {account.displayName || account.emailAddress}
                            </span>
                            <BadgeIcons badges={account.badges || []} size="md" />
                          </div>
                          <div className="text-sm text-gray-500 truncate">
                            {account.emailAddress}
                            {account.label && (
                              <span className="ml-2 text-gray-400">({account.label})</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap mt-1">
                            <span className="text-xs text-gray-400">{providerLabel(account.provider)}</span>
                            {account.isDefault && (
                              <span className="text-xs px-2 py-0.5 bg-brand-100 text-brand-700 rounded-full font-medium">
                                {t.settings.default}
                              </span>
                            )}
                            {!account.isActive && (
                              <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">
                                {t.settings.disabled}
                              </span>
                            )}
                            {account.syncError && (
                              <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full font-medium">
                                {t.settings.syncError}
                              </span>
                            )}
                            {account.lastSyncAt && (
                              <span className="text-xs text-gray-400">
                                {t.accounts.lastSynced}: {new Date(account.lastSyncAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => editingAccount === account.id ? setEditingAccount(null) : startEdit(account)}
                          className="text-xs px-3 py-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          {t.settings.edit}
                        </button>
                        {!account.isDefault && (
                          <button
                            onClick={() => handleSetDefault(account.id)}
                            disabled={actionLoading}
                            className="btn-secondary text-xs"
                          >
                            {t.settings.setDefault}
                          </button>
                        )}
                        <button
                          onClick={() => handleToggleActive(account)}
                          disabled={actionLoading}
                          className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                            account.isActive
                              ? 'text-orange-600 hover:text-orange-700 hover:bg-orange-50'
                              : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                          }`}
                        >
                          {account.isActive ? t.settings.disable : t.settings.enable}
                        </button>
                        <button
                          onClick={() => handleDeleteAccount(account)}
                          disabled={actionLoading}
                          className="text-xs px-3 py-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          {t.settings.remove}
                        </button>
                      </div>
                    </div>

                    {/* Inline edit panel */}
                    {editingAccount === account.id && (
                      <div className="px-5 pb-5 pt-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                          {t.accounts.editTitle}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              {t.settings.displayName}
                            </label>
                            <input
                              type="text"
                              value={editForm.display_name}
                              onChange={(e) => setEditForm((f) => ({ ...f, display_name: e.target.value }))}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                              placeholder={t.settings.optional}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              {t.settings.label}
                            </label>
                            <input
                              type="text"
                              value={editForm.label}
                              onChange={(e) => setEditForm((f) => ({ ...f, label: e.target.value }))}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                              placeholder={t.settings.egWork}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              {t.settings.color}
                            </label>
                            <input
                              type="color"
                              value={editForm.color}
                              onChange={(e) => setEditForm((f) => ({ ...f, color: e.target.value }))}
                              className="w-full h-[34px] rounded-lg border border-gray-200 cursor-pointer"
                            />
                          </div>
                        </div>

                        {/* Signature editor */}
                        <div className="mb-3">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            {t.accounts.signature}
                          </label>
                          <textarea
                            value={editForm.signature}
                            onChange={(e) => setEditForm((f) => ({ ...f, signature: e.target.value }))}
                            rows={3}
                            maxLength={2000}
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none resize-y dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                            placeholder={t.accounts.signaturePlaceholder}
                          />
                          {editForm.signature && (
                            <div className="mt-1 px-2 py-1 bg-gray-50 dark:bg-gray-700 rounded text-xs text-gray-500 border border-gray-100 dark:border-gray-600">
                              <span className="font-medium text-gray-400">Preview: </span>
                              <span className="whitespace-pre-wrap">{editForm.signature}</span>
                            </div>
                          )}
                        </div>

                        {/* Account type + AI handling */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              {t.accounts.accountTypeLabel}
                            </label>
                            <select
                              value={editForm.account_type}
                              onChange={(e) => setEditForm((f) => ({ ...f, account_type: e.target.value as 'personal' | 'team' | 'shared' }))}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                            >
                              <option value="personal">Personlig</option>
                              <option value="team">Team</option>
                              <option value="shared">Delad inkorg</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              {t.accounts.aiHandlingLabel}
                            </label>
                            <select
                              value={editForm.ai_handling}
                              onChange={(e) => setEditForm((f) => ({ ...f, ai_handling: e.target.value as 'normal' | 'separate' | 'notify_only' }))}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                            >
                              <option value="normal">Hantera normalt</option>
                              <option value="separate">Separera team-mejl</option>
                              <option value="notify_only">Notifiera bara</option>
                            </select>
                          </div>
                        </div>

                        {/* Team members — only shown for team/shared */}
                        {(editForm.account_type === 'team' || editForm.account_type === 'shared') && (
                          <div className="mb-3">
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              {t.accounts.teamMembersLabel}
                            </label>
                            <input
                              type="text"
                              value={editForm.team_members}
                              onChange={(e) => setEditForm((f) => ({ ...f, team_members: e.target.value }))}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                              placeholder={t.accounts.teamMembersPlaceholder}
                            />
                          </div>
                        )}

                        <BadgeManager
                          accountId={account.id}
                          currentBadges={account.badges || []}
                          onBadgesChanged={(badges) => handleBadgesChanged(account.id, badges)}
                        />

                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={handleSaveEdit}
                            disabled={actionLoading}
                            className="btn-primary text-xs"
                          >
                            {t.settings.save}
                          </button>
                          <button
                            onClick={() => setEditingAccount(null)}
                            className="btn-secondary text-xs"
                          >
                            {t.settings.cancel}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </BadgeContextMenu>
              ))}
            </div>
          )}
        </div>

        <p className="mt-5 text-xs text-gray-400">
          <Info size={12} className="inline mr-1 text-gray-400" />{t.accounts.tip}
        </p>
      </main>
    </div>
  );
}
