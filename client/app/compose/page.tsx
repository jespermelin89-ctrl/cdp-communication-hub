'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import TopBar from '@/components/TopBar';
import ConfirmDialog from '@/components/ConfirmDialog';
import VoiceButton from '@/components/VoiceButton';
import { Send, Save, Wand2, X, ChevronDown, PenLine, Loader2, CornerDownLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { toast } from 'sonner';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import type { Account } from '@/lib/types';

const isDev = process.env.NODE_ENV === 'development';

export default function ComposePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const replyThreadId = searchParams.get('reply');
  const { t } = useI18n();
  const toInputRef = useRef<HTMLInputElement>(null);

  // ── Reply context ─────────────────────────────────────────────────────────
  const [replySubject, setReplySubject] = useState<string | null>(null);
  const [replyLoading, setReplyLoading] = useState(false);

  // ── Form state ────────────────────────────────────────────────────────────
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [toInput, setToInput] = useState('');
  const [toAddresses, setToAddresses] = useState<string[]>([]);
  const [ccVisible, setCcVisible] = useState(false);
  const [ccInput, setCcInput] = useState('');
  const [ccAddresses, setCcAddresses] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [selectedMode, setSelectedMode] = useState('');

  // ── Contact autocomplete ──────────────────────────────────────────────────
  const [contactQuery, setContactQuery] = useState('');
  const [showContactDropdown, setShowContactDropdown] = useState(false);

  // ── AI assist panel ───────────────────────────────────────────────────────
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);

  // ── Submit state ──────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: accountsData } = useSWR('compose-accounts', () => api.getAccounts(), { revalidateOnFocus: false });
  const accounts: Account[] = accountsData?.accounts ?? [];

  const { data: profileData } = useSWR('compose-writing-profile', () => api.getWritingProfile(), { revalidateOnFocus: false });
  const writingModes: any[] = profileData?.profile?.modes ?? [];

  const { data: contactsData } = useSWR('compose-contacts', () => api.getContacts(), { revalidateOnFocus: false });
  const allContacts: any[] = contactsData?.contacts ?? [];

  // Set default account
  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  // Set default writing mode
  useEffect(() => {
    if (writingModes.length > 0 && !selectedMode) {
      setSelectedMode(writingModes[0].name ?? '');
    }
  }, [writingModes, selectedMode]);

  // ── Reply pre-fill — load thread data when ?reply=<id> ────────────────────
  useEffect(() => {
    if (!replyThreadId) return;
    let cancelled = false;
    setReplyLoading(true);
    api.getThread(replyThreadId)
      .then((res) => {
        if (cancelled) return;
        const thread = res.thread as any;
        // Pre-fill subject with "Re: ..." prefix
        const originalSubject = thread.subject ?? '';
        const reSubject = originalSubject.toLowerCase().startsWith('re:')
          ? originalSubject
          : `Re: ${originalSubject}`;
        setSubject(reSubject);
        setReplySubject(originalSubject);

        // Pre-fill To with external participants (not own accounts)
        const ownEmails = accounts.map((a: Account) => a.emailAddress.toLowerCase());
        const participants: string[] = (thread.participantEmails ?? []).filter(
          (e: string) => !ownEmails.includes(e.toLowerCase())
        );
        // Fall back to latest message sender
        const latestSender: string | undefined = thread.messages?.[thread.messages.length - 1]?.fromAddress;
        const recipients = participants.length > 0
          ? participants.slice(0, 3)
          : latestSender ? [latestSender] : [];
        if (recipients.length > 0) setToAddresses(recipients);

        // Auto-select the account that received the email
        if (thread.account?.id) setSelectedAccountId(thread.account.id);

        // Append quoted original snippet to body
        const snippet = thread.snippet ?? thread.messages?.[thread.messages.length - 1]?.bodyText?.slice(0, 300) ?? '';
        if (snippet) {
          setBody(`\n\n---\n> ${snippet.replace(/\n/g, '\n> ')}`);
        }
      })
      .catch(() => {
        if (!cancelled) toast.error('Kunde inte hämta tråd för svar');
      })
      .finally(() => { if (!cancelled) setReplyLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replyThreadId]);

  // ── Contact filtering ─────────────────────────────────────────────────────
  const filteredContacts = contactQuery.length >= 1
    ? allContacts.filter((c) =>
        c.emailAddress?.toLowerCase().includes(contactQuery.toLowerCase()) ||
        c.displayName?.toLowerCase().includes(contactQuery.toLowerCase())
      ).slice(0, 6)
    : [];

  function addToAddress(email: string) {
    const trimmed = email.trim();
    if (!trimmed || toAddresses.includes(trimmed)) return;
    setToAddresses((prev) => [...prev, trimmed]);
    setToInput('');
    setContactQuery('');
    setShowContactDropdown(false);
  }

  function removeToAddress(email: string) {
    setToAddresses((prev) => prev.filter((a) => a !== email));
  }

  function addCcAddress(email: string) {
    const trimmed = email.trim();
    if (!trimmed || ccAddresses.includes(trimmed)) return;
    setCcAddresses((prev) => [...prev, trimmed]);
    setCcInput('');
  }

  function removeCcAddress(email: string) {
    setCcAddresses((prev) => prev.filter((a) => a !== email));
  }

  // ── AI assist ─────────────────────────────────────────────────────────────
  async function handleAiGenerate() {
    if (!aiInstruction.trim() || !selectedAccountId) return;
    setAiGenerating(true);
    try {
      const result = await api.generateDraft({
        account_id: selectedAccountId,
        instruction: `${selectedMode ? `[Skrivsätt: ${selectedMode}] ` : ''}${aiInstruction}`,
        subject: subject || undefined,
      });
      // Extract body from the created draft and fill textarea
      if (result.draft?.bodyText) {
        setBody(result.draft.bodyText);
      }
      setAiPanelOpen(false);
      setAiInstruction('');
      // Also navigate to the draft for editing if body extraction isn't available
      if (!result.draft?.bodyText && result.draft?.id) {
        toast.success('Utkast skapat — öppnar utkast-editor');
        router.push(`/drafts/${result.draft.id}`);
        return;
      }
      toast.success('AI-text genererad');
    } catch (err: any) {
      if (isDev) console.error('AI generate failed:', err);
      toast.error('Kunde inte generera text');
    } finally {
      setAiGenerating(false);
    }
  }

  // ── Save draft ────────────────────────────────────────────────────────────
  async function handleSaveDraft() {
    if (!selectedAccountId) { toast.error('Välj ett konto'); return; }
    if (toAddresses.length === 0) { toast.error('Ange minst en mottagare'); return; }
    if (!subject.trim()) { toast.error('Ange ett ämne'); return; }
    setSaving(true);
    try {
      const result = await api.createDraft({
        account_id: selectedAccountId,
        to_addresses: toAddresses,
        cc_addresses: ccAddresses.length > 0 ? ccAddresses : undefined,
        subject: subject.trim(),
        body_text: body,
      });
      toast.success('Utkast sparat');
      router.push(`/drafts/${result.draft.id}`);
    } catch (err: any) {
      if (isDev) console.error('Save draft failed:', err);
      toast.error('Kunde inte spara utkast');
    } finally {
      setSaving(false);
    }
  }

  // ── Send (create + approve + confirm) ────────────────────────────────────
  async function executeSend() {
    setSendConfirmOpen(false);
    if (!selectedAccountId) { toast.error('Välj ett konto'); return; }
    if (toAddresses.length === 0) { toast.error('Ange minst en mottagare'); return; }
    if (!subject.trim()) { toast.error('Ange ett ämne'); return; }
    setSaving(true);
    try {
      const created = await api.createDraft({
        account_id: selectedAccountId,
        to_addresses: toAddresses,
        cc_addresses: ccAddresses.length > 0 ? ccAddresses : undefined,
        subject: subject.trim(),
        body_text: body,
      });
      await api.approveDraft(created.draft.id);
      await api.sendDraft(created.draft.id);
      toast.success('Mail skickat!');
      router.push('/inbox');
    } catch (err: any) {
      if (isDev) console.error('Send failed:', err);
      toast.error(`Misslyckades: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useKeyboardShortcuts({
    'cmd+enter': () => setSendConfirmOpen(true),
    'cmd+s': () => handleSaveDraft(),
    escape: () => router.back(),
  });

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <TopBar />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              {replyThreadId ? (
                <CornerDownLeft size={22} className="text-brand-500" />
              ) : (
                <PenLine size={22} className="text-brand-500" />
              )}
              {replyLoading ? 'Laddar svar…' : replyThreadId ? 'Svara' : 'Nytt meddelande'}
            </h1>
            {replySubject && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1">
                <CornerDownLeft size={13} className="shrink-0 text-brand-400" />
                Svarar på: <span className="font-medium truncate max-w-[300px]">{replySubject}</span>
              </p>
            )}
            {!replySubject && (
              <p className="text-sm text-gray-400 mt-0.5">⌘↩ skicka · ⌘S spara · Esc tillbaka</p>
            )}
          </div>
          <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X size={20} />
          </button>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          {/* From */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 dark:border-gray-700">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400 w-12 shrink-0">Från</span>
            <div className="relative flex-1">
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>{acc.emailAddress}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            {selectedAccount?.color && (
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: selectedAccount.color }} />
            )}
          </div>

          {/* To */}
          <div className="flex items-start gap-3 px-5 py-3 border-b border-gray-100 dark:border-gray-700 relative">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400 w-12 shrink-0 mt-1.5">Till</span>
            <div className="flex-1">
              <div className="flex flex-wrap gap-1 mb-1">
                {toAddresses.map((addr) => (
                  <span key={addr} className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 text-xs rounded-lg border border-brand-200 dark:border-brand-700">
                    {addr}
                    <button onClick={() => removeToAddress(addr)} className="hover:text-red-500">×</button>
                  </span>
                ))}
              </div>
              <input
                ref={toInputRef}
                type="text"
                value={toInput}
                onChange={(e) => {
                  setToInput(e.target.value);
                  setContactQuery(e.target.value);
                  setShowContactDropdown(e.target.value.length > 0);
                }}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ',') && toInput.trim()) {
                    e.preventDefault();
                    addToAddress(toInput);
                  }
                  if (e.key === 'Backspace' && !toInput && toAddresses.length > 0) {
                    removeToAddress(toAddresses[toAddresses.length - 1]);
                  }
                }}
                onBlur={() => {
                  setTimeout(() => setShowContactDropdown(false), 150);
                  if (toInput.trim()) addToAddress(toInput);
                }}
                placeholder={toAddresses.length === 0 ? 'E-postadress… (Enter eller komma för att lägga till)' : ''}
                className="w-full text-sm bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none"
              />
              {/* Contact autocomplete dropdown */}
              {showContactDropdown && filteredContacts.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg z-10 overflow-hidden">
                  {filteredContacts.map((contact) => (
                    <button
                      key={contact.emailAddress}
                      onMouseDown={(e) => { e.preventDefault(); addToAddress(contact.emailAddress); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-left transition-colors"
                    >
                      <div className="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 dark:text-brand-400 text-xs font-bold shrink-0">
                        {(contact.displayName || contact.emailAddress)[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        {contact.displayName && (
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{contact.displayName}</div>
                        )}
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{contact.emailAddress}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setCcVisible(!ccVisible)}
              className="text-xs text-gray-400 hover:text-brand-500 shrink-0 mt-1.5"
            >
              {ccVisible ? 'Dölj Cc' : 'Lägg till Cc'}
            </button>
          </div>

          {/* Cc */}
          {ccVisible && (
            <div className="flex items-start gap-3 px-5 py-3 border-b border-gray-100 dark:border-gray-700">
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400 w-12 shrink-0 mt-1.5">Cc</span>
              <div className="flex-1">
                <div className="flex flex-wrap gap-1 mb-1">
                  {ccAddresses.map((addr) => (
                    <span key={addr} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs rounded-lg">
                      {addr}
                      <button onClick={() => removeCcAddress(addr)} className="hover:text-red-500">×</button>
                    </span>
                  ))}
                </div>
                <input
                  type="text"
                  value={ccInput}
                  onChange={(e) => setCcInput(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ',') && ccInput.trim()) {
                      e.preventDefault();
                      addCcAddress(ccInput);
                    }
                  }}
                  onBlur={() => { if (ccInput.trim()) addCcAddress(ccInput); }}
                  placeholder="Cc-adresser…"
                  className="w-full text-sm bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none"
                />
              </div>
            </div>
          )}

          {/* Subject */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 dark:border-gray-700">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400 w-12 shrink-0">Ämne</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ämnesrad…"
              className="flex-1 text-sm bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none font-medium"
            />
          </div>

          {/* Writing mode + AI assist row */}
          <div className="flex items-center gap-3 px-5 py-2.5 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
            {writingModes.length > 0 && (
              <div className="relative shrink-0">
                <select
                  value={selectedMode}
                  onChange={(e) => setSelectedMode(e.target.value)}
                  className="appearance-none pl-3 pr-7 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-brand-500 outline-none"
                >
                  <option value="">Inget skrivsätt</option>
                  {writingModes.map((mode: any) => (
                    <option key={mode.id ?? mode.name} value={mode.name}>{mode.name}</option>
                  ))}
                </select>
                <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            )}
            <button
              onClick={() => setAiPanelOpen(!aiPanelOpen)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                aiPanelOpen
                  ? 'bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-700 text-brand-700 dark:text-brand-300'
                  : 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-brand-300 dark:hover:border-brand-700'
              }`}
            >
              <Wand2 size={13} />
              AI-hjälp
            </button>
          </div>

          {/* AI assist panel */}
          {aiPanelOpen && (
            <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 bg-brand-50/30 dark:bg-brand-900/10">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={aiInstruction}
                  onChange={(e) => setAiInstruction(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && aiInstruction.trim()) handleAiGenerate(); }}
                  placeholder="Beskriv vad du vill skriva, t.ex. 'Tacka för mötet och föreslå nästa steg'…"
                  className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  autoFocus
                />
                <button
                  onClick={handleAiGenerate}
                  disabled={!aiInstruction.trim() || aiGenerating}
                  className="btn-primary text-sm px-4 shrink-0 flex items-center gap-1.5"
                >
                  {aiGenerating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                  {aiGenerating ? 'Genererar…' : 'Generera'}
                </button>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                AI fyller i texten — du granskar och redigerar innan du skickar
              </p>
            </div>
          )}

          {/* Body */}
          <div className="relative">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Skriv ditt meddelande här…"
              rows={14}
              className="w-full px-5 py-4 text-sm bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 resize-none outline-none leading-relaxed pr-12"
            />
            {/* Voice dictation button — appends transcript to body */}
            <div className="absolute bottom-3 right-3">
              <VoiceButton
                onTranscript={(text) => setBody((prev) => prev + (prev.endsWith(' ') || prev === '' ? '' : ' ') + text)}
                lang="sv-SE"
              />
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
            <button
              onClick={() => router.back()}
              className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              Avbryt
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveDraft}
                disabled={saving}
                className="btn-secondary text-sm flex items-center gap-1.5"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Spara utkast
              </button>
              <button
                onClick={() => setSendConfirmOpen(true)}
                disabled={saving || toAddresses.length === 0 || !subject.trim()}
                className="btn-primary text-sm flex items-center gap-1.5"
              >
                <Send size={14} />
                Skicka
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Send confirmation — NEVER auto-send */}
      <ConfirmDialog
        open={sendConfirmOpen}
        title="Skicka mail?"
        description={`Mailet skickas till ${toAddresses.join(', ')} via Gmail. Det går inte att ångra.`}
        confirmLabel="Skicka nu"
        cancelLabel="Avbryt"
        variant="warning"
        onConfirm={executeSend}
        onCancel={() => setSendConfirmOpen(false)}
      />
    </div>
  );
}
