'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, BellOff, ChevronDown } from 'lucide-react';
import useSWR from 'swr';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/api';
import { useNotifications } from '@/lib/use-notifications';
import LanguageSwitcher from './LanguageSwitcher';
import { useTheme } from './ThemeProvider';
import type { Account } from '@/lib/types';

interface TopBarProps {
  /** Override the pending draft count (e.g. from a parent that already has it). */
  pendingCount?: number;
  userEmail?: string;
}

/** Deterministic pastel dot color from email string (fallback when account.color is null). */
function emailColor(email: string): string {
  const hue = [...email].reduce((h, c) => (h * 31 + c.charCodeAt(0)) & 0xffff, 0) % 360;
  return `hsl(${hue}, 60%, 50%)`;
}

export default function TopBar({ pendingCount: pendingCountProp, userEmail }: TopBarProps) {
  const pathname = usePathname();
  const { t } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const { permission, requestPermission } = useNotifications();
  const [fetchedCount, setFetchedCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch accounts for active-account indicator
  const { data: accountsData } = useSWR(
    api.isAuthenticated() ? 'topbar-accounts' : null,
    () => api.getAccounts(),
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
  const accounts: Account[] = (accountsData as any)?.accounts ?? [];
  const activeAccount = accounts.find((a) => a.isDefault) ?? accounts[0] ?? null;

  // Fetch draft + unread counts from command-center (single call, 60s refresh).
  useEffect(() => {
    if (pendingCountProp !== undefined) return;
    if (!api.isAuthenticated()) return;

    let cancelled = false;

    async function fetchCounts() {
      try {
        const result = await api.getCommandCenter();
        if (!cancelled) {
          setFetchedCount(result.pending_drafts ?? 0);
          setUnreadCount(result.unread_threads ?? 0);
        }
      } catch {
        // unauthenticated or backend down — ignore silently
      }
    }

    fetchCounts();
    const id = setInterval(fetchCounts, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [pendingCountProp]);

  const pendingCount = pendingCountProp ?? fetchedCount;

  const navItems = [
    { href: '/', label: t.nav.commandCenter, icon: '⚡' },
    { href: '/drafts', label: t.nav.drafts, icon: '📝' },
    { href: '/inbox', label: t.nav.inbox, icon: '📥' },
    { href: '/categories', label: t.nav.rules, icon: '🏷️' },
    { href: '/activity', label: t.nav.activity, icon: '📋' },
  ];

  return (
    <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <span className="font-semibold text-gray-900 dark:text-gray-100 hidden sm:block">CDP Hub</span>
          </div>

          {/* Navigation */}
          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname === item.href
                    ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <span>{item.icon}</span>
                <span className="hidden sm:inline">{item.label}</span>
                {item.href === '/drafts' && pendingCount > 0 && (
                  <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}
                {item.href === '/inbox' && unreadCount > 0 && (
                  <span className="bg-brand-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Link>
            ))}
          </nav>

          {/* User Info + Language + Theme */}
          <div className="flex items-center gap-2">
            {/* Active account indicator — shows dot + email, links to /settings/accounts */}
            {activeAccount && (
              <Link
                href="/settings/accounts"
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
                title={`Aktiva konton — klicka för att hantera`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: activeAccount.color ?? emailColor(activeAccount.emailAddress) }}
                />
                <span className="text-xs text-gray-600 dark:text-gray-300 max-w-[130px] truncate">
                  {activeAccount.emailAddress}
                </span>
                {accounts.length > 1 && (
                  <span className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-1.5 py-0.5 font-semibold">
                    +{accounts.length - 1}
                  </span>
                )}
                <ChevronDown size={11} className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
              </Link>
            )}
            {/* Notification bell */}
            <button
              onClick={requestPermission}
              disabled={permission === 'denied'}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={
                permission === 'granted'
                  ? 'Notifieringar aktiverade'
                  : permission === 'denied'
                  ? 'Notifieringar blockerade i webbläsaren'
                  : 'Aktivera notifieringar'
              }
            >
              {permission === 'granted' ? (
                <Bell className="w-4 h-4 text-brand-500" />
              ) : (
                <BellOff className="w-4 h-4" />
              )}
            </button>
            {/* Dark mode toggle */}
            <button
              onClick={toggleTheme}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <LanguageSwitcher />
            {userEmail && (
              <span className="text-sm text-gray-500 dark:text-gray-400 hidden md:block">{userEmail}</span>
            )}
            <Link
              href="/settings/accounts"
              className="hidden sm:flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors"
            >
              {t.dashboard.addAccount}
            </Link>
            <Link
              href="/settings"
              className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors text-sm"
            >
              {t.nav.settings}
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
