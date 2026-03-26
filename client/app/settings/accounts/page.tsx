'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import TopBar from '@/components/TopBar';
import AddEmailAccount from '@/components/AddEmailAccount';
import { api } from '@/lib/api';
import type { Account } from '@/lib/types';

export default function AccountsSettingsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [editingAccount, setEditingAccount] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ display_name: '', label: '', color: '' });
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
      alert(`Fel: ${err.message}`);
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
      alert(`Fel: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteAccount(account: Account) {
    if (!confirm(`Koppla bort ${account.emailAddress}? All cachad data för det här kontot kommer att tas bort.`)) return;
    setActionLoading(true);
    try {
      await api.deleteAccount(account.id);
      await loadAccounts();
    } catch (err: any) {
      alert(`Fel: ${err.message}`);
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
      });
      setEditingAccount(null);
      await loadAccounts();
    } catch (err: any) {
      alert(`Fel: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  }

  const providerLabel = (provider: string) => {
    switch (provider) {
      case 'gmail': return 'Gmail (OAuth)';
      case 'imap': return 'IMAP/SMTP';
      case 'microsoft': return 'Microsoft 365';
      default: return provider;
    }
  };

  const providerIcon = (provider: string) => {
    switch (provider) {
      case 'gmail': return '📧';
      case 'imap': return '⚙️';
      case 'microsoft': return '💼';
      default: return '📬';
    }
  };

  if (showAddAccount) {
    return (
      <AddEmailAccount
        onSuccess={() => {
          setShowAddAccount(false);
          loadAccounts();
        }}
        onCancel={() => setShowAddAccount(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">E-postkonton</h1>
            <p className="text-gray-600 mt-1">Hantera anslutna e-postkonton</p>
          </div>
          <button
            onClick={() => setShowAddAccount(true)}
            className="btn-primary text-sm"
          >
            + Lägg till konto
          </button>
        </div>

        <div className="mb-6">
          <Link href="/settings" className="text-sm text-brand-600 hover:text-brand-700">
            ← Tillbaka till inställningar
          </Link>
        </div>

        {error && (
          <div className="card border-red-200 bg-red-50 text-red-700 mb-6">
            {error}
          </div>
        )}

        <div className="card">
          {loading ? (
            <div className="text-center py-12 text-gray-500">Läser in konton...</div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">Inga e-postkonton är anslutna ännu.</p>
              <button
                onClick={() => setShowAddAccount(true)}
                className="btn-primary"
              >
                Anslut ditt första konto
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="rounded-xl border border-gray-200 overflow-hidden hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="text-2xl">
                        {providerIcon(account.provider)}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">
                          {account.displayName || account.emailAddress}
                        </div>
                        <div className="text-sm text-gray-500">
                          {account.emailAddress}
                          {account.label && <span className="ml-2 text-gray-400">({account.label})</span>}
                        </div>
                        <div className="text-xs text-gray-400 mt-1 flex items-center gap-2 flex-wrap">
                          <span>{providerLabel(account.provider)}</span>
                          {account.isDefault && (
                            <span className="px-2 py-0.5 bg-brand-100 text-brand-700 rounded-full text-xs font-medium">
                              Standard
                            </span>
                          )}
                          {!account.isActive && (
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                              Inaktiv
                            </span>
                          )}
                          {account.syncError && (
                            <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                              Synkfel
                            </span>
                          )}
                          {account.lastSyncAt && (
                            <span className="text-gray-400">
                              Senast synkad: {new Date(account.lastSyncAt).toLocaleDateString('sv-SE')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => startEdit(account)}
                        className="text-xs px-3 py-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        Redigera
                      </button>
                      {!account.isDefault && (
                        <button
                          onClick={() => handleSetDefault(account.id)}
                          disabled={actionLoading}
                          className="btn-secondary text-xs"
                        >
                          Sätt som standard
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
                        {account.isActive ? 'Inaktivera' : 'Aktivera'}
                      </button>
                      <button
                        onClick={() => handleDeleteAccount(account)}
                        disabled={actionLoading}
                        className="text-xs px-3 py-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        Ta bort
                      </button>
                    </div>
                  </div>

                  {/* Inline edit panel */}
                  {editingAccount === account.id && (
                    <div className="px-4 pb-4 pt-2 border-t border-gray-100 bg-gray-50">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Visningsnamn
                          </label>
                          <input
                            type="text"
                            value={editForm.display_name}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, display_name: e.target.value }))
                            }
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                            placeholder="Valfritt"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Etikett
                          </label>
                          <input
                            type="text"
                            value={editForm.label}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, label: e.target.value }))
                            }
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                            placeholder="t.ex. Arbete"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Färg
                          </label>
                          <input
                            type="color"
                            value={editForm.color}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, color: e.target.value }))
                            }
                            className="w-full h-[34px] rounded-lg border border-gray-200 cursor-pointer"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveEdit}
                          disabled={actionLoading}
                          className="btn-primary text-xs"
                        >
                          Spara
                        </button>
                        <button
                          onClick={() => setEditingAccount(null)}
                          className="btn-secondary text-xs"
                        >
                          Avbryt
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 text-sm text-gray-500">
          <p>
            💡 <strong>Tips:</strong> Du kan ansluta flera e-postkonton och välja vilket som är standard.
            Varje konto kan ha sina egna etiketter och inställningar.
          </p>
        </div>
      </main>
    </div>
  );
}
