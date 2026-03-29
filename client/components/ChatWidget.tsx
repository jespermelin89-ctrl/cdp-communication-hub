'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { MessageCircle, X, Send, RefreshCw, WifiOff, Loader, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useChatContext } from '@/lib/chat-context';
import { commandQueue } from '@/lib/command-queue';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import VoiceButton from './VoiceButton';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type?: string;
  data?: any;
  timestamp: Date;
  queued?: boolean; // true = sent while offline, waiting for flush
}

// ── Intent system ─────────────────────────────────────────────────────────────
interface Intent {
  pattern: RegExp;
  description: string;
  execute: (match: RegExpMatchArray, text: string) => Promise<{ type: string; message: string; data?: any }>;
}

const INTENTS: Intent[] = [
  {
    pattern: /^(kolla\s*mail|briefing|inbox|olästa|vad har jag|morgon|sammanfatt)/i,
    description: 'Hämtar inbox-briefing',
    execute: async () => {
      return api.chatAsk('ge mig en detaljerad inbox-briefing med prioriterade mail');
    },
  },
  {
    pattern: /^(klassificera|sortera|triage|analysera\s*(alla|mail))/i,
    description: 'Klassificerar mail med AI',
    execute: async () => {
      const result = await api.bulkClassify(10);
      const lines = result.results.map((r) => {
        const icon =
          r.priority === 'high' ? '🔴' : r.priority === 'medium' ? '🟡' : '🟢';
        return `${icon} ${r.subject ?? '(inget ämne)'} → **${r.classification}**`;
      });
      const summary = `_${result.ai_calls} AI-anrop, ${result.results.length - result.ai_calls} regelmatchningar_`;
      const message =
        lines.length > 0
          ? lines.join('\n') + '\n\n' + summary
          : `Inga oanalyserade trådar hittades. ${summary}`;
      return { type: 'bulk_classify', message };
    },
  },
  {
    pattern: /^(synca|hämta\s*nya|uppdatera|refresh|sync)/i,
    description: 'Syncar mail från Gmail',
    execute: async () => {
      return api.chatAsk('synca och hämta nya mail från Gmail');
    },
  },
  {
    pattern: /^(brain|status|statistik|learning|vad har du lärt)/i,
    description: 'Hämtar Brain Core-status',
    execute: async () => {
      return api.chatAsk('visa brain core statistik, writing modes och learning status');
    },
  },
  {
    pattern: /^(sök|hitta|leta|search)\s+(.+)/i,
    description: 'Söker i mail',
    execute: async (match) => {
      return api.chatAsk('sök i mina mail efter: ' + match[2]);
    },
  },
  {
    pattern: /^(svara|reply|skriv\s*svar)/i,
    description: 'Letar mail som behöver svar',
    execute: async () => {
      return api.chatAsk('vilka mail behöver jag svara på?');
    },
  },
  {
    pattern: /^(utkast|drafts|väntande utkast)/i,
    description: 'Hämtar väntande utkast',
    execute: async () => {
      return api.chatAsk('visa mina väntande utkast');
    },
  },
  {
    pattern: /^(rensa|städa|arkivera\s*skräp|clean)/i,
    description: 'Analyserar vad som kan rensas',
    execute: async () => {
      return api.chatAsk('vad bör jag rensa och arkivera i inkorgen?');
    },
  },
  {
    pattern: /^(notis|alert|varning|vad har hänt)/i,
    description: 'Hämtar senaste notiser',
    execute: async () => {
      return api.chatAsk('visa senaste notiser och viktiga händelser');
    },
  },
  {
    pattern: /^(nytt\s*mail|skriv\s*mail|compose|ny\s*e-post|skicka\s*till)\s*(.*)/i,
    description: 'Skapar utkast till nytt mail',
    execute: async (match) => {
      const hint = match[2] ? `Ämne/mottagare: ${match[2]}` : '';
      return api.chatAsk(`skapa ett nytt mail-utkast${hint ? ' — ' + hint : ''}. Fråga efter mottagare, ämne och meddelande om de saknas.`);
    },
  },
  {
    pattern: /^(daglig\s*sammanfattning|dagens\s*sammanfattning|daily\s*summary|sammanfatta\s*dagen)/i,
    description: 'Hämtar daglig AI-sammanfattning',
    execute: async () => {
      return api.chatAsk('visa dagens dagliga sammanfattning från Brain Core med needs_reply, good_to_know och ai_recommendation');
    },
  },
];

// ── Quick action chips ────────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { label: '📊 Statistik', cmd: 'statistik' },
  { label: '📬 Kolla mail', cmd: 'kolla mail' },
  { label: '⚡ Viktiga', cmd: 'visa viktiga mail' },
  { label: '🤖 Klassificera', cmd: 'klassificera alla' },
  { label: '🔄 Synca', cmd: 'synca' },
  { label: '🧠 Brain Core', cmd: 'brain status' },
  { label: '📝 Utkast', cmd: 'utkast' },
  { label: '✉️ Nytt mail', cmd: 'nytt mail' },
  { label: '📅 Daglig sammanfattning', cmd: 'daglig sammanfattning' },
];

// ── Connection status badge shown inside the chat header ──────────────────
function ConnectionBadge({
  online,
  backendReachable,
  renderColdStart,
  queuedCount,
}: {
  online: boolean;
  backendReachable: boolean;
  renderColdStart: boolean;
  queuedCount: number;
}) {
  if (!online) {
    return (
      <div className="flex items-center gap-1 text-[10px] text-amber-300 font-medium">
        <WifiOff className="w-3 h-3 shrink-0" />
        Offline{queuedCount > 0 ? ` · ${queuedCount} köat` : ''}
      </div>
    );
  }
  if (renderColdStart) {
    return (
      <div className="flex items-center gap-1 text-[10px] text-blue-300 font-medium">
        <Loader className="w-3 h-3 shrink-0 animate-spin" />
        Backend startar…
      </div>
    );
  }
  if (!backendReachable) {
    return (
      <div className="flex items-center gap-1 text-[10px] text-red-300 font-medium">
        <AlertCircle className="w-3 h-3 shrink-0" />
        Servern svarar inte
      </div>
    );
  }
  return null;
}

export default function ChatWidget() {
  const { t } = useI18n();
  const { selectedThreadIds } = useChatContext();
  const networkStatus = useNetworkStatus();
  const { isOpen, setIsOpen } = useChatContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState('');
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Lazy welcome message — avoids hydration mismatch from new Date()
  useEffect(() => {
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: t.chat.welcome,
      timestamp: new Date(),
    }]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync queue count display
  useEffect(() => {
    commandQueue.count().then(setQueuedCount).catch(() => {});
  }, []);

  // Flush queued commands when we come back online
  useEffect(() => {
    if (!networkStatus.online || !networkStatus.backendReachable) return;

    commandQueue.count().then((n) => {
      if (n === 0) return;
      // Flush: send each queued command
      commandQueue.flush(async (cmd) => {
        try {
          const result = await api.chatAsk(cmd.text);
          setMessages((prev) => {
            // Replace the 'queued' placeholder bubble if present
            const withoutQueued = prev.filter(
              (m) => !(m.queued && m.content === cmd.text)
            );
            return [
              ...withoutQueued,
              {
                id: `a-flush-${cmd.id}`,
                role: 'assistant' as const,
                content: result.message,
                type: result.type,
                data: result.data,
                timestamp: new Date(),
              },
            ];
          });
          return true;
        } catch {
          return false;
        }
      }).then((flushed) => {
        if (flushed > 0) {
          commandQueue.count().then(setQueuedCount).catch(() => {});
        }
      });
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [networkStatus.online, networkStatus.backendReachable]);

  // Handle URL params: ?voice=1 opens chat + starts mic, ?cmd=<action> auto-sends a command
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);

    const cmd = params.get('cmd');
    if (cmd) {
      setIsOpen(true);
      const commandMap: Record<string, string> = {
        briefing: 'Ge mig en mail briefing',
        reply: 'Visa mail som behöver svar',
        compose: 'Jag vill skriva ett nytt mail',
      };
      const message = commandMap[cmd];
      if (message) {
        setTimeout(() => {
          setTimeout(() => {
            doSend(message);
          }, 100);
        }, 600);
      }
    }

    if (params.get('voice') === '1') {
      setIsOpen(true);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('cdp:start-voice'));
      }, 800);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // ── Core send logic ──────────────────────────────────────────────────────
  async function doSend(text: string) {
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    navigator.vibrate?.(30);

    // ── Offline: queue the command ──────────────────────────────────────────
    if (!networkStatus.online) {
      await commandQueue.add(text);
      const n = await commandQueue.count();
      setQueuedCount(n);
      setMessages((prev) => [
        ...prev,
        {
          id: `q-${Date.now()}`,
          role: 'assistant',
          content: '📥 Du är offline. Meddelandet köas och skickas automatiskt när du är online igen.',
          type: 'info',
          timestamp: new Date(),
          queued: true,
        },
      ]);
      return;
    }

    // ── Online: match intent or fall back to chatAsk ────────────────────────
    setLoading(true);

    try {
      let result: { type: string; message: string; data?: any } | undefined;

      // Try each intent in order — first match wins
      for (const intent of INTENTS) {
        const match = text.match(intent.pattern);
        if (match) {
          setThinkingLabel(intent.description);
          result = await intent.execute(match, text);
          setThinkingLabel('');
          break;
        }
      }

      // Fall back to generic chatAsk
      if (!result) {
        result = await api.chatAsk(
          text,
          selectedThreadIds.length > 0 ? selectedThreadIds : undefined
        );
      }

      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: result.message,
        type: result.type,
        data: result.data,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      setThinkingLabel('');
      const rawMsg: string = err instanceof Error ? err.message : '';
      const friendlyMsg = /prisma|database|500|connection/i.test(rawMsg)
        ? 'Något gick fel. Testa igen om en stund.'
        : rawMsg || 'Något gick fel. Testa igen.';
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: friendlyMsg,
          type: 'error',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    doSend(text);
  }

  const handleVoiceTranscript = useCallback((text: string) => {
    setInput((prev) => (prev ? `${prev} ${text}` : text));
    inputRef.current?.focus();
  }, []);

  function resetChat() {
    setMessages([{
      id: `w-${Date.now()}`,
      role: 'assistant',
      content: t.chat.welcome,
      timestamp: new Date(),
    }]);
    setInput('');
  }

  async function applyAnalyze(messageId: string, threadIds: string[]) {
    setApplyingId(messageId);
    let succeeded = 0;
    for (const id of threadIds) {
      try { await api.analyzeThread(id); succeeded++; } catch { /* skip */ }
    }
    setApplyingId(null);
    setMessages((prev) => [
      ...prev,
      {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: `Klart! ${succeeded} av ${threadIds.length} trådar analyserade.`,
        type: 'action_done',
        timestamp: new Date(),
      },
    ]);
  }

  // Quick action buttons based on last response
  function QuickActions({ message }: { message: ChatMessage }) {
    if (message.role !== 'assistant') return null;

    const actions: Array<{ label: string; command: string }> = [];

    if (message.type === 'summary') {
      actions.push({ label: t.chat.showImportant, command: 'visa viktiga mail' });
      actions.push({ label: t.chat.showRules, command: 'visa regler' });
      actions.push({ label: t.chat.showUnread, command: 'visa olästa' });
    } else if (message.type === 'rule_created') {
      actions.push({ label: t.chat.showAllRules, command: 'visa regler' });
      actions.push({ label: t.chat.summarize, command: 'sammanfatta inkorgen' });
    } else if (message.type === 'thread_list') {
      actions.push({ label: t.chat.summarize, command: 'sammanfatta inkorgen' });
    }

    if (actions.length === 0) return null;

    return (
      <div className="flex gap-1.5 mt-2 flex-wrap">
        {actions.map((a) => (
          <button
            key={a.command}
            onClick={() => doSend(a.command)}
            className="px-2.5 py-1 rounded-full bg-brand-100 text-brand-700 text-xs font-medium hover:bg-brand-200 transition-colors"
          >
            {a.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <>
      {/* Floating button — hidden on mobile when chat is open (fullscreen replaces it) */}
      <div
        className={`fixed z-50 flex flex-col items-end gap-1 ${isOpen ? 'hidden sm:flex' : 'flex'}`}
        style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))', right: '1.5rem' }}
      >
        <span className="hidden sm:block text-[10px] text-gray-400 dark:text-gray-500 font-mono bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700 shadow-sm">⌘K</span>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-14 h-14 bg-brand-500 hover:bg-brand-600 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105"
          aria-label={isOpen ? 'Stäng chatt' : 'Öppna chatt'}
        >
          {isOpen ? <X size={22} /> : (
            <div className="relative">
              <MessageCircle size={22} />
              {(selectedThreadIds.length > 0 || queuedCount > 0) && (
                <span className="absolute -top-2 -right-2 w-4 h-4 bg-amber-400 text-gray-900 text-[10px] font-bold rounded-full flex items-center justify-center">
                  {selectedThreadIds.length + queuedCount}
                </span>
              )}
            </div>
          )}
        </button>
      </div>

      {/* Chat panel — fullscreen on mobile (<sm), floating bubble on sm+ */}
      {isOpen && (
        <div className="fixed inset-0 sm:inset-auto sm:bottom-24 sm:right-6 z-50 sm:w-96 sm:h-[32rem] bg-white dark:bg-gray-800 sm:rounded-2xl shadow-2xl border-0 sm:border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom,0px)]">
          {/* Header */}
          <div className="px-4 py-3 bg-brand-500 text-white flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <span className="font-bold text-sm">C</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{t.chat.title}</div>
              <div className="text-xs text-brand-100 truncate">
                <ConnectionBadge
                  online={networkStatus.online}
                  backendReachable={networkStatus.backendReachable}
                  renderColdStart={networkStatus.renderColdStart}
                  queuedCount={queuedCount}
                />
                {networkStatus.online && networkStatus.backendReachable && !networkStatus.renderColdStart && (
                  <span>{t.chat.subtitle}</span>
                )}
              </div>
            </div>
            <button
              onClick={resetChat}
              aria-label="Starta om chatten"
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            >
              <RefreshCw size={14} />
            </button>
            {/* Close button — only visible on mobile where FAB is hidden */}
            <button
              onClick={() => setIsOpen(false)}
              aria-label="Stäng chatt"
              className="sm:hidden p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Selected threads banner */}
          {selectedThreadIds.length > 0 && (
            <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-700">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="font-medium">{selectedThreadIds.length} trådar markerade</span>
                <span className="text-amber-500">— skickas med nästa meddelande</span>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {[
                  { label: '📋 Sammanfatta', cmd: 'sammanfatta' },
                  { label: '⏰ Snooze 3h', cmd: 'snooze 3 timmar' },
                  { label: '🏷️ Etikett', cmd: 'etikett VIKTIG' },
                ].map((a) => (
                  <button
                    key={a.cmd}
                    onClick={() => doSend(a.cmd)}
                    disabled={loading}
                    className="px-2 py-0.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-700 transition-colors disabled:opacity-50"
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Queued commands banner */}
          {queuedCount > 0 && networkStatus.online && (
            <div className="px-3 py-2 bg-blue-50 border-b border-blue-200 text-xs text-blue-700 flex items-center gap-1.5">
              <Loader size={11} className="animate-spin shrink-0" />
              <span>Skickar {queuedCount} köat {queuedCount === 1 ? 'meddelande' : 'meddelanden'}…</span>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                    msg.role === 'user'
                      ? 'bg-brand-500 text-white rounded-br-md'
                      : msg.type === 'error'
                        ? 'bg-red-50 text-red-700 border border-red-200 rounded-bl-md'
                        : msg.type === 'info' || msg.queued
                          ? 'bg-amber-50 text-amber-700 border border-amber-200 rounded-bl-md'
                          : msg.type === 'ai_response'
                            ? 'bg-brand-50 dark:bg-brand-900/20 text-gray-800 dark:text-gray-200 border border-brand-200 dark:border-brand-800 rounded-bl-md'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-md'
                  }`}
                >
                  {/* Amanda avatar for AI responses */}
                  {msg.type === 'ai_response' && msg.role === 'assistant' && (
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className="w-4 h-4 bg-brand-500 rounded-full flex items-center justify-center shrink-0">
                        <span className="text-white text-[8px] font-bold">A</span>
                      </div>
                      <span className="text-[10px] font-semibold text-brand-600 dark:text-brand-400 uppercase tracking-wide">Amanda</span>
                    </div>
                  )}
                  {msg.role === 'user' ? (
                    <div className="whitespace-pre-wrap leading-relaxed break-words">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap leading-relaxed break-words">
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p className="mb-1 last:mb-0 leading-relaxed">{children}</p>,
                          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                          em: ({ children }) => <em className="text-xs text-gray-400 not-italic">{children}</em>,
                          ul: ({ children }) => <ul className="mt-1 space-y-0.5">{children}</ul>,
                          li: ({ children }) => <li className="flex gap-1.5"><span className="shrink-0 text-gray-400">•</span><span>{children}</span></li>,
                          code: ({ children }) => <code className="bg-gray-200 dark:bg-gray-600 text-xs px-1 rounded">{children}</code>,
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  )}

                  {/* Thread list — render clickable links */}
                  {msg.type === 'thread_list' && Array.isArray(msg.data) && msg.data.length > 0 && (
                    <div className="mt-2.5 space-y-1.5 border-t border-gray-200 dark:border-gray-600 pt-2.5">
                      {msg.data.slice(0, 8).map((thread: any) => (
                        <Link
                          key={thread.id}
                          href={`/threads/${thread.id}`}
                          className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 hover:border-brand-300 dark:hover:border-brand-600 hover:bg-brand-50/40 dark:hover:bg-brand-900/20 transition-all group"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate group-hover:text-brand-700 dark:group-hover:text-brand-300">
                              {thread.subject || t.chat.noSubject}
                            </div>
                            <div className="text-xs text-gray-400 truncate">{thread.sender}</div>
                          </div>
                          {thread.priority === 'high' && (
                            <span className="shrink-0 text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full">!</span>
                          )}
                          {!thread.isRead && (
                            <span className="shrink-0 w-2 h-2 bg-brand-500 rounded-full" />
                          )}
                        </Link>
                      ))}
                      {msg.data.length > 8 && (
                        <div className="text-xs text-gray-400 text-center pt-1">{t.chat.more.replace('{n}', String(msg.data.length - 8))}</div>
                      )}
                      {/* Tillämpa: analyze all listed threads */}
                      <button
                        onClick={() => applyAnalyze(msg.id, msg.data.map((t: any) => t.id))}
                        disabled={applyingId === msg.id}
                        className="w-full mt-1 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-medium rounded-xl transition-colors disabled:opacity-60"
                      >
                        {applyingId === msg.id ? 'Analyserar…' : 'Tillämpa — analysera alla'}
                      </button>
                    </div>
                  )}

                  <QuickActions message={msg} />
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  {thinkingLabel && (
                    <p className="text-xs text-gray-400 italic mt-1">{thinkingLabel}…</p>
                  )}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick actions */}
          <div className="flex gap-2 px-3 py-1.5 overflow-x-auto scrollbar-hide border-t border-gray-100 dark:border-gray-700/50 shrink-0">
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.cmd}
                onClick={() => doSend(a.cmd)}
                disabled={loading}
                className="whitespace-nowrap text-xs px-3 py-1 rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-brand-50 dark:hover:bg-brand-900/20 hover:border-brand-300 dark:hover:border-brand-700 hover:text-brand-700 dark:hover:text-brand-300 transition-colors disabled:opacity-40 shrink-0"
              >
                {a.label}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gray-100 dark:border-gray-700" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}>
            <div className="flex gap-2 items-center">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder={networkStatus.online ? t.chat.placeholder : 'Offline — meddelanden köas…'}
                disabled={loading}
                className="flex-1 px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none disabled:opacity-50"
              />
              <div className="flex items-center gap-1 shrink-0">
                <VoiceButton onTranscript={handleVoiceTranscript} disabled={loading} />
                <button
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  className={`p-2.5 rounded-xl transition-colors disabled:opacity-50 ${
                    networkStatus.online
                      ? 'bg-brand-500 text-white hover:bg-brand-600'
                      : 'bg-amber-500 text-white hover:bg-amber-600'
                  }`}
                  aria-label={networkStatus.online ? 'Skicka meddelande' : 'Kö meddelande (offline)'}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
