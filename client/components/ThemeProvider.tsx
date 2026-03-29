'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type Theme = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolvedTheme: 'light' | 'dark';
  /** Legacy helper — cycles light ↔ dark (ignores system). Used by TopBar toggle. */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  setTheme: () => {},
  resolvedTheme: 'light',
  toggleTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolved] = useState<'light' | 'dark'>('light');

  // Restore saved preference on mount
  useEffect(() => {
    const saved = localStorage.getItem('cdp-theme') as Theme | null;
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      setThemeState(saved);
    }
  }, []);

  // Apply theme whenever the preference or system preference changes
  useEffect(() => {
    localStorage.setItem('cdp-theme', theme);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');

    function apply() {
      const isDark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', isDark);
      setResolved(isDark ? 'dark' : 'light');
    }

    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  function setTheme(t: Theme) {
    setThemeState(t);
  }

  function toggleTheme() {
    setThemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      return next;
    });
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
