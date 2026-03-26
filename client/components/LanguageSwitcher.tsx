'use client';

import { useState, useRef, useEffect } from 'react';
import { useI18n, LOCALES, type Locale } from '@/lib/i18n';

const FLAG_MAP: Record<Locale, string> = {
  sv: '🇸🇪',
  en: '🇬🇧',
  ru: '🇷🇺',
  es: '🇪🇸',
};

export default function LanguageSwitcher() {
  const { locale, t, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors"
        aria-label={t.settings.language}
      >
        <span className="text-base">{FLAG_MAP[locale]}</span>
        <span className="hidden sm:inline text-xs font-medium">{locale.toUpperCase()}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-[100] min-w-[140px]">
          {LOCALES.map((loc) => (
            <button
              key={loc}
              onClick={() => {
                setLocale(loc);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                locale === loc
                  ? 'bg-brand-50 text-brand-600 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="text-base">{FLAG_MAP[loc]}</span>
              <span>{t.languages[loc]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
