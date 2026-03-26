'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSubscription } from '@/lib/realtime/supabase-realtime';
import { StatCard, StatusBadge, ProcessPipeline, TimelineBar, MiniSparkline, MiniBarChart, MiniDonut, MiniGauge } from '@/components/ui/data-viz';
import { AlertCircle, Clock, ShieldCheck, Zap, Users, CheckCircle2, Link as LinkIcon, TrendingUp, Calendar, ReceiptText, MessageSquare, BellOff, Inbox, Activity } from 'lucide-react';
import { useDashboardStats } from '@/hooks/use-dashboard-stats';
import { useEnabledModules } from '@/lib/modules/use-enabled-modules';
import { getPack } from '@/lib/industry/registry';
import type { KPIConfig } from '@/lib/industry/types';
import { TabSkeleton } from './tab-skeleton';
import { TabShell } from '@/components/ui/tab-shell';
import { SectionCard } from '@/components/ui/section-card';
import { EmptyState } from '@/components/ui/empty-state';
import { logger } from '@/lib/core/logger';

/* ─── Interfaces ─── */

interface AgentRun {
  id: string;
  output_summary: string;
  created_at: string;
  agent_configs?: { name: string | null; agent_type: string } | null;
}

interface PriorityTask {
  id: string;
  title: string;
  priority: string;
  status: string;
}

/* ─── Hoisted Style Objects ─── */

const S = {
  /* Layout grids */
  quickActionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 12,
  } as React.CSSProperties,

  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 16,
  } as React.CSSProperties,

  mainGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: 24,
  } as React.CSSProperties,

  triGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: 24,
  } as React.CSSProperties,

  /* Glass card */
  glassCard: {
    background: 'var(--bg-card-solid, rgba(15, 20, 30, 0.6))',
    backdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
    WebkitBackdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
    border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
    boxShadow: 'var(--card-inset, inset 0 1px 0 rgba(255, 255, 255, 0.05))',
    borderRadius: 16,
    overflow: 'hidden',
  } as React.CSSProperties,

  /* Card header */
  cardHeader: {
    padding: 16,
    borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
  } as React.CSSProperties,

  cardHeaderTitle: {
    fontSize: 16,
    fontWeight: 500,
    color: 'var(--text-primary, #F1F5F9)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    margin: 0,
  } as React.CSSProperties,

  cardHeaderSub: {
    fontSize: 14,
    color: 'var(--text-secondary, #94A3B8)',
    marginTop: 4,
  } as React.CSSProperties,

  /* Card body */
  cardBody: {
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  } as React.CSSProperties,

  cardBodyCompact: {
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  } as React.CSSProperties,

  cardBodyScroll: {
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    maxHeight: 256,
    overflowY: 'auto',
  } as React.CSSProperties,

  /* Quick action button */
  quickActionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
    background: 'rgba(25, 35, 50, 0.8)',
    cursor: 'pointer',
    textAlign: 'left',
    minHeight: 40,
    transition: 'background 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
    color: 'inherit',
    fontSize: 'inherit',
    fontFamily: 'inherit',
  } as React.CSSProperties,

  quickActionBtnDisabled: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
    background: 'rgba(25, 35, 50, 0.8)',
    cursor: 'not-allowed',
    textAlign: 'left',
    minHeight: 40,
    opacity: 0.4,
    color: 'inherit',
    fontSize: 'inherit',
    fontFamily: 'inherit',
  } as React.CSSProperties,

  /* Icon containers with semantic status colors at 12% opacity */
  iconBoxWarning: {
    width: 36,
    height: 36,
    borderRadius: 12,
    background: 'rgba(234, 179, 8, 0.12)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  } as React.CSSProperties,

  iconBoxSuccess: {
    width: 36,
    height: 36,
    borderRadius: 12,
    background: 'rgba(34, 197, 94, 0.12)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  } as React.CSSProperties,

  iconBoxOrange: {
    width: 36,
    height: 36,
    borderRadius: 12,
    background: 'rgba(255, 255, 255, 0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  } as React.CSSProperties,

  iconBoxError: {
    width: 36,
    height: 36,
    borderRadius: 12,
    background: 'rgba(239, 68, 68, 0.12)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  } as React.CSSProperties,

  /* Quick action text */
  qaTextWrap: {
    minWidth: 0,
  } as React.CSSProperties,

  qaTitle: {
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--text-primary, #F1F5F9)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    margin: 0,
  } as React.CSSProperties,

  qaSub: {
    fontSize: 14,
    color: 'var(--text-secondary, #94A3B8)',
    margin: 0,
  } as React.CSSProperties,

  /* Approval row */
  approvalRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    background: 'rgba(25, 35, 50, 0.8)',
    border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
  } as React.CSSProperties,

  approvalTitle: {
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--text-primary, #F1F5F9)',
    margin: 0,
  } as React.CSSProperties,

  approvalDesc: {
    fontSize: 14,
    color: 'var(--text-secondary, #94A3B8)',
    marginTop: 4,
  } as React.CSSProperties,

  approvalActions: {
    display: 'flex',
    gap: 8,
  } as React.CSSProperties,

  dismissBtn: {
    padding: '8px 12px',
    fontSize: 14,
    fontWeight: 500,
    borderRadius: 12,
    background: 'var(--bg-input, rgba(13, 17, 23, 0.6))',
    border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
    color: 'var(--text-secondary, #94A3B8)',
    cursor: 'pointer',
    minHeight: 40,
    transition: 'background 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
  } as React.CSSProperties,

  dismissBtnDisabled: {
    padding: '8px 12px',
    fontSize: 14,
    fontWeight: 500,
    borderRadius: 12,
    background: 'var(--bg-input, rgba(13, 17, 23, 0.6))',
    border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
    color: 'var(--text-secondary, #94A3B8)',
    cursor: 'not-allowed',
    minHeight: 40,
    opacity: 0.5,
  } as React.CSSProperties,

  approveBtn: {
    padding: '8px 12px',
    fontSize: 14,
    fontWeight: 500,
    borderRadius: 12,
    background: 'var(--btn-primary-bg, #F1F5F9)',
    border: 'none',
    color: 'var(--btn-primary-fg, #0a0f1a)',
    cursor: 'pointer',
    minHeight: 40,
    transition: 'opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
  } as React.CSSProperties,

  approveBtnDisabled: {
    padding: '8px 12px',
    fontSize: 14,
    fontWeight: 500,
    borderRadius: 12,
    background: 'var(--btn-primary-bg, #F1F5F9)',
    border: 'none',
    color: 'var(--btn-primary-fg, #0a0f1a)',
    cursor: 'not-allowed',
    minHeight: 40,
    opacity: 0.5,
  } as React.CSSProperties,

  /* Priority task row */
  priorityRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: 8,
    borderRadius: 12,
    background: 'rgba(25, 35, 50, 0.8)',
    border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
  } as React.CSSProperties,

  priorityBadgeCritical: {
    fontSize: 14,
    fontWeight: 500,
    padding: '4px 8px',
    borderRadius: 8,
    background: 'rgba(239, 68, 68, 0.12)',
    color: 'rgba(248, 113, 113, 1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,

  priorityBadgeHigh: {
    fontSize: 14,
    fontWeight: 500,
    padding: '4px 8px',
    borderRadius: 8,
    background: 'rgba(234, 179, 8, 0.12)',
    color: 'rgba(250, 204, 21, 1)',
    border: '1px solid rgba(234, 179, 8, 0.2)',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,

  priorityTitle: {
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--text-primary, #F1F5F9)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
    margin: 0,
  } as React.CSSProperties,

  /* Feed item row */
  feedRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    paddingBottom: 12,
    borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
  } as React.CSSProperties,

  feedRowLast: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    paddingBottom: 12,
  } as React.CSSProperties,

  feedDot: {
    width: 8,
    height: 8,
    borderRadius: 9999,
    marginTop: 8,
    flexShrink: 0,
  } as React.CSSProperties,

  feedContent: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,

  feedTitle: {
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--text-primary, #F1F5F9)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    margin: 0,
  } as React.CSSProperties,

  feedSub: {
    fontSize: 14,
    color: 'var(--text-secondary, #94A3B8)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    marginTop: 4,
  } as React.CSSProperties,

  feedTime: {
    fontSize: 14,
    color: 'var(--text-dim, #475569)',
    marginTop: 4,
  } as React.CSSProperties,

  feedChannel: {
    marginLeft: 8,
    fontSize: 14,
    opacity: 0.6,
    color: 'var(--text-dim, #475569)',
  } as React.CSSProperties,

  /* Lead row */
  leadRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    background: 'rgba(25, 35, 50, 0.8)',
    border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
  } as React.CSSProperties,

  leadName: {
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--text-primary, #F1F5F9)',
    margin: 0,
  } as React.CSSProperties,

  leadStatus: {
    fontSize: 14,
    color: 'var(--text-secondary, #94A3B8)',
    marginTop: 4,
  } as React.CSSProperties,

  leadValue: {
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--text-primary, #F1F5F9)',
  } as React.CSSProperties,

  /* Schedule section */
  scheduleHint: {
    fontSize: 14,
    color: 'var(--text-secondary, #94A3B8)',
    marginBottom: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  } as React.CSSProperties,
} as const;

/* ─── Responsive breakpoint styles via media query classes (layout only) ─── */
/* We use Tailwind ONLY for grid layout breakpoints: sm:grid-cols-4, lg:grid-cols-* */

function CommandCenterTab() {
  const [loading, setLoading] = useState(true);
  const [approvals, setApprovals] = useState<Record<string, unknown>[]>([]);
  const [leads, setLeads] = useState<Record<string, unknown>[]>([]);
  const [tasks, setTasks] = useState<Record<string, unknown>[]>([]);
  const [recentActivity, setRecentActivity] = useState<Record<string, unknown>[]>([]);
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const [todaysPriorities, setTodaysPriorities] = useState<PriorityTask[]>([]);
  const [inboxCount, setInboxCount] = useState(0);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const { stats } = useDashboardStats();
  const { industry } = useEnabledModules();
  const pack = getPack(industry ?? 'agency');
  const kpis: KPIConfig[] = pack.kpis ?? [];

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) { setLoading(false); return; }

    Promise.all([
      supabase.from('approval_queue').select('*').eq('status', 'pending').limit(5),
      supabase.from('leads').select('*').in('status', ['new', 'contacted', 'qualified']).order('created_at', { ascending: false }).limit(3),
      supabase.from('tasks').select('*').eq('status', 'todo').lt('due_date', new Date().toISOString()).limit(5),
      supabase.from('channel_messages').select('*').order('received_at', { ascending: false }).limit(5),
      // Agent activity feed
      supabase.from('agent_runs').select('id, output_summary, created_at, agent_configs(name, agent_type)').order('created_at', { ascending: false }).limit(8),
      // Today's priorities (critical + high tasks)
      supabase.from('tasks').select('id, title, priority, status').in('priority', ['critical', 'high']).in('status', ['pending', 'in_progress']).order('priority', { ascending: true }).limit(5),
      // Unread inbox count
      supabase.from('channel_messages').select('id', { count: 'exact', head: true }).eq('processed', false),
    ]).then(([appRes, leadRes, taskRes, actRes, agentRes, priorityRes, inboxRes]) => {
      setApprovals(appRes.data || []);
      setLeads(leadRes.data || []);
      setTasks(taskRes.data || []);
      setRecentActivity(actRes.data || []);
      setAgentRuns((agentRes.data || []) as unknown as AgentRun[]);
      setTodaysPriorities((priorityRes.data || []) as PriorityTask[]);
      setInboxCount(inboxRes.count || 0);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, []);

  // Live agent activity feed via realtime
  const refreshAgentRuns = useCallback(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.from('agent_runs')
      .select('id, output_summary, created_at, agent_configs(name, agent_type)')
      .order('created_at', { ascending: false })
      .limit(8)
      .then(({ data }) => {
        if (data) setAgentRuns(data as unknown as AgentRun[]);
      });
  }, []);

  useRealtimeSubscription('agent_runs', { event: '*' }, refreshAgentRuns);

  // Live approval updates
  const refreshApprovals = useCallback(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.from('approval_queue')
      .select('*')
      .eq('status', 'pending')
      .limit(5)
      .then(({ data }) => {
        if (data) setApprovals(data);
      });
  }, []);

  useRealtimeSubscription('approval_queue', { event: '*' }, refreshApprovals);

  // Live inbox count
  useRealtimeSubscription('channel_messages', { event: 'INSERT' }, () => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.from('channel_messages')
      .select('id', { count: 'exact', head: true })
      .eq('processed', false)
      .then(({ count }) => {
        setInboxCount(count || 0);
      });
  });

  const topApprovalId = approvals[0]?.id as string | undefined;
  const topApprovalProcessing = topApprovalId ? processingIds.has(topApprovalId) : false;
  const topApprovalDisabled = approvals.length === 0 || topApprovalProcessing;

  const handleApprove = async (approvalId: string) => {
    setProcessingIds(prev => new Set(prev).add(approvalId));
    try {
      const response = await fetch('/api/agent/approvals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId, decision: 'approved' })
      });

      if (response.ok) {
        setApprovals(prev => prev.filter(app => app.id !== approvalId));
      } else {
        logger.error('Failed to approve:', await response.text());
      }
    } catch (error) {
      logger.error('Error approving:', error);
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(approvalId);
        return next;
      });
    }
  };

  const handleDismiss = async (approvalId: string) => {
    setProcessingIds(prev => new Set(prev).add(approvalId));
    try {
      const response = await fetch('/api/agent/approvals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId, decision: 'rejected' })
      });

      if (response.ok) {
        setApprovals(prev => prev.filter(app => app.id !== approvalId));
      } else {
        logger.error('Failed to dismiss:', await response.text());
      }
    } catch (error) {
      logger.error('Error dismissing:', error);
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(approvalId);
        return next;
      });
    }
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

  if (loading) return <TabSkeleton />;

  return (
    <TabShell variant="fixed">
      {/* Quick Actions Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4" style={{ gap: 12 }}>
        <button
          onClick={() => {
            if (topApprovalId && !topApprovalProcessing) handleApprove(topApprovalId);
          }}
          disabled={topApprovalDisabled}
          style={topApprovalDisabled ? S.quickActionBtnDisabled : S.quickActionBtn}
        >
          <div style={S.iconBoxWarning}>
            <ShieldCheck size={18} style={{ color: 'rgba(234, 179, 8, 1)' }} />
          </div>
          <div style={S.qaTextWrap}>
            <p style={S.qaTitle}>Approve Next</p>
            <p style={S.qaSub}>
              {topApprovalProcessing ? 'Processing...' : `${approvals.length} pending`}
            </p>
          </div>
        </button>

        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: 'invoices' } }));
          }}
          style={S.quickActionBtn}
        >
          <div style={S.iconBoxSuccess}>
            <ReceiptText size={18} style={{ color: 'rgba(34, 197, 94, 1)' }} />
          </div>
          <div style={S.qaTextWrap}>
            <p style={S.qaTitle}>New Invoice</p>
            <p style={S.qaSub}>Create & send</p>
          </div>
        </button>

        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: 'inbox' } }));
          }}
          style={S.quickActionBtn}
        >
          <div style={S.iconBoxOrange}>
            <Inbox size={18} style={{ color: 'var(--text-primary, #F1F5F9)' }} />
          </div>
          <div style={S.qaTextWrap}>
            <p style={S.qaTitle}>Inbox</p>
            <p style={S.qaSub}>{inboxCount} unread</p>
          </div>
        </button>

        <button
          onClick={() => {
            if (topApprovalId && !topApprovalProcessing) handleDismiss(topApprovalId);
          }}
          disabled={topApprovalDisabled}
          style={topApprovalDisabled ? S.quickActionBtnDisabled : S.quickActionBtn}
        >
          <div style={S.iconBoxError}>
            <BellOff size={18} style={{ color: 'rgba(239, 68, 68, 1)' }} />
          </div>
          <div style={S.qaTextWrap}>
            <p style={S.qaTitle}>Dismiss Top</p>
            <p style={S.qaSub}>
              {topApprovalProcessing ? 'Processing...' : 'Clear alert'}
            </p>
          </div>
        </button>
      </div>

      {/* KPI Widgets — driven by industry pack */}
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: 16 }}>
          {kpis.map((kpi) => {
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
          })}
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3" style={{ gap: 24 }}>
        {/* Approvals - Left Column (spans 2) */}
        <div className="lg:col-span-2" style={S.glassCard}>
          <div style={S.cardHeader}>
            <h2 style={S.cardHeaderTitle}>
              <ShieldCheck size={20} style={{ color: 'rgba(234, 179, 8, 1)' }} /> Action Required
            </h2>
            <p style={S.cardHeaderSub}>{approvals.length} pending approvals</p>
          </div>
          <div style={S.cardBody}>
            {approvals.length === 0 ? (
              <EmptyState title="No pending approvals" description="Great work! All actions have been reviewed." />
            ) : (
              approvals.map(app => {
                const isProcessing = processingIds.has(app.id as string);
                return (
                  <div key={app.id as string} style={S.approvalRow}>
                    <div>
                      <p style={S.approvalTitle}>{(app.title || app.action_type || 'Approval Request') as string}</p>
                      <p style={S.approvalDesc}>{app.description as string}</p>
                    </div>
                    <div style={S.approvalActions}>
                      <button
                        onClick={() => handleDismiss(app.id as string)}
                        disabled={isProcessing}
                        style={isProcessing ? S.dismissBtnDisabled : S.dismissBtn}
                      >
                        {isProcessing ? 'Processing...' : 'Dismiss'}
                      </button>
                      <button
                        onClick={() => handleApprove(app.id as string)}
                        disabled={isProcessing}
                        style={isProcessing ? S.approveBtnDisabled : S.approveBtn}
                      >
                        {isProcessing ? 'Processing...' : 'Approve'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Today's Priorities - Right Column */}
        <div style={S.glassCard}>
          <div style={S.cardHeader}>
            <h2 style={S.cardHeaderTitle}>
              <Zap size={20} style={{ color: 'rgba(234, 179, 8, 1)' }} /> Today&apos;s Priorities
            </h2>
          </div>
          <div style={S.cardBodyCompact}>
            {todaysPriorities.length === 0 ? (
              <EmptyState title="No high-priority tasks" description="Enjoy the calm — nothing urgent right now." />
            ) : (
              todaysPriorities.map(task => (
                <div key={task.id} style={S.priorityRow}>
                  <span style={task.priority === 'critical' ? S.priorityBadgeCritical : S.priorityBadgeHigh}>
                    {task.priority}
                  </span>
                  <p style={S.priorityTitle}>{task.title}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Agent Activity Feed + Hot Leads + Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-3" style={{ gap: 24 }}>
        {/* Agent Activity Feed */}
        <div style={S.glassCard}>
          <div style={S.cardHeader}>
            <h2 style={S.cardHeaderTitle}>
              <Activity size={20} style={{ color: 'var(--text-primary, #F1F5F9)' }} /> Agent Activity
            </h2>
            <p style={S.cardHeaderSub}>Recent agent runs</p>
          </div>
          <div style={S.cardBodyScroll}>
            {agentRuns.length === 0 ? (
              <EmptyState title="No recent agent activity" description="Agents will appear here when they run." />
            ) : (
              agentRuns.map((run, idx) => (
                <div key={run.id} style={idx === agentRuns.length - 1 ? S.feedRowLast : S.feedRow}>
                  <div style={{ ...S.feedDot, background: 'var(--text-primary, #F1F5F9)' }} />
                  <div style={S.feedContent}>
                    <p style={S.feedTitle}>
                      {run.agent_configs?.name || run.agent_configs?.agent_type || 'Agent'}
                    </p>
                    <p style={S.feedSub}>
                      {run.output_summary}
                    </p>
                    <p style={S.feedTime}>
                      {new Date(run.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Hot Leads */}
        <div style={S.glassCard}>
          <div style={S.cardHeader}>
            <h2 style={S.cardHeaderTitle}>
              <TrendingUp size={20} style={{ color: 'var(--text-primary, #F1F5F9)' }} /> Hot Leads
            </h2>
            <p style={S.cardHeaderSub}>Top opportunities this week</p>
          </div>
          <div style={S.cardBodyCompact}>
            {leads.length === 0 ? (
              <EmptyState title="No active leads" description="New leads will appear here as they come in." />
            ) : (
              leads.map(lead => (
                <div key={lead.id as string} style={S.leadRow}>
                  <div style={{ flex: 1 }}>
                    <p style={S.leadName}>{((lead.metadata as Record<string, unknown>)?.name || (lead.metadata as Record<string, unknown>)?.company || lead.source_channel || 'Unnamed Lead') as string}</p>
                    <p style={S.leadStatus}>
                      {lead.status === 'new' && 'New Contact'}
                      {lead.status === 'contacted' && 'Contacted'}
                      {lead.status === 'qualified' && 'Qualified'}
                    </p>
                  </div>
                  <div style={S.leadValue}>{(lead.metadata as Record<string, unknown>)?.value ? `$${(lead.metadata as Record<string, unknown>).value}` : (lead.budget_range as string) || '--'}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Today's Schedule */}
        <div style={S.glassCard}>
          <div style={S.cardHeader}>
            <h2 style={S.cardHeaderTitle}>
              <Clock size={20} style={{ color: 'var(--text-secondary, #94A3B8)' }} /> Today&apos;s Schedule
            </h2>
          </div>
          <div style={{ padding: 16 }}>
            <div style={S.scheduleHint}>
              <Calendar size={14} />
              <span>Connect Google Calendar to see the schedule</span>
            </div>
            <TimelineBar
              startLabel="09:00"
              endLabel="17:00"
              events={[]}
              selection={[0.25, 0.38]}
            />
          </div>
        </div>
      </div>

      {/* Recent Channel Activity */}
      <div style={S.glassCard}>
        <div style={S.cardHeader}>
          <h2 style={S.cardHeaderTitle}>
            <Users size={20} style={{ color: 'var(--text-primary, #F1F5F9)' }} /> Recent Channel Activity
          </h2>
          <p style={S.cardHeaderSub}>Latest messages across all channels</p>
        </div>
        <div style={S.cardBodyScroll}>
          {recentActivity.length === 0 ? (
            <EmptyState title="No recent activity" description="Channel messages will appear here." />
          ) : (
            recentActivity.map((activity, idx) => (
              <div key={(activity.id as string) || idx} style={idx === recentActivity.length - 1 ? S.feedRowLast : S.feedRow}>
                <div style={{ ...S.feedDot, background: 'var(--text-primary, #F1F5F9)' }} />
                <div style={S.feedContent}>
                  <p style={S.feedTitle}>
                    {(activity.sender_name || activity.content || activity.message || 'Activity Update') as string}
                  </p>
                  <p style={S.feedSub}>
                    {activity.subject ? `${activity.subject}` : (activity.body as string || '').slice(0, 80)}
                  </p>
                  <p style={S.feedTime}>
                    {activity.received_at || activity.created_at ? (
                      new Date((activity.received_at || activity.created_at) as string).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    ) : 'Just now'}
                    {activity.channel_type ? <span style={S.feedChannel}>via {String(activity.channel_type)}</span> : null}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </TabShell>
  );
}

export default React.memo(CommandCenterTab);
