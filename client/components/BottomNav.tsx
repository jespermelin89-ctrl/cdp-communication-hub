'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Inbox, FileText, Bell, Settings, PenSquare, Users } from 'lucide-react';
import useSWR from 'swr';
import { api } from '@/lib/api';

const LAST_SEEN_KEY = 'notifications_last_seen';

interface NavItemProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  active: boolean;
}

function NavItem({ href, icon, label, badge, active }: NavItemProps) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-2 px-1 relative transition-colors ${
        active
          ? 'text-brand-600 dark:text-brand-400'
          : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
      }`}
    >
      <div className="relative">
        {icon}
        {badge != null && badge > 0 && (
          <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </div>
      <span className={`text-[10px] font-medium ${active ? 'text-brand-600 dark:text-brand-400' : ''}`}>
        {label}
      </span>
      {active && (
        <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-brand-500 rounded-full" />
      )}
    </Link>
  );
}

export default function BottomNav() {
  const pathname = usePathname();
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  // Fetch command-center counts — silently fails if not authenticated
  const { data: cmdData } = useSWR(
    'cmd-center-nav',
    () => api.getCommandCenter(),
    {
      refreshInterval: 60_000,
      shouldRetryOnError: false,
      revalidateOnFocus: false,
    }
  );

  // Fetch action logs to count unseen notifications
  const { data: logsData } = useSWR(
    'action-logs-nav',
    () => api.getActionLogs({ limit: 50 }),
    { refreshInterval: 120_000, shouldRetryOnError: false, revalidateOnFocus: false }
  );

  useEffect(() => {
    if (!logsData?.logs) return;
    const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
    if (!lastSeen) {
      // First visit — treat all as new (cap at 9)
      setUnreadAlerts(Math.min(logsData.logs.length, 9));
      return;
    }
    const lastSeenDate = new Date(lastSeen);
    const unseen = logsData.logs.filter((l: any) => new Date(l.createdAt) > lastSeenDate).length;
    setUnreadAlerts(Math.min(unseen, 99));
  }, [logsData]);

  // Reset badge when notifications page is active
  useEffect(() => {
    if (pathname === '/notifications') setUnreadAlerts(0);
  }, [pathname]);

  // Extract counts from command-center response
  const unreadCount: number = (cmdData as any)?.overview?.unread_threads ?? 0;
  const pendingCount: number = (cmdData as any)?.overview?.pending_drafts ?? 0;

  return (
    // Only visible on mobile — desktop uses sidebar / TopBar
    <nav
      aria-label="Navigering"
      className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700 flex items-stretch"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* Compose FAB — centered above the nav bar */}
      <Link
        href="/compose"
        aria-label="Nytt mail"
        className="absolute -top-6 left-1/2 -translate-x-1/2 w-12 h-12 bg-brand-500 hover:bg-brand-600 text-white rounded-2xl shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
      >
        <PenSquare size={20} />
      </Link>

      <NavItem
        href="/inbox"
        icon={<Inbox size={20} />}
        label="Inkorg"
        badge={unreadCount}
        active={pathname === '/inbox' || pathname.startsWith('/inbox/')}
      />
      <NavItem
        href="/drafts"
        icon={<FileText size={20} />}
        label="Utkast"
        badge={pendingCount}
        active={pathname === '/drafts' || pathname.startsWith('/drafts/')}
      />
      {/* Empty slot — FAB sits here visually */}
      <div className="flex-1" aria-hidden />
      <NavItem
        href="/contacts"
        icon={<Users size={20} />}
        label="Kontakter"
        active={pathname === '/contacts' || pathname.startsWith('/contacts/')}
      />
      <NavItem
        href="/settings"
        icon={<Settings size={20} />}
        label="Inställningar"
        active={pathname === '/settings'}
      />
    </nav>
  );
}
