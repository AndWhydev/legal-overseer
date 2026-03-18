'use client';

import React from 'react';
import {
  LayoutDashboard,
  MessageSquare,
  Inbox,
  BellRing,

  Pill,
  Users,
  Handshake,
  ReceiptText,
  ShieldAlert,
  ShieldCheck,
  Activity,
  Film,
  SearchCheck,
  FileSearch,
  FileText,
  Brain,
  DollarSign,
  BarChart3,
  Wrench,
  Settings,
  Monitor,
  Link2,
  Zap,
  Palette,
  Mic,
} from 'lucide-react';
import type { SidebarCategory } from '@/lib/modules/registry';
import type { BadgeCounts } from '@/hooks/use-badge-counts';
import { NotificationBadge } from '@/components/ui/notification-badge';

const ICON_MAP: Record<string, React.ElementType> = {
  dashboard:       LayoutDashboard,
  'command-center': Monitor,
  chat:            MessageSquare,
  inbox:           Inbox,
  'creator-studio': BellRing,

  medications:     Pill,
  contacts:        Users,
  leads:           Handshake,
  invoices:        ReceiptText,
  tenders:         FileSearch,
  meetings:        Mic,
  sentry:          ShieldAlert,
  approvals:       ShieldCheck,
  'ad-scripts':    Film,
  'ai-search':     SearchCheck,
  reports:         FileText,
  knowledge:       Brain,
  costs:           DollarSign,
  analytics:       BarChart3,
  activity:        Activity,
  admin:           Wrench,
  settings:        Settings,
  'settings-connections':  Link2,
  'settings-automations':  Zap,
  'settings-appearance':   Palette,
};

const BADGE_CONFIG: Record<string, { key: keyof BadgeCounts; color: string }> = {
  dashboard: { key: 'overdueTaskCount', color: 'var(--bb-red)' },
  inbox:     { key: 'inbox',           color: 'var(--bb-red)' },
  approvals: { key: 'approvals',       color: 'var(--bb-red)' },
  leads:     { key: 'leads',           color: 'var(--bb-red)' },
  invoices:  { key: 'invoices',        color: 'var(--bb-red)' },
};

interface SidebarPanelProps {
  category: SidebarCategory | null;
  open: boolean;
  activeTabId: string;
  enabledModules: string[];
  badgeCounts: BadgeCounts;
  labelOverrides: Record<string, string>;
  onTabChange: (tabId: string) => void;
}

export function SidebarPanel({
  category,
  open,
  activeTabId,
  enabledModules,
  badgeCounts,
  labelOverrides,
  onTabChange,
}: SidebarPanelProps) {
  if (!category) return null;

  // Filter items to only enabled modules
  const visibleItems = category.items.filter(id => enabledModules.includes(id));

  return (
    <div className={`bb-sidebar-panel${open ? ' bb-sidebar-panel--open' : ''}`}>
      <div className="bb-sidebar-panel__header">
        {category.label}
      </div>
      <nav className="bb-sidebar-panel__nav" aria-label={`${category.label} items`}>
        {visibleItems.map(tabId => {
          const Icon = ICON_MAP[tabId];
          if (!Icon) return null;
          const isActive = tabId === activeTabId;
          const label = labelOverrides[tabId] ?? tabId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

          // Badge
          const badgeDef = BADGE_CONFIG[tabId];
          const badgeCount = badgeDef ? (badgeCounts[badgeDef.key] ?? 0) : 0;

          return (
            <button
              key={tabId}
              onClick={() => onTabChange(tabId)}
              className={`bb-sidebar-panel__item${isActive ? ' bb-sidebar-panel__item--active' : ''}`}
              role="tab"
              id={`tab-${tabId}`}
              aria-selected={isActive}
              aria-controls={`tabpanel-${tabId}`}
              style={{ position: 'relative' }}
            >
              <Icon size={16} strokeWidth={1.8} />
              <span className="bb-sidebar-panel__label">{label}</span>
              {badgeCount > 0 && (
                <NotificationBadge
                  count={badgeCount}
                  color={badgeDef!.color}
                  size="md"
                  className={open ? 'bb-badge--migrate-in' : undefined}
                  ariaLabel={`${label}: ${badgeCount} notifications`}
                />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
