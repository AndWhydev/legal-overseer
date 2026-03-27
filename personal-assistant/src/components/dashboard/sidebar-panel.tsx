'use client';

/**
 * SidebarPanel — legacy compatibility export.
 *
 * The sidebar redesign (shadcn Sidebar) now renders all navigation items
 * inline via collapsible groups in sidebar-nav.tsx. This file is kept so
 * existing imports don't break, but it renders nothing.
 */

import type { SidebarCategory } from '@/lib/modules/registry';
import type { BadgeCounts } from '@/hooks/use-badge-counts';

interface SidebarPanelProps {
  category: SidebarCategory | null;
  open: boolean;
  activeTabId: string;
  enabledModules: string[];
  badgeCounts: BadgeCounts;
  labelOverrides: Record<string, string>;
  onTabChange: (tabId: string) => void;
}

export function SidebarPanel(_props: SidebarPanelProps) {
  // All panel functionality is now handled by the collapsible groups
  // inside SidebarNav (sidebar-nav.tsx).
  return null;
}
