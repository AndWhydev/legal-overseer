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
  IconBuilding,
  IconSelector,
  IconCheck,
  IconPlus,
} from '@tabler/icons-react';
import type { TabDef } from './spa-shell';
import type { SidebarCategory } from '@/lib/modules/registry';
import { getCategoryForTab, SIDEBAR_CATEGORIES } from '@/lib/modules/registry';
import { useEnabledModules } from '@/lib/modules/use-enabled-modules';
import { useBadgeCounts } from '@/hooks/use-badge-counts';
import type { BadgeCounts } from '@/hooks/use-badge-counts';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/animate-ui/components/radix/sidebar';
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

// ---- Org type (inlined from org-switcher) ----

interface Org {
  id: string;
  name: string;
  plan_tier: string;
}

// ---- Props ----

interface SidebarNavProps {
  avatarUrl?: string;
  avatarFallback?: string;
  displayName?: string;
  userEmail?: string;
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
  userEmail,
  onSignOut,
  activeTabId = 'dashboard',
  onTabChange,
  tabs = [],
}: SidebarNavProps) {
  const { modules: enabledModules, composition } = useEnabledModules();
  const badgeCounts = useBadgeCounts('sidebar-badge-counts');

  // ---- Org switcher state (inlined from org-switcher.tsx) ----
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [activeOrg, setActiveOrg] = useState<Org | null>(null);
  const [resolvedEmail, setResolvedEmail] = useState<string | undefined>(userEmail);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    let cancelled = false;

    async function fetchOrgs() {
      const { data: { user } } = await supabase!.auth.getUser();
      if (!user || cancelled) return;

      // Resolve email client-side if not provided via props
      if (!userEmail && user.email) {
        setResolvedEmail(user.email);
      }

      const { data: profile } = await supabase!
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .single();

      const { data: userOrgs } = await supabase!
        .from('organisations')
        .select('id, name, plan_tier')
        .order('name');

      if (userOrgs && !cancelled) {
        setOrgs(userOrgs);
        const current = userOrgs.find(o => o.id === profile?.org_id) ?? userOrgs[0] ?? null;
        setActiveOrg(current);
      }
    }

    fetchOrgs();
    return () => { cancelled = true; };
  }, [userEmail]);

  const switchOrg = useCallback(async (orgId: string) => {
    const supabase = createClient();
    if (!supabase) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('profiles').update({ org_id: orgId }).eq('id', user.id);
    const switched = orgs.find(o => o.id === orgId) ?? null;
    setActiveOrg(switched);
  }, [orgs]);

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

  // Resolve display email
  const email = userEmail || resolvedEmail;

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      {/* Header: BitBit + Org Switcher (single button) */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                  <div className="flex size-8 items-center justify-center rounded-lg overflow-hidden">
                    <Image
                      src="/bitbit-app-icon.png"
                      alt="BitBit"
                      width={32}
                      height={32}
                      priority
                    />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">BitBit</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {activeOrg?.name ?? 'Personal'}
                    </span>
                  </div>
                  <IconSelector className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side="bottom"
                align="start"
                sideOffset={4}
              >
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Teams
                </DropdownMenuLabel>
                {orgs.map((org) => (
                  <DropdownMenuItem
                    key={org.id}
                    onClick={() => switchOrg(org.id)}
                    className="gap-2 p-2"
                  >
                    <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                      <IconBuilding className="size-4 shrink-0" />
                    </div>
                    <span className="truncate">{org.name}</span>
                    {org.id === activeOrg?.id && (
                      <IconCheck className="ml-auto size-4 shrink-0" />
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2 p-2">
                  <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                    <IconPlus className="size-4 shrink-0" />
                  </div>
                  Add team
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Home — standalone, no section label */}
        {visibleCategories.filter(c => c.directNav).map(cat => {
          const CatIcon = CATEGORY_ICON_MAP[cat.icon];
          const catBadge = getCategoryBadge(cat);
          return (
            <SidebarGroup key={cat.id} className="py-0">
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
        })}

        {/* Platform — collapsible groups with section label */}
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarMenu>
            {visibleCategories.filter(c => !c.directNav && c.id !== 'settings').map(cat => {
              const CatIcon = CATEGORY_ICON_MAP[cat.icon];
              const isOpen = openGroups.has(cat.id);
              const catBadge = getCategoryBadge(cat);
              const visibleItems = cat.items.filter(id => enabledModules.includes(id));

              return (
                <Collapsible key={cat.id} open={isOpen} onOpenChange={() => toggleGroup(cat.id)} className="group/collapsible">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton tooltip={cat.label}>
                        {CatIcon && <CatIcon data-icon />}
                        <span>{cat.label}</span>
                        {catBadge > 0 && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 mr-1">
                            {catBadge}
                          </Badge>
                        )}
                        <IconChevronDown
                          className={cn(
                            'ml-auto transition-transform duration-200',
                            !isOpen && '-rotate-90',
                          )}
                        />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="animate-collapsible-content">
                      <SidebarMenuSub>
                        {visibleItems.map(tabId => {
                          const isActive = tabId === activeTabId;
                          const label =
                            tabLabels[tabId] ??
                            tabId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                          const badgeDef = BADGE_CONFIG[tabId];
                          const badgeCount = badgeDef ? (badgeCounts[badgeDef.key] ?? 0) : 0;

                          return (
                            <SidebarMenuSubItem key={tabId}>
                              <SidebarMenuSubButton
                                isActive={isActive}
                                onClick={() => handleItemClick(tabId)}
                              >
                                <span>{label}</span>
                                {badgeCount > 0 && (
                                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0 ml-auto">
                                    {badgeCount}
                                  </Badge>
                                )}
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>

        {/* Settings — flat items with section label */}
        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarMenu>
            {SIDEBAR_CATEGORIES.find(c => c.id === 'settings')
              ?.items.filter(id => enabledModules.includes(id))
              .map(tabId => {
                const Icon = ICON_MAP[tabId];
                const isActive = tabId === activeTabId;
                const label =
                  tabLabels[tabId] ??
                  tabId.replace(/^settings-/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

                return (
                  <SidebarMenuItem key={tabId}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => handleItemClick(tabId)}
                      tooltip={label}
                    >
                      {Icon && <Icon data-icon />}
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
          </SidebarMenu>
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
                  <Avatar className="size-8 rounded-lg">
                    {avatarUrl && <AvatarImage src={avatarUrl} alt="User avatar" />}
                    <AvatarFallback className="rounded-lg">{avatarFallback}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {displayName || 'User'}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {activeOrg?.plan_tier ?? 'Free'} plan
                    </span>
                  </div>
                  <IconSelector className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side="top"
                align="start"
                sideOffset={4}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar className="size-8 rounded-lg">
                      {avatarUrl && <AvatarImage src={avatarUrl} alt="User avatar" />}
                      <AvatarFallback className="rounded-lg">{avatarFallback}</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">
                        {displayName || 'User'}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {activeOrg?.plan_tier ?? 'Free'} plan
                      </span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onTabChange?.('settings-connections')}
                >
                  <IconSettings className="size-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onTabChange?.('settings-billing')}
                >
                  <IconCurrencyDollar className="size-4" />
                  Billing
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <IconBell className="size-4" />
                  Notifications
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onSignOut?.()}>
                  <IconLogout className="size-4" />
                  Log out
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
