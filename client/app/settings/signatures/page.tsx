'use client';

import { useState, useEffect } from 'react';
import TopBar from '@/components/TopBar';
import RichTextEditor from '@/components/RichTextEditor';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { PenLine, Check, Copy } from 'lucide-react';
import { sanitizeHtml } from '@/lib/sanitize-html';
import type { Account } from '@/lib/types';

interface SignatureData {
  id: string;
  emailAddress: string;
  signature: string | null;
  signatureHtml: string | null;
  useSignatureOnNew: boolean;
  useSignatureOnReply: boolean;
}

export default function SignaturesSettingsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [signatures, setSignatures] = useState<Record<string, SignatureData>>({});
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [htmlContent, setHtmlContent] = useState('');
  const [useOnNew, setUseOnNew] = useState(true);
  const [useOnReply, setUseOnReply] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    if (selectedAccountId) {
      loadSignature(selectedAccountId);
    }
  }, [selectedAccountId]);

  async function loadAccounts() {
    try {
      const res = await api.getAccounts();
      setAccounts(res.accounts);
      if (res.accounts.length > 0) {
        setSelectedAccountId(res.accounts[0].id);
      }
    } catch {
      toast.error('Kunde inte ladda konton');
    } finally {
      setLoading(false);
    }
  }

  async function loadSignature(accountId: string) {
    try {
      const res = await api.getSignature(accountId);
      setSignatures((prev) => ({ ...prev, [accountId]: res.signature }));
      setHtmlContent(res.signature.signatureHtml ?? '');
      setUseOnNew(res.signature.useSignatureOnNew);
      setUseOnReply(res.signature.useSignatureOnReply);
    } catch {
      setHtmlContent('');
      setUseOnNew(true);
      setUseOnReply(true);
    }
  }

  async function handleSave() {
    if (!selectedAccountId) return;
    setSaving(true);
    try {
      // Extract plain text from HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = htmlContent;
      const plainText = tempDiv.innerText;

      await api.saveSignature(selectedAccountId, {
        text: plainText,
        html: htmlContent,
        useOnNew,
        useOnReply,
      });
      toast.success('Signatur sparad');
      await loadSignature(selectedAccountId);
    } catch {
      toast.error('Kunde inte spara signatur');
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyFrom(sourceAccountId: string) {
    const source = signatures[sourceAccountId];
    if (!source) {
      // Load it first
      try {
        const res = await api.getSignature(sourceAccountId);
        setHtmlContent(res.signature.signatureHtml ?? '');
        toast.success('Signatur kopierad');
      } catch {
        toast.error('Kunde inte kopiera signatur');
      }
    } else {
      setHtmlContent(source.signatureHtml ?? '');
      toast.success('Signatur kopierad');
    }
  }

  const currentSig = selectedAccountId ? signatures[selectedAccountId] : null;
  const hasSignature = !!(currentSig?.signatureHtml || currentSig?.signature);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <TopBar />
        <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Laddar...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <TopBar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <PenLine size={24} className="text-violet-600 dark:text-violet-400" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Signaturer</h1>
        </div>

        {accounts.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-400 text-sm">
            Inga kopplade konton. Lägg till ett konto i Inställningar → Konton.
          </div>
        ) : (
          <>
            {/* Account selector */}
            <div className="flex gap-2 mb-5 flex-wrap">
              {accounts.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => setSelectedAccountId(acc.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    selectedAccountId === acc.id
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {acc.emailAddress}
                  {signatures[acc.id]?.signatureHtml && (
                    <span className="flex items-center gap-0.5 text-xs">
                      <Check size={11} className="text-green-500" />
                    </span>
                  )}
                </button>
              ))}
            </div>

            {selectedAccountId && (
              <div className="space-y-4">
                {/* Signature status */}
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Signatur: {hasSignature
                    ? <span className="text-green-600 dark:text-green-400 font-medium">Konfigurerad ✓</span>
                    : <span className="text-gray-400">Ingen</span>
                  }
                </div>

                {/* Copy from another account */}
                {accounts.filter((a) => a.id !== selectedAccountId).length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Kopiera från:</span>
                    {accounts
                      .filter((a) => a.id !== selectedAccountId)
                      .map((acc) => (
                        <button
                          key={acc.id}
                          onClick={() => handleCopyFrom(acc.id)}
                          className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                        >
                          <Copy size={11} />
                          {acc.emailAddress}
                        </button>
                      ))}
                  </div>
                )}

                {/* Rich text editor */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Signaturinnehåll</h3>
                  </div>
                  <div className="p-4">
                    <RichTextEditor
                      value={htmlContent}
                      onChange={setHtmlContent}
                      placeholder="Skriv din signatur här..."
                    />
                  </div>
                </div>

                {/* Preview */}
                {htmlContent && (
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                    <p className="text-xs text-gray-400 mb-2">Förhandsvisning:</p>
                    <div className="text-sm text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-600 pt-2 mt-2">
                      <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(htmlContent) }} className="signature-preview" />
                    </div>
                  </div>
                )}

                {/* Toggle options */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useOnNew}
                      onChange={(e) => setUseOnNew(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-400"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Använd på nya mail</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useOnReply}
                      onChange={(e) => setUseOnReply(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-400"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Använd vid svar</span>
                  </label>
                </div>

                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Sparar...' : 'Spara signatur'}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
