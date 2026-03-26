'use client';

import { useState, useRef, useEffect } from 'react';
import { api } from '@/lib/api';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type?: string;
  data?: any;
  timestamp: Date;
}

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Hej Jesper! Jag kan hjälpa dig med din mail. Prova:\n\n• "sammanfatta inkorgen"\n• "visa viktiga mail"\n• "markera X som skräp"\n• "visa regler"',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      const result = await api.chatAsk(text);

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
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: `Fel: ${err.message}`,
          type: 'error',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  // Quick action buttons based on last response
  function QuickActions({ message }: { message: ChatMessage }) {
    if (message.role !== 'assistant') return null;

    const actions: Array<{ label: string; command: string }> = [];

    if (message.type === 'summary') {
      actions.push({ label: 'Visa viktiga', command: 'visa viktiga mail' });
      actions.push({ label: 'Visa regler', command: 'visa regler' });
      actions.push({ label: 'Visa olästa', command: 'visa olästa' });
    } else if (message.type === 'rule_created') {
      actions.push({ label: 'Visa alla regler', command: 'visa regler' });
      actions.push({ label: 'Sammanfatta inbox', command: 'sammanfatta inkorgen' });
    } else if (message.type === 'thread_list') {
      actions.push({ label: 'Sammanfatta', command: 'sammanfatta inkorgen' });
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
      >
        {isOpen ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
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
            <div>
              <div className="font-semibold text-sm">CDP Mail Assistant</div>
              <div className="text-xs text-brand-100">Skriv vad du vill göra med din mail</div>
            </div>
          </div>

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
          <div className="p-3 border-t border-gray-100">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Skriv ett kommando..."
                disabled={loading}
                className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="px-4 py-2.5 bg-brand-500 text-white rounded-xl font-medium text-sm hover:bg-brand-600 disabled:opacity-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
