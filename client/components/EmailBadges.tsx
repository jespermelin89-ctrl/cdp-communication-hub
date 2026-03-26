'use client';

import { useState, useRef, useEffect } from 'react';
import { api } from '@/lib/api';

// Badge definitions
export const BADGE_CONFIG: Record<string, { icon: string; label: string; description: string; color: string }> = {
  multi_person: {
    icon: '👥',
    label: 'Flera personer',
    description: 'Denna mail hanteras av flera personer',
    color: '#3B82F6',
  },
  ai_managed: {
    icon: '🤖',
    label: 'AI-styrd',
    description: 'Denna mail hanteras helt av AI',
    color: '#8B5CF6',
  },
  shared_inbox: {
    icon: '📬',
    label: 'Delad inkorg',
    description: 'Delad inkorg med team-åtkomst',
    color: '#F59E0B',
  },
};

// ============================================================
// Badge Icons - Displayed inline next to email addresses
// ============================================================
export function BadgeIcons({ badges, size = 'sm' }: { badges: string[]; size?: 'sm' | 'md' | 'lg' }) {
  if (!badges || badges.length === 0) return null;

  const sizeClass = size === 'sm' ? 'text-sm' : size === 'md' ? 'text-base' : 'text-lg';

  return (
    <span className="inline-flex items-center gap-0.5 ml-1">
      {badges.map((badge) => {
        const config = BADGE_CONFIG[badge];
        if (!config) return null;
        return (
          <span
            key={badge}
            title={config.description}
            className={`${sizeClass} cursor-help transition-transform hover:scale-110`}
          >
            {config.icon}
          </span>
        );
      })}
    </span>
  );
}

// ============================================================
// Badge Context Menu - Right-click on an email to toggle badges
// ============================================================
interface BadgeContextMenuProps {
  accountId: string;
  currentBadges: string[];
  onBadgesChanged: (badges: string[]) => void;
  children: React.ReactNode;
}

export function BadgeContextMenu({ accountId, currentBadges, onBadgesChanged, children }: BadgeContextMenuProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [loading, setLoading] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setMenuPos({ x: e.clientX, y: e.clientY });
    setShowMenu(true);
  }

  async function toggleBadge(badge: string) {
    setLoading(badge);
    try {
      const hasBadge = currentBadges.includes(badge);
      if (hasBadge) {
        await api.removeBadge(accountId, badge);
        onBadgesChanged(currentBadges.filter((b) => b !== badge));
      } else {
        await api.addBadge(accountId, badge);
        onBadgesChanged([...currentBadges, badge]);
      }
    } catch (err) {
      console.error('Failed to toggle badge:', err);
    } finally {
      setLoading(null);
      setShowMenu(false);
    }
  }

  return (
    <div onContextMenu={handleContextMenu} className="relative">
      {children}

      {showMenu && (
        <div
          ref={menuRef}
          style={{ position: 'fixed', left: menuPos.x, top: menuPos.y, zIndex: 9999 }}
          className="bg-white rounded-lg shadow-xl border border-gray-200 py-2 min-w-[220px]"
        >
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            E-post badges
          </div>
          {Object.entries(BADGE_CONFIG).map(([key, config]) => {
            const isActive = currentBadges.includes(key);
            const isLoading = loading === key;
            return (
              <button
                key={key}
                onClick={() => toggleBadge(key)}
                disabled={isLoading}
                className={`w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-gray-50 transition-colors text-sm ${
                  isActive ? 'bg-blue-50' : ''
                } ${isLoading ? 'opacity-50' : ''}`}
              >
                <span className="text-base">{config.icon}</span>
                <span className="flex-1 text-gray-700">{config.label}</span>
                {isActive && (
                  <span className="text-blue-500 text-xs font-medium">✓ Aktiv</span>
                )}
              </button>
            );
          })}
          <div className="border-t border-gray-100 mt-1 pt-1">
            <button
              onClick={() => setShowMenu(false)}
              className="w-full px-3 py-1.5 text-left text-xs text-gray-400 hover:bg-gray-50"
            >
              Stäng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Badge Manager - Full badge management panel for settings
// ============================================================
interface BadgeManagerProps {
  accountId: string;
  currentBadges: string[];
  onBadgesChanged: (badges: string[]) => void;
}

export function BadgeManager({ accountId, currentBadges, onBadgesChanged }: BadgeManagerProps) {
  const [loading, setLoading] = useState<string | null>(null);

  async function toggleBadge(badge: string) {
    setLoading(badge);
    try {
      const hasBadge = currentBadges.includes(badge);
      if (hasBadge) {
        await api.removeBadge(accountId, badge);
        onBadgesChanged(currentBadges.filter((b) => b !== badge));
      } else {
        await api.addBadge(accountId, badge);
        onBadgesChanged([...currentBadges, badge]);
      }
    } catch (err) {
      console.error('Failed to toggle badge:', err);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">Badges</label>
      <div className="flex flex-wrap gap-2">
        {Object.entries(BADGE_CONFIG).map(([key, config]) => {
          const isActive = currentBadges.includes(key);
          const isLoading = loading === key;
          return (
            <button
              key={key}
              onClick={() => toggleBadge(key)}
              disabled={isLoading}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                isActive
                  ? 'bg-blue-100 text-blue-800 border-2 border-blue-300'
                  : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
              } ${isLoading ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
              title={config.description}
            >
              <span>{config.icon}</span>
              <span>{config.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
