'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { MessageCircle, X, Send, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useChatContext } from '@/lib/chat-context';
import VoiceButton from './VoiceButton';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type?: string;
  data?: any;
  timestamp: Date;
}

export default function ChatWidget() {
  const { t } = useI18n();
  const { selectedThreadIds } = useChatContext();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
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
        // Short delay so welcome message renders first
        setTimeout(() => {
          setInput(message);
          // Use a ref-based send to avoid stale closure
          setTimeout(() => {
            setInput('');
            const userMsg: ChatMessage = {
              id: `u-${Date.now()}`,
              role: 'user',
              content: message,
              timestamp: new Date(),
            };
            setMessages((prev) => [...prev, userMsg]);
            setLoading(true);
            api.chatAsk(message).then((result) => {
              setMessages((prev) => [
                ...prev,
                {
                  id: `a-${Date.now()}`,
                  role: 'assistant',
                  content: result.message,
                  type: result.type,
                  data: result.data,
                  timestamp: new Date(),
                },
              ]);
            }).catch(() => {}).finally(() => setLoading(false));
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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const result = await api.chatAsk(text, selectedThreadIds.length > 0 ? selectedThreadIds : undefined);

      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: result.message,
        type: result.type,
        data: result.data,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const rawMsg: string = err?.message || '';
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
            onClick={() => {
              setInput(a.command);
              setTimeout(() => handleSend(), 50);
            }}
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
      {/* Floating button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-brand-500 hover:bg-brand-600 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105"
        title="Öppna chatt"
      >
        {isOpen ? <X size={22} /> : (
          <div className="relative">
            <MessageCircle size={22} />
            {selectedThreadIds.length > 0 && (
              <span className="absolute -top-2 -right-2 w-4 h-4 bg-amber-400 text-gray-900 text-[10px] font-bold rounded-full flex items-center justify-center">
                {selectedThreadIds.length}
              </span>
            )}
          </div>
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-96 h-[32rem] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 bg-brand-500 text-white flex items-center gap-2">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <span className="font-bold text-sm">C</span>
            </div>
            <div className="flex-1">
              <div className="font-semibold text-sm">{t.chat.title}</div>
              <div className="text-xs text-brand-100">{t.chat.subtitle}</div>
            </div>
            <button
              onClick={resetChat}
              title="Starta om chatten"
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            >
              <RefreshCw size={14} />
            </button>
          </div>

          {/* Selected threads banner */}
          {selectedThreadIds.length > 0 && (
            <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-700 flex items-center gap-1.5">
              <span className="font-medium">{selectedThreadIds.length} trådar markerade</span>
              <span className="text-amber-500">— skickas med nästa meddelande</span>
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
                        : 'bg-gray-100 text-gray-800 rounded-bl-md'
                  }`}
                >
                  <div className="whitespace-pre-wrap leading-relaxed break-words">
                    {msg.content.split('**').map((part, i) =>
                      i % 2 === 1 ? <strong key={i}>{part}</strong> : part
                    )}
                  </div>

                  {/* Thread list — render clickable links */}
                  {msg.type === 'thread_list' && Array.isArray(msg.data) && msg.data.length > 0 && (
                    <div className="mt-2.5 space-y-1.5 border-t border-gray-200 pt-2.5">
                      {msg.data.slice(0, 8).map((thread: any) => (
                        <Link
                          key={thread.id}
                          href={`/threads/${thread.id}`}
                          className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-white border border-gray-200 hover:border-brand-300 hover:bg-brand-50/40 transition-all group"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-gray-800 truncate group-hover:text-brand-700">
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
                <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gray-100 dark:border-gray-700">
            <div className="flex gap-2 items-center">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder={t.chat.placeholder}
                disabled={loading}
                className="flex-1 px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none disabled:opacity-50"
              />
              <div className="flex items-center gap-1 shrink-0">
                <VoiceButton onTranscript={handleVoiceTranscript} disabled={loading} />
                <button
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  className="p-2.5 bg-brand-500 text-white rounded-xl hover:bg-brand-600 disabled:opacity-50 transition-colors"
                  title="Skicka"
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
