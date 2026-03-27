'use client';

import React from 'react';
import type { KanbanColumn, Task } from '@/lib/types';
import { useDashboardStats } from '@/hooks/use-dashboard-stats';
import { useSeedData } from '@/hooks/use-seed-data';
import { useEnabledModules } from '@/lib/modules/use-enabled-modules';
import { useTheme } from '@/lib/theme/theme-provider';
import { getPack } from '@/lib/industry/registry';
import type { KPIConfig } from '@/lib/industry/types';
import { StatCard, MiniSparkline, MiniBarChart, MiniDonut, MiniGauge } from '@/components/ui/data-viz';
import { DailyBrief } from './daily-brief';
import { KanbanBoard } from './kanban-board';
import { InboxFeed } from './inbox-feed';
import { RoleStatusCards, RoleActivityFeed, AttentionView, RoleDetailView, IntelligenceWidgets } from '@/components/roles';
import type { RoleType } from '@/lib/bitbit-core';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DashboardRedesignProps {
  columns: KanbanColumn[];
  tasks: Task[];
  messages: any[];
  completedToday: number;
  totalActive: number;
}

// ─── Main Dashboard ─────────────────────────────────────────────────────────

export function DashboardRedesign({ columns, tasks, messages, completedToday, totalActive }: DashboardRedesignProps) {
  const [inboxCollapsed, setInboxCollapsed] = React.useState(false);
  const [edgeGlow, setEdgeGlow] = React.useState(0);
  const [selectedRole, setSelectedRole] = React.useState<RoleType | null>(null);
  const edgeRef = React.useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const { stats, loading } = useDashboardStats();
  const seed = useSeedData();
  const { industry } = useEnabledModules();
  const pack = getPack(industry ?? 'agency');
  const kpis: KPIConfig[] = pack.kpis ?? [];

  // Initialize collapse state from localStorage
  React.useEffect(() => {
    const stored = localStorage.getItem('bb-inbox-collapsed');
    if (stored !== null) {
      setInboxCollapsed(JSON.parse(stored));
    }
  }, []);

  // Save collapse state to localStorage
  const handleInboxCollapse = React.useCallback((collapsed: boolean) => {
    setInboxCollapsed(collapsed);
    localStorage.setItem('bb-inbox-collapsed', JSON.stringify(collapsed));
  }, []);

  // Edge-knock: fling cursor into right viewport edge → toggle inbox.
  // Uses mouseleave to catch the cursor exiting the browser (fast fling).
  // Knock flash gives tactile visual feedback on trigger.
  const knockArmedRef = React.useRef(true);
  const [knockFlash, setKnockFlash] = React.useState(false);
  const lastMouseXRef = React.useRef(0);

  const fireKnock = React.useCallback(() => {
    if (!knockArmedRef.current) return;
    knockArmedRef.current = false;
    // Tactile flash
    setKnockFlash(true);
    setTimeout(() => setKnockFlash(false), 300);
    handleInboxCollapse(!inboxCollapsed);
  }, [inboxCollapsed, handleInboxCollapse]);

  React.useEffect(() => {
    let rafId: number;

    const handleMouseMove = (e: MouseEvent) => {
      lastMouseXRef.current = e.clientX;
      const distFromEdge = window.innerWidth - e.clientX;

      // Re-arm once cursor moves away from edge
      if (distFromEdge > 80) {
        knockArmedRef.current = true;
      }

      // Direct edge hit (within 8px)
      if (distFromEdge <= 8) {
        fireKnock();
      }

      // Glow effect (only when collapsed) — throttled via rAF
      if (inboxCollapsed) {
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          const glowThreshold = 80;
          if (distFromEdge < glowThreshold) {
            setEdgeGlow(Math.min(1, (glowThreshold - distFromEdge) / glowThreshold));
          } else {
            setEdgeGlow(0);
          }
        });
      }
    };

    // Cursor left the browser window — check if it exited from the right side.
    // This is the primary detection for fast flings where mousemove never
    // reaches the edge because the cursor exits the viewport entirely.
    const handleMouseLeave = (e: MouseEvent) => {
      // e.clientX at the moment of exit — if it's in the right 25% of the
      // viewport, the cursor left through the right edge.
      const exitX = e.clientX || lastMouseXRef.current;
      if (exitX > window.innerWidth * 0.75) {
        fireKnock();
      }
    };

    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.documentElement.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(rafId);
    };
  }, [inboxCollapsed, fireKnock]);

  // Use seed kanban data when active, otherwise use props
  const displayColumns = seed.active && seed.data?.kanbanColumns ? seed.data.kanbanColumns : columns;
  const displayTasks = seed.active && seed.data?.kanbanTasks ? seed.data.kanbanTasks : tasks;

  const skeletonStyle: React.CSSProperties = {
    padding: '16px 20px',
    borderRadius: 'var(--radius-xl)',
    background: 'var(--bg-card)',
    backdropFilter: 'var(--glass-blur)',
    WebkitBackdropFilter: 'var(--glass-blur)',
    border: 'none',
    boxShadow: 'var(--card-shadow), var(--card-inset)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    minWidth: 200,
    animation: 'pulse 2s ease-in-out infinite',
  };

  const getChartNode = (kpi: KPIConfig): React.ReactNode => {
    switch (kpi.chart) {
      case 'sparkline':
        return (
          <MiniSparkline
            data={kpi.chartData}
            color={kpi.color}
            height={32}
            interactive
          />
        );
      case 'bar':
        return (
          <MiniBarChart
            data={kpi.chartData.map((v, i) => ({
              value: v,
              label: kpi.chartLabels?.[i],
              color: kpi.chartColors?.[i],
            }))}
            color={kpi.color}
            height={40}
            showLabels={!!kpi.chartLabels}
            interactive
          />
        );
      case 'donut':
        const donutSegments = kpi.chartSegments ?? kpi.chartData.map((v) => ({ value: v }));
        return (
          <MiniDonut
            segments={donutSegments}
            size={48}
            color={kpi.color}
            interactive
          />
        );
      case 'gauge':
        const gaugeValue = kpi.gaugeValue ?? kpi.chartData[kpi.chartData.length - 1] ?? 0;
        return (
          <MiniGauge
            value={gaugeValue}
            size={64}
            color={kpi.color}
            interactive
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      {/* KPI Row — driven by industry pack */}
      <div
        className="bb-stagger grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4"
      >
        {loading ? (
          Array.from({ length: 4 }, (_, i) => (
            <article key={i} aria-label="Loading" style={skeletonStyle}>
              <div className="h-3 w-1/2 rounded bg-muted" />
              <div className="h-9 w-[35%] rounded bg-muted" />
              <div className="h-8 w-full rounded bg-muted/50" />
              <div className="h-2.5 w-3/5 rounded bg-muted/50" />
            </article>
          ))
        ) : (
          kpis.map((kpi) => {
            const liveValue = kpi.dataKey && stats ? stats[kpi.dataKey] : undefined;
            const displayValue = liveValue !== undefined
              ? (typeof liveValue === 'number' ? liveValue.toLocaleString() : liveValue)
              : kpi.fallback;

            const chartNode = getChartNode(kpi);

            return (
              <StatCard
                key={kpi.key}
                label={kpi.label}
                value={displayValue}
                unit={kpi.unit}
                trend={kpi.trend}
                trendValue={kpi.trendValue}
                color={kpi.color}
                chart={chartNode}
                subtitle={kpi.subtitle}
              />
            );
          })
        )}
      </div>

      {/* Daily Brief */}
      <DailyBrief />

      {/* Role Detail drill-down (replaces roles section when active) */}
      {selectedRole ? (
        <RoleDetailView roleType={selectedRole} onBack={() => setSelectedRole(null)} />
      ) : (
        <>
          {/* Roles Section — status cards + attention + intelligence */}
          <div className="dashboard-roles-grid grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-4">
              <RoleStatusCards onRoleClick={(rt) => setSelectedRole(rt)} />
              <IntelligenceWidgets />
            </div>
            <AttentionView maxHeight="380px" />
          </div>

          {/* Role Activity Feed — unified timeline across all roles */}
          <RoleActivityFeed maxHeight="400px" />
        </>
      )}

      {/* Kanban + Inbox side-by-side */}
      <div
        className="dashboard-main-grid flex flex-1 gap-5 overflow-hidden"
        style={{ minHeight: 0 }}
      >
        {/* Kanban Board */}
        <div className="flex flex-1 flex-col overflow-hidden transition-[margin-right] duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]" style={{ minHeight: 0 }}>
          <KanbanBoard
            initialColumns={displayColumns}
            initialTasks={displayTasks}
          />
        </div>

        {/* Fixed edge strip — always present, pinned to viewport edge */}
        <div
          ref={edgeRef}
          aria-label={inboxCollapsed ? 'Open inbox (fling cursor to right edge)' : 'Close inbox (fling cursor to right edge)'}
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: inboxCollapsed ? 8 : 4,
            zIndex: 30,
            cursor: 'pointer',
            pointerEvents: 'auto',
          }}
          onClick={() => handleInboxCollapse(!inboxCollapsed)}
        >
          {/* Glow strip — theme-inverse: white on dark, black on light */}
          <div style={{
            position: 'absolute',
            top: '10%',
            bottom: '10%',
            right: 0,
            width: edgeGlow > 0.3 ? 4 : 2,
            borderRadius: '3px 0 0 3px',
            background: inboxCollapsed
              ? (isLight
                  ? `rgba(0, 0, 0, ${0.03 + edgeGlow * 0.25})`
                  : `rgba(255, 255, 255, ${0.04 + edgeGlow * 0.4})`)
              : 'transparent',
            boxShadow: (inboxCollapsed && edgeGlow > 0.15)
              ? (isLight
                  ? `0 0 ${14 * edgeGlow}px rgba(0, 0, 0, ${0.1 * edgeGlow})`
                  : `0 0 ${14 * edgeGlow}px rgba(255, 255, 255, ${0.2 * edgeGlow})`)
              : 'none',
            transition: 'all 0.15s ease',
          }} />
          {/* Knock flash — theme-inverse pulse on trigger */}
          <div style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: knockFlash ? 3 : 0,
            background: 'var(--edge-knock-flash, rgba(255, 255, 255, 0.7))',
            boxShadow: knockFlash
              ? '0 0 20px var(--edge-knock-flash-spread, rgba(255, 255, 255, 0.4)), 0 0 60px var(--edge-knock-flash-spread, rgba(255, 255, 255, 0.15))'
              : 'none',
            opacity: knockFlash ? 1 : 0,
            transition: knockFlash
              ? 'opacity 0.05s ease, width 0.05s ease'
              : 'opacity 0.25s ease, width 0.25s ease',
          }} />
        </div>

        {/* Inbox panel — always rendered, slides in/out */}
        <aside
          style={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            width: 320,
            flexShrink: 0,
            transform: inboxCollapsed ? 'translateX(340px)' : 'translateX(0)',
            opacity: inboxCollapsed ? 0 : 1,
            pointerEvents: inboxCollapsed ? 'none' : 'auto',
            overflow: 'hidden',
            marginRight: inboxCollapsed ? -320 : 0,
            transition: [
              'transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)',
              'opacity 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)',
              'margin-right 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)',
            ].join(', '),
          }}
        >
          <InboxFeed
            isCollapsed={inboxCollapsed}
            onCollapsedChange={handleInboxCollapse}
          />
        </aside>
      </div>

      {/* Responsive: stack on mobile */}
      <style>{`
        @media (max-width: 1024px) {
          .dashboard-main-grid {
            flex-direction: column !important;
          }
          .dashboard-roles-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

export default DashboardRedesign;
