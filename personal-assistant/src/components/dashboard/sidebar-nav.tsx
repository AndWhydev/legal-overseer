'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  IconClockPause,
  IconSend,
  IconFlag,
  IconAlertOctagon,
  IconCalendarEvent,
  IconTrash,
  IconFileText as IconDraft,
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
  SidebarMenuAction,
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
import { ChatSidebarPanel } from '@/components/chat/chat-sidebar-panel';
import { SidebarContextTransition } from './sidebar-context-transition';
import { PixelWordmark } from '@/components/ui/pixel-heading-word';

// ---- Icon map: tab/module ID -> Tabler icon ----

const ICON_MAP: Record<string, React.ElementType> = {
  dashboard: IconLayoutDashboard,
  'command-center': IconDeviceDesktop,
  chat: IconMessage,
  inbox: IconInbox,
  'creator-studio': IconBell,
  companies: IconBuilding,
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
  { id: 'companies', label: 'Companies' },
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
  ctaCompact?: boolean;
  items: ContextItem[];
  sections?: { label: string; items: ContextItem[] }[];
}

function getContextConfig(tabId: string): ContextConfig | null {
  switch (tabId) {
    case 'inbox':
      return {
        cta: { label: 'New Message', icon: IconPlus },
        ctaCompact: true,
        items: [
          { icon: IconInbox, label: 'Inbox', count: 0 },
          { icon: IconClockPause, label: 'Snoozed' },
          { icon: IconSend, label: 'Sent' },
          { icon: IconDraft, label: 'Draft' },
          { icon: IconAlertOctagon, label: 'Spam' },
          { icon: IconFlag, label: 'Important' },
          { icon: IconCalendarEvent, label: 'Scheduled' },
          { icon: IconTrash, label: 'Trash' },
        ],
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
  plan: string;
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

      const { data: memberships } = await supabase!
        .from('org_members')
        .select('org_id')
        .eq('user_id', user.id);

      const orgIds = memberships?.map(m => m.org_id) ?? [];

      const { data: userOrgs } = orgIds.length > 0
        ? await supabase!
            .from('organisations')
            .select('id, name, plan')
            .in('id', orgIds)
            .order('name')
        : { data: [] as Org[] };

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
  const sidebarContentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sidebarContentRef.current;
    if (el && el.scrollTop !== 0) {
      el.scrollTop = 0;
    }
  }, [activeTabId]);

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
                  <div className="relative flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg overflow-hidden bg-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]">
                    <img src="/bitbit-icon-mark-light.png" alt="BitBit" width={22} height={22} className="dark:hidden" style={{ filter: 'brightness(0.45)' }} />
                    <img src="/bitbit-icon-mark.png" alt="BitBit" width={22} height={22} className="hidden dark:block" style={{ filter: 'invert(1) brightness(0.55)' }} />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <PixelWordmark className="truncate font-medium text-sm" style={{ WebkitTextStroke: '0.5px currentColor' }}>BitBit</PixelWordmark>
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

      <SidebarContent ref={sidebarContentRef} className="overflow-hidden">
        <div className="min-h-0 flex-1 overflow-hidden">
          <SidebarGroup className="h-full min-h-0 pb-1">
            <div className="h-full overflow-y-auto pr-1">
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
            </div>
          </SidebarGroup>
        </div>

        {/* Contextual panel — isolated scroll region independent from page navigation */}
        {(() => {
          const ctx = getContextConfig(activeTabId);
          return (
            <SidebarContextTransition contextKey={ctx ? activeTabId : null}>
                {activeTabId === 'chat' ? (
                  <ChatSidebarPanel />
                ) : activeTabId === 'inbox' ? (
                  <SidebarGroup className="h-full min-h-0 p-0">
                    <SidebarMenu className="gap-1">
                      {ctx?.items.map((item, idx) => {
                        const showCompactCta = idx === 0 && ctx.ctaCompact && ctx.cta;

                        return (
                          <SidebarMenuItem key={item.label}>
                            <SidebarMenuButton
                              onClick={() => {}}
                              isActive={idx === 0}
                              className={cn(showCompactCta && 'pr-10')}
                            >
                              {item.dot && <span className={cn('size-2 rounded-full shrink-0', item.dot)} />}
                              {item.icon && <item.icon className="size-4" />}
                              <span>{item.label}</span>
                              {item.count !== undefined && item.count > 0 && (
                                <SidebarMenuBadge>{item.count}</SidebarMenuBadge>
                              )}
                            </SidebarMenuButton>

                            {showCompactCta && (
                              <SidebarMenuAction
                                aria-label={ctx.cta?.label}
                                className="border-sidebar-border/60 bg-sidebar top-1.5 right-1 rounded-md border"
                              >
                                {ctx.cta?.icon && <ctx.cta.icon className="size-3.5" />}
                              </SidebarMenuAction>
                            )}
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroup>
                ) : ctx ? (
                  <SidebarGroup className="h-full min-h-0 p-0">
                    {ctx.cta && !ctx.ctaCompact && (
                      <SidebarMenu>
                        <SidebarMenuItem>
                          <Button variant="default" size="sm" className="mb-1 w-full justify-start gap-2">
                            <ctx.cta.icon className="size-4" />
                            {ctx.cta.label}
                          </Button>
                        </SidebarMenuItem>
                      </SidebarMenu>
                    )}
                    <SidebarMenu>
                      {ctx.items.map((item, idx) => (
                        <SidebarMenuItem key={item.label}>
                          <SidebarMenuButton onClick={() => {}}>
                            {item.dot && <span className={cn('size-2 rounded-full shrink-0', item.dot)} />}
                            {item.icon && <item.icon className="size-4" />}
                            <span>{item.label}</span>
                            {item.count !== undefined && (
                              <span className="ml-auto text-xs text-muted-foreground tabular-nums">{item.count}</span>
                            )}
                          </SidebarMenuButton>
                          {idx === 0 && ctx.ctaCompact && ctx.cta && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 shrink-0"
                              aria-label={ctx.cta.label}
                            >
                              <ctx.cta.icon className="size-4" />
                            </Button>
                          )}
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
                ) : null}
            </SidebarContextTransition>
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
                      {activeOrg?.plan ?? 'Free'} plan
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
                        {activeOrg?.plan ?? 'Free'} plan
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