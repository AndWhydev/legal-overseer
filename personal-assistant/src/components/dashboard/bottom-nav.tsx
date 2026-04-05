'use client';

import React from 'react';
import {
  IconMessage,
  IconInbox,
  IconHeartHandshake,
  IconShieldCheck,
  IconSettings,
} from '@tabler/icons-react';
import type { TabDef } from './spa-shell';
import { useEnabledModules } from '@/lib/modules/use-enabled-modules';
import { useBadgeCounts } from '@/hooks/use-badge-counts';
import type { BadgeCounts } from '@/hooks/use-badge-counts';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

// Fixed bottom nav items (5 most-used)
const BOTTOM_NAV_ITEMS: { id: string; label: string; icon: React.ElementType }[] = [
  { id: 'chat', label: 'Chat', icon: IconMessage },
  { id: 'inbox', label: 'Inbox', icon: IconInbox },
  { id: 'leads', label: 'Leads', icon: IconHeartHandshake },
  { id: 'approvals', label: 'Approvals', icon: IconShieldCheck },
  { id: 'settings-connections', label: 'Settings', icon: IconSettings },
];

const BADGE_CONFIG: Record<string, { key: keyof BadgeCounts }> = {
  approvals: { key: 'approvals' },
  leads: { key: 'leads' },
};

// Props
interface BottomNavProps {
  avatarUrl?: string;
  avatarFallback?: string;
  displayName?: string;
  onSignOut?: () => void;
  activeTabId?: string;
  onTabChange?: (tabId: string) => void;
  tabs?: TabDef[];
}

// Component
export function BottomNav({
  activeTabId = 'dashboard',
  onTabChange,
}: BottomNavProps) {
  const { modules: enabledModules, composition } = useEnabledModules();
  const badgeCounts = useBadgeCounts('bottom-nav-badge-counts');

  // Filter to only enabled modules
  const visibleItems = BOTTOM_NAV_ITEMS.filter(item =>
    enabledModules.includes(item.id),
  );

  return (
    <nav
      className="bb-bottom-nav flex w-full items-stretch justify-around border-t border-border bg-background px-1 pb-[env(safe-area-inset-bottom)]"
      role="tablist"
      aria-label="Dashboard sections"
      aria-orientation="horizontal"
    >
      {visibleItems.map(item => {
        const Icon = item.icon;
        const active = item.id === activeTabId;
        const label = composition.labelOverrides[item.id] ?? item.label;

        const badgeDef = BADGE_CONFIG[item.id];
        const badgeCount = badgeDef ? badgeCounts[badgeDef.key] : 0;

        return (
          <button
            key={item.id}
            onClick={() => onTabChange?.(item.id)}
            className={cn(
              'bb-bottom-nav__item relative flex flex-1 flex-col items-center justify-center gap-1 bg-transparent border-none cursor-pointer transition-colors',
              active
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
            role="tab"
            id={`bottom-tab-${item.id}`}
            aria-selected={active}
            aria-controls={`tabpanel-${item.id}`}
            aria-label={label}
          >
            <div className="relative">
              <Icon data-icon />
              {badgeCount > 0 && (
                <Badge
                  variant="destructive"
                  className="absolute -top-2 -right-3 text-sm px-1 py-0 min-w-4 h-4 flex items-center justify-center"
                >
                  {badgeCount > 99 ? '99+' : badgeCount}
                </Badge>
              )}
            </div>
            <span
              className={cn(
                'text-sm leading-none truncate max-w-full',
                active ? 'font-medium' : 'font-medium',
              )}
            >
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export default BottomNav;
