'use client';

import React from 'react';
import {
  FolderOpen,
  DollarSign,
  ListTodo,
  Bot,
  MoreHorizontal,
  ChevronRight,
  Sparkles,
  Radio,
} from 'lucide-react';
import type { KanbanColumn, Task } from '@/lib/types';
import { useDashboardStats } from '@/hooks/use-dashboard-stats';
// AIButton available at @/components/ui/ai-button when needed

// ─── Types ──────────────────────────────────────────────────────────────────

interface DashboardRedesignProps {
  columns: KanbanColumn[];
  tasks: Task[];
  messages: any[];
  completedToday: number;
  totalActive: number;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

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
  background: 'rgba(15, 20, 30, 0.6)',
  backdropFilter: 'blur(20px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
  border: '1px solid rgba(255, 255, 255, 0.03)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
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
        <span style={{ fontSize: 12, color: 'var(--text-secondary, #64748B)', fontWeight: 500, letterSpacing: '0.02em' }}>
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

      {subtitle && (
        <span style={{ fontSize: 11, color: 'var(--text-dim, #475569)' }}>
          {subtitle}
        </span>
      )}
    </article>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────────────────────

export function DashboardRedesign({ columns, tasks, messages, completedToday, totalActive }: DashboardRedesignProps) {
  const { stats, loading } = useDashboardStats();
  // Filter for top priority actionable messages
  const actionableMessages = messages.filter(m => m.significance >= 5 || m.is_actionable);

  // Skeleton loader component
  const SkeletonKpiCard = () => (
    <article aria-label="Loading" style={{
      ...kpiCardStyle,
      animation: 'pulse 2s ease-in-out infinite',
    }}>
      <div style={{ height: 12, background: 'rgba(255,255,255,0.08)', borderRadius: 4, width: '50%' }} />
      <div style={{ height: 38, background: 'rgba(255,255,255,0.08)', borderRadius: 4, width: '35%' }} />
      <div style={{ height: 11, background: 'rgba(255,255,255,0.05)', borderRadius: 4, width: '60%' }} />
    </article>
  );

  return (
    <>
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
              <button
                className="bb-btn bb-btn--primary bb-btn--sm"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: 'chat' } }));
                  // Brief delay to let chat tab mount before sending
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('bitbit-chat-send', { detail: 'Plan my day. Look at my tasks, messages, and calendar to suggest what I should focus on today.' }));
                  }, 300);
                }}
              >
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
