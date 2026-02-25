'use client';

import React from 'react';
import {
  FolderOpen,
  DollarSign,
  ListTodo,
  Bot,
  MoreHorizontal,
  Plus,
  Clock,
  ChevronRight,
  Filter,
  CalendarDays,
  Sparkles,
  Flame,
  Radio,
  TrendingUp,
  TrendingDown,
  AlertCircle,
} from 'lucide-react';
import type { KanbanColumn, Task } from '@/lib/types';
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip, Cell,
} from 'recharts';
// AIButton available at @/components/ui/ai-button when needed

// ─── Types ──────────────────────────────────────────────────────────────────

interface ActivityEntry {
  id: string;
  text: React.ReactNode;
  time: string;
  dot: 'green' | 'blue' | 'amber' | 'red';
}

interface DashboardRedesignProps {
  columns: KanbanColumn[];
  tasks: Task[];
  messages: any[];
  completedToday: number;
  totalActive: number;
}

// ─── Sample Activity ────────────────────────────────────────────────────────

// SAMPLE_ACTIVITY removed in favor of live messages

const TIMELINE_HOURS = ['6 AM', '7', '8', '9', '10', '11', '12 PM', '1', '2', '3', '4', '5', '6'];

// ─── Accent mapping from task priority ──────────────────────────────────────

function getTaskAccent(task: Task): 'green' | 'blue' | 'amber' | 'red' | 'purple' {
  if (task.priority === 'high' || task.priority === 'urgent') return 'red';
  if (task.priority === 'medium') return 'amber';
  return 'green';
}

// ─── SVG Hatch Pattern Defs ─────────────────────────────────────────────────

function ChartHatchPatterns() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }}>
      <defs>
        <pattern id="bb-hatch-orange" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(-45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(255, 90, 31, 0.4)" strokeWidth="2" />
        </pattern>
        <pattern id="bb-hatch-green" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(-45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(34, 197, 94, 0.4)" strokeWidth="2" />
        </pattern>
        <pattern id="bb-hatch-blue" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(-45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(59, 130, 246, 0.4)" strokeWidth="2" />
        </pattern>
        <pattern id="bb-hatch-purple" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(-45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(139, 92, 246, 0.4)" strokeWidth="2" />
        </pattern>
      </defs>
    </svg>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

// ─── KPI Card Mock Data ─────────────────────────────────────────────────────

const PROJECTS_BY_STATUS = [
  { name: 'Discovery', value: 2 },
  { name: 'Design', value: 1 },
  { name: 'Dev', value: 3 },
  { name: 'Launch', value: 2 },
];

const REVENUE_TREND = [
  { month: 'Jul', value: 18.2 },
  { month: 'Aug', value: 19.5 },
  { month: 'Sep', value: 17.8 },
  { month: 'Oct', value: 20.1 },
  { month: 'Nov', value: 21.4 },
  { month: 'Dec', value: 22.3 },
  { month: 'Jan', value: 23.1 },
  { month: 'Feb', value: 24.8 },
];

const TASKS_PER_DAY = [
  { day: 'Mon', value: 4 },
  { day: 'Tue', value: 2 },
  { day: 'Wed', value: 3 },
  { day: 'Thu', value: 3 },
  { day: 'Fri', value: 2 },
];

const AGENT_ACTIVITY_7D = [
  { day: 'Mon', value: 85 },
  { day: 'Tue', value: 95 },
  { day: 'Wed', value: 71 },
  { day: 'Thu', value: 110 },
  { day: 'Fri', value: 98 },
  { day: 'Sat', value: 134 },
  { day: 'Sun', value: 127 },
];

const AXIS_TICK = { fontSize: 9, fill: 'var(--text-dim, #475569)' };
const GRID_STROKE = 'rgba(255,255,255,0.04)';

// ─── KPI Card Component ────────────────────────────────────────────────────

interface KpiCardProps {
  title: string;
  icon: React.ReactNode;
  accent: string;
  value: string;
  prefix?: string;
  unit?: string;
  trendText: string;
  trendType: 'positive' | 'negative' | 'warning';
  children: React.ReactNode;
}

const kpiCardStyle: React.CSSProperties = {
  padding: '20px',
  borderRadius: 16,
  background: 'var(--bg-card, rgba(15, 20, 30, 0.6))',
  backdropFilter: 'blur(20px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
  border: '1px solid rgba(255, 255, 255, 0.03)',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
  backgroundImage: 'linear-gradient(135deg, rgba(255, 255, 255, 0.02) 0%, transparent 100%)',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  minWidth: 180,
  minHeight: 160,
};

function KpiCard({ title, icon, accent, value, prefix, unit, trendText, trendType, children }: KpiCardProps) {
  const trendColor = trendType === 'positive' ? 'var(--bb-green)' : trendType === 'negative' ? '#ef4444' : 'var(--bb-amber)';

  return (
    <article aria-label={`${title} — ${prefix || ''}${value}${unit ? ' ' + unit : ''}, ${trendText}`} style={kpiCardStyle}>
      {/* Header: title left, trend pill right */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary, #64748B)', fontWeight: 500, letterSpacing: '0.02em' }}>
          {title}
        </span>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            padding: '3px 8px',
            borderRadius: 99,
            background: `color-mix(in srgb, ${trendColor} 12%, transparent)`,
            color: trendColor,
            fontSize: 11,
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          {trendText}
        </div>
      </div>

      {/* Value (left) + Chart (right) — chart breathes into center */}
      <div role="group" aria-label={`${title}: ${prefix || ''}${value} ${unit || ''}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexShrink: 0 }}>
          {prefix && (
            <span style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
              {prefix}
            </span>
          )}
          <span
            style={{
              fontSize: 38,
              fontWeight: 700,
              color: 'var(--text-primary, #F1F5F9)',
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
        <div aria-hidden="true" style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{children}</div>
      </div>
    </article>
  );
}

function TaskCard({ task }: { task: Task }) {
  const accent = getTaskAccent(task);
  return (
    <div className={`bb-node bb-node--${accent}`}>
      <div className="bb-node__row">
        <div className={`bb-node__icon bb-node__icon--${accent}`}>
          {accent === 'green' && <Sparkles size={13} />}
          {accent === 'blue' && <Radio size={13} />}
          {accent === 'amber' && <Clock size={13} />}
          {accent === 'red' && <Flame size={13} />}
          {accent === 'purple' && <Sparkles size={13} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="bb-node__title bb-truncate">{task.title}</div>
        </div>
      </div>
      <div className="bb-node__row bb-justify-between">
        <span className={`bb-badge bb-badge--${accent}`}>{task.priority || 'normal'}</span>
        <div className="bb-flex bb-items-center bb-gap-xs">
          {typeof task.metadata?.due_date === 'string' && (
            <span className="bb-badge bb-badge--ghost">
              <Clock size={9} />
              {new Date(task.metadata.due_date).toLocaleDateString('en-AU', { weekday: 'short' })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────────────────────

export function DashboardRedesign({ columns, tasks, messages, completedToday, totalActive }: DashboardRedesignProps) {
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Filter for top priority actionable messages
  const actionableMessages = messages.filter(m => m.significance >= 5 || m.is_actionable);

  return (
    <div style={{ display: 'contents' }}>
      <ChartHatchPatterns />

      {/* Top Bar */}
      <header className="bb-topbar">
        <h1 className="bb-topbar__title">Dashboard</h1>
        <div className="bb-topbar__breadcrumb">
          <CalendarDays size={14} />
          <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{dateStr}</span>
        </div>

        <div className="bb-timeline">
          {TIMELINE_HOURS.map((h, i) => (
            <span
              key={h}
              className={`bb-timeline__tick ${i >= 4 && i <= 7 ? 'bb-timeline__tick--active' : ''}`}
            >
              {h}
            </span>
          ))}
        </div>
      </header>

      {/* Main Content */}
      <main
        className="bb-main-area grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 p-4 lg:gap-6 lg:p-6"
      >
        {/* KPI Row */}
        <div
          className="bb-stagger grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 col-span-1 lg:col-span-full"
        >
          <KpiCard
            title="Active Projects"
            icon={<FolderOpen size={14} />}
            accent="var(--bb-blue)"
            value="8"
            unit="projects"
            trendText="+2 this month"
            trendType="positive"
          >
            <div style={{ width: 140, height: 80, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={PROJECTS_BY_STATUS} margin={{ top: 2, right: 2, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="blueBarGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={18} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 11, color: '#f1f5f9' }} />
                  <Bar dataKey="value" fill="url(#blueBarGrad)" stroke="#3B82F6" strokeWidth={0.5} strokeOpacity={0.4} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </KpiCard>
          <KpiCard
            title="Monthly Revenue"
            icon={<DollarSign size={14} />}
            accent="var(--bb-green)"
            prefix="$"
            value="24.8k"
            trendText="+12%"
            trendType="positive"
          >
            <div style={{ width: 140, height: 80, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={REVENUE_TREND} margin={{ top: 2, right: 2, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22C55E" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#22C55E" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="month" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={22} tickFormatter={(v: any) => `$${v}`} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 11, color: '#f1f5f9' }} formatter={(v: any) => [`$${v}k`, 'Revenue']} />
                  <Area type="monotone" dataKey="value" stroke="#22C55E" fill="url(#greenGrad)" strokeWidth={1.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </KpiCard>
          <KpiCard
            title="Tasks Due This Week"
            icon={<ListTodo size={14} />}
            accent="var(--bb-amber)"
            value="14"
            unit="tasks"
            trendText="3 overdue"
            trendType="negative"
          >
            <div style={{ width: 140, height: 80, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={TASKS_PER_DAY} margin={{ top: 2, right: 2, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="amberBarGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#F59E0B" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="day" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={18} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 11, color: '#f1f5f9' }} />
                  <Bar dataKey="value" fill="url(#amberBarGrad)" stroke="#F59E0B" strokeWidth={0.5} strokeOpacity={0.4} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </KpiCard>
          <KpiCard
            title="AI Agent Actions"
            icon={<Bot size={14} />}
            accent="var(--bb-purple)"
            value="127"
            unit="today"
            trendText="+34%"
            trendType="positive"
          >
            <div style={{ width: 140, height: 80, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={AGENT_ACTIVITY_7D} margin={{ top: 2, right: 2, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="purpleGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="day" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={25} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 11, color: '#f1f5f9' }} />
                  <Area type="monotone" dataKey="value" stroke="#8B5CF6" fill="url(#purpleGrad)" strokeWidth={1.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </KpiCard>
        </div>

        {/* Command Center Inbox */}
        <div style={{ gridColumn: '1 / 2', overflow: 'hidden' }}>
          <div className="bb-flex bb-items-center bb-justify-between" style={{ marginBottom: 'var(--gap-md)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, letterSpacing: 'var(--tracking-tight)' }}>
              Action Needed
            </h2>
            <div className="bb-flex bb-gap-sm">
              <button className="bb-btn bb-btn--ghost bb-btn--sm">
                <Filter size={13} />
                Filter
              </button>
            </div>
          </div>

          <div className="bb-flex-col bb-gap-md bb-stagger">
            {actionableMessages.length === 0 && (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 12 }}>
                Inbox Zero — You're all caught up!
              </div>
            )}
            {actionableMessages.map((msg) => {
              const accent = msg.significance >= 8 ? 'red' : msg.significance >= 5 ? 'amber' : 'blue';
              return (
                <div key={msg.id} className={`bb-node bb-node--${accent}`} style={{ padding: '16px' }}>
                  <div className="bb-node__row">
                    <div className={`bb-node__icon bb-node__icon--${accent}`}>
                      {msg.channel === 'gmail' || msg.channel === 'outlook' ? <Radio size={14} /> : <Bot size={14} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div className="bb-flex bb-items-center bb-justify-between">
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{msg.sender}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          {new Date(msg.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="bb-node__title" style={{ WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', whiteSpace: 'normal', color: 'var(--text-secondary)' }}>
                        {msg.subject ? <strong>{msg.subject}: </strong> : null}
                        {msg.body}
                      </div>
                    </div>
                  </div>
                  <div className="bb-node__row bb-justify-between" style={{ marginTop: '12px' }}>
                    <div className="bb-flex bb-gap-sm">
                      {msg.category && (
                        <span className={`bb-badge bb-badge--${accent}`}>{msg.category}</span>
                      )}
                      {msg.significance && (
                        <span className="bb-badge bb-badge--ghost">Priority: {msg.significance}/10</span>
                      )}
                    </div>

                    <div className="bb-flex bb-gap-xs">
                      {/* 1.5.15 Quick actions from command center */}
                      <button className="bb-btn bb-btn--ghost bb-btn--sm" style={{ padding: '4px 8px', fontSize: 11 }}>
                        Archive
                      </button>
                      {msg.recommended_actions?.includes('reply') && (
                        <button className="bb-btn bb-btn--ghost bb-btn--sm" style={{ padding: '4px 8px', fontSize: 11 }}>
                          Draft Reply
                        </button>
                      )}
                      <button className="bb-btn bb-btn--primary bb-btn--sm" style={{ padding: '4px 8px', fontSize: 11 }}>
                        <Sparkles size={11} />
                        Auto-handle
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Panel: Activity Feed */}
        <aside className="bb-flex-col bb-gap-md" style={{ gridColumn: '2 / 3' }}>
          <div className="bb-card">
            <div className="bb-card__header">
              <h3 className="bb-card__title">Activity</h3>
              <button className="bb-btn bb-btn--icon">
                <MoreHorizontal size={16} />
              </button>
            </div>
            <div className="bb-activity">
              {messages.slice(0, 8).map((msg) => {
                const dot = msg.significance >= 8 ? 'red' : msg.significance >= 5 ? 'amber' : 'blue';
                const timeStr = new Date(msg.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return (
                  <div key={`act-${msg.id}`} className="bb-activity__item">
                    <div className={`bb-activity__dot bb-activity__dot--${dot}`} />
                    <div>
                      <div className="bb-activity__text">
                        <strong>{msg.channel === 'gmail' || msg.channel === 'outlook' ? 'Email' : msg.channel}</strong> from {msg.sender}
                      </div>
                      <div className="bb-activity__time">{timeStr}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              className="bb-btn bb-btn--ghost bb-btn--sm"
              style={{ width: '100%', marginTop: 'var(--gap-md)' }}
            >
              View all activity
              <ChevronRight size={13} />
            </button>
          </div>

          {/* AI Summary Card */}
          <div className="bb-card">
            <div className="bb-card__header">
              <div className="bb-flex bb-items-center bb-gap-sm">
                <Sparkles size={14} style={{ color: 'var(--text-secondary)' }} />
                <h3 className="bb-card__title">BitBit Summary</h3>
              </div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              You have <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>8 active projects</span> with{' '}
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>14 tasks due this week</span>.
              Revenue is <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>trending up 12%</span>.
            </p>
            <div className="bb-flex bb-gap-sm" style={{ marginTop: 'var(--gap-md)' }}>
              <button className="bb-btn bb-btn--primary bb-btn--sm">
                <Sparkles size={12} />
                Plan my day
              </button>
              <button className="bb-btn bb-btn--ghost bb-btn--sm">
                Dismiss
              </button>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

export default DashboardRedesign;
