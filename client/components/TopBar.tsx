'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import LanguageSwitcher from './LanguageSwitcher';

interface TopBarProps {
  pendingCount?: number;
  userEmail?: string;
}

export default function TopBar({ pendingCount = 0, userEmail }: TopBarProps) {
  const pathname = usePathname();
  const { t } = useI18n();

  const navItems = [
    { href: '/', label: t.nav.commandCenter, icon: '⚡' },
    { href: '/drafts', label: t.nav.drafts, icon: '📝' },
    { href: '/inbox', label: t.nav.inbox, icon: '📥' },
    { href: '/categories', label: t.nav.rules, icon: '🏷️' },
  ];

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <span className="font-semibold text-gray-900 hidden sm:block">CDP Hub</span>
          </div>

          {/* Navigation */}
          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname === item.href
                    ? 'bg-brand-50 text-brand-600'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span>{item.icon}</span>
                <span className="hidden sm:inline">{item.label}</span>
                {item.href === '/drafts' && pendingCount > 0 && (
                  <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {pendingCount}
                  </span>
                )}
              </Link>
            ))}
          </nav>

          {/* User Info + Language */}
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            {userEmail && (
              <span className="text-sm text-gray-500 hidden md:block">{userEmail}</span>
            )}
            <Link
              href="/settings"
              className="text-gray-400 hover:text-gray-600 transition-colors text-sm"
            >
              {t.nav.settings}
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
