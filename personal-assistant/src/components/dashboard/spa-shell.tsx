'use client';

import React, {
  lazy,
  Suspense,
  useState,
  useCallback,
  useEffect,
} from 'react';

import { IconMenu2 } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { SidebarNav } from './sidebar-nav';
import { BottomNav } from './bottom-nav';
import { BitBitOverlay } from './bitbit-overlay';
import { SplashScreen } from './splash-screen';
import { OnboardingTour } from './onboarding-tour';
import { FirstRunGuideProvider } from '@/components/onboarding/first-run-guide';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { ToastProvider } from '@/components/ui/toast';
import { Summon } from './summon';
import { TabSkeleton } from './tabs/tab-skeleton';
import { KeepAliveTabPanel } from './tab-transition';
import { Topbar } from './topbar';
import { TOPBAR_CONFIGS } from './topbar-configs';
import { NotificationCenter } from './notification-center';
import { AppDataProvider } from '@/lib/data/app-data-provider';
import { useEnabledModulesFetch, EnabledModulesContext } from '@/lib/modules/use-enabled-modules';
const DevToolbar = lazy(() => import('@/components/dev/dev-toolbar').then(m => ({ default: m.DevToolbar })));
import { KeyboardShortcuts } from './keyboard-shortcuts';
import { ThemeProvider } from '@/lib/theme/theme-provider';
import { useHotkeys, getTabHistory } from '@/hooks/use-hotkeys';
import { SIDEBAR_CATEGORIES } from '@/lib/modules/registry';
import { FeedbackWidget } from '@/components/beta/feedback-widget';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/animate-ui/components/radix/sidebar';
import { Separator } from '@/components/ui/separator';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ChatThreadsProvider } from '@/components/chat/chat-threads-context';
import { UserProfileProvider } from '@/lib/user/user-profile-context';
import { DrawerProvider } from './drawer-context';
import { DrawerSlot } from './drawer-slot';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

// ---- Tab definitions ----

export interface TabDef {
  id: string;
  label: string;
  path: string;
}

export const TABS: TabDef[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard' },
  { id: 'chat', label: 'Chat', path: '/dashboard/chat' },
  { id: 'inbox', label: 'Inbox', path: '/dashboard/inbox' },
  { id: 'creator-studio', label: 'Creator Studio', path: '/dashboard/creator-studio' },
  { id: 'tasks', label: 'Tasks', path: '/dashboard/tasks' },

  { id: 'companies', label: 'Companies', path: '/dashboard/companies' },
  { id: 'contacts', label: 'Contacts', path: '/dashboard/contacts' },
  { id: 'leads', label: 'Leads', path: '/dashboard/leads' },
  { id: 'invoices', label: 'Invoices', path: '/dashboard/invoices' },
  { id: 'tenders', label: 'Tenders', path: '/dashboard/tenders' },
  { id: 'jobs',   label: 'Jobs',   path: '/dashboard/jobs' },
  { id: 'quotes', label: 'Quotes', path: '/dashboard/quotes' },
  { id: 'meetings', label: 'Meetings', path: '/dashboard/meetings' },
  { id: 'sentry', label: 'Sentry', path: '/dashboard/sentry' },
  { id: 'swarm', label: 'Swarm', path: '/dashboard/swarm' },
  { id: 'workflows', label: 'Workflows', path: '/dashboard/workflows' },
  { id: 'approvals', label: 'Approvals', path: '/dashboard/approvals' },
  { id: 'ad-scripts', label: 'Ad Scripts', path: '/dashboard/ad-scripts' },
  { id: 'ai-search', label: 'AI Search', path: '/dashboard/ai-search' },
  { id: 'reports', label: 'Reports', path: '/dashboard/reports' },
  { id: 'knowledge', label: 'Knowledge', path: '/dashboard/knowledge' },
  { id: 'costs', label: 'Costs', path: '/dashboard/costs' },
  { id: 'analytics', label: 'Analytics', path: '/dashboard/analytics' },
  { id: 'activity', label: 'Activity', path: '/dashboard/activity' },
  { id: 'admin', label: 'Admin', path: '/dashboard/admin' },
  { id: 'monitoring', label: 'Monitoring', path: '/dashboard/monitoring' },
  { id: 'beta-admin', label: 'Beta Program', path: '/dashboard/beta-admin' },
  { id: 'settings-connections', label: 'Connections', path: '/dashboard/settings/connections' },
  { id: 'settings-automations', label: 'Plugins', path: '/dashboard/settings/automations' },
  { id: 'settings-appearance', label: 'Appearance', path: '/dashboard/settings/appearance' },
  { id: 'settings-billing', label: 'Billing', path: '/dashboard/settings/billing' },
];

// ---- Pre-warm all tab imports immediately ----

const tabImports: Record<string, Promise<{ default: React.ComponentType }>> = {
  dashboard: import('./tabs/dashboard-tab'),
  chat: import('./tabs/chat-tab'),
  inbox: import('./tabs/inbox-tab'),
  'creator-studio': import('./tabs/creator-studio-tab'),
  tasks: import('./tabs/tasks-tab'),

  companies: import('./tabs/companies-tab'),
  contacts: import('./tabs/contacts-tab'),
  leads: import('./tabs/leads-tab'),
  invoices: import('./tabs/invoices-tab'),
  tenders: import('./tabs/tenders-tab'),
  jobs: import('./tabs/jobs-tab'),
  quotes: import('./tabs/quotes-tab'),
  meetings: import('./tabs/meetings-tab'),
  sentry: import('./tabs/sentry-tab'),
  swarm: import('./tabs/swarm-tab'),
  workflows: import('./tabs/workflows-tab'),
  approvals: import('./tabs/approvals-tab'),
  'ad-scripts': import('./tabs/ad-scripts-tab'),
  'ai-search': import('./tabs/ai-search-tab'),
  reports: import('./tabs/reports-tab'),
  knowledge: import('./tabs/knowledge-tab'),
  costs: import('./tabs/costs-tab'),
  analytics: import('./tabs/analytics-tab'),
  activity: import('./tabs/activity-tab'),
  admin: import('./tabs/admin-tab'),
  monitoring: import('./tabs/monitoring-tab'),
  'beta-admin': import('./tabs/beta-admin-tab'),
  'settings-connections': import('./tabs/settings-tab').then(m => ({ default: m.SettingsConnectionsTab })),
  'settings-automations': import('./tabs/settings-tab').then(m => ({ default: m.SettingsAutomationsTab })),
  'settings-appearance': import('./tabs/settings-tab').then(m => ({ default: m.SettingsAppearanceTab })),
  'settings-billing': import('./tabs/settings-tab').then(m => ({ default: m.SettingsBillingTab })),
};

// Lazy wrappers that resolve from the already-triggered promises
const TabComponents: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  dashboard: lazy(() => tabImports.dashboard),
  chat: lazy(() => tabImports.chat),
  inbox: lazy(() => tabImports.inbox),
  'creator-studio': lazy(() => tabImports['creator-studio']),
  tasks: lazy(() => tabImports.tasks),

  companies: lazy(() => tabImports.companies),
  contacts: lazy(() => tabImports.contacts),
  leads: lazy(() => tabImports.leads),
  invoices: lazy(() => tabImports.invoices),
  tenders: lazy(() => tabImports.tenders),
  jobs: lazy(() => tabImports.jobs),
  quotes: lazy(() => tabImports.quotes),
  meetings: lazy(() => tabImports.meetings),
  sentry: lazy(() => tabImports.sentry),
  swarm: lazy(() => tabImports.swarm),
  workflows: lazy(() => tabImports.workflows),
  approvals: lazy(() => tabImports.approvals),
  'ad-scripts': lazy(() => tabImports['ad-scripts']),
  'ai-search': lazy(() => tabImports['ai-search']),
  reports: lazy(() => tabImports.reports),
  knowledge: lazy(() => tabImports.knowledge),
  costs: lazy(() => tabImports.costs),
  analytics: lazy(() => tabImports.analytics),
  activity: lazy(() => tabImports.activity),
  admin: lazy(() => tabImports.admin),
  monitoring: lazy(() => tabImports.monitoring),
  'beta-admin': lazy(() => tabImports['beta-admin']),
  'settings-connections': lazy(() => tabImports['settings-connections']),
  'settings-automations': lazy(() => tabImports['settings-automations']),
  'settings-appearance': lazy(() => tabImports['settings-appearance']),
  'settings-billing': lazy(() => tabImports['settings-billing']),
};

// ---- Helpers ----

function pathToTabIndex(path: string): number {
  const idx = TABS.findIndex(t => t.path === path);
  return idx >= 0 ? idx : 0;
}

const TAB_SKELETON_VARIANTS: Record<string, import('./tabs/tab-skeleton').TabSkeletonVariant> = {
  leads: 'kanban',
  tasks: 'kanban',
  invoices: 'table',
  contacts: 'cards-grid',
  inbox: 'inbox',
  analytics: 'chart',
  activity: 'timeline',
  meetings: 'detail',
  tenders: 'table',
  jobs: 'table',
  quotes: 'table',
  reports: 'chart',
  knowledge: 'cards-grid',
};

// ---- SPA Shell ----

interface SPAShellProps {
  displayName: string;
  initials: string;
  isNewUser?: boolean;
}

export function SPAShell({ displayName, initials, isNewUser = false }: SPAShellProps) {
  const router = useRouter();

  const handleSignOut = useCallback(async () => {
    await fetch('/auth/signout', { method: 'POST' });
    router.push('/login');
  }, [router]);

  // Track when all tab imports have resolved (pre-warm complete)
  const [tabsReady, setTabsReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);

  // Module gating -- filter tabs by org plan + overrides + composition
  const enabledModulesState = useEnabledModulesFetch();
  const { composition } = enabledModulesState;
  const visibleTabs = TABS.filter(t => enabledModulesState.modules.includes(t.id));

  // Track visited tabs for keep-alive — only mount tabs the user actually navigates to
  const PRIORITY_TABS = new Set(['dashboard']);
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set(PRIORITY_TABS));

  useEffect(() => {
    Promise.all(Object.values(tabImports)).then(() => setTabsReady(true));
  }, []);

  // State: active tab and slide-animation direction
  const [activeNavIndex, setActiveNavIndex] = useState(0);
  const [transitionDir, setTransitionDir] = useState<'up' | 'down' | null>(null);

  // Resolve preferred tab after mount to avoid hydration mismatch
  useEffect(() => {
    const stored = sessionStorage.getItem('bitbit-tab');
    let idx = -1;

    if (stored) {
      idx = TABS.findIndex(t => t.id === stored);
    }

    if (idx < 0) {
      idx = pathToTabIndex(window.location.pathname);
    }

    // Fall back to composition default tab
    if (idx < 0) {
      idx = TABS.findIndex(t => t.id === composition.defaultTab);
    }

    const nextIndex = idx >= 0 ? idx : 0;
    setActiveNavIndex(nextIndex);
    const tabId = TABS[nextIndex]?.id;
    if (tabId) setVisitedTabs(prev => { if (prev.has(tabId)) return prev; const next = new Set(prev); next.add(tabId); return next; });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigate to a tab -- immediate switch with CSS slide animation
  const navigateTo = useCallback((index: number) => {
    if (index === activeNavIndex) return;
    const tab = TABS[index];
    if (!tab) return;

    const dir = index > activeNavIndex ? 'down' : 'up';
    setTransitionDir(dir);
    setActiveNavIndex(index);
    sessionStorage.setItem('bitbit-tab', tab.id);

    setVisitedTabs(prev => {
      if (prev.has(tab.id)) return prev;
      const next = new Set(prev);
      next.add(tab.id);
      return next;
    });

    setTimeout(() => setTransitionDir(null), 250);
  }, [activeNavIndex]);

  // Navigate by tab ID (used by sidebar)
  const navigateToId = useCallback((tabId: string) => {
    const idx = TABS.findIndex(t => t.id === tabId);
    if (idx >= 0) navigateTo(idx);
  }, [navigateTo]);

  // Handle browser back/forward (fallback)
  useEffect(() => {
    const handlePopState = () => {
      const idx = pathToTabIndex(window.location.pathname);
      setActiveNavIndex(idx);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Listen for bb-navigate custom events (dispatched by Quick Actions, etc.)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ tab: string }>).detail;
      if (detail?.tab) {
        navigateToId(detail.tab);
      }
    };
    window.addEventListener('bb-navigate', handler);
    return () => window.removeEventListener('bb-navigate', handler);
  }, [navigateToId]);

  // Listen for bb-dev-tools-open events (dispatched by sidebar Dev Tools menu item)
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return
    const handler = () => setDevToolsOpen(true)
    window.addEventListener('bb-dev-tools-open', handler)
    return () => window.removeEventListener('bb-dev-tools-open', handler)
  }, [])

  // Listen for bb-feedback-open events (dispatched by sidebar Feedback menu item)
  useEffect(() => {
    const handler = () => setFeedbackOpen(true)
    window.addEventListener('bb-feedback-open', handler)
    return () => window.removeEventListener('bb-feedback-open', handler)
  }, [])

  // Spacebar -> navigate home (dashboard) when not typing in an input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
          (e.target as HTMLElement)?.isContentEditable) return;
      if (TABS[activeNavIndex]?.id === 'dashboard') return;
      e.preventDefault();
      navigateToId('dashboard');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeNavIndex, navigateToId]);

  // Keep the viewport locked
  useEffect(() => {
    const main = document.getElementById('main-content');
    if (main) main.scrollTop = 0;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [activeNavIndex]);

  const currentPage = TABS[activeNavIndex]?.label || 'Dashboard';

  // Close sidebar on tab change
  const handleTabChange = useCallback((tabId: string) => {
    navigateToId(tabId);
  }, [navigateToId]);

  // Power-user hotkeys
  const [focusMode, setFocusMode] = useState(false);
  const [devToolsOpen, setDevToolsOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);

  useHotkeys({
    activeTabId: TABS[activeNavIndex]?.id ?? 'dashboard',
    actions: {
      navigateToTab: (tabId: string) => handleTabChange(tabId),

      navigateToCategory: (index: number) => {
        const cats = SIDEBAR_CATEGORIES;
        const cat = cats[index - 1];
        if (!cat) return;
        if (cat.directNav) {
          handleTabChange(cat.directNav);
        } else {
          const firstItem = cat.items.find(id => enabledModulesState.modules.includes(id));
          if (firstItem) handleTabChange(firstItem);
        }
      },

      toggleFocusMode: () => setFocusMode(f => !f),

      openSearch: () => {
        window.dispatchEvent(new Event('bb-search-open'));
      },

      toggleCheatsheet: () => setCheatsheetOpen(o => !o),

      goBack: () => {
        const prev = getTabHistory().back();
        if (prev) handleTabChange(prev);
      },

      goForward: () => {
        const next = getTabHistory().forward();
        if (next) handleTabChange(next);
      },

      escapeCascade: () => {
        if (cheatsheetOpen) {
          setCheatsheetOpen(false);
        }
        if (focusMode) {
          setFocusMode(false);
        }
      },
    },
  });

  return (
    <ThemeProvider>
    <UserProfileProvider displayName={displayName} initials={initials} isNewUser={isNewUser}>
    <ToastProvider>
    <FirstRunGuideProvider>
    <EnabledModulesContext.Provider value={enabledModulesState}>
    <SplashScreen codeReady={tabsReady} dataReady={dataReady && !enabledModulesState.loading} minDisplayMs={600}>
      <AppDataProvider onReady={() => setDataReady(true)}>
      <BitBitOverlay currentPage={currentPage} activeTabId={TABS[activeNavIndex].id}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:top-4 focus:left-4 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <TooltipProvider>
          <ChatThreadsProvider>
          <SidebarProvider
            defaultOpen={true}
            data-focus-mode={focusMode || undefined}
            className="!h-svh !max-h-svh !min-h-0 overflow-hidden"
            style={{
              '--sidebar-width': 'calc(var(--spacing) * 72)',
              '--header-height': 'calc(var(--spacing) * 12)',
            } as React.CSSProperties}
          >
            {/* Sidebar (desktop/tablet) */}
            <SidebarNav
              avatarFallback={initials}
              displayName={displayName}
              onSignOut={handleSignOut}
              activeTabId={TABS[activeNavIndex].id}
              onTabChange={handleTabChange}
              tabs={visibleTabs}
            />

            {/* DrawerProvider wraps both SidebarInset and DrawerSlot */}
            <DrawerProvider activeTab={TABS[activeNavIndex]?.id ?? 'dashboard'}>
            {/* Main content area */}
            <SidebarInset className="flex flex-col !min-h-0 !flex-1 overflow-hidden">
              {/* Topbar */}
              {(() => {
                const topbarConfig = TOPBAR_CONFIGS[TABS[activeNavIndex]?.id];
                const isHidden = topbarConfig?.hidden;

                if (isHidden) {
                  return (
                    <div className="absolute top-0 right-4 z-10 flex h-12 items-center pointer-events-auto">
                      <NotificationCenter onTabChange={handleTabChange} />
                    </div>
                  );
                }

                return (
                  <header className="relative flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height) px-4 lg:px-6">
                    <SidebarTrigger className="-ml-1" />
                    <div className="mx-2 h-4 w-px shrink-0 bg-border" />
                    <Topbar config={topbarConfig} />
                    <NotificationCenter onTabChange={handleTabChange} />
                  </header>
                );
              })()}

              {/* SPA Content Area — keep-alive: visited tabs stay mounted */}
              <main
                id="main-content"
                className="relative flex-1 overflow-y-auto overscroll-contain bg-background"
                tabIndex={-1}
              >
                <KeepAliveTabPanel
                  activeTabId={TABS[activeNavIndex]?.id ?? 'dashboard'}
                  direction={transitionDir}
                  tabs={TABS
                    .filter(t => visitedTabs.has(t.id))
                    .map(t => {
                      const Comp = TabComponents[t.id];
                      return {
                        id: t.id,
                        children: (
                          <ErrorBoundary>
                            <Suspense fallback={<TabSkeleton variant={TAB_SKELETON_VARIANTS[t.id]} />}>
                              <Comp />
                            </Suspense>
                          </ErrorBoundary>
                        ),
                      };
                    })}
                />
              </main>

              {/* Mobile bottom nav */}
              <div className="md:hidden">
                <BottomNav
                  avatarFallback={initials}
                  displayName={displayName}
                  onSignOut={handleSignOut}
                  activeTabId={TABS[activeNavIndex].id}
                  onTabChange={handleTabChange}
                  tabs={visibleTabs}
                />
              </div>
            </SidebarInset>

            {/* Right drawer — sibling of SidebarInset, same pattern as left sidebar */}
            <DrawerSlot />
            </DrawerProvider>
          </SidebarProvider>
          </ChatThreadsProvider>
        </TooltipProvider>

        {/* Summon command palette (Cmd+K or /) */}
        <Summon onNavigate={handleTabChange} activeTab={TABS[activeNavIndex]?.id ?? 'dashboard'} />

        {/* Keyboard shortcuts cheatsheet (?) */}
        <KeyboardShortcuts open={cheatsheetOpen} onClose={() => setCheatsheetOpen(false)} />

        {/* Onboarding tour for returning users */}
        <OnboardingTour onNavigate={handleTabChange} tourVariant={composition.tourVariant} />

        {/* Beta feedback widget — Sheet triggered from sidebar menu */}
        <Sheet open={feedbackOpen} onOpenChange={setFeedbackOpen}>
          <SheetContent side="right" className="w-[380px] overflow-y-auto p-0">
            <SheetHeader className="px-5 py-4 border-b border-sidebar-border">
              <SheetTitle className="text-base font-medium">Send Feedback</SheetTitle>
            </SheetHeader>
            <div className="p-5">
              <FeedbackWidget onClose={() => setFeedbackOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>

        {/* Dev toolbar -- lazy-loaded, never bundled in production */}
        {process.env.NODE_ENV === 'development' && (
          <Sheet open={devToolsOpen} onOpenChange={setDevToolsOpen}>
            <SheetContent side="right" className="w-80 overflow-y-auto p-0">
              <SheetHeader className="px-4 py-3 border-b border-sidebar-border">
                <SheetTitle className="text-sm font-medium font-mono">Dev Tools</SheetTitle>
              </SheetHeader>
              <Suspense fallback={null}>
                <DevToolbar />
              </Suspense>
            </SheetContent>
          </Sheet>
        )}
      </BitBitOverlay>
      </AppDataProvider>
    </SplashScreen>
    </EnabledModulesContext.Provider>
    </FirstRunGuideProvider>
    </ToastProvider>
    </UserProfileProvider>
    </ThemeProvider>
  );
}

export default SPAShell;