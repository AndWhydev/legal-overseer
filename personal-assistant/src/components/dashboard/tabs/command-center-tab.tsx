'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSubscription } from '@/lib/realtime/supabase-realtime';
import { StatCard, StatusBadge, ProcessPipeline, TimelineBar, MiniSparkline, MiniBarChart, MiniDonut, MiniGauge } from '@/components/ui/data-viz';
import { SFExclamationmarkCircle, SFClock, SFCheckmarkShield, SFBolt, SFPerson2, SFCheckmarkCircle, SFLink as LinkIcon, SFArrowUpRight, SFCalendar, SFReceipt, SFBubbleRight, SFBellSlash, SFTray, SFWaveformPathEcg } from 'sf-symbols-lib';
import { useDashboardStats } from '@/hooks/use-dashboard-stats';
import { useEnabledModules } from '@/lib/modules/use-enabled-modules';
import { getPack } from '@/lib/industry/registry';
import type { KPIConfig } from '@/lib/industry/types';
import { TabSkeleton } from './tab-skeleton';
import { TabShell } from '@/components/ui/tab-shell';
import { SectionCard } from '@/components/ui/section-card';
import { EmptyState } from '@/components/ui/empty-state';
import { logger } from '@/lib/core/logger';

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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => {
            if (topApprovalId && !topApprovalProcessing) handleApprove(topApprovalId);
          }}
          disabled={topApprovalDisabled}
          className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0">
            <SFCheckmarkShield size={18} style={{ color: 'var(--bb-status-warning)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">Approve Next</p>
            <p className="text-[11px] text-muted-foreground">
              {topApprovalProcessing ? 'Processing...' : `${approvals.length} pending`}
            </p>
          </div>
        </button>

        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: 'invoices' } }));
          }}
          className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
            <SFReceipt size={18} style={{ color: 'var(--bb-status-success)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">New Invoice</p>
            <p className="text-[11px] text-muted-foreground">Create & send</p>
          </div>
        </button>

        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: 'inbox' } }));
          }}
          className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-violet-500/15 flex items-center justify-center flex-shrink-0">
            <SFTray size={18} style={{ color: 'var(--bb-purple)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">Inbox</p>
            <p className="text-[11px] text-muted-foreground">{inboxCount} unread</p>
          </div>
        </button>

        <button
          onClick={() => {
            if (topApprovalId && !topApprovalProcessing) handleDismiss(topApprovalId);
          }}
          disabled={topApprovalDisabled}
          className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-red-500/15 flex items-center justify-center flex-shrink-0">
            <SFBellSlash size={18} style={{ color: 'var(--bb-status-error)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">Dismiss Top</p>
            <p className="text-[11px] text-muted-foreground">
              {topApprovalProcessing ? 'Processing...' : 'Clear alert'}
            </p>
          </div>
        </button>
      </div>

      {/* KPI Widgets — driven by industry pack */}
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Approvals - Left Column (spans 2) */}
        <div className="bb-card col-span-1 lg:col-span-2">
          <div className="p-4 border-b border-[var(--border-subtle)]">
            <h2 className="text-lg font-medium flex items-center gap-2">
              <SFCheckmarkShield size={20} style={{ color: 'var(--bb-status-warning)' }} /> Action Required
            </h2>
            <p className="text-xs text-muted-foreground mt-1">{approvals.length} pending approvals</p>
          </div>
          <div className="p-4 space-y-4">
            {approvals.length === 0 ? (
              <EmptyState icon={<SFCheckmarkShield size={32} />} title="No pending approvals" description="Great work! All actions have been reviewed." />
            ) : (
              approvals.map(app => (
                <div key={app.id as string} className="flex items-center justify-between p-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                  <div>
                    <p className="font-medium text-sm">{(app.title || app.action_type || 'Approval Request') as string}</p>
                    <p className="text-xs text-muted-foreground mt-1">{app.description as string}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDismiss(app.id as string)}
                      disabled={processingIds.has(app.id as string)}
                      className="px-3 py-1 text-xs font-medium rounded-md bg-[var(--bg-element)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {processingIds.has(app.id as string) ? 'Processing...' : 'Dismiss'}
                    </button>
                    <button
                      onClick={() => handleApprove(app.id as string)}
                      disabled={processingIds.has(app.id as string)}
                      className="px-3 py-1 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {processingIds.has(app.id as string) ? 'Processing...' : 'Approve'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Today's Priorities - Right Column */}
        <div className="bb-card col-span-1">
          <div className="p-4 border-b border-[var(--border-subtle)]">
            <h2 className="text-lg font-medium flex items-center gap-2">
              <SFBolt size={20} style={{ color: 'var(--bb-status-warning)' }} /> Today&apos;s Priorities
            </h2>
          </div>
          <div className="p-4 space-y-3">
            {todaysPriorities.length === 0 ? (
              <EmptyState icon={<SFBolt size={32} />} title="No high-priority tasks" description="Enjoy the calm — nothing urgent right now." />
            ) : (
              todaysPriorities.map(task => (
                <div key={task.id} className="flex items-center gap-3 p-2 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                    task.priority === 'critical'
                      ? 'bg-red-500/20 text-red-400 border-red-500/30'
                      : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  }`}>
                    {task.priority}
                  </span>
                  <p className="text-xs font-medium truncate flex-1">{task.title}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Agent SFWaveformPathEcg Feed + Hot Leads + Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent SFWaveformPathEcg Feed */}
        <div className="bb-card">
          <div className="p-4 border-b border-[var(--border-subtle)]">
            <h2 className="text-lg font-medium flex items-center gap-2">
              <SFWaveformPathEcg size={20} style={{ color: 'var(--bb-cyan)' }} /> Agent SFWaveformPathEcg
            </h2>
            <p className="text-xs text-muted-foreground mt-1">Recent agent runs</p>
          </div>
          <div className="p-4 space-y-3 max-h-64 overflow-y-auto">
            {agentRuns.length === 0 ? (
              <EmptyState icon={<SFWaveformPathEcg size={32} />} title="No recent agent activity" description="Agents will appear here when they run." />
            ) : (
              agentRuns.map((run) => (
                <div key={run.id} className="flex items-start gap-3 pb-3 border-b border-[var(--border-subtle)] last:border-0">
                  <div className="w-2 h-2 rounded-full mt-2 flex-shrink-0" style={{ background: 'var(--bb-cyan)' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">
                      {run.agent_configs?.name || run.agent_configs?.agent_type || 'Agent'}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {run.output_summary}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(run.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Hot Leads */}
        <div className="bb-card">
          <div className="p-4 border-b border-[var(--border-subtle)]">
            <h2 className="text-lg font-medium flex items-center gap-2">
              <SFArrowUpRight size={20} style={{ color: 'var(--bb-pink)' }} /> Hot Leads
            </h2>
            <p className="text-xs text-muted-foreground mt-1">Top opportunities this week</p>
          </div>
          <div className="p-4 space-y-3">
            {leads.length === 0 ? (
              <EmptyState icon={<SFArrowUpRight size={32} />} title="No active leads" description="New leads will appear here as they come in." />
            ) : (
              leads.map(lead => (
                <div key={lead.id as string} className="flex items-center justify-between p-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{((lead.metadata as Record<string, unknown>)?.name || (lead.metadata as Record<string, unknown>)?.company || lead.source_channel || 'Unnamed Lead') as string}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {lead.status === 'new' && 'New Contact'}
                      {lead.status === 'contacted' && 'Contacted'}
                      {lead.status === 'qualified' && 'Qualified'}
                    </p>
                  </div>
                  <div className="text-xs font-medium" style={{ color: 'var(--bb-amber)' }}>{(lead.metadata as Record<string, unknown>)?.value ? `$${(lead.metadata as Record<string, unknown>).value}` : (lead.budget_range as string) || '--'}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Today's Schedule */}
        <div className="bb-card col-span-1">
          <div className="p-4 border-b border-[var(--border-subtle)]">
            <h2 className="text-lg font-medium flex items-center gap-2">
              <SFClock size={20} style={{ color: 'var(--bb-status-info)' }} /> Today&apos;s Schedule
            </h2>
          </div>
          <div className="p-4">
            <div className="text-xs text-muted-foreground mb-4 flex items-center gap-2">
              <SFCalendar size={14} />
              <span>Connect Google SFCalendar to see your schedule</span>
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

      {/* Recent Channel SFWaveformPathEcg */}
      <div className="bb-card">
        <div className="p-4 border-b border-[var(--border-subtle)]">
          <h2 className="text-lg font-medium flex items-center gap-2">
            <SFPerson2 size={20} style={{ color: 'var(--bb-cyan)' }} /> Recent Channel SFWaveformPathEcg
          </h2>
          <p className="text-xs text-muted-foreground mt-1">Latest messages across all channels</p>
        </div>
        <div className="p-4 space-y-3 max-h-64 overflow-y-auto">
          {recentActivity.length === 0 ? (
            <EmptyState icon={<SFPerson2 size={32} />} title="No recent activity" description="Channel messages will appear here." />
          ) : (
            recentActivity.map((activity, idx) => (
              <div key={(activity.id as string) || idx} className="flex items-start gap-3 pb-3 border-b border-[var(--border-subtle)] last:border-0">
                <div className="w-2 h-2 rounded-full bg-[var(--accent)] mt-2 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">
                    {(activity.sender_name || activity.content || activity.message || 'Activity Update') as string}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {activity.subject ? `${activity.subject}` : (activity.body as string || '').slice(0, 80)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {activity.received_at || activity.created_at ? (
                      new Date((activity.received_at || activity.created_at) as string).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    ) : 'Just now'}
                    {activity.channel_type ? <span className="ml-2 text-[10px] opacity-60">via {String(activity.channel_type)}</span> : null}
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
