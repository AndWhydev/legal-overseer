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
import { SidebarNav } from './sidebar-nav';
import { BitBitOverlay } from './bitbit-overlay';
import { SplashScreen } from './splash-screen';
import { OnboardingTour } from './onboarding-tour';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { ToastProvider } from '@/components/ui/toast';

// ─── Tab definitions ────────────────────────────────────────────────────────

export interface TabDef {
  id: string;
  label: string;
  path: string;
}

export const TABS: TabDef[] = [
  { id: 'command-center', label: 'Command Center', path: '/dashboard' },
  { id: 'dashboard', label: 'Tasks', path: '/dashboard/tasks' },
  { id: 'chat', label: 'Chat', path: '/dashboard/chat' },
  { id: 'inbox', label: 'Inbox', path: '/dashboard/inbox' },
  { id: 'channels', label: 'Channels', path: '/dashboard/channels' },
  { id: 'medications', label: 'Medications', path: '/dashboard/medications' },
  { id: 'contacts', label: 'Contacts', path: '/dashboard/contacts' },
  { id: 'leads', label: 'Leads', path: '/dashboard/leads' },
  { id: 'invoices', label: 'Invoices', path: '/dashboard/invoices' },
  { id: 'tenders', label: 'Tenders', path: '/dashboard/tenders' },
  { id: 'sentry', label: 'Sentry', path: '/dashboard/sentry' },
  { id: 'approvals', label: 'Approvals', path: '/dashboard/approvals' },
  { id: 'ad-scripts', label: 'Ad Scripts', path: '/dashboard/ad-scripts' },
  { id: 'ai-search', label: 'AI Search', path: '/dashboard/ai-search' },
  { id: 'costs', label: 'Costs', path: '/dashboard/costs' },
  { id: 'analytics', label: 'Analytics', path: '/dashboard/analytics' },
  { id: 'activity', label: 'Activity', path: '/dashboard/activity' },
  { id: 'settings', label: 'Settings', path: '/dashboard/settings' },
];

// ─── Pre-warm all tab imports immediately ───────────────────────────────────
// Trigger dynamic imports eagerly so chunks are fetched in the background.
// The resolved modules feed into React.lazy wrappers below.

const tabImports: Record<string, Promise<{ default: React.ComponentType }>> = {
  'command-center': import('./tabs/command-center-tab'),
  dashboard: import('./tabs/dashboard-tab'),
  chat: import('./tabs/chat-tab'),
  inbox: import('./tabs/inbox-tab'),
  channels: import('./tabs/channels-tab'),
  medications: import('./tabs/medications-tab'),
  contacts: import('./tabs/contacts-tab'),
  leads: import('./tabs/leads-tab'),
  invoices: import('./tabs/invoices-tab'),
  tenders: import('./tabs/tenders-tab'),
  sentry: import('./tabs/sentry-tab'),
  approvals: import('./tabs/approvals-tab'),
  'ad-scripts': import('./tabs/ad-scripts-tab'),
  'ai-search': import('./tabs/ai-search-tab'),
  costs: import('./tabs/costs-tab'),
  analytics: import('./tabs/analytics-tab'),
  activity: import('./tabs/activity-tab'),
  settings: import('./tabs/settings-tab'),
};

// Lazy wrappers that resolve from the already-triggered promises
const TabComponents: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  'command-center': lazy(() => tabImports['command-center']),
  dashboard: lazy(() => tabImports.dashboard),
  chat: lazy(() => tabImports.chat),
  inbox: lazy(() => tabImports.inbox),
  channels: lazy(() => tabImports.channels),
  medications: lazy(() => tabImports.medications),
  contacts: lazy(() => tabImports.contacts),
  leads: lazy(() => tabImports.leads),
  invoices: lazy(() => tabImports.invoices),
  tenders: lazy(() => tabImports.tenders),
  sentry: lazy(() => tabImports.sentry),
  approvals: lazy(() => tabImports.approvals),
  'ad-scripts': lazy(() => tabImports['ad-scripts']),
  'ai-search': lazy(() => tabImports['ai-search']),
  costs: lazy(() => tabImports.costs),
  analytics: lazy(() => tabImports.analytics),
  activity: lazy(() => tabImports.activity),
  settings: lazy(() => tabImports.settings),
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function pathToTabIndex(path: string): number {
  const idx = TABS.findIndex(t => t.path === path);
  return idx >= 0 ? idx : 0;
}

function TabFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-pulse text-muted-foreground text-sm">Loading…</div>
    </div>
  );
}

// ─── SPA Shell ──────────────────────────────────────────────────────────────

interface SPAShellProps {
  displayName: string;
  initials: string;
}

export function SPAShell({ displayName, initials }: SPAShellProps) {
  // Track when all tab imports have resolved (pre-warm complete)
  const [tabsReady, setTabsReady] = useState(false);

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

    // 3. Set transition direction for CSS animation
    const dir = index > renderedPage ? 'down' : 'up';
    setTransitionDir(dir);
    prevPageRef.current = renderedPage;

    // 4. Content switches via startTransition
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
    <SplashScreen ready={tabsReady} minDisplayMs={1200}>
      <BitBitOverlay currentPage={currentPage} activeTabId={TABS[activeNavIndex].id}>
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
              activeTabId={TABS[activeNavIndex].id}
              onTabChange={handleTabChange}
              tabs={TABS}
            />
          </div>

          {/* SPA Content Area */}
          <div
            className="bb-spa-content"
            style={{ position: 'relative', overflow: 'hidden' }}
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
                  {isActive ? (
                    <ErrorBoundary>
                      <Suspense fallback={<TabFallback />}>
                        <Comp />
                      </Suspense>
                    </ErrorBoundary>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {/* Onboarding tour for first-time users */}
        <OnboardingTour onNavigate={handleTabChange} />
      </BitBitOverlay>
    </SplashScreen>
    </ToastProvider>
  );
}

export default SPAShell;
