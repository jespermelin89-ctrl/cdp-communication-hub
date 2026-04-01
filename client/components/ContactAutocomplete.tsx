'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import { X, User } from 'lucide-react';

interface Contact {
  email: string;
  displayName: string | null;
  lastContactAt: string | null;
  totalEmails: number;
}

interface ContactAutocompleteProps {
  value: string[];
  onChange: (addresses: string[]) => void;
  placeholder?: string;
  label?: string;
  id?: string;
}

function getInitials(nameOrEmail: string): string {
  const name = nameOrEmail.replace(/<.*>/, '').trim();
  const parts = name.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export default function ContactAutocomplete({
  value,
  onChange,
  placeholder = 'Lägg till mottagare...',
  label,
  id,
}: ContactAutocompleteProps) {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<Contact[]>([]);
  const [recentContacts, setRecentContacts] = useState<Contact[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [focusedSuggestionIndex, setFocusedSuggestionIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load recent contacts on mount
  useEffect(() => {
    api.getRecentContacts(5).then((res) => setRecentContacts(res.contacts ?? [])).catch(() => {});
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (!inputValue.trim()) {
      setSuggestions([]);
      return;
    }
    debounceTimer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.searchContacts(inputValue.trim(), 10);
        setSuggestions(res.contacts ?? []);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [inputValue]);

  // Click outside to close
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const addAddress = useCallback((email: string) => {
    const clean = email.trim();
    if (!clean || value.includes(clean)) return;
    onChange([...value, clean]);
    setInputValue('');
    setSuggestions([]);
    setShowDropdown(false);
    setFocusedSuggestionIndex(-1);
    inputRef.current?.focus();
  }, [value, onChange]);

  const removeAddress = useCallback((addr: string) => {
    onChange(value.filter((a) => a !== addr));
  }, [value, onChange]);

  const displayList = inputValue.trim() ? suggestions : recentContacts;

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (focusedSuggestionIndex >= 0 && focusedSuggestionIndex < displayList.length) {
        addAddress(displayList[focusedSuggestionIndex].email);
      } else if (inputValue.trim()) {
        if (isValidEmail(inputValue)) {
          addAddress(inputValue.trim());
        }
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedSuggestionIndex((i) => Math.min(i + 1, displayList.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedSuggestionIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      removeAddress(value[value.length - 1]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
        </label>
      )}
      <div
        className="flex flex-wrap gap-1.5 min-h-[40px] px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-brand-500 transition-shadow cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {/* Chips */}
        {value.map((addr) => (
          <span
            key={addr}
            className="flex items-center gap-1 px-2 py-0.5 bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 rounded-full text-sm font-medium border border-brand-200 dark:border-brand-700 max-w-[200px]"
          >
            <span className="truncate">{addr}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeAddress(addr); }}
              className="text-brand-400 hover:text-brand-700 dark:hover:text-brand-200 shrink-0"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {/* Input */}
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); setShowDropdown(true); setFocusedSuggestionIndex(-1); }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400"
          autoComplete="off"
        />
      </div>

      {/* Dropdown */}
      {showDropdown && (displayList.length > 0 || (inputValue.trim() && isValidEmail(inputValue))) && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto">
          {displayList.length === 0 && inputValue.trim() && isValidEmail(inputValue) ? (
            <button
              type="button"
              onClick={() => addAddress(inputValue.trim())}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-left"
            >
              <span className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300 shrink-0">
                <User size={13} />
              </span>
              <span>Lägg till <strong>{inputValue.trim()}</strong></span>
            </button>
          ) : (
            <>
              {!inputValue.trim() && (
                <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-700">
                  Senaste kontakter
                </div>
              )}
              {displayList.map((contact, idx) => (
                <button
                  key={contact.email}
                  type="button"
                  onClick={() => addAddress(contact.email)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                    idx === focusedSuggestionIndex
                      ? 'bg-brand-50 dark:bg-brand-900/20'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {/* Avatar initials */}
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{ backgroundColor: `hsl(${contact.email.charCodeAt(0) * 13 % 360}, 60%, 50%)` }}
                  >
                    {getInitials(contact.displayName ?? contact.email)}
                  </span>
                  <div className="min-w-0">
                    {contact.displayName && (
                      <div className="font-medium text-gray-800 dark:text-gray-200 truncate">{contact.displayName}</div>
                    )}
                    <div className={`text-gray-500 dark:text-gray-400 truncate ${contact.displayName ? 'text-xs' : 'font-medium'}`}>
                      {contact.email}
                    </div>
                  </div>
                </button>
              ))}
              {loading && (
                <div className="px-4 py-2 text-xs text-gray-400 dark:text-gray-500">Söker...</div>
              )}
              {inputValue.trim() && isValidEmail(inputValue) && !displayList.some(c => c.email === inputValue.trim()) && (
                <button
                  type="button"
                  onClick={() => addAddress(inputValue.trim())}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-left border-t border-gray-100 dark:border-gray-700"
                >
                  <User size={14} className="text-gray-400 shrink-0" />
                  <span>Lägg till <strong>{inputValue.trim()}</strong></span>
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
