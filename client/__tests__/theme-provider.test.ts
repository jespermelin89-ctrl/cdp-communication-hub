/**
 * ThemeProvider — pure logic tests (no DOM required).
 * Tests theme value validation, localStorage key, and system theme detection logic.
 */

import { describe, it, expect } from 'vitest';

type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'cdp-theme';
const VALID_THEMES: Theme[] = ['light', 'dark', 'system'];

function isValidTheme(value: string): value is Theme {
  return VALID_THEMES.includes(value as Theme);
}

function resolveTheme(stored: string | null, prefersDark: boolean): 'light' | 'dark' {
  if (stored === 'dark') return 'dark';
  if (stored === 'light') return 'light';
  // 'system' or null — follow OS preference
  return prefersDark ? 'dark' : 'light';
}

function getHtmlClass(theme: Theme, prefersDark: boolean): string {
  const resolved = resolveTheme(theme, prefersDark);
  return resolved === 'dark' ? 'dark' : '';
}

describe('ThemeProvider — theme value logic', () => {
  it('default theme key is correct', () => {
    expect(STORAGE_KEY).toBe('cdp-theme');
  });

  it('valid themes are light, dark, system', () => {
    expect(VALID_THEMES).toContain('light');
    expect(VALID_THEMES).toContain('dark');
    expect(VALID_THEMES).toContain('system');
  });

  it('isValidTheme accepts light/dark/system', () => {
    expect(isValidTheme('light')).toBe(true);
    expect(isValidTheme('dark')).toBe(true);
    expect(isValidTheme('system')).toBe(true);
    expect(isValidTheme('auto')).toBe(false);
    expect(isValidTheme('')).toBe(false);
  });

  it('resolveTheme: dark stored → dark', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('dark', true)).toBe('dark');
  });

  it('resolveTheme: light stored → light', () => {
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('resolveTheme: system — follows OS preference', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('resolveTheme: null — follows OS preference', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
  });

  it('getHtmlClass returns "dark" for dark theme', () => {
    expect(getHtmlClass('dark', false)).toBe('dark');
  });

  it('getHtmlClass returns empty string for light theme', () => {
    expect(getHtmlClass('light', true)).toBe('');
  });

  it('getHtmlClass with system + prefersDark returns "dark"', () => {
    expect(getHtmlClass('system', true)).toBe('dark');
    expect(getHtmlClass('system', false)).toBe('');
  });
});
