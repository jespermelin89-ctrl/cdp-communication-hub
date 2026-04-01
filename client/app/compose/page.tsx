'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import TopBar from '@/components/TopBar';
import ConfirmDialog from '@/components/ConfirmDialog';
import VoiceButton from '@/components/VoiceButton';
import { Send, Save, Wand2, X, ChevronDown, PenLine, Loader2, CornerDownLeft, CheckCircle2, Paperclip, Type, AlignLeft, LayoutTemplate } from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { toast } from 'sonner';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import type { Account } from '@/lib/types';
import RichTextEditor from '@/components/RichTextEditor';
import ContactAutocomplete from '@/components/ContactAutocomplete';
import { showUndoSendToast } from '@/components/UndoSendToast';

const isDev = process.env.NODE_ENV === 'development';

function ComposePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const replyThreadId = searchParams.get('reply');
  const { t } = useI18n();
  const toInputRef = useRef<HTMLInputElement>(null);

  // ── Reply / Forward context ───────────────────────────────────────────────
  const forwardThreadId = searchParams.get('forward');
  const [replySubject, setReplySubject] = useState<string | null>(null);
  const [forwardSubject, setForwardSubject] = useState<string | null>(null);
  const [replyLoading, setReplyLoading] = useState(false);

  // ── Form state ────────────────────────────────────────────────────────────
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [toInput, setToInput] = useState('');
  const [toAddresses, setToAddresses] = useState<string[]>([]);
  const [ccVisible, setCcVisible] = useState(false);
  const [ccInput, setCcInput] = useState('');
  const [ccAddresses, setCcAddresses] = useState<string[]>([]);
  const [bccVisible, setBccVisible] = useState(false);
  const [bccInput, setBccInput] = useState('');
  const [bccAddresses, setBccAddresses] = useState<string[]>([]);
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

  // ── Signature tracking ────────────────────────────────────────────────────
  const prevAccountIdRef = useRef<string>('');

  // ── Attachment state ──────────────────────────────────────────────────────
  const [attachments, setAttachments] = useState<Array<{
    id: string;
    filename: string;
    size: number;
    mimeType: string;
    uploading?: boolean;
  }>>([]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Auto-save state ───────────────────────────────────────────────────────
  const [autoSavedDraftId, setAutoSavedDraftId] = useState<string | null>(null);
  const [autoSaveIndicator, setAutoSaveIndicator] = useState<'saved' | 'saving' | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoSaveBodyRef = useRef<string>('');

  // ── Editor mode ───────────────────────────────────────────────────────────
  const [editorMode, setEditorMode] = useState<'plain' | 'rich'>('rich');
  const [bodyHtml, setBodyHtml] = useState('');

  // ── Template panel ────────────────────────────────────────────────────────
  const [templatePanelOpen, setTemplatePanelOpen] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

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

  // Pre-fill / update signature when account is selected (compose mode only)
  useEffect(() => {
    if (!selectedAccountId || accounts.length === 0) return;
    if (replyThreadId || forwardThreadId) return; // reply/forward manage their own body
    if (selectedAccountId === prevAccountIdRef.current) return; // no-op on re-render
    prevAccountIdRef.current = selectedAccountId;
    const acc = accounts.find(a => a.id === selectedAccountId);
    if (!acc) return;

    // Only insert if useSignatureOnNew is true (or field doesn't exist yet — legacy)
    const shouldInsert = acc.useSignatureOnNew !== false;

    if (editorMode === 'rich' && acc.signatureHtml && shouldInsert) {
      setBodyHtml(prev => {
        const sigMarker = '<div class="cdp-signature">';
        const sigStart = prev.indexOf(sigMarker);
        const content = sigStart >= 0 ? prev.slice(0, sigStart) : prev;
        return `${content}<div class="cdp-signature" style="color:#6b7280;font-size:0.875rem;border-top:1px solid #e5e7eb;margin-top:1rem;padding-top:0.5rem">${acc.signatureHtml}</div>`;
      });
    } else {
      setBody(prev => {
        const sigStart = prev.indexOf('\n\n--\n');
        const content = sigStart >= 0 ? prev.slice(0, sigStart) : prev;
        const sig = acc.signature ?? '';
        return sig && shouldInsert ? `${content}\n\n--\n${sig}` : content;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountId, accounts, editorMode]);

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

  // ── Forward pre-fill — load thread data when ?forward=<id> ───────────────
  useEffect(() => {
    if (!forwardThreadId) return;
    let cancelled = false;
    setReplyLoading(true);
    api.getThread(forwardThreadId)
      .then((res) => {
        if (cancelled) return;
        const thread = res.thread as any;
        const originalSubject = thread.subject ?? '';
        const fwdSubject = originalSubject.toLowerCase().startsWith('fwd:')
          ? originalSubject
          : `Fwd: ${originalSubject}`;
        setSubject(fwdSubject);
        setForwardSubject(originalSubject);

        // Auto-select the account that received the email
        if (thread.account?.id) setSelectedAccountId(thread.account.id);

        // Build forwarded body with original message header
        const latestMsg = thread.messages?.[thread.messages.length - 1];
        const fromAddr = latestMsg?.fromAddress ?? thread.participantEmails?.[0] ?? '';
        const msgDate = latestMsg?.receivedAt
          ? new Date(latestMsg.receivedAt).toLocaleString('sv-SE')
          : '';
        const originalBody = latestMsg?.bodyText ?? thread.snippet ?? '';
        const forwardedBlock = [
          '',
          '',
          '---------- Vidarebefordrat meddelande ----------',
          `Från: ${fromAddr}`,
          `Datum: ${msgDate}`,
          `Ämne: ${originalSubject}`,
          '',
          originalBody,
        ].join('\n');
        setBody(forwardedBlock);
        // Focus the To field so user can type recipient
        setTimeout(() => toInputRef.current?.focus(), 100);
      })
      .catch(() => {
        if (!cancelled) toast.error('Kunde inte hämta tråd för vidarebefordran');
      })
      .finally(() => { if (!cancelled) setReplyLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forwardThreadId]);

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

  function addBccAddress(email: string) {
    const trimmed = email.trim();
    if (!trimmed || bccAddresses.includes(trimmed)) return;
    setBccAddresses((prev) => [...prev, trimmed]);
    setBccInput('');
  }

  function removeBccAddress(email: string) {
    setBccAddresses((prev) => prev.filter((a) => a !== email));
  }

  // ── Auto-save ─────────────────────────────────────────────────────────────
  const triggerAutoSave = useCallback(() => {
    if (!selectedAccountId || toAddresses.length === 0 || !subject.trim()) return;
    if (body === lastAutoSaveBodyRef.current) return;
    lastAutoSaveBodyRef.current = body;

    setAutoSaveIndicator('saving');
    const doSave = async () => {
      try {
        if (autoSavedDraftId) {
          // Update existing autosave draft — use updateDraft if available, else create new
          await api.updateDraft(autoSavedDraftId, { body_text: body });
        } else {
          const result = await api.createDraft({
            account_id: selectedAccountId,
            to_addresses: toAddresses,
            cc_addresses: ccAddresses.length > 0 ? ccAddresses : undefined,
            subject: subject.trim(),
            body_text: body,
          });
          setAutoSavedDraftId(result.draft.id);
        }
        setAutoSaveIndicator('saved');
        setTimeout(() => setAutoSaveIndicator(null), 3000);
      } catch {
        setAutoSaveIndicator(null);
      }
    };
    doSave();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountId, toAddresses, subject, body, ccAddresses, autoSavedDraftId]);

  // Schedule auto-save 30s after last body change
  useEffect(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => triggerAutoSave(), 30_000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body]);

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

  // ── Attachment helpers ────────────────────────────────────────────────────
  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function handleFileUpload(files: FileList) {
    if (!selectedAccountId) { toast.error('Välj ett konto innan du bifogar'); return; }

    // Ensure a draft exists to attach to — autosave first
    let draftId = autoSavedDraftId;
    if (!draftId) {
      try {
        const result = await api.createDraft({
          account_id: selectedAccountId,
          to_addresses: toAddresses.length > 0 ? toAddresses : ['draft@placeholder.local'],
          subject: subject.trim() || 'Utkast',
          body_text: body,
        });
        draftId = result.draft.id;
        setAutoSavedDraftId(draftId);
      } catch {
        toast.error('Kunde inte skapa utkast för bilaga');
        return;
      }
    }

    const csrfToken = typeof document !== 'undefined'
      ? document.cookie.split(';').find(c => c.trim().startsWith('csrf_token='))?.split('=')[1]
      : undefined;

    for (const file of Array.from(files)) {
      if (file.size > 25 * 1024 * 1024) {
        toast.error(`${file.name} är för stor (max 25 MB)`);
        continue;
      }

      const tempId = crypto.randomUUID();
      setAttachments(prev => [...prev, { id: tempId, filename: file.name, size: file.size, mimeType: file.type, uploading: true }]);

      try {
        const formData = new FormData();
        formData.append('file', file);
        const token = api.getToken();
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

        const res = await fetch(`/api/v1/drafts/${draftId}/attachments`, {
          method: 'POST',
          headers,
          body: formData,
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setAttachments(prev => prev.map(a => a.id === tempId ? { ...data.attachment, uploading: false } : a));
      } catch {
        toast.error(`Kunde inte ladda upp ${file.name}`);
        setAttachments(prev => prev.filter(a => a.id !== tempId));
      }
    }
  }

  async function removeAttachment(attId: string) {
    if (autoSavedDraftId) {
      const csrfToken = typeof document !== 'undefined'
        ? document.cookie.split(';').find(c => c.trim().startsWith('csrf_token='))?.split('=')[1]
        : undefined;
      const token = api.getToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

      await fetch(`/api/v1/drafts/${autoSavedDraftId}/attachments/${attId}`, {
        method: 'DELETE',
        headers,
      }).catch(() => {});
    }
    setAttachments(prev => prev.filter(a => a.id !== attId));
  }

  // ── Save draft ────────────────────────────────────────────────────────────
  async function handleSaveDraft() {
    if (!selectedAccountId) { toast.error('Välj ett konto'); return; }
    if (toAddresses.length === 0) { toast.error('Ange minst en mottagare'); return; }
    if (!subject.trim()) { toast.error('Ange ett ämne'); return; }
    setSaving(true);
    try {
      const draftId = autoSavedDraftId;
      let result: { draft: { id: string } };
      if (draftId) {
        await api.updateDraft(draftId, {
          to_addresses: toAddresses,
          cc_addresses: ccAddresses.length > 0 ? ccAddresses : undefined,
          bcc_addresses: bccAddresses.length > 0 ? bccAddresses : undefined,
          subject: subject.trim(),
          body_text: body,
        });
        result = { draft: { id: draftId } };
      } else {
        result = await api.createDraft({
          account_id: selectedAccountId,
          to_addresses: toAddresses,
          cc_addresses: ccAddresses.length > 0 ? ccAddresses : undefined,
          bcc_addresses: bccAddresses.length > 0 ? bccAddresses : undefined,
          subject: subject.trim(),
          body_text: body,
        });
      }
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
        bcc_addresses: bccAddresses.length > 0 ? bccAddresses : undefined,
        subject: subject.trim(),
        body_text: body,
        ...(editorMode === 'rich' && bodyHtml ? { body_html: bodyHtml } : {}),
      } as any);
      await api.approveDraft(created.draft.id);
      // Use delayed send with undo window
      const delayedRes = await api.sendDelayed(created.draft.id);
      const outcome = await showUndoSendToast(created.draft.id, delayedRes.delaySeconds);
      if (outcome === 'sent') {
        toast.success('Mail skickat!');
        router.push('/inbox');
      } else {
        // Cancelled — go to drafts so user can edit
        router.push('/drafts');
      }
    } catch (err: any) {
      if (isDev) console.error('Send failed:', err);
      toast.error(`Misslyckades: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  // ── Templates ─────────────────────────────────────────────────────────────
  async function openTemplates() {
    setTemplatePanelOpen(true);
    if (templates.length === 0) {
      setTemplatesLoading(true);
      try {
        const result = await api.getTemplates();
        setTemplates(result.templates ?? []);
      } catch {
        toast.error('Kunde inte ladda mallar');
      } finally {
        setTemplatesLoading(false);
      }
    }
  }

  async function applyTemplate(template: any) {
    if (template.subject) setSubject(template.subject);
    if (editorMode === 'rich' && template.bodyHtml) {
      setBodyHtml(template.bodyHtml);
    } else if (template.bodyText) {
      setBody(template.bodyText);
    }
    setTemplatePanelOpen(false);
    try { await api.useTemplate(template.id); } catch { /* non-critical */ }
    toast.success(t.templates?.used ?? 'Mall använd');
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
              ) : forwardThreadId ? (
                <Send size={22} className="text-brand-500 -scale-x-100" />
              ) : (
                <PenLine size={22} className="text-brand-500" />
              )}
              {replyLoading
                ? 'Laddar…'
                : replyThreadId
                ? 'Svara'
                : forwardThreadId
                ? 'Vidarebefordra'
                : 'Nytt meddelande'}
            </h1>
            {replySubject && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1">
                <CornerDownLeft size={13} className="shrink-0 text-brand-400" />
                Svarar på: <span className="font-medium truncate max-w-[300px]">{replySubject}</span>
              </p>
            )}
            {forwardSubject && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1">
                <Send size={13} className="shrink-0 text-brand-400 -scale-x-100" />
                Vidarebefordrar: <span className="font-medium truncate max-w-[300px]">{forwardSubject}</span>
              </p>
            )}
            {!replySubject && !forwardSubject && (
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

          {/* To — ContactAutocomplete */}
          <div className="flex items-start gap-3 px-5 py-3 border-b border-gray-100 dark:border-gray-700">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400 w-12 shrink-0 mt-2">Till</span>
            <div className="flex-1">
              <ContactAutocomplete
                value={toAddresses}
                onChange={setToAddresses}
                placeholder="E-postadress…"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0 mt-2.5">
              <button
                onClick={() => setCcVisible(!ccVisible)}
                className={`text-xs hover:text-brand-500 ${ccVisible ? 'text-brand-500' : 'text-gray-400'}`}
              >
                Cc
              </button>
              <span className="text-gray-200 dark:text-gray-600">|</span>
              <button
                onClick={() => setBccVisible(!bccVisible)}
                className={`text-xs hover:text-brand-500 ${bccVisible ? 'text-brand-500' : 'text-gray-400'}`}
              >
                Bcc
              </button>
            </div>
          </div>

          {/* Cc — ContactAutocomplete */}
          {ccVisible && (
            <div className="flex items-start gap-3 px-5 py-3 border-b border-gray-100 dark:border-gray-700">
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400 w-12 shrink-0 mt-2">Cc</span>
              <div className="flex-1">
                <ContactAutocomplete
                  value={ccAddresses}
                  onChange={setCcAddresses}
                  placeholder="Cc-adresser…"
                />
              </div>
            </div>
          )}

          {/* Bcc — ContactAutocomplete */}
          {bccVisible && (
            <div className="flex items-start gap-3 px-5 py-3 border-b border-gray-100 dark:border-gray-700">
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400 w-12 shrink-0 mt-2">Bcc</span>
              <div className="flex-1">
                <ContactAutocomplete
                  value={bccAddresses}
                  onChange={setBccAddresses}
                  placeholder="Bcc-adresser…"
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

          {/* Template snippets */}
          <div className="flex items-center gap-2 px-5 py-2 border-b border-gray-100 dark:border-gray-700 overflow-x-auto scrollbar-hide">
            <span className="text-xs text-gray-400 shrink-0">Snabbtext:</span>
            {[
              { label: 'Tack', text: 'Tack för ditt meddelande! ' },
              { label: 'Återkommer', text: 'Jag återkommer till dig så snart som möjligt. ' },
              { label: 'Möte', text: 'Kan vi boka ett möte för att diskutera detta vidare? ' },
              { label: 'Hej', text: 'Hej,\n\nHoppas allt är bra med dig. ' },
            ].map(({ label, text }) => (
              <button
                key={label}
                onClick={() => setBody((prev) => prev + text)}
                className="shrink-0 px-2.5 py-1 text-xs rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-900/20 dark:hover:text-brand-300 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>

          {/* Body — drag & drop zone */}
          <div
            className={`relative transition-colors ${dragActive ? 'ring-2 ring-inset ring-violet-500 bg-violet-50/30 dark:bg-violet-900/10' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              if (e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files);
            }}
          >
            {/* Editor mode toggle */}
            <div className="flex items-center gap-1 px-3 pt-2 pb-1 border-b border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setEditorMode('rich')}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${editorMode === 'rich' ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                title="Formaterad text"
              >
                <Type size={12} />
                Formaterad
              </button>
              <button
                type="button"
                onClick={() => setEditorMode('plain')}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${editorMode === 'plain' ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                title="Vanlig text"
              >
                <AlignLeft size={12} />
                Vanlig
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={openTemplates}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title="Mailmallar"
              >
                <LayoutTemplate size={12} />
                Mallar
              </button>
            </div>

            {/* Template panel */}
            {templatePanelOpen && (
              <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-200">Mailmallar</span>
                  <button type="button" onClick={() => setTemplatePanelOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                    <X size={14} />
                  </button>
                </div>
                {templatesLoading ? (
                  <div className="text-xs text-gray-500 dark:text-gray-400">Laddar mallar...</div>
                ) : templates.length === 0 ? (
                  <div className="text-xs text-gray-500 dark:text-gray-400">Inga mallar. Skapa mallar i inställningar.</div>
                ) : (
                  <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                    {templates.map((tmpl) => (
                      <button
                        key={tmpl.id}
                        type="button"
                        onClick={() => applyTemplate(tmpl)}
                        className="text-left text-xs px-2 py-1.5 rounded bg-white dark:bg-gray-700 hover:bg-violet-50 dark:hover:bg-violet-900/20 border border-gray-200 dark:border-gray-600 transition-colors"
                      >
                        <div className="font-medium text-gray-800 dark:text-gray-100">{tmpl.name}</div>
                        {tmpl.subject && <div className="text-gray-500 dark:text-gray-400 truncate">{tmpl.subject}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {editorMode === 'rich' ? (
              <RichTextEditor
                value={bodyHtml || body}
                onChange={(html) => {
                  setBodyHtml(html);
                  // Extract plain text for fallback
                  const tmp = document.createElement('div');
                  tmp.innerHTML = html;
                  setBody(tmp.textContent ?? '');
                }}
                placeholder="Skriv ditt meddelande här…"
                className="rounded-none border-0"
              />
            ) : (
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Skriv ditt meddelande här…"
                rows={14}
                className="w-full px-5 py-4 text-sm bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 resize-none outline-none leading-relaxed pr-12 landscape:rows-8 min-h-[8rem]"
              />
            )}
            {/* Voice dictation button — appends transcript to body */}
            <div className="absolute bottom-3 right-3">
              <VoiceButton
                onTranscript={(text) => setBody((prev) => prev + (prev.endsWith(' ') || prev === '' ? '' : ' ') + text)}
                lang="sv-SE"
              />
            </div>

            {/* Drag overlay */}
            {dragActive && (
              <div className="absolute inset-0 bg-violet-500/10 border-2 border-dashed border-violet-400 rounded-b-2xl flex items-center justify-center z-50 pointer-events-none">
                <p className="text-violet-600 dark:text-violet-300 font-medium text-sm">Släpp filer här</p>
              </div>
            )}
          </div>

          {/* Attachment bar */}
          <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-violet-600 dark:text-gray-400 dark:hover:text-violet-400 transition-colors"
            >
              <Paperclip size={14} />
              Bifoga fil
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
            />
            {attachments.map(att => (
              <div key={att.id} className="flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">
                {att.uploading
                  ? <Loader2 size={12} className="animate-spin text-violet-500" />
                  : <Paperclip size={12} className="text-gray-400" />}
                <span className="max-w-[120px] truncate text-gray-700 dark:text-gray-200">{att.filename}</span>
                <span className="text-gray-400">{formatFileSize(att.size)}</span>
                {!att.uploading && (
                  <button
                    type="button"
                    onClick={() => removeAttachment(att.id)}
                    className="text-gray-400 hover:text-red-500 transition-colors ml-0.5"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                Avbryt
              </button>
              {autoSaveIndicator === 'saving' && (
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <Loader2 size={11} className="animate-spin" />
                  Sparar…
                </span>
              )}
              {autoSaveIndicator === 'saved' && (
                <span className="flex items-center gap-1 text-xs text-green-500">
                  <CheckCircle2 size={11} />
                  Autosparat
                </span>
              )}
            </div>
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

export default function ComposePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
          <TopBar />
          <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-8 text-sm text-gray-500 dark:text-gray-400">
              Laddar skrivfönster...
            </div>
          </main>
        </div>
      }
    >
      <ComposePageContent />
    </Suspense>
  );
}
