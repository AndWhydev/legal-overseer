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
  Sun,
  Moon,
} from 'lucide-react';
import type { TabDef } from './spa-shell';
import { NotificationCenter } from './notification-center';
import { ConnectionStatus } from './connection-status';
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

// ─── Spring physics for wheel navigation ────────────────────────────────────

const WHEEL_THRESHOLD = 50;
const WHEEL_COOLDOWN_MS = 200;

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

  // Filter nav items through module gating + composition profile
  const { modules: enabledModules, composition } = useEnabledModules();
  const filteredPrimaryTabIds = composition.primaryModules.filter(id => enabledModules.includes(id));
  const filteredAdvancedTabIds = composition.advancedModules.filter(id => enabledModules.includes(id));
  const filteredMainTabIds = [...filteredPrimaryTabIds, ...filteredAdvancedTabIds];

  // Theme toggle
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    return (localStorage.getItem('bitbit-theme') as 'dark' | 'light') || 'dark';
  });

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('bitbit-theme', next);
      document.documentElement.className = next;
      return next;
    });
  }, []);

  // Progressive disclosure: show/hide advanced tabs
  const [showAdvanced, setShowAdvanced] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('bb-show-advanced') === 'true';
  });

  const toggleAdvanced = useCallback(() => {
    setShowAdvanced(prev => {
      const next = !prev;
      localStorage.setItem('bb-show-advanced', String(next));
      return next;
    });
  }, []);

  // State for badge counts
  const [badgeCounts, setBadgeCounts] = useState({
    approvals: 0,
    leads: 0,
    invoices: 0,
  });
  const clientRef = useRef<SupabaseClient | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Keep a ref to the current main tab list for imperative callbacks
  const mainTabIdsRef = useRef(filteredMainTabIds);
  mainTabIdsRef.current = filteredMainTabIds;

  // ── Update nav indicator via CSS variable (zero React re-renders) ───────
  const updateIndicator = useCallback((tabId: string) => {
    const mainIds = mainTabIdsRef.current;
    if (!indicatorRef.current) return;

    // For main tabs, use continuous offset; settings is separate
    if (mainIds.includes(tabId)) {
      const mainIdx = mainIds.indexOf(tabId);
      indicatorRef.current.style.setProperty('--active-offset', `${mainIdx * NAV_ITEM_STRIDE}px`);
      indicatorRef.current.style.opacity = '1';
      indicatorRef.current.dataset.section = 'main';
    } else {
      // Settings is in bottom section — hide main indicator
      indicatorRef.current.style.opacity = '0';
    }
  }, []);

  // Update indicator when activeTabId changes (driven by parent state)
  useEffect(() => {
    updateIndicator(activeTabId);
  }, [activeTabId, updateIndicator]);

  // ── Scroll-based tab switching with spring feel ─────────────────────────
  const accumulatedDelta = useRef(0);
  const lastWheelTime = useRef(0);
  const wheelCooldown = useRef(false);

  const handleWheel = useCallback((e: WheelEvent) => {
    if (!onTabChange || tabs.length === 0) return;
    e.preventDefault();

    if (wheelCooldown.current) return;

    const now = performance.now();
    // Reset accumulator if wheel paused
    if (now - lastWheelTime.current > WHEEL_COOLDOWN_MS) {
      accumulatedDelta.current = 0;
    }
    lastWheelTime.current = now;

    accumulatedDelta.current += e.deltaY;

    if (Math.abs(accumulatedDelta.current) > WHEEL_THRESHOLD) {
      const direction = accumulatedDelta.current > 0 ? 1 : -1;
      // Only cycle through main tabs, not settings
      const wheelTabs = tabs.filter(t => mainTabIdsRef.current.includes(t.id));
      const currentIdx = wheelTabs.findIndex(t => t.id === activeTabId);
      if (currentIdx < 0) return;

      const nextIdx = (currentIdx + direction + wheelTabs.length) % wheelTabs.length;
      const nextTab = wheelTabs[nextIdx];

      accumulatedDelta.current = 0;
      onTabChange(nextTab.id);

      // Cooldown to prevent overshooting
      wheelCooldown.current = true;
      setTimeout(() => { wheelCooldown.current = false; }, WHEEL_COOLDOWN_MS);
    }
  }, [activeTabId, onTabChange, tabs]);

  useEffect(() => {
    const el = sidebarRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

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

    return (
      <button
        key={tabId}
        onClick={() => onTabChange?.(tabId)}
        className={[
          'bb-sidebar__item',
          active && 'bb-sidebar__item--active',
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
      <nav className="bb-sidebar__nav" ref={navRef} role="tablist" aria-label="Dashboard sections" aria-orientation="vertical">
        {/* Sliding active indicator — CSS transform only, no re-renders */}
        <div
          ref={indicatorRef}
          className="bb-sidebar__indicator"
          aria-hidden="true"
        />
        {filteredMainTabIds.map(id => renderNavItem(id, tabLabels[id] || id))}

        {/* Advanced toggle */}
        <button
          onClick={toggleAdvanced}
          className="bb-sidebar__item"
          data-tooltip={showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
          aria-label={showAdvanced ? 'Hide advanced tabs' : 'Show advanced tabs'}
          style={{
            marginTop: '4px',
            opacity: 0.6,
            transition: 'opacity 0.15s, transform 0.2s',
          }}
        >
          <ChevronDown
            size={16}
            strokeWidth={2}
            style={{
              transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }}
          />
        </button>
      </nav>

      {/* Notification Center */}
      <div style={{ padding: '8px 0', display: 'flex', justifyContent: 'center' }}>
        <NotificationCenter onTabChange={onTabChange} />
      </div>

      {/* Connection status + Theme toggle + Settings pinned to bottom */}
      <div className="bb-sidebar__bottom">
        <ConnectionStatus />
        <button
          onClick={toggleTheme}
          className="bb-sidebar__item"
          data-tooltip={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={18} strokeWidth={1.8} /> : <Moon size={18} strokeWidth={1.8} />}
        </button>
        {renderNavItem('settings', tabLabels['settings'] || 'Settings')}
      </div>

      {/* User Avatar */}
      <div className="bb-sidebar__avatar" data-tooltip={displayName || 'Profile'} role="button" tabIndex={0}>
        {avatarUrl ? (
          <Image src={avatarUrl} alt="User avatar" width={32} height={32} className="bb-sidebar__avatar-img" />
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
    </aside>
  );
}

export default SidebarNav;
