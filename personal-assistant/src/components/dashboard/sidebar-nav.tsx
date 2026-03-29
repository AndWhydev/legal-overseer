'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { BitBitAsciiAvatar } from '@/components/ui/bitbit-ascii-avatar';
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
  IconBolt,
  IconCalendar,
  IconMessageChatbot,
  IconCheckbox,
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
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

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
  tasks: IconCheckbox,
  meetings: IconCalendar,
  sentry: IconShield,
  swarm: IconSwarm,
  workflows: IconBolt,
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

// ─── Flat nav order — direct page links, no collapsible groups ───────────────

const NAV_ITEMS = [
  // Core
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'inbox', label: 'Inbox' },
  { id: 'chat', label: 'Chat' },
  { id: 'tasks', label: 'Tasks' },
  // Business
  { id: 'leads', label: 'Leads' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'tenders', label: 'Tenders' },
  { id: 'meetings', label: 'Meetings' },
  { id: 'approvals', label: 'Approvals' },
  // Intelligence
  { id: 'workflows', label: 'Workflows' },
  { id: 'swarm', label: 'Swarm' },
  { id: 'sentry', label: 'Sentry' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'ai-search', label: 'AI Search' },
  { id: 'ad-scripts', label: 'Ad Scripts' },
  { id: 'reports', label: 'Reports' },
  // Operations
  { id: 'activity', label: 'Activity' },
  { id: 'costs', label: 'Costs' },
  { id: 'monitoring', label: 'Monitoring' },
  { id: 'admin', label: 'Admin' },
  { id: 'beta-admin', label: 'Beta Program' },
];

// ─── Context panel configs (GAIA-style) ──────────────────────────────────────

interface ContextItem {
  icon?: React.ElementType;
  label: string;
  count?: number;
  dot?: string;
}

interface ContextConfig {
  cta?: { label: string; icon: React.ElementType };
  items: ContextItem[];
  sections?: { label: string; items: ContextItem[] }[];
}

function getContextConfig(tabId: string): ContextConfig | null {
  switch (tabId) {
    case 'inbox':
      return {
        cta: { label: 'New Message', icon: IconPlus },
        items: [
          { icon: IconInbox, label: 'Inbox', count: 0 },
          { label: 'Starred' },
          { label: 'Snoozed' },
          { label: 'Archived' },
        ],
        sections: [{
          label: 'Channels',
          items: [
            { label: 'Email' },
            { label: 'WhatsApp' },
            { label: 'SMS' },
            { label: 'Web Chat' },
          ],
        }],
      };
    case 'leads':
      return {
        cta: { label: 'New Lead', icon: IconPlus },
        items: [
          { label: 'All Leads' },
          { label: 'New' },
          { label: 'Contacted' },
          { label: 'Qualified' },
          { label: 'Won' },
          { label: 'Lost' },
        ],
        sections: [{
          label: 'Sources',
          items: [
            { label: 'Organic' },
            { label: 'Referral' },
            { label: 'Paid' },
            { label: 'Social' },
          ],
        }],
      };
    case 'tasks':
      return {
        cta: { label: 'New Task', icon: IconPlus },
        items: [
          { icon: IconInbox, label: 'Inbox', count: 0 },
          { icon: IconCalendar, label: 'Today', count: 0 },
          { label: 'Upcoming', count: 0 },
          { label: 'Completed', count: 0 },
        ],
        sections: [{
          label: 'Priorities',
          items: [
            { label: 'High Priority', dot: 'bg-red-500' },
            { label: 'Medium Priority', dot: 'bg-amber-500' },
            { label: 'Low Priority', dot: 'bg-blue-500' },
          ],
        }],
      };
    case 'invoices':
      return {
        cta: { label: 'New Invoice', icon: IconPlus },
        items: [
          { label: 'All' },
          { label: 'Draft' },
          { label: 'Sent' },
          { label: 'Overdue' },
          { label: 'Paid' },
        ],
      };
    case 'meetings':
      return {
        cta: { label: 'New Event', icon: IconPlus },
        items: [
          { label: 'Today' },
          { label: 'This Week' },
          { label: 'Upcoming' },
        ],
        sections: [{
          label: 'Your Calendars',
          items: [
            { label: 'Primary', dot: 'bg-blue-500' },
            { label: 'Work', dot: 'bg-purple-500' },
            { label: 'Personal', dot: 'bg-green-500' },
          ],
        }],
      };
    case 'chat':
      return {
        cta: { label: 'New Chat', icon: IconPlus },
        items: [
          { label: 'All Chats' },
          { label: 'Unread' },
          { label: 'Starred' },
        ],
      };
    case 'workflows':
      return {
        cta: { label: 'New Workflow', icon: IconPlus },
        items: [
          { label: 'All Workflows' },
          { label: 'Active' },
          { label: 'Paused' },
          { label: 'Draft' },
        ],
        sections: [{
          label: 'Categories',
          items: [
            { label: 'Lead Nurture' },
            { label: 'Follow-up' },
            { label: 'Onboarding' },
            { label: 'Notifications' },
          ],
        }],
      };
    case 'contacts':
      return {
        cta: { label: 'New Contact', icon: IconPlus },
        items: [
          { label: 'All Contacts' },
          { label: 'Clients' },
          { label: 'Prospects' },
          { label: 'Vendors' },
        ],
      };
    case 'monitoring':
      return {
        items: [
          { label: 'Overview' },
          { label: 'Agents' },
          { label: 'API Health' },
          { label: 'Errors' },
        ],
      };
    default:
      return null;
  }
}

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
    <Sidebar collapsible="offcanvas" variant="inset">
      {/* Header: BitBit + Org Switcher (single button) */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                  <div className="relative flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg overflow-hidden bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_2px_4px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.15)]">
                    <Image
                      src="/bitbit-app-icon.png"
                      alt="BitBit"
                      width={32}
                      height={32}
                      priority
                    />
                    <div className="pointer-events-none absolute inset-0 rounded-lg bg-gradient-to-b from-white/20 via-transparent to-black/10" />
                    <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-white/10" />
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
                className="min-w-56 rounded-lg"
                side="right"
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
        {/* Flat nav — direct page links (GAIA-style) */}
        <SidebarGroup>
          <SidebarMenu>
            {NAV_ITEMS.filter(item => enabledModules.includes(item.id)).map(item => {
              const Icon = ICON_MAP[item.id];
              const isActive = item.id === activeTabId;
              const label = tabLabels[item.id] ?? item.label;
              const badgeDef = BADGE_CONFIG[item.id];
              const badgeCount = badgeDef ? (badgeCounts[badgeDef.key] ?? 0) : 0;

              return (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={isActive}
                    onClick={() => handleItemClick(item.id)}
                    tooltip={label}
                  >
                    {Icon && <Icon data-icon />}
                    <span>{label}</span>
                  </SidebarMenuButton>
                  {badgeCount > 0 && (
                    <SidebarMenuBadge>
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                        {badgeCount}
                      </Badge>
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>

        {/* Contextual panel — GAIA-style, changes per active tab */}
        {(() => {
          const ctx = getContextConfig(activeTabId);
          if (!ctx) return null;
          return (
            <>
              <Separator className="mx-2" />
              <SidebarGroup>
                {ctx.cta && (
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <Button variant="default" size="sm" className="w-full justify-start gap-2 mb-1">
                        <ctx.cta.icon className="size-4" />
                        {ctx.cta.label}
                      </Button>
                    </SidebarMenuItem>
                  </SidebarMenu>
                )}
                <SidebarMenu>
                  {ctx.items.map(item => (
                    <SidebarMenuItem key={item.label}>
                      <SidebarMenuButton onClick={() => {}}>
                        {item.dot && <span className={cn('size-2 rounded-full shrink-0', item.dot)} />}
                        {item.icon && <item.icon className="size-4" />}
                        <span>{item.label}</span>
                        {item.count !== undefined && (
                          <span className="ml-auto text-xs text-muted-foreground tabular-nums">{item.count}</span>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
                {ctx.sections?.map(section => (
                  <React.Fragment key={section.label}>
                    <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
                    <SidebarMenu>
                      {section.items.map(item => (
                        <SidebarMenuItem key={item.label}>
                          <SidebarMenuButton onClick={() => {}}>
                            {item.dot && <span className={cn('size-2 rounded-full shrink-0', item.dot)} />}
                            {item.icon && <item.icon className="size-4" />}
                            <span>{item.label}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </React.Fragment>
                ))}
              </SidebarGroup>
            </>
          );
        })()}
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
                  <Avatar className="h-8 w-8 rounded-lg">
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
                className="min-w-56 rounded-lg"
                side="right"
                align="end"
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
