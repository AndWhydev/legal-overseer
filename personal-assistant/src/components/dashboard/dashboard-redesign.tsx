'use client';

import React from 'react';
import {
  FolderOpen,
  DollarSign,
  ListTodo,
  Bot,
} from 'lucide-react';
import type { KanbanColumn, Task } from '@/lib/types';
import { useDashboardStats } from '@/hooks/use-dashboard-stats';
import { useSeedData } from '@/hooks/use-seed-data';
import { DailyBrief } from './daily-brief';
import { KanbanBoard } from './kanban-board';
import { InboxFeed } from './inbox-feed';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DashboardRedesignProps {
  columns: KanbanColumn[];
  tasks: Task[];
  messages: any[];
  completedToday: number;
  totalActive: number;
}

// ─── KPI Card Component ────────────────────────────────────────────────────

interface KpiCardProps {
  title: string;
  icon: React.ReactNode;
  accent: string;
  value: string;
  prefix?: string;
  unit?: string;
  subtitle?: string;
}

const kpiCardStyle: React.CSSProperties = {
  padding: '20px',
  borderRadius: 16,
  background: 'var(--glass-card-bg)',
  backdropFilter: 'var(--glass-card-blur)',
  WebkitBackdropFilter: 'var(--glass-card-blur)',
  border: '1px solid var(--glass-card-border)',
  boxShadow: 'var(--card-inset)',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minWidth: 180,
};

function KpiCard({ title, icon, accent, value, prefix, unit, subtitle }: KpiCardProps) {
  return (
    <article aria-label={`${title} — ${prefix || ''}${value}${unit ? ' ' + unit : ''}`} style={kpiCardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: 'var(--text-secondary)', display: 'flex' }}>{icon}</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500, letterSpacing: '0.02em' }}>
          {title}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        {prefix && (
          <span style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            {prefix}
          </span>
        )}
        <span
          style={{
            fontSize: 38,
            fontWeight: 700,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '-0.03em',
            lineHeight: 1,
          }}
        >
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginLeft: 2 }}>
            {unit}
          </span>
        )}
      </div>

      {subtitle && (
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          {subtitle}
        </span>
      )}
    </article>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────────────────────

export function DashboardRedesign({ columns, tasks, messages, completedToday, totalActive }: DashboardRedesignProps) {
  const { stats, loading } = useDashboardStats();
  const seed = useSeedData();

  // Use seed kanban data when active, otherwise use props
  const displayColumns = seed.active && seed.data?.kanbanColumns ? seed.data.kanbanColumns : columns;
  const displayTasks = seed.active && seed.data?.kanbanTasks ? seed.data.kanbanTasks : tasks;

  const SkeletonKpiCard = () => (
    <article aria-label="Loading" style={{
      ...kpiCardStyle,
      animation: 'pulse 2s ease-in-out infinite',
    }}>
      <div style={{ height: 12, background: 'var(--hover-bg-strong)', borderRadius: 4, width: '50%' }} />
      <div style={{ height: 38, background: 'var(--hover-bg-strong)', borderRadius: 4, width: '35%' }} />
      <div style={{ height: 11, background: 'var(--hover-bg)', borderRadius: 4, width: '60%' }} />
    </article>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, height: '100%', minHeight: 0 }}>
      {/* KPI Row */}
      <div
        className="bb-stagger"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16,
        }}
      >
        {loading ? (
          <>
            <SkeletonKpiCard />
            <SkeletonKpiCard />
            <SkeletonKpiCard />
            <SkeletonKpiCard />
          </>
        ) : (
          <>
            <KpiCard
              title="Active Tasks"
              icon={<ListTodo size={14} />}
              accent="var(--bb-blue)"
              value={String(stats?.activeTasks || 0)}
              subtitle={`${completedToday} completed today`}
            />
            <KpiCard
              title="Revenue"
              icon={<DollarSign size={14} />}
              accent="var(--bb-green)"
              prefix="$"
              value={(stats?.totalRevenue || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
              subtitle="from paid invoices"
            />
            <KpiCard
              title="Agent Runs"
              icon={<Bot size={14} />}
              accent="var(--bb-amber)"
              value={String(stats?.agentRunsToday || 0)}
              subtitle="today"
            />
            <KpiCard
              title="Contacts"
              icon={<FolderOpen size={14} />}
              accent="var(--bb-purple)"
              value={String(stats?.activeContacts || 0)}
              subtitle="in your network"
            />
          </>
        )}
      </div>

      {/* Daily Brief */}
      <DailyBrief />

      {/* Kanban + Inbox side-by-side */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 320px',
          gap: 20,
          flex: 1,
          minHeight: 0,
        }}
        className="dashboard-main-grid"
      >
        {/* Kanban Board */}
        <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <KanbanBoard
            initialColumns={displayColumns}
            initialTasks={displayTasks}
          />
        </div>

        {/* Inbox Feed */}
        <aside style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}>
          <InboxFeed />
        </aside>
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
