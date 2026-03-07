'use client';

import React, { useState } from 'react';
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
  Sparkles,
  Flame,
  Radio,
} from 'lucide-react';
import type { KanbanColumn, Task } from '@/lib/types';
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip, Cell,
} from 'recharts';
import { useDashboardStats } from '@/hooks/use-dashboard-stats';
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

const TOOLTIP_STYLE: React.CSSProperties = {
  background: 'rgba(15, 20, 30, 0.85)',
  backdropFilter: 'blur(16px) saturate(1.3)',
  WebkitBackdropFilter: 'blur(16px) saturate(1.3)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 10,
  fontSize: 11,
  color: '#f1f5f9',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
  padding: '8px 12px',
};

const BAR_CURSOR = { fill: 'rgba(255, 255, 255, 0.08)', radius: 3 };
const AREA_CURSOR = { stroke: 'rgba(255, 255, 255, 0.2)', strokeWidth: 1 };

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
  background: 'rgba(15, 20, 30, 0.6)',
  backdropFilter: 'blur(20px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
  border: '1px solid rgba(255, 255, 255, 0.03)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  minWidth: 180,
  minHeight: 160,
  overflow: 'visible',
};

function KpiCard({ title, icon, accent, value, prefix, unit, trendText, trendType, children }: KpiCardProps) {
  const trendVariant = trendType === 'positive' ? 'green' : trendType === 'negative' ? 'red' : 'amber';

  return (
    <article aria-label={`${title} — ${prefix || ''}${value}${unit ? ' ' + unit : ''}, ${trendText}`} style={kpiCardStyle}>
      {/* Header: title left, trend pill right */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary, #64748B)', fontWeight: 500, letterSpacing: '0.02em' }}>
          {title}
        </span>
        <span className={`bb-badge bb-badge--${trendVariant}`}>
          {trendText}
        </span>
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
  const [autopilot, setAutopilot] = useState(false);
  const { stats, loading } = useDashboardStats();
  // Filter for top priority actionable messages
  const actionableMessages = messages.filter(m => m.significance >= 5 || m.is_actionable);

  // Skeleton loader component
  const SkeletonKpiCard = () => (
    <article aria-label="Loading" style={{
      padding: '20px',
      borderRadius: 16,
      background: 'rgba(15, 20, 30, 0.6)',
      backdropFilter: 'blur(20px) saturate(1.2)',
      WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
      border: '1px solid rgba(255, 255, 255, 0.03)',
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      minWidth: 180,
      minHeight: 160,
      overflow: 'visible',
    }}>
      <div style={{ height: 12, background: 'rgba(255,255,255,0.1)', borderRadius: 4, width: '60%' }} />
      <div style={{ flex: 1, display: 'flex', gap: 20 }}>
        <div style={{ height: 40, background: 'rgba(255,255,255,0.1)', borderRadius: 4, width: '40%' }} />
        <div style={{ height: 80, background: 'rgba(255,255,255,0.1)', borderRadius: 4, flex: 1 }} />
      </div>
    </article>
  );

  return (
    <>
      <ChartHatchPatterns />

      {/* Main Content */}
      <div
        className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 lg:gap-6"
      >
        {/* KPI Row */}
        <div
          className="bb-stagger grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 col-span-1 lg:col-span-full"
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
                unit="tasks"
                trendText="In progress"
                trendType="positive"
              >
                <div style={{ width: 140, height: 80, flexShrink: 0, overflow: 'visible' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={TASKS_PER_DAY} margin={{ top: 2, right: 2, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="blueBarGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                      <XAxis dataKey="day" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                      <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={18} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={BAR_CURSOR} wrapperStyle={{ zIndex: 50 }} />
                      <Bar dataKey="value" fill="url(#blueBarGrad)" stroke="#3B82F6" strokeWidth={0.5} strokeOpacity={0.4} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </KpiCard>
              <KpiCard
                title="Total Revenue"
                icon={<DollarSign size={14} />}
                accent="var(--bb-green)"
                prefix="$"
                value={String((stats?.totalRevenue || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }))}
                trendText="Paid invoices"
                trendType="positive"
              >
                <div style={{ width: 140, height: 80, flexShrink: 0, overflow: 'visible' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={REVENUE_TREND} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#22C55E" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#22C55E" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                      <XAxis dataKey="month" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                      <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={22} tickFormatter={(v: any) => `$${v}`} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={AREA_CURSOR} wrapperStyle={{ zIndex: 50 }} formatter={(v: any) => [`$${v}k`, 'Revenue']} />
                      <Area type="monotone" dataKey="value" stroke="#22C55E" fill="url(#greenGrad)" strokeWidth={1.5} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </KpiCard>
              <KpiCard
                title="Agent Runs Today"
                icon={<Bot size={14} />}
                accent="var(--bb-amber)"
                value={String(stats?.agentRunsToday || 0)}
                unit="runs"
                trendText="Today's activity"
                trendType="positive"
              >
                <div style={{ width: 140, height: 80, flexShrink: 0, overflow: 'visible' }}>
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
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={BAR_CURSOR} wrapperStyle={{ zIndex: 50 }} />
                      <Bar dataKey="value" fill="url(#amberBarGrad)" stroke="#F59E0B" strokeWidth={0.5} strokeOpacity={0.4} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </KpiCard>
              <KpiCard
                title="Active Contacts"
                icon={<FolderOpen size={14} />}
                accent="var(--bb-purple)"
                value={String(stats?.activeContacts || 0)}
                unit="contacts"
                trendText="Network size"
                trendType="positive"
              >
                <div style={{ width: 140, height: 80, flexShrink: 0, overflow: 'visible' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={AGENT_ACTIVITY_7D} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="purpleGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                      <XAxis dataKey="day" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                      <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={25} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={AREA_CURSOR} wrapperStyle={{ zIndex: 50 }} />
                      <Area type="monotone" dataKey="value" stroke="#8B5CF6" fill="url(#purpleGrad)" strokeWidth={1.5} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </KpiCard>
            </>
          )}
        </div>

        {/* Command Center Inbox */}
        <div className="overflow-hidden">
          <div className="bb-flex bb-items-center bb-justify-between" style={{ marginBottom: 'var(--gap-md)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, letterSpacing: 'var(--tracking-tight)' }}>
              Action Needed
            </h2>
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
                      {/* Quick actions available here when implemented */}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Panel: Activity Feed */}
        <aside className="bb-flex-col bb-gap-md lg:col-start-2">
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
              onClick={() => {
                // Navigate to activity section or scroll
                document.querySelector('[data-activity-section]')?.scrollIntoView({ behavior: 'smooth' });
              }}
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
              You have <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{stats?.activeTasks || 0} active tasks</span> and{' '}
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{stats?.activeContacts || 0} contacts</span> in your network.
              Revenue is <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>${(stats?.totalRevenue || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>.
            </p>
            <div className="bb-flex bb-gap-sm" style={{ marginTop: 'var(--gap-md)' }}>
              <button className="bb-btn bb-btn--primary bb-btn--sm">
                <Sparkles size={12} />
                Plan my day
              </button>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

export default DashboardRedesign;
