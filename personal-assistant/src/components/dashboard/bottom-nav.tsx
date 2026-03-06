'use client';

import React, { useCallback, useRef, useEffect, useState } from 'react';
import {
  LayoutDashboard,
  MessageSquare,
  Inbox,
  BellRing,
  Plug,
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
  'creator-studio': BellRing,
  connections: Plug,
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

// ─── Props ──────────────────────────────────────────────────────────────────

interface BottomNavProps {
  avatarUrl?: string;
  avatarFallback?: string;
  displayName?: string;
  onSignOut?: () => void;
  activeTabId?: string;
  onTabChange?: (tabId: string) => void;
  tabs?: TabDef[];
}

// ─── Component ──────────────────────────────────────────────────────────────

export function BottomNav({
  avatarUrl,
  avatarFallback = 'U',
  displayName,
  onSignOut,
  activeTabId = 'dashboard',
  onTabChange,
  tabs = [],
}: BottomNavProps) {
  // Filter nav items through module gating + composition profile
  const { modules: enabledModules, composition } = useEnabledModules();
  const filteredPrimaryTabIds = composition.primaryModules.filter(id => enabledModules.includes(id));

  // State for badge counts (same as sidebar)
  const [badgeCounts, setBadgeCounts] = useState({
    approvals: 0,
    leads: 0,
    invoices: 0,
  });
  const clientRef = useRef<SupabaseClient | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Keep refs for imperative callbacks
  const primaryTabIdsRef = useRef(filteredPrimaryTabIds);
  primaryTabIdsRef.current = filteredPrimaryTabIds;
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const onTabChangeRef = useRef(onTabChange);
  onTabChangeRef.current = onTabChange;

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
        .channel('bottom-nav-badge-counts')
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

    const activeColor = active ? '#FF5A1F' : '#94A3B8';
    const labelColor = active ? '#FF5A1F' : '#94A3B8';

    return (
      <button
        key={tabId}
        onClick={() => onTabChange?.(tabId)}
        className="bb-bottom-nav__item"
        role="tab"
        id={`bottom-tab-${tabId}`}
        aria-selected={active}
        aria-controls={`tabpanel-${tabId}`}
        aria-label={label}
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2px',
          width: '100%',
          height: '100%',
          padding: '0',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: activeColor,
          transition: 'color 0.15s ease',
        }}
      >
        <Icon size={20} strokeWidth={1.8} style={{ color: activeColor }} />
        <span
          style={{
            fontSize: '10px',
            fontWeight: active ? 600 : 500,
            color: labelColor,
            lineHeight: 1,
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            overflow: 'hidden',
            maxWidth: '100%',
          }}
        >
          {label}
        </span>
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

  // Build labels from tabs
  const tabLabels: Record<string, string> = {};
  tabs.forEach(t => { tabLabels[t.id] = composition.labelOverrides[t.id] ?? t.label; });

  return (
    <nav
      className="bb-bottom-nav"
      role="tablist"
      aria-label="Dashboard sections"
      aria-orientation="horizontal"
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'stretch',
        justifyContent: 'space-around',
        width: '100%',
        height: '100%',
        background: '#0A0F1A',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '0 4px',
        paddingBottom: 'env(safe-area-inset-bottom)',
        gap: '2px',
      }}
    >
      {filteredPrimaryTabIds.map(id => renderNavItem(id, tabLabels[id] || id))}
    </nav>
  );
}

export default BottomNav;
