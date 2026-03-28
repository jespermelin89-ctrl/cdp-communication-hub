'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Inbox, FileText, Brain, Settings } from 'lucide-react';
import useSWR from 'swr';
import { api } from '@/lib/api';

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

  // Extract counts from command-center response (may vary by backend)
  const unreadCount: number = (cmdData as any)?.unread_count ?? (cmdData as any)?.unread ?? 0;
  const pendingCount: number = (cmdData as any)?.pending_drafts ?? (cmdData as any)?.pending ?? 0;

  return (
    // Only visible on mobile — desktop uses sidebar / TopBar
    <nav
      className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700 flex items-stretch"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
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
      <NavItem
        href="/settings/brain-core"
        icon={<Brain size={20} />}
        label="Brain"
        active={pathname.startsWith('/settings/brain-core')}
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
