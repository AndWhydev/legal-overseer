'use client';

import React, { useCallback, useRef, useEffect, useState } from 'react';
import Image from 'next/image';
import {
  LayoutDashboard,
  MessageSquare,
  Inbox,
  Cable,
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
  ChevronDown,
  LogOut,
  User,
} from 'lucide-react';
import type { TabDef } from './spa-shell';
import { createClient } from '@/lib/supabase/client';
import { useEnabledModules } from '@/lib/modules/use-enabled-modules';
import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Nav icon mapping ───────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  dashboard:   LayoutDashboard,
  chat:        MessageSquare,
  inbox:       Inbox,
  channels:    Cable,
  medications: Pill,
  contacts:    Users,
  leads:       Handshake,
  invoices:    ReceiptText,
  tenders:     FileSearch,
  sentry:      ShieldAlert,
  approvals:   ShieldCheck,
  'ad-scripts': Film,
  'ai-search': SearchCheck,
  reports:     FileText,
  knowledge:   Brain,
  costs:       DollarSign,
  analytics:   BarChart3,
  activity:    Activity,
  admin:       Wrench,
  settings:    Settings,
};

// Note: PRIMARY/ADVANCED tab lists are now driven by composition profiles via useEnabledModules()

// ─── Constants ──────────────────────────────────────────────────────────────

const NAV_ITEM_SIZE = 48;  // px — matches .bb-sidebar__item height
const NAV_ITEM_GAP = 8;    // px — matches --gap-sm (0.5rem)
const NAV_ITEM_STRIDE = NAV_ITEM_SIZE + NAV_ITEM_GAP;

// ─── Wheel navigation tuning ─────────────────────────────────────────────

const WHEEL_STEP_INTERVAL = 160; // ms — minimum time between tab switches
const WHEEL_NOISE_GATE = 8;      // ignore tiny sub-pixel deltas

// ─── Props ──────────────────────────────────────────────────────────────────

interface SidebarNavProps {
  avatarUrl?: string;
  avatarFallback?: string;
  displayName?: string;
  onSignOut?: () => void;
  activeTabId?: string;
  onTabChange?: (tabId: string) => void;
  tabs?: TabDef[];
}

// ─── Component ──────────────────────────────────────────────────────────────

export function SidebarNav({
  avatarUrl,
  avatarFallback = 'U',
  displayName,
  onSignOut,
  activeTabId = 'dashboard',
  onTabChange,
  tabs = [],
}: SidebarNavProps) {
  const sidebarRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const chevronRef = useRef<HTMLButtonElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  // Filter nav items through module gating + composition profile
  const { modules: enabledModules, composition } = useEnabledModules();
  const filteredPrimaryTabIds = composition.primaryModules.filter(id => enabledModules.includes(id));
  const filteredAdvancedTabIds = composition.advancedModules.filter(id => enabledModules.includes(id));
  const filteredMainTabIds = [...filteredPrimaryTabIds, ...filteredAdvancedTabIds];

  // Progressive disclosure: show/hide advanced tabs
  const [showAdvanced, setShowAdvanced] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('bb-show-advanced') === 'true';
  });

  // State for badge counts
  const [badgeCounts, setBadgeCounts] = useState({
    approvals: 0,
    leads: 0,
    invoices: 0,
  });
  const clientRef = useRef<SupabaseClient | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Keep refs for imperative callbacks (avoids re-creating handlers on every state change)
  const mainTabIdsRef = useRef(filteredMainTabIds);
  mainTabIdsRef.current = filteredMainTabIds;
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const showAdvancedRef = useRef(showAdvanced);
  showAdvancedRef.current = showAdvanced;
  const onTabChangeRef = useRef(onTabChange);
  onTabChangeRef.current = onTabChange;

  // ── Update nav indicator via actual button position (zero React re-renders)
  const updateIndicator = useCallback((tabId: string) => {
    const mainIds = mainTabIdsRef.current;
    if (!indicatorRef.current || !navRef.current) return;

    if (mainIds.includes(tabId)) {
      // Read the actual button position — robust against pseudo-elements / padding
      const btn = navRef.current.querySelector(`#tab-${tabId}`) as HTMLElement | null;
      if (btn) {
        indicatorRef.current.style.setProperty('--active-offset', `${btn.offsetTop}px`);
      } else {
        // Fallback to calculated position
        const mainIdx = mainIds.indexOf(tabId);
        indicatorRef.current.style.setProperty('--active-offset', `${mainIdx * NAV_ITEM_STRIDE}px`);
      }
      indicatorRef.current.style.opacity = '1';
      indicatorRef.current.dataset.section = 'main';
    } else {
      indicatorRef.current.style.opacity = '0';
    }
  }, []);

  // Update indicator when activeTabId changes OR when the button layout changes
  // (module gating, advanced toggle, dev toolbar overrides all shift button positions)
  const layoutKey = `${filteredMainTabIds.join(',')}|${showAdvanced}`;
  useEffect(() => {
    updateIndicator(activeTabId);
  }, [activeTabId, updateIndicator, layoutKey]);

  // ── Position chevron toggle: collapsed = after last primary tab, expanded = natural bottom ──
  const updateChevronPosition = useCallback(() => {
    const chevron = chevronRef.current;
    const nav = navRef.current;
    if (!chevron || !nav) return;

    if (showAdvancedRef.current) {
      // Expanded: chevron sits at its natural position (bottom of nav-wrapper)
      chevron.style.transform = 'translateY(0)';
      return;
    }

    // If nav overflows (primary tabs don't all fit), chevron stays at natural bottom
    if (nav.scrollHeight > nav.clientHeight + 2) {
      chevron.style.transform = 'translateY(0)';
      return;
    }

    // Nav doesn't overflow — position chevron right after last primary button
    const lastPrimaryId = filteredPrimaryTabIds[filteredPrimaryTabIds.length - 1];
    if (!lastPrimaryId) return;

    const lastBtn = nav.querySelector(`#tab-${lastPrimaryId}`) as HTMLElement | null;
    if (!lastBtn) return;

    // offsetTop is layout-based (unaffected by CSS transforms) — avoids feedback loops
    const targetTop = nav.offsetTop + lastBtn.offsetTop + lastBtn.offsetHeight + 8; // 8px gap
    const chevronNaturalTop = chevron.offsetTop; // layout position, stable
    const offset = targetTop - chevronNaturalTop;

    chevron.style.transform = `translateY(${offset}px)`;
  }, [filteredPrimaryTabIds]);

  // Re-run chevron positioning when layout changes
  useEffect(() => {
    updateChevronPosition();
  }, [updateChevronPosition, layoutKey]);

  // ── Scroll-aware fade hints on nav overflow ──────────────────────────────
  const updateScrollFades = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
    const canScrollUp = nav.scrollTop > 2;
    const canScrollDown = nav.scrollHeight - nav.scrollTop - nav.clientHeight > 2;
    nav.dataset.scrollTop = String(canScrollUp);
    nav.dataset.scrollBottom = String(canScrollDown);
  }, []);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    updateScrollFades();
    nav.addEventListener('scroll', updateScrollFades, { passive: true });
    return () => nav.removeEventListener('scroll', updateScrollFades);
  }, [updateScrollFades, layoutKey]); // re-run when tabs appear/disappear

  // Progressive disclosure toggle — defined after updateScrollFades/updateIndicator
  const toggleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const toggleAdvanced = useCallback(() => {
    setShowAdvanced(prev => {
      const next = !prev;
      localStorage.setItem('bb-show-advanced', String(next));
      return next;
    });
    // Cancel any pending update from a previous rapid toggle
    if (toggleTimerRef.current) clearTimeout(toggleTimerRef.current);
    // After render: keep the currently active tab in view (don't scroll away)
    requestAnimationFrame(() => {
      const nav = navRef.current;
      if (nav) {
        const activeBtn = nav.querySelector(`#tab-${activeTabIdRef.current}`) as HTMLElement | null;
        if (activeBtn) {
          const btnTop = activeBtn.offsetTop;
          const btnBottom = btnTop + activeBtn.offsetHeight;
          const scrollTop = nav.scrollTop;
          const viewHeight = nav.clientHeight;
          const pad = 8;
          if (btnTop - pad < scrollTop) {
            nav.scrollTo({ top: Math.max(0, btnTop - pad), behavior: 'auto' });
          } else if (btnBottom + pad > scrollTop + viewHeight) {
            nav.scrollTo({ top: btnBottom - viewHeight + pad, behavior: 'auto' });
          }
        }
      }
      updateScrollFades();
      updateIndicator(activeTabIdRef.current);
      updateChevronPosition();
    });
    // Delayed update after stagger animation settles
    toggleTimerRef.current = setTimeout(() => {
      updateScrollFades();
      updateIndicator(activeTabIdRef.current);
      updateChevronPosition();
      toggleTimerRef.current = null;
    }, 350);
  }, [updateScrollFades, updateIndicator, updateChevronPosition]);

  // Scroll active item into view — smooth follow like a native desktop app
  useEffect(() => {
    if (!navRef.current) return;
    const activeBtn = navRef.current.querySelector(`#tab-${activeTabId}`) as HTMLElement | null;
    if (!activeBtn) return;

    const nav = navRef.current;
    const btnTop = activeBtn.offsetTop;
    const btnBottom = btnTop + activeBtn.offsetHeight;
    const scrollTop = nav.scrollTop;
    const viewHeight = nav.clientHeight;
    const pad = 8;

    if (btnTop - pad < scrollTop) {
      nav.scrollTo({ top: Math.max(0, btnTop - pad), behavior: 'smooth' });
    } else if (btnBottom + pad > scrollTop + viewHeight) {
      nav.scrollTo({ top: btnBottom - viewHeight + pad, behavior: 'smooth' });
    }

    // Update fade hints immediately + after smooth scroll animation settles
    updateScrollFades();
    const t = setTimeout(updateScrollFades, 300);
    return () => clearTimeout(t);
  }, [activeTabId, updateScrollFades]);

  // ── RAF-batched wheel navigation — stable refs, no re-registration ─────
  const wheelAccum = useRef(0);
  const wheelRafId = useRef(0);
  const lastStepTime = useRef(0);

  // Stable callback — reads everything from refs / DOM, never recreated
  const processWheelRef = useRef(() => {});
  processWheelRef.current = () => {
    wheelRafId.current = 0;
    const cb = onTabChangeRef.current;
    const nav = navRef.current;
    if (!cb || !nav) return;

    const now = performance.now();
    if (now - lastStepTime.current < WHEEL_STEP_INTERVAL) {
      wheelAccum.current = 0;
      return;
    }

    const delta = wheelAccum.current;
    wheelAccum.current = 0;

    if (Math.abs(delta) < WHEEL_NOISE_GATE) return;

    const direction = delta > 0 ? 1 : -1;

    // Query the DOM for actually visible tab buttons — single source of truth.
    // This avoids any mismatch between JS filter logic and what's rendered.
    const buttons = nav.querySelectorAll<HTMLElement>('.bb-sidebar__item[role="tab"]');
    const visibleIds: string[] = [];
    buttons.forEach(btn => {
      // Skip buttons hidden via display:none (advanced tabs when collapsed)
      if (btn.offsetParent !== null) {
        const id = btn.id.replace('tab-', '');
        if (id) visibleIds.push(id);
      }
    });

    const currentIdx = visibleIds.indexOf(activeTabIdRef.current);
    if (currentIdx < 0) return;

    let nextIdx = currentIdx + direction;
    if (nextIdx >= visibleIds.length) nextIdx = 0;
    if (nextIdx < 0) nextIdx = visibleIds.length - 1;

    lastStepTime.current = now;
    cb(visibleIds[nextIdx]);
  };

  // Mount once — never re-registers
  useEffect(() => {
    const el = sidebarRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      wheelAccum.current += e.deltaY;
      if (!wheelRafId.current) {
        wheelRafId.current = requestAnimationFrame(() => processWheelRef.current());
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (wheelRafId.current) cancelAnimationFrame(wheelRafId.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Close profile popover on click outside / Escape ──────────────────
  useEffect(() => {
    if (!profileOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setProfileOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [profileOpen]);

  // ── Initialize Supabase client ─────────────────────────────────────────
  useEffect(() => {
    const client = createClient();
    if (!client) return;
    clientRef.current = client;
  }, []);

  // ── Fetch badge counts ─────────────────────────────────────────────────
  const fetchBadgeCounts = useCallback(async () => {
    if (!clientRef.current) return;

    try {
      const [approvalsRes, leadsRes, invoicesRes] = await Promise.all([
        clientRef.current
          .from('approval_queue')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        clientRef.current
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'new'),
        clientRef.current
          .from('invoices')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'overdue'),
      ]);

      setBadgeCounts({
        approvals: approvalsRes.count || 0,
        leads: leadsRes.count || 0,
        invoices: invoicesRes.count || 0,
      });
    } catch (err) {
      console.warn('Error fetching badge counts:', err);
    }
  }, []);

  // Initial fetch + realtime with polling fallback
  useEffect(() => {
    if (!clientRef.current) return;
    const client = clientRef.current;

    fetchBadgeCounts();

    // Try realtime subscription
    try {
      const channel = client
        .channel('sidebar-badge-counts')
        .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'approval_queue' }, () => fetchBadgeCounts())
        .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'leads' }, () => fetchBadgeCounts())
        .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'invoices' }, () => fetchBadgeCounts())
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED' && pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        });

      // Fallback polling
      pollIntervalRef.current = setInterval(() => fetchBadgeCounts(), 30000);

      return () => {
        client.removeChannel(channel);
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      };
    } catch {
      pollIntervalRef.current = setInterval(() => fetchBadgeCounts(), 30000);
      return () => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      };
    }
  }, [fetchBadgeCounts]);

  // ── Render nav item ─────────────────────────────────────────────────────

  const renderNavItem = (tabId: string, label: string) => {
    const Icon = ICON_MAP[tabId];
    if (!Icon) return null;
    const active = tabId === activeTabId;

    // Determine badge color and count
    let badgeColor: string | null = null;
    let badgeCount = 0;

    if (tabId === 'approvals' && badgeCounts.approvals > 0) {
      badgeColor = 'var(--bb-orange)';
      badgeCount = badgeCounts.approvals;
    } else if (tabId === 'leads' && badgeCounts.leads > 0) {
      badgeColor = 'var(--bb-blue)';
      badgeCount = badgeCounts.leads;
    } else if (tabId === 'invoices' && badgeCounts.invoices > 0) {
      badgeColor = 'var(--bb-red)';
      badgeCount = badgeCounts.invoices;
    }

    const isAdvanced = filteredAdvancedTabIds.includes(tabId);
    const advIdx = isAdvanced ? filteredAdvancedTabIds.indexOf(tabId) : -1;

    return (
      <button
        key={tabId}
        onClick={() => onTabChange?.(tabId)}
        className={[
          'bb-sidebar__item',
          active && 'bb-sidebar__item--active',
          isAdvanced && showAdvanced && 'bb-sidebar__item--stagger-in',
        ].filter(Boolean).join(' ')}
        role="tab"
        id={`tab-${tabId}`}
        aria-selected={active}
        aria-controls={`tabpanel-${tabId}`}
        data-tooltip={label}
        data-advanced={isAdvanced || undefined}
        aria-label={label}
        style={{
          position: 'relative',
          display: isAdvanced && !showAdvanced ? 'none' : undefined,
          ...(isAdvanced && showAdvanced ? { '--stagger-index': advIdx, animationDelay: `${advIdx * 50}ms` } as React.CSSProperties : {}),
        }}
      >
        <Icon size={20} strokeWidth={1.8} />
        {badgeColor && badgeCount > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              minWidth: '16px',
              height: '16px',
              borderRadius: '8px',
              backgroundColor: badgeColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '9px',
              fontWeight: 700,
              color: '#fff',
              lineHeight: 1,
              padding: '0 3px',
            }}
            aria-hidden="true"
            title={`${badgeCount} pending`}
          >
            {badgeCount > 99 ? '99+' : badgeCount}
          </div>
        )}
      </button>
    );
  };

  // Build labels from tabs, applying composition overrides
  const tabLabels: Record<string, string> = {};
  tabs.forEach(t => { tabLabels[t.id] = composition.labelOverrides[t.id] ?? t.label; });

  return (
    <aside className="bb-sidebar" role="navigation" aria-label="Main navigation" ref={sidebarRef}>
      {/* Logo */}
      <div className="bb-sidebar__logo" aria-label="BitBit">
        <Image src="/bitbit-logo.svg" alt="BitBit" width={28} height={28} priority style={{ filter: 'brightness(0) invert(1)' }} />
      </div>

      {/* Main Nav Icons with sliding indicator */}
      <div className="bb-sidebar__nav-wrapper">
        <nav
          className="bb-sidebar__nav bb-sidebar__nav--scrollable"
          ref={navRef}
          role="tablist"
          aria-label="Dashboard sections"
          aria-orientation="vertical"
        >
          {/* Sliding active indicator — CSS transform only, no re-renders */}
          <div
            ref={indicatorRef}
            className="bb-sidebar__indicator"
            aria-hidden="true"
          />
          {filteredMainTabIds.map(id => renderNavItem(id, tabLabels[id] || id))}
        </nav>
        {/* Fade overlays — absolutely positioned to avoid flex interference */}
        <div className="bb-sidebar__fade bb-sidebar__fade--top" aria-hidden="true" />
        <div className="bb-sidebar__fade bb-sidebar__fade--bottom" aria-hidden="true" />

        {/* Chevron toggle — pinned at bottom of nav-wrapper, always visible */}
        {filteredAdvancedTabIds.length > 0 && (
          <button
            ref={chevronRef}
            onClick={toggleAdvanced}
            className={[
              'bb-sidebar__item',
              'bb-sidebar__chevron-toggle',
              showAdvanced && 'bb-sidebar__chevron-toggle--open',
            ].filter(Boolean).join(' ')}
            data-tooltip={showAdvanced ? 'Less' : 'More'}
            aria-label={showAdvanced ? 'Hide advanced tabs' : 'Show advanced tabs'}
          >
            <ChevronDown
              size={16}
              strokeWidth={2}
              className="bb-sidebar__chevron-icon"
            />
          </button>
        )}
      </div>

      {/* Separator divider between nav and avatar */}
      <div
        style={{
          width: '32px',
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)',
          margin: '8px auto',
        }}
        aria-hidden="true"
      />

      {/* User Avatar + Profile Menu */}
      <div style={{ position: 'relative' }} ref={profileMenuRef}>
        <div
          className="bb-sidebar__avatar"
          data-tooltip={!profileOpen ? (displayName || 'Profile') : undefined}
          role="button"
          tabIndex={0}
          onClick={() => setProfileOpen(o => !o)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setProfileOpen(o => !o); } }}
          aria-expanded={profileOpen}
          aria-haspopup="true"
        >
          {avatarUrl ? (
            <Image src={avatarUrl} alt="User avatar" width={36} height={36} className="bb-sidebar__avatar-img" />
          ) : (
            <span
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              {avatarFallback}
            </span>
          )}
        </div>

        {/* Profile popover menu */}
        {profileOpen && (
          <div
            role="menu"
            style={{
              position: 'absolute',
              bottom: '0',
              left: 'calc(100% + 12px)',
              minWidth: '180px',
              background: 'rgba(15, 20, 30, 0.95)',
              backdropFilter: 'blur(24px) saturate(1.2)',
              WebkitBackdropFilter: 'blur(24px) saturate(1.2)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              boxShadow: '0 16px 48px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.04)',
              padding: '6px',
              zIndex: 'var(--z-dropdown)',
              animation: 'bb-profile-pop 0.15s ease-out',
            }}
          >
            {/* User info */}
            <div
              style={{
                padding: '10px 12px 8px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                marginBottom: '4px',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {displayName || 'User'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Manage your account
              </div>
            </div>

            {/* Settings */}
            <button
              role="menuitem"
              onClick={() => { setProfileOpen(false); onTabChange?.('settings'); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 12px',
                background: 'transparent',
                border: 'none',
                borderRadius: '8px',
                color: 'var(--text-secondary)',
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.12s ease',
                textAlign: 'left',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              <Settings size={16} strokeWidth={1.8} />
              Settings
            </button>

            {/* Profile / Account */}
            <button
              role="menuitem"
              onClick={() => { setProfileOpen(false); onTabChange?.('settings'); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 12px',
                background: 'transparent',
                border: 'none',
                borderRadius: '8px',
                color: 'var(--text-secondary)',
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.12s ease',
                textAlign: 'left',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              <User size={16} strokeWidth={1.8} />
              Profile
            </button>

            {/* Divider */}
            <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.06)', margin: '4px 0' }} />

            {/* Sign Out */}
            <button
              role="menuitem"
              onClick={() => { setProfileOpen(false); onSignOut?.(); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 12px',
                background: 'transparent',
                border: 'none',
                borderRadius: '8px',
                color: '#ef4444',
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.12s ease',
                textAlign: 'left',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <LogOut size={16} strokeWidth={1.8} />
              Sign out
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

export default SidebarNav;
