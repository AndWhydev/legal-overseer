'use client';

import React from 'react';
import type { KanbanColumn, Task } from '@/lib/types';
import { useDashboardStats } from '@/hooks/use-dashboard-stats';
import { useSeedData } from '@/hooks/use-seed-data';
import { useEnabledModules } from '@/lib/modules/use-enabled-modules';
import { getPack } from '@/lib/industry/registry';
import type { KPIConfig } from '@/lib/industry/types';
import { StatCard, MiniSparkline, MiniBarChart, MiniDonut, MiniGauge } from '@/components/ui/data-viz';
import { DailyBrief } from './daily-brief';
import { KanbanBoard } from './kanban-board';
import { InboxFeed } from './inbox-feed';
import { KanbanBoardTooltip } from '@/components/onboarding/first-run-guide';

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
  const edgeRef = React.useRef<HTMLDivElement>(null);
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

  // Edge-knock proximity detection for collapsed inbox
  React.useEffect(() => {
    if (!inboxCollapsed) {
      setEdgeGlow(0);
      return;
    }
    let rafId: number;
    const handleMouseMove = (e: MouseEvent) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const distFromRight = window.innerWidth - e.clientX;
        if (distFromRight < 60) {
          setEdgeGlow(Math.min(1, (60 - distFromRight) / 60));
        } else {
          setEdgeGlow(0);
        }
      });
    };
    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(rafId);
    };
  }, [inboxCollapsed]);

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, height: '100%', minHeight: 0 }}>
      {/* KPI Row — driven by industry pack */}
      <div
        className="bb-stagger"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
        }}
      >
        {loading ? (
          Array.from({ length: 4 }, (_, i) => (
            <article key={i} aria-label="Loading" style={skeletonStyle}>
              <div style={{ height: 12, background: 'var(--hover-bg-strong)', borderRadius: 4, width: '50%' }} />
              <div style={{ height: 36, background: 'var(--hover-bg-strong)', borderRadius: 4, width: '35%' }} />
              <div style={{ height: 32, background: 'var(--hover-bg)', borderRadius: 4, width: '100%' }} />
              <div style={{ height: 10, background: 'var(--hover-bg)', borderRadius: 4, width: '60%' }} />
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

      {/* Kanban + Inbox side-by-side */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: inboxCollapsed ? '1fr 36px' : '1fr 320px',
          gap: 20,
          flex: 1,
          minHeight: 0,
          transition: 'grid-template-columns 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
        className="dashboard-main-grid"
      >
        {/* Kanban Board */}
        <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <KanbanBoardTooltip>
            <KanbanBoard
              initialColumns={displayColumns}
              initialTasks={displayTasks}
            />
          </KanbanBoardTooltip>
        </div>

        {/* Inbox Feed or Edge Knock Strip */}
        {inboxCollapsed ? (
          <div
            ref={edgeRef}
            onClick={() => handleInboxCollapse(false)}
            aria-label="Expand inbox"
            role="button"
            tabIndex={0}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              position: 'relative',
              borderRadius: 12,
              transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            {/* Luminous edge strip */}
            <div style={{
              position: 'absolute',
              top: 16,
              bottom: 16,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 3,
              borderRadius: 3,
              background: `rgba(255, 255, 255, ${0.06 + edgeGlow * 0.14})`,
              boxShadow: edgeGlow > 0.3
                ? `0 0 ${8 * edgeGlow}px rgba(255, 255, 255, ${0.05 * edgeGlow}), 0 0 ${20 * edgeGlow}px rgba(255, 255, 255, ${0.03 * edgeGlow})`
                : 'none',
              transition: 'all 0.3s ease',
            }} />
            {/* Inbox icon hint -- appears on hover */}
            <div style={{
              opacity: edgeGlow > 0.5 ? edgeGlow : 0,
              transition: 'opacity 0.2s ease',
              color: `rgba(255, 255, 255, ${0.3 + edgeGlow * 0.3})`,
            }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </div>
          </div>
        ) : (
          <aside
            style={{
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              opacity: 1,
              transition: 'opacity 0.3s ease',
            }}
          >
            <InboxFeed
              isCollapsed={inboxCollapsed}
              onCollapsedChange={handleInboxCollapse}
            />
          </aside>
        )}
      </div>

      {/* Responsive: stack on mobile */}
      <style>{`
        @media (max-width: 1024px) {
          .dashboard-main-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

export default DashboardRedesign;
