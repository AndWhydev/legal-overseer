'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import {
  IconSettings,
  IconLogout,
  IconLayoutDashboard,
  IconMessage,
  IconBriefcase,
  IconBrain,
  IconTool,
  IconChevronDown,
  IconInbox,
  IconBell,
  IconUsers,
  IconHeartHandshake,
  IconReceipt,
  IconFileSearch,
  IconMicrophone,
  IconShieldCheck,
  IconShield,
  IconMovie,
  IconSearch,
  IconFileText,
  IconCurrencyDollar,
  IconChartBar,
  IconActivity,
  IconTerminal,
  IconLink,
  IconPuzzle,
  IconPalette,
  IconDeviceDesktop,
  IconPill,
  IconBug,
  IconUsers as IconSwarm,
} from '@tabler/icons-react';
import type { TabDef } from './spa-shell';
import type { SidebarCategory } from '@/lib/modules/registry';
import { getCategoryForTab, SIDEBAR_CATEGORIES } from '@/lib/modules/registry';
import { useEnabledModules } from '@/lib/modules/use-enabled-modules';
import { useBadgeCounts } from '@/hooks/use-badge-counts';
import type { BadgeCounts } from '@/hooks/use-badge-counts';
import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';

// ---- Icon map: tab/module ID -> Tabler icon ----

const ICON_MAP: Record<string, React.ElementType> = {
  dashboard: IconLayoutDashboard,
  'command-center': IconDeviceDesktop,
  chat: IconMessage,
  inbox: IconInbox,
  'creator-studio': IconBell,
  medications: IconPill,
  contacts: IconUsers,
  leads: IconHeartHandshake,
  invoices: IconReceipt,
  tenders: IconFileSearch,
  meetings: IconMicrophone,
  sentry: IconShield,
  swarm: IconSwarm,
  approvals: IconShieldCheck,
  'ad-scripts': IconMovie,
  'ai-search': IconSearch,
  reports: IconFileText,
  knowledge: IconBrain,
  costs: IconCurrencyDollar,
  analytics: IconChartBar,
  activity: IconActivity,
  admin: IconTerminal,
  monitoring: IconBug,
  'beta-admin': IconBug,
  'settings-connections': IconLink,
  'settings-automations': IconPuzzle,
  'settings-appearance': IconPalette,
  'settings-billing': IconCurrencyDollar,
};

const CATEGORY_ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard: IconLayoutDashboard,
  MessageSquare: IconMessage,
  Briefcase: IconBriefcase,
  Brain: IconBrain,
  Wrench: IconTool,
  Settings: IconSettings,
};

// Badge config: which tab IDs show badge counts
const BADGE_CONFIG: Record<string, { key: keyof BadgeCounts }> = {
  dashboard: { key: 'overdueTaskCount' },
  inbox: { key: 'inbox' },
  approvals: { key: 'approvals' },
  leads: { key: 'leads' },
  invoices: { key: 'invoices' },
};

// ---- Props ----

interface SidebarNavProps {
  avatarUrl?: string;
  avatarFallback?: string;
  displayName?: string;
  onSignOut?: () => void;
  activeTabId?: string;
  onTabChange?: (tabId: string) => void;
  tabs?: TabDef[];
}

// ---- Component ----

export function SidebarNav({
  avatarUrl,
  avatarFallback = 'U',
  displayName,
  onSignOut,
  activeTabId = 'dashboard',
  onTabChange,
  tabs = [],
}: SidebarNavProps) {
  const { modules: enabledModules, composition } = useEnabledModules();
  const badgeCounts = useBadgeCounts('sidebar-badge-counts');

  // Track which category groups are open
  const activeCategory = getCategoryForTab(activeTabId) ?? 'home';
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set([activeCategory]));

  // Keep active category group open when tab changes
  useEffect(() => {
    const cat = getCategoryForTab(activeTabId);
    if (cat && !openGroups.has(cat)) {
      setOpenGroups(prev => new Set(prev).add(cat));
    }
  }, [activeTabId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter categories by enabled modules
  const visibleCategories = composition.categories
    .map(cat => ({
      ...cat,
      items: cat.items.filter(id => enabledModules.includes(id)),
    }))
    .filter(cat => cat.items.length > 0);

  // Build label lookup from tabs
  const tabLabels: Record<string, string> = {};
  tabs.forEach(t => {
    tabLabels[t.id] = composition.labelOverrides[t.id] ?? t.label;
  });

  const handleItemClick = useCallback(
    (tabId: string) => {
      onTabChange?.(tabId);
    },
    [onTabChange],
  );

  const toggleGroup = useCallback((groupId: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  // Aggregate badge count for a category
  const getCategoryBadge = (cat: SidebarCategory): number => {
    return cat.items.reduce((sum, id) => {
      const cfg = BADGE_CONFIG[id];
      if (cfg) sum += badgeCounts[cfg.key] ?? 0;
      return sum;
    }, 0);
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      {/* Logo header */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="pointer-events-none">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Image
                  src="/bitbit-logo.svg"
                  alt="BitBit"
                  width={20}
                  height={20}
                  priority
                  className="invert dark:invert-0"
                />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">BitBit</span>
                <span className="truncate text-xs text-muted-foreground">AI Operations</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {visibleCategories.map(cat => {
          const CatIcon = CATEGORY_ICON_MAP[cat.icon];
          const isOpen = openGroups.has(cat.id);
          const catBadge = getCategoryBadge(cat);

          // Direct-nav categories (Home) navigate directly
          if (cat.directNav) {
            return (
              <SidebarGroup key={cat.id}>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={activeTabId === cat.directNav}
                      onClick={() => handleItemClick(cat.directNav!)}
                      tooltip={cat.label}
                    >
                      {CatIcon && <CatIcon data-icon />}
                      <span>{cat.label}</span>
                    </SidebarMenuButton>
                    {catBadge > 0 && (
                      <SidebarMenuBadge>
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                          {catBadge}
                        </Badge>
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>
            );
          }

          // Collapsible category groups
          return (
            <Collapsible
              key={cat.id}
              open={isOpen}
              onOpenChange={() => toggleGroup(cat.id)}
              className="group/collapsible"
            >
              <SidebarGroup>
                <SidebarGroupLabel asChild>
                  <CollapsibleTrigger className="flex w-full items-center gap-2">
                    {CatIcon && <CatIcon data-icon />}
                    <span className="flex-1 text-left">{cat.label}</span>
                    {catBadge > 0 && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0 mr-1">
                        {catBadge}
                      </Badge>
                    )}
                    <IconChevronDown
                      data-icon
                      className={cn(
                        'transition-transform duration-200',
                        isOpen && 'rotate-180',
                      )}
                    />
                  </CollapsibleTrigger>
                </SidebarGroupLabel>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {cat.items
                        .filter(id => enabledModules.includes(id))
                        .map(tabId => {
                          const Icon = ICON_MAP[tabId];
                          const isActive = tabId === activeTabId;
                          const label =
                            tabLabels[tabId] ??
                            tabId
                              .replace(/-/g, ' ')
                              .replace(/\b\w/g, c => c.toUpperCase());

                          const badgeDef = BADGE_CONFIG[tabId];
                          const badgeCount = badgeDef
                            ? (badgeCounts[badgeDef.key] ?? 0)
                            : 0;

                          return (
                            <SidebarMenuItem key={tabId}>
                              <SidebarMenuButton
                                isActive={isActive}
                                onClick={() => handleItemClick(tabId)}
                                tooltip={label}
                                role="tab"
                                id={`tab-${tabId}`}
                                aria-selected={isActive}
                                aria-controls={`tabpanel-${tabId}`}
                              >
                                {Icon && <Icon data-icon />}
                                <span>{label}</span>
                              </SidebarMenuButton>
                              {badgeCount > 0 && (
                                <SidebarMenuBadge>
                                  <Badge
                                    variant="destructive"
                                    className="text-[10px] px-1.5 py-0"
                                  >
                                    {badgeCount}
                                  </Badge>
                                </SidebarMenuBadge>
                              )}
                            </SidebarMenuItem>
                          );
                        })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          );
        })}

        {/* Settings group -- always at bottom of content */}
        <SidebarSeparator />
        <SidebarGroup>
          <SidebarGroupLabel>
            <IconSettings data-icon />
            <span>Settings</span>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {SIDEBAR_CATEGORIES.find(c => c.id === 'settings')
                ?.items.filter(id => enabledModules.includes(id))
                .map(tabId => {
                  const Icon = ICON_MAP[tabId];
                  const isActive = tabId === activeTabId;
                  const label =
                    tabLabels[tabId] ??
                    tabId
                      .replace(/^settings-/, '')
                      .replace(/-/g, ' ')
                      .replace(/\b\w/g, c => c.toUpperCase());

                  return (
                    <SidebarMenuItem key={tabId}>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => handleItemClick(tabId)}
                        tooltip={label}
                        role="tab"
                        id={`tab-${tabId}`}
                        aria-selected={isActive}
                        aria-controls={`tabpanel-${tabId}`}
                      >
                        {Icon && <Icon data-icon />}
                        <span>{label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer: user profile dropdown */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
                >
                  <Avatar size="sm">
                    {avatarUrl && <AvatarImage src={avatarUrl} alt="User avatar" />}
                    <AvatarFallback>{avatarFallback}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {displayName || 'User'}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      Account
                    </span>
                  </div>
                  <IconChevronDown data-icon className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
                side="top"
                align="start"
                sideOffset={4}
              >
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium leading-none">
                      {displayName || 'User'}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      Account settings
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    onTabChange?.('settings-connections');
                  }}
                >
                  <IconSettings data-icon />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onSignOut?.()}>
                  <IconLogout data-icon />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export default SidebarNav;
