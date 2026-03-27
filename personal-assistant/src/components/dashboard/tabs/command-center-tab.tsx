'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSubscription } from '@/lib/realtime/supabase-realtime';
import { useDashboardStats } from '@/hooks/use-dashboard-stats';
import { useEnabledModules } from '@/lib/modules/use-enabled-modules';
import { getPack } from '@/lib/industry/registry';
import type { KPIConfig } from '@/lib/industry/types';
import { TabSkeleton } from './tab-skeleton';
import { TabShell } from '@/components/ui/tab-shell';
import { Empty, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  IconShieldCheck,
  IconReceipt,
  IconInbox,
  IconBellOff,
  IconBolt,
  IconActivity,
  IconTrendingUp,
  IconClock,
  IconCalendar,
  IconUsers,
} from '@tabler/icons-react';
import { logger } from '@/lib/core/logger';

/* ---- Interfaces ---- */

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

/* ---- Component ---- */

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
      supabase.from('agent_runs').select('id, output_summary, created_at, agent_configs(name, agent_type)').order('created_at', { ascending: false }).limit(8),
      supabase.from('tasks').select('id, title, priority, status').in('priority', ['critical', 'high']).in('status', ['pending', 'in_progress']).order('priority', { ascending: true }).limit(5),
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

  if (loading) return <TabSkeleton />;

  return (
    <TabShell variant="fixed">
      {/* Quick Actions Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Button
          variant="outline"
          size="lg"
          className="h-auto flex-col items-start gap-1 px-4 py-3"
          onClick={() => {
            if (topApprovalId && !topApprovalProcessing) handleApprove(topApprovalId);
          }}
          disabled={topApprovalDisabled}
        >
          <span className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10">
              <IconShieldCheck data-icon className="text-amber-500" />
            </span>
            <span className="text-sm font-medium text-foreground">Approve Next</span>
          </span>
          <span className="pl-10 text-xs text-muted-foreground">
            {topApprovalProcessing ? 'Processing...' : `${approvals.length} pending`}
          </span>
        </Button>

        <Button
          variant="outline"
          size="lg"
          className="h-auto flex-col items-start gap-1 px-4 py-3"
          onClick={() => {
            window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: 'invoices' } }));
          }}
        >
          <span className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10">
              <IconReceipt data-icon className="text-emerald-500" />
            </span>
            <span className="text-sm font-medium text-foreground">New Invoice</span>
          </span>
          <span className="pl-10 text-xs text-muted-foreground">Create &amp; send</span>
        </Button>

        <Button
          variant="outline"
          size="lg"
          className="h-auto flex-col items-start gap-1 px-4 py-3"
          onClick={() => {
            window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: 'inbox' } }));
          }}
        >
          <span className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
              <IconInbox data-icon className="text-primary" />
            </span>
            <span className="text-sm font-medium text-foreground">Inbox</span>
          </span>
          <span className="pl-10 text-xs text-muted-foreground">
            {inboxCount} unread
          </span>
        </Button>

        <Button
          variant="outline"
          size="lg"
          className="h-auto flex-col items-start gap-1 px-4 py-3"
          onClick={() => {
            if (topApprovalId && !topApprovalProcessing) handleDismiss(topApprovalId);
          }}
          disabled={topApprovalDisabled}
        >
          <span className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-destructive/10">
              <IconBellOff data-icon className="text-destructive" />
            </span>
            <span className="text-sm font-medium text-foreground">Dismiss Top</span>
          </span>
          <span className="pl-10 text-xs text-muted-foreground">
            {topApprovalProcessing ? 'Processing...' : 'Clear alert'}
          </span>
        </Button>
      </div>

      {/* KPI Widgets -- driven by industry pack */}
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {kpis.map((kpi) => {
            const liveValue = kpi.dataKey && stats ? stats[kpi.dataKey] : undefined;
            const displayValue = liveValue !== undefined
              ? (typeof liveValue === 'number' ? liveValue.toLocaleString() : liveValue)
              : kpi.fallback;

            return (
              <Card key={kpi.key} className="py-4">
                <CardContent className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">{kpi.label}</span>
                  <span className="font-mono text-2xl font-semibold tracking-tight text-foreground">
                    {kpi.unit === '$' && '$'}{displayValue}{kpi.unit && kpi.unit !== '$' && ` ${kpi.unit}`}
                  </span>
                  {kpi.trendValue && (
                    <span className={`text-xs font-medium ${kpi.trend === 'up' ? 'text-emerald-500' : kpi.trend === 'down' ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {kpi.trend === 'up' ? '+' : kpi.trend === 'down' ? '-' : ''}{kpi.trendValue}
                      {kpi.subtitle && <span className="ml-1 text-muted-foreground">{kpi.subtitle}</span>}
                    </span>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Approvals - Left Column (spans 2) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconShieldCheck data-icon className="text-amber-500" />
              Action Required
            </CardTitle>
            <CardDescription>{approvals.length} pending approvals</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {approvals.length === 0 ? (
              <Empty><EmptyTitle>No pending approvals</EmptyTitle><EmptyDescription>Great work! All actions have been reviewed.</EmptyDescription></Empty>
            ) : (
              approvals.map(app => {
                const isProcessing = processingIds.has(app.id as string);
                return (
                  <div key={app.id as string} className="flex items-center justify-between rounded-lg border border-border bg-muted/50 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{(app.title || app.action_type || 'Approval Request') as string}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{app.description as string}</p>
                    </div>
                    <div className="ml-4 flex shrink-0 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDismiss(app.id as string)}
                        disabled={isProcessing}
                      >
                        {isProcessing ? 'Processing...' : 'Dismiss'}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleApprove(app.id as string)}
                        disabled={isProcessing}
                      >
                        {isProcessing ? 'Processing...' : 'Approve'}
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Today's Priorities - Right Column */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconBolt data-icon className="text-amber-500" />
              Today&apos;s Priorities
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {todaysPriorities.length === 0 ? (
              <Empty><EmptyTitle>No high-priority tasks</EmptyTitle><EmptyDescription>Enjoy the calm -- nothing urgent right now.</EmptyDescription></Empty>
            ) : (
              todaysPriorities.map(task => (
                <div key={task.id} className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 p-2.5">
                  <Badge variant={task.priority === 'critical' ? 'destructive' : 'secondary'}>
                    {task.priority}
                  </Badge>
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{task.title}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Agent Activity Feed + Hot Leads + Schedule */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Agent Activity Feed */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconActivity data-icon className="text-foreground" />
              Agent Activity
            </CardTitle>
            <CardDescription>Recent agent runs</CardDescription>
          </CardHeader>
          <CardContent className="flex max-h-64 flex-col gap-3 overflow-y-auto">
            {agentRuns.length === 0 ? (
              <Empty><EmptyTitle>No recent agent activity</EmptyTitle><EmptyDescription>Agents will appear here when they run.</EmptyDescription></Empty>
            ) : (
              agentRuns.map((run, idx) => (
                <React.Fragment key={run.id}>
                  <div className="flex gap-3">
                    <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {run.agent_configs?.name || run.agent_configs?.agent_type || 'Agent'}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {run.output_summary}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground/60">
                        {new Date(run.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  {idx < agentRuns.length - 1 && <Separator />}
                </React.Fragment>
              ))
            )}
          </CardContent>
        </Card>

        {/* Hot Leads */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconTrendingUp data-icon className="text-foreground" />
              Hot Leads
            </CardTitle>
            <CardDescription>Top opportunities this week</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {leads.length === 0 ? (
              <Empty><EmptyTitle>No active leads</EmptyTitle><EmptyDescription>New leads will appear here as they come in.</EmptyDescription></Empty>
            ) : (
              leads.map(lead => (
                <div key={lead.id as string} className="flex items-center justify-between rounded-lg border border-border bg-muted/50 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {((lead.metadata as Record<string, unknown>)?.name || (lead.metadata as Record<string, unknown>)?.company || lead.source_channel || 'Unnamed Lead') as string}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {lead.status === 'new' && 'New Contact'}
                      {lead.status === 'contacted' && 'Contacted'}
                      {lead.status === 'qualified' && 'Qualified'}
                    </p>
                  </div>
                  <span className="font-mono text-sm font-medium text-foreground">
                    {(lead.metadata as Record<string, unknown>)?.value ? `$${(lead.metadata as Record<string, unknown>).value}` : (lead.budget_range as string) || '--'}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Today's Schedule */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconClock data-icon className="text-muted-foreground" />
              Today&apos;s Schedule
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <IconCalendar data-icon />
              <span>Connect Google Calendar to see the schedule</span>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">09:00</span>
              <Progress value={38} className="flex-1" />
              <span className="text-xs text-muted-foreground">17:00</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Channel Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconUsers data-icon className="text-foreground" />
            Recent Channel Activity
          </CardTitle>
          <CardDescription>Latest messages across all channels</CardDescription>
        </CardHeader>
        <CardContent className="flex max-h-64 flex-col gap-3 overflow-y-auto">
          {recentActivity.length === 0 ? (
            <Empty><EmptyTitle>No recent activity</EmptyTitle><EmptyDescription>Channel messages will appear here.</EmptyDescription></Empty>
          ) : (
            recentActivity.map((activity, idx) => (
              <React.Fragment key={(activity.id as string) || idx}>
                <div className="flex gap-3">
                  <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {(activity.sender_name || activity.content || activity.message || 'Activity Update') as string}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {activity.subject ? `${activity.subject}` : (activity.body as string || '').slice(0, 80)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground/60">
                      {activity.received_at || activity.created_at ? (
                        new Date((activity.received_at || activity.created_at) as string).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      ) : 'Just now'}
                      {activity.channel_type ? (
                        <span className="ml-2 opacity-60">via {String(activity.channel_type)}</span>
                      ) : null}
                    </p>
                  </div>
                </div>
                {idx < recentActivity.length - 1 && <Separator />}
              </React.Fragment>
            ))
          )}
        </CardContent>
      </Card>
    </TabShell>
  );
}

export default React.memo(CommandCenterTab);
