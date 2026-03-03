'use client';

import React, {
  lazy,
  Suspense,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { startTransition } from 'react';
import { Menu } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { SidebarNav } from './sidebar-nav';
import { BitBitOverlay } from './bitbit-overlay';
import { SplashScreen } from './splash-screen';
import { OnboardingTour } from './onboarding-tour';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { ToastProvider } from '@/components/ui/toast';
import { GlobalSearch } from './global-search';
import { TabSkeleton } from './tabs/tab-skeleton';
import { Topbar } from './topbar';
import { TOPBAR_CONFIGS } from './topbar-configs';
import { NotificationCenter } from './notification-center';
import { AppDataProvider } from '@/lib/data/app-data-provider';
import { useEnabledModulesFetch, EnabledModulesContext } from '@/lib/modules/use-enabled-modules';
import { DevToolbar } from '@/components/dev/dev-toolbar';

// ─── Tab definitions ────────────────────────────────────────────────────────

export interface TabDef {
  id: string;
  label: string;
  path: string;
}

export const TABS: TabDef[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard' },
  { id: 'chat', label: 'Chat', path: '/dashboard/chat' },
  { id: 'inbox', label: 'Inbox', path: '/dashboard/inbox' },
  { id: 'channels', label: 'Channels', path: '/dashboard/channels' },
  { id: 'medications', label: 'Medications', path: '/dashboard/medications' },
  { id: 'contacts', label: 'Contacts', path: '/dashboard/contacts' },
  { id: 'leads', label: 'Leads', path: '/dashboard/leads' },
  { id: 'invoices', label: 'Invoices', path: '/dashboard/invoices' },
  { id: 'tenders', label: 'Tenders', path: '/dashboard/tenders' },
  { id: 'jobs',   label: 'Jobs',   path: '/dashboard/jobs' },
  { id: 'quotes', label: 'Quotes', path: '/dashboard/quotes' },
  { id: 'sentry', label: 'Sentry', path: '/dashboard/sentry' },
  { id: 'approvals', label: 'Approvals', path: '/dashboard/approvals' },
  { id: 'ad-scripts', label: 'Ad Scripts', path: '/dashboard/ad-scripts' },
  { id: 'ai-search', label: 'AI Search', path: '/dashboard/ai-search' },
  { id: 'reports', label: 'Reports', path: '/dashboard/reports' },
  { id: 'knowledge', label: 'Knowledge', path: '/dashboard/knowledge' },
  { id: 'costs', label: 'Costs', path: '/dashboard/costs' },
  { id: 'analytics', label: 'Analytics', path: '/dashboard/analytics' },
  { id: 'activity', label: 'Activity', path: '/dashboard/activity' },
  { id: 'admin', label: 'Admin', path: '/dashboard/admin' },
  { id: 'settings', label: 'Settings', path: '/dashboard/settings' },
];

// ─── Pre-warm all tab imports immediately ───────────────────────────────────
// Trigger dynamic imports eagerly so chunks are fetched in the background.
// The resolved modules feed into React.lazy wrappers below.

const tabImports: Record<string, Promise<{ default: React.ComponentType }>> = {
  dashboard: import('./tabs/dashboard-tab'),
  chat: import('./tabs/chat-tab'),
  inbox: import('./tabs/inbox-tab'),
  channels: import('./tabs/channels-tab'),
  medications: import('./tabs/medications-tab'),
  contacts: import('./tabs/contacts-tab'),
  leads: import('./tabs/leads-tab'),
  invoices: import('./tabs/invoices-tab'),
  tenders: import('./tabs/tenders-tab'),
  jobs: import('./tabs/jobs-tab'),
  quotes: import('./tabs/quotes-tab'),
  sentry: import('./tabs/sentry-tab'),
  approvals: import('./tabs/approvals-tab'),
  'ad-scripts': import('./tabs/ad-scripts-tab'),
  'ai-search': import('./tabs/ai-search-tab'),
  reports: import('./tabs/reports-tab'),
  knowledge: import('./tabs/knowledge-tab'),
  costs: import('./tabs/costs-tab'),
  analytics: import('./tabs/analytics-tab'),
  activity: import('./tabs/activity-tab'),
  admin: import('./tabs/admin-tab'),
  settings: import('./tabs/settings-tab'),
};

// Lazy wrappers that resolve from the already-triggered promises
const TabComponents: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  dashboard: lazy(() => tabImports.dashboard),
  chat: lazy(() => tabImports.chat),
  inbox: lazy(() => tabImports.inbox),
  channels: lazy(() => tabImports.channels),
  medications: lazy(() => tabImports.medications),
  contacts: lazy(() => tabImports.contacts),
  leads: lazy(() => tabImports.leads),
  invoices: lazy(() => tabImports.invoices),
  tenders: lazy(() => tabImports.tenders),
  jobs: lazy(() => tabImports.jobs),
  quotes: lazy(() => tabImports.quotes),
  sentry: lazy(() => tabImports.sentry),
  approvals: lazy(() => tabImports.approvals),
  'ad-scripts': lazy(() => tabImports['ad-scripts']),
  'ai-search': lazy(() => tabImports['ai-search']),
  reports: lazy(() => tabImports.reports),
  knowledge: lazy(() => tabImports.knowledge),
  costs: lazy(() => tabImports.costs),
  analytics: lazy(() => tabImports.analytics),
  activity: lazy(() => tabImports.activity),
  admin: lazy(() => tabImports.admin),
  settings: lazy(() => tabImports.settings),
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function pathToTabIndex(path: string): number {
  const idx = TABS.findIndex(t => t.path === path);
  return idx >= 0 ? idx : 0;
}

function TabFallback() {
  return <TabSkeleton />;
}

// ─── SPA Shell ──────────────────────────────────────────────────────────────

interface SPAShellProps {
  displayName: string;
  initials: string;
}

export function SPAShell({ displayName, initials }: SPAShellProps) {
  const router = useRouter();

  const handleSignOut = useCallback(async () => {
    await fetch('/auth/signout', { method: 'POST' });
    router.push('/login');
  }, [router]);

  // Track when all tab imports have resolved (pre-warm complete)
  const [tabsReady, setTabsReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);

  // Module gating — filter tabs by org plan + overrides + composition
  const enabledModulesState = useEnabledModulesFetch();
  const { composition } = enabledModulesState;
  const visibleTabs = TABS.filter(t => enabledModulesState.modules.includes(t.id));

  // Track visited tabs for keep-alive
  const PRIORITY_TABS = new Set(['dashboard', 'chat', 'inbox']);
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set(PRIORITY_TABS));

  useEffect(() => {
    Promise.all(Object.values(tabImports)).then(() => setTabsReady(true));
  }, []);

  // State: nav indicator (instant) and rendered page (with transition)
  const [activeNavIndex, setActiveNavIndex] = useState(0);
  const [renderedPage, setRenderedPage] = useState(0);
  const [transitionDir, setTransitionDir] = useState<'up' | 'down' | null>(null);
  const prevPageRef = useRef(0);

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
    setRenderedPage(nextIndex);
    prevPageRef.current = nextIndex;
  }, []);

  // Navigate to a tab — instant nav, smooth content slide
  const navigateTo = useCallback((index: number) => {
    if (index === activeNavIndex) return;
    const tab = TABS[index];
    if (!tab) return;

    // 1. Nav moves INSTANTLY
    setActiveNavIndex(index);

    // 2. Persist tab choice without touching URL bar
    sessionStorage.setItem('bitbit-tab', tab.id);

    // 3. Mark tab as visited for keep-alive
    setVisitedTabs(prev => {
      if (prev.has(tab.id)) return prev;
      const next = new Set(prev);
      next.add(tab.id);
      return next;
    });

    // 4. Set transition direction for CSS animation
    const dir = index > renderedPage ? 'down' : 'up';
    setTransitionDir(dir);
    prevPageRef.current = renderedPage;

    // 5. Content switches via startTransition
    startTransition(() => {
      setRenderedPage(index);
    });

    // Clear transition class after animation completes
    setTimeout(() => setTransitionDir(null), 250);
  }, [activeNavIndex, renderedPage]);

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
      prevPageRef.current = renderedPage;
      startTransition(() => {
        setRenderedPage(idx);
      });
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [renderedPage]);

  // Listen for bb-navigate custom events (dispatched by Quick Actions, etc.)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ tab: string }>).detail;
      if (detail?.tab) navigateToId(detail.tab);
    };
    window.addEventListener('bb-navigate', handler);
    return () => window.removeEventListener('bb-navigate', handler);
  }, [navigateToId]);

  // Spacebar → navigate home (dashboard) when not typing in an input
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

  // Keep the viewport locked to the shell so docked chat input never falls below the fold.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [activeNavIndex, renderedPage]);

  const currentPage = TABS[activeNavIndex]?.label || 'Dashboard';

  // Tablet sidebar overlay state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // Close sidebar on tab change (tablet)
  const handleTabChange = useCallback((tabId: string) => {
    navigateToId(tabId);
    setSidebarOpen(false);
  }, [navigateToId]);

  return (
    <ToastProvider>
    <EnabledModulesContext.Provider value={enabledModulesState}>
    <SplashScreen codeReady={tabsReady} dataReady={dataReady} minDisplayMs={1200}>
      <AppDataProvider onReady={() => setDataReady(true)}>
      <BitBitOverlay currentPage={currentPage} activeTabId={TABS[activeNavIndex].id}>
        <a
          href="#main-content"
          className="bb-skip-link"
        >
          Skip to content
        </a>
        <div className="bb-layout bb-dot-grid">
          {/* Tablet sidebar toggle */}
          <button
            className="bb-sidebar-toggle"
            onClick={() => setSidebarOpen(o => !o)}
            aria-label="Toggle navigation"
          >
            <Menu size={20} />
          </button>

          {/* Tablet backdrop */}
          <div
            className="bb-sidebar-backdrop"
            data-visible={sidebarOpen}
            onClick={closeSidebar}
          />

          <div className="bb-sidebar-area" data-open={sidebarOpen}>
            <SidebarNav
              avatarFallback={initials}
              displayName={displayName}
              onSignOut={handleSignOut}
              activeTabId={TABS[activeNavIndex].id}
              onTabChange={handleTabChange}
              tabs={visibleTabs}
            />
          </div>

          {/* Unified Topbar */}
          {(() => {
            const topbarConfig = TOPBAR_CONFIGS[TABS[activeNavIndex]?.id];
            const isHidden = topbarConfig?.hidden;
            // Propagate hidden state to layout div for grid collapse
            const layoutEl = typeof document !== 'undefined'
              ? document.querySelector('.bb-layout')
              : null;
            if (layoutEl) {
              if (isHidden) layoutEl.setAttribute('data-topbar-hidden', '');
              else layoutEl.removeAttribute('data-topbar-hidden');
            }
            return (
              <div
                className="bb-topbar-area"
                data-topbar-hidden={isHidden || undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: isHidden ? 'flex-end' : undefined,
                  ...(isHidden ? {
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    left: 'var(--sidebar-width)',
                    height: 'var(--topbar-height)',
                    zIndex: 10,
                    pointerEvents: 'none',
                    background: 'transparent',
                  } : {}),
                }}
              >
                <Topbar config={topbarConfig} />
                <div style={{ flexShrink: 0, paddingRight: '16px', pointerEvents: 'auto' }}>
                  <NotificationCenter onTabChange={handleTabChange} />
                </div>
              </div>
            );
          })()}

          {/* SPA Content Area */}
          <main
            id="main-content"
            className="bb-spa-content"
            style={{ position: 'relative', overflow: 'hidden' }}
            tabIndex={-1}
          >
            {TABS.map((tab, index) => {
              const isActive = index === renderedPage;
              const Comp = TabComponents[tab.id];

              return (
                <div
                  key={tab.id}
                  className="bb-tab-panel"
                  role="tabpanel"
                  id={`tabpanel-${tab.id}`}
                  aria-labelledby={`tab-${tab.id}`}
                  tabIndex={isActive ? 0 : -1}
                  data-active={isActive}
                  data-dir={isActive && transitionDir ? transitionDir : undefined}
                  aria-hidden={!isActive}
                >
                  {(isActive || visitedTabs.has(tab.id)) ? (
                    <ErrorBoundary>
                      <Suspense fallback={<TabFallback />}>
                        <Comp />
                      </Suspense>
                    </ErrorBoundary>
                  ) : null}
                </div>
              );
            })}
          </main>
        </div>

        {/* Global search command palette (Cmd+K) */}
        <GlobalSearch onNavigate={handleTabChange} />

        {/* Onboarding tour for first-time users */}
        <OnboardingTour onNavigate={handleTabChange} tourVariant={composition.tourVariant} />

        {/* Dev toolbar — tree-shaken from production builds */}
        {process.env.NODE_ENV === 'development' && <DevToolbar />}
      </BitBitOverlay>
      </AppDataProvider>
    </SplashScreen>
    </EnabledModulesContext.Provider>
    </ToastProvider>
  );
}

export default SPAShell;
