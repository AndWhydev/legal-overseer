'use client';

import React from 'react';
import {
  MessageSquare,
  Inbox,
  Handshake,
  ShieldCheck,
  Settings,
} from 'lucide-react';
import type { TabDef } from './spa-shell';
import { useEnabledModules } from '@/lib/modules/use-enabled-modules';
import { useBadgeCounts } from '@/hooks/use-badge-counts';
import type { BadgeCounts } from '@/hooks/use-badge-counts';
import { NotificationBadge } from '@/components/ui/notification-badge';

// ─── Fixed bottom nav items (5 most-used) ────────────────────────────────────

const BOTTOM_NAV_ITEMS: { id: string; label: string; icon: React.ElementType }[] = [
  { id: 'chat',      label: 'Chat',      icon: MessageSquare },
  { id: 'inbox',     label: 'Inbox',     icon: Inbox },
  { id: 'leads',     label: 'Leads',     icon: Handshake },
  { id: 'approvals', label: 'Approvals', icon: ShieldCheck },
  { id: 'settings-connections', label: 'Settings', icon: Settings },
];

const BADGE_CONFIG: Record<string, { key: keyof BadgeCounts; color: string }> = {
  approvals: { key: 'approvals', color: 'var(--bb-orange)' },
  leads:     { key: 'leads',     color: 'var(--bb-blue)' },
};

// ─── Props ──────────────────────────────────────────────────────────────────

interface BottomNavProps {
  avatarUrl?: string;
  avatarFallback?: string;
  displayName?: string;
  onSignOut?: () => void;
  activeTabId?: string;
  onTabChange?: (tabId: string) => void;
  tabs?: TabDef[];
}

// ─── Component ──────────────────────────────────────────────────────────────

export function BottomNav({
  activeTabId = 'dashboard',
  onTabChange,
}: BottomNavProps) {
  const { modules: enabledModules, composition } = useEnabledModules();
  const badgeCounts = useBadgeCounts('bottom-nav-badge-counts');

  // Filter to only enabled modules
  const visibleItems = BOTTOM_NAV_ITEMS.filter(item => enabledModules.includes(item.id));

  return (
    <nav
      className="bb-bottom-nav"
      role="tablist"
      aria-label="Dashboard sections"
      aria-orientation="horizontal"
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'stretch',
        justifyContent: 'space-around',
        width: '100%',
        height: '100%',
        background: 'var(--bg-primary)',
        borderTop: '1px solid var(--glass-interactive-border)',
        padding: '0 4px',
        paddingBottom: 'env(safe-area-inset-bottom)',
        gap: '4px',
      }}
    >
      {visibleItems.map(item => {
        const Icon = item.icon;
        const active = item.id === activeTabId;
        const activeColor = active ? '#FF5A1F' : 'var(--text-secondary)';
        const label = composition.labelOverrides[item.id] ?? item.label;

        const badgeDef = BADGE_CONFIG[item.id];
        const badgeCount = badgeDef ? badgeCounts[badgeDef.key] : 0;

        return (
          <button
            key={item.id}
            onClick={() => onTabChange?.(item.id)}
            className="bb-bottom-nav__item"
            role="tab"
            id={`bottom-tab-${item.id}`}
            aria-selected={active}
            aria-controls={`tabpanel-${item.id}`}
            aria-label={label}
            style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              width: '100%',
              height: '100%',
              padding: '0',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: activeColor,
              transition: 'color 0.15s ease',
            }}
          >
            <Icon size={20} strokeWidth={1.8} style={{ color: activeColor }} />
            <span
              style={{
                fontSize: '14px',
                fontWeight: active ? 600 : 500,
                color: activeColor,
                lineHeight: 1,
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                overflow: 'hidden',
                maxWidth: '100%',
              }}
            >
              {label}
            </span>
            {badgeCount > 0 && (
              <NotificationBadge
                count={badgeCount}
                color={badgeDef!.color}
                size="sm"
                maxDisplay={99}
                ariaLabel={`${label}: ${badgeCount} notifications`}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}

export default BottomNav;
