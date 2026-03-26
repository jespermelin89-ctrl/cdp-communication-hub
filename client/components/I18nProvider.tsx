'use client';

import { useState, useEffect, ReactNode } from 'react';
import { I18nContext, getTranslations, getStoredLocale, setStoredLocale, type Locale } from '@/lib/i18n';

export default function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('sv');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setLocaleState(getStoredLocale());
    setMounted(true);
  }, []);

  function setLocale(newLocale: Locale) {
    setLocaleState(newLocale);
    setStoredLocale(newLocale);
  }

  const t = getTranslations(locale);

  // Avoid hydration mismatch by rendering with default locale until mounted
  if (!mounted) {
    return (
      <I18nContext.Provider value={{ locale: 'sv', t: getTranslations('sv'), setLocale }}>
        {children}
      </I18nContext.Provider>
    );
  }

  return (
    <I18nContext.Provider value={{ locale, t, setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}
