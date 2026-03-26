'use client';

import { createContext, useContext } from 'react';
import sv from './sv';
import en from './en';
import ru from './ru';
import es from './es';
import type { Translations } from './sv';

export type Locale = 'sv' | 'en' | 'ru' | 'es';

export const LOCALES: Locale[] = ['sv', 'en', 'ru', 'es'];

const translations: Record<Locale, Translations> = { sv, en, ru, es };

export function getTranslations(locale: Locale): Translations {
  return translations[locale] || sv;
}

export function getStoredLocale(): Locale {
  if (typeof window === 'undefined') return 'sv';
  const stored = localStorage.getItem('cdp-locale') as Locale | null;
  if (stored && LOCALES.includes(stored)) return stored;
  return 'sv'; // Swedish default
}

export function setStoredLocale(locale: Locale) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('cdp-locale', locale);
  }
}

// Context
interface I18nContextValue {
  locale: Locale;
  t: Translations;
  setLocale: (locale: Locale) => void;
}

export const I18nContext = createContext<I18nContextValue>({
  locale: 'sv',
  t: sv,
  setLocale: () => {},
});

export function useI18n() {
  return useContext(I18nContext);
}

// Re-export
export type { Translations };
export { sv, en, ru, es };
