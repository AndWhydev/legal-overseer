'use client';

import React, { useCallback, useRef, useEffect, useState } from 'react';
import Image from 'next/image';
import {
  Settings,
  LogOut,
} from 'lucide-react';
import type { TabDef } from './spa-shell';
import { SidebarRail } from './sidebar-rail';
import { SidebarPanel } from './sidebar-panel';
import { useEnabledModules } from '@/lib/modules/use-enabled-modules';
import { getCategoryForTab, SIDEBAR_CATEGORIES } from '@/lib/modules/registry';
import { useBadgeCounts } from '@/hooks/use-badge-counts';

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
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  // Module gating + composition profile
  const { modules: enabledModules, composition } = useEnabledModules();

  // Badge counts via shared hook
  const badgeCounts = useBadgeCounts('sidebar-badge-counts');

  // Category state
  const derivedCategory = getCategoryForTab(activeTabId) ?? 'home';
  const [activeCategory, setActiveCategory] = useState<string>(derivedCategory);
  const [panelOpen, setPanelOpen] = useState(false);

  // Filter categories by enabled modules
  const filterByModules = (categories: typeof SIDEBAR_CATEGORIES) => {
    return categories
      .map(cat => ({
        ...cat,
        items: cat.items.filter(id => enabledModules.includes(id)),
      }))
      .filter(cat => cat.items.length > 0);
  };

  // Sync category when activeTabId changes externally (e.g. spacebar→home, global search, bb-navigate)
  useEffect(() => {
    const cat = getCategoryForTab(activeTabId);
    if (cat && cat !== activeCategory) {
      setActiveCategory(cat);
      // Auto-close panel when navigating to a directNav category (Home)
      const catDef = SIDEBAR_CATEGORIES.find(c => c.id === cat);
      if (catDef?.directNav) {
        setPanelOpen(false);
      }
    }
  }, [activeTabId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Propagate panel state to layout for grid column sizing
  useEffect(() => {
    const layout = document.querySelector('.bb-layout');
    if (!layout) return;
    if (panelOpen) {
      layout.setAttribute('data-sidebar-panel-open', '');
    } else {
      layout.removeAttribute('data-sidebar-panel-open');
    }
  }, [panelOpen]);

  // Filter categories by enabled modules
  const visibleCategories = filterByModules(composition.categories);

  // Get the active category definition
  const activeCategoryDef = SIDEBAR_CATEGORIES.find(c => c.id === activeCategory) ?? null;

  // Handle category click
  const handleCategoryChange = useCallback((categoryId: string) => {
    const cat = SIDEBAR_CATEGORIES.find(c => c.id === categoryId);
    if (!cat) return;

    // Direct navigation category (Home) — navigate directly, close panel
    if (cat.directNav) {
      setActiveCategory(categoryId);
      setPanelOpen(false);
      onTabChange?.(cat.directNav);
      return;
    }

    // Same category clicked — toggle panel
    if (categoryId === activeCategory) {
      setPanelOpen(prev => !prev);
      return;
    }

    // Different category — navigate to first enabled item + open panel
    setActiveCategory(categoryId);
    setPanelOpen(true);
    const firstEnabledItem = cat.items.find(id => enabledModules.includes(id));
    if (firstEnabledItem) {
      onTabChange?.(firstEnabledItem);
    }
  }, [activeCategory, onTabChange, enabledModules]);

  // Handle tab selection from panel
  const handleTabChange = useCallback((tabId: string) => {
    onTabChange?.(tabId);
    // Panel stays open — user may want to switch between sub-items
  }, [onTabChange]);

  // Close profile popover on click outside / Escape
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

  // Escape cascade: close panel → navigate home
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Don't interfere if profile menu is handling its own Escape
      if (profileOpen) return;
      // Don't interfere if user is in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (panelOpen) {
        e.stopPropagation();
        setPanelOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [panelOpen, profileOpen]);

  // Build labels from tabs, applying composition overrides
  const tabLabels: Record<string, string> = {};
  tabs.forEach(t => { tabLabels[t.id] = composition.labelOverrides[t.id] ?? t.label; });

  return (
    <aside
      className="bb-sidebar"
      role="navigation"
      aria-label="Main navigation"
      ref={sidebarRef}
      data-panel-open={panelOpen || undefined}
    >
      <SidebarRail
        categories={visibleCategories}
        activeCategory={activeCategory}
        badgeCounts={badgeCounts}
        onCategoryChange={handleCategoryChange}
        avatarUrl={avatarUrl}
        avatarFallback={avatarFallback}
        onAvatarClick={() => setProfileOpen(o => !o)}
        profileOpen={profileOpen}
      />

      <SidebarPanel
        category={activeCategoryDef}
        open={panelOpen}
        activeTabId={activeTabId}
        enabledModules={enabledModules}
        badgeCounts={badgeCounts}
        labelOverrides={tabLabels}
        onTabChange={handleTabChange}
      />

      {/* Profile popover — positioned relative to sidebar */}
      <div style={{ position: 'absolute', bottom: '16px', left: '8px' }} ref={profileMenuRef}>
        {profileOpen && (
          <div
            role="menu"
            style={{
              position: 'absolute',
              bottom: '0',
              left: 'calc(var(--sidebar-rail-width, 56px) + 4px)',
              minWidth: '180px',
              background: 'var(--glass-bg-heavy)',
              backdropFilter: 'var(--glass-card-blur)',
              WebkitBackdropFilter: 'var(--glass-card-blur)',
              border: '1px solid var(--glass-interactive-border)',
              borderRadius: '12px',
              boxShadow: 'var(--card-shadow-hover), 0 0 0 1px var(--glass-card-border)',
              padding: '6px',
              zIndex: 'var(--z-dropdown)',
              animation: 'bb-profile-pop 200ms cubic-bezier(0.2, 0.9, 0.3, 1)',
            }}
          >
            {/* User info */}
            <div
              style={{
                padding: '10px 12px 8px',
                borderBottom: '1px solid var(--glass-divider)',
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
                e.currentTarget.style.background = 'var(--glass-hover-bg)';
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

            {/* Divider */}
            <div style={{ height: '1px', background: 'var(--glass-divider)', margin: '4px 0' }} />

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
