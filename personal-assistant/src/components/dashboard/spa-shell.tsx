'use client';

import React, {
  lazy,
  Suspense,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import { startTransition } from 'react';
import { SidebarNav } from './sidebar-nav';
import { BitBitOverlay } from './bitbit-overlay';
import { SplashScreen } from './splash-screen';

// ─── Tab definitions ────────────────────────────────────────────────────────

export interface TabDef {
  id: string;
  label: string;
  path: string;
}

export const TABS: TabDef[] = [
  { id: 'dashboard',   label: 'Tasks',       path: '/dashboard' },
  { id: 'chat',        label: 'Chat',        path: '/dashboard/chat' },
  { id: 'channels',    label: 'Channels',    path: '/dashboard/channels' },
  { id: 'medications', label: 'Medications', path: '/dashboard/medications' },
  { id: 'contacts',    label: 'Contacts',    path: '/dashboard/contacts' },
  { id: 'leads',       label: 'Leads',       path: '/dashboard/leads' },
  { id: 'invoices',    label: 'Invoices',    path: '/dashboard/invoices' },
  { id: 'sentry',      label: 'Sentry',      path: '/dashboard/sentry' },
  { id: 'approvals',   label: 'Approvals',   path: '/dashboard/approvals' },
  { id: 'activity',    label: 'Activity',    path: '/dashboard/activity' },
  { id: 'settings',    label: 'Settings',    path: '/dashboard/settings' },
];

// ─── Pre-warm all tab imports immediately ───────────────────────────────────
// Trigger dynamic imports eagerly so chunks are fetched in the background.
// The resolved modules feed into React.lazy wrappers below.

const tabImports: Record<string, Promise<{ default: React.ComponentType }>> = {
  dashboard:   import('./tabs/dashboard-tab'),
  chat:        import('./tabs/chat-tab'),
  channels:    import('./tabs/channels-tab'),
  medications: import('./tabs/medications-tab'),
  contacts:    import('./tabs/contacts-tab'),
  leads:       import('./tabs/leads-tab'),
  invoices:    import('./tabs/invoices-tab'),
  sentry:      import('./tabs/sentry-tab'),
  approvals:   import('./tabs/approvals-tab'),
  activity:    import('./tabs/activity-tab'),
  settings:    import('./tabs/settings-tab'),
};

// Lazy wrappers that resolve from the already-triggered promises
const TabComponents: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  dashboard:   lazy(() => tabImports.dashboard),
  chat:        lazy(() => tabImports.chat),
  channels:    lazy(() => tabImports.channels),
  medications: lazy(() => tabImports.medications),
  contacts:    lazy(() => tabImports.contacts),
  leads:       lazy(() => tabImports.leads),
  invoices:    lazy(() => tabImports.invoices),
  sentry:      lazy(() => tabImports.sentry),
  approvals:   lazy(() => tabImports.approvals),
  activity:    lazy(() => tabImports.activity),
  settings:    lazy(() => tabImports.settings),
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

  // Determine initial tab — check sessionStorage first, then URL
  const initialIndex = useMemo(() => {
    if (typeof window === 'undefined') return 0;
    const stored = sessionStorage.getItem('bitbit-tab');
    if (stored) {
      const idx = TABS.findIndex(t => t.id === stored);
      if (idx >= 0) return idx;
    }
    return pathToTabIndex(window.location.pathname);
  }, []);

  // State: nav indicator (instant) and rendered page (with transition)
  const [activeNavIndex, setActiveNavIndex] = useState(initialIndex);
  const [renderedPage, setRenderedPage] = useState(initialIndex);
  const [transitionDir, setTransitionDir] = useState<'up' | 'down' | null>(null);
  const prevPageRef = useRef(initialIndex);

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

  const currentPage = TABS[activeNavIndex]?.label || 'Dashboard';

  return (
    <SplashScreen ready={tabsReady} minDisplayMs={1200}>
    <BitBitOverlay currentPage={currentPage} activeTabId={TABS[activeNavIndex].id}>
      <div className="bb-layout bb-dot-grid">
        <div className="bb-sidebar-area">
          <SidebarNav
            avatarFallback={initials}
            displayName={displayName}
            activeTabId={TABS[activeNavIndex].id}
            onTabChange={navigateToId}
            tabs={TABS}
          />
        </div>

        {/* SPA Content Area */}
        <div
          className="bb-spa-content"
          style={{ gridColumn: 2, gridRow: '1 / -1', position: 'relative', overflow: 'hidden' }}
        >
          {TABS.map((tab, index) => {
            const isActive = index === renderedPage;
            const Comp = TabComponents[tab.id];

            return (
              <div
                key={tab.id}
                className="bb-tab-panel"
                data-active={isActive}
                data-dir={isActive && transitionDir ? transitionDir : undefined}
                aria-hidden={!isActive}
              >
                <Suspense fallback={<TabFallback />}>
                  <Comp />
                </Suspense>
              </div>
            );
          })}
        </div>
      </div>
    </BitBitOverlay>
    </SplashScreen>
  );
}

export default SPAShell;
