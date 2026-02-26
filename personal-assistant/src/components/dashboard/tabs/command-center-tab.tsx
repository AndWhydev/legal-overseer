'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSubscription } from '@/lib/realtime/supabase-realtime';
import { StatCard, StatusBadge, ProcessPipeline, TimelineBar } from '@/components/ui/data-viz';
import { AlertCircle, Clock, ShieldCheck, Zap, Handshake, Users, CheckCircle2, Link as LinkIcon, TrendingUp, Calendar, ReceiptText, MessageSquare, BellOff, Inbox, Activity, LayoutDashboard } from 'lucide-react';
import { TabSkeleton } from './tab-skeleton';
import { TabShell } from '@/components/ui/tab-shell';
import { TabHeader } from '@/components/ui/tab-header';
import { SectionCard } from '@/components/ui/section-card';
import { EmptyState } from '@/components/ui/empty-state';

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
        console.error('Failed to approve:', await response.text());
      }
    } catch (error) {
      console.error('Error approving:', error);
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
        console.error('Failed to dismiss:', await response.text());
      }
    } catch (error) {
      console.error('Error dismissing:', error);
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
      {/* Header */}
      <TabHeader
        icon={<LayoutDashboard size={22} />}
        iconColor="var(--bb-orange)"
        title="Command Center"
        subtitle="What needs attention NOW."
      />

      {/* Quick Actions Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => {
            if (approvals.length > 0) handleApprove(approvals[0].id as string);
          }}
          disabled={approvals.length === 0}
          className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0">
            <ShieldCheck size={18} style={{ color: 'var(--bb-status-warning)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">Approve Next</p>
            <p className="text-[11px] text-muted-foreground">{approvals.length} pending</p>
          </div>
        </button>

        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent('bb-navigate', { detail: 'invoices' }));
          }}
          className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
            <ReceiptText size={18} style={{ color: 'var(--bb-status-success)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">New Invoice</p>
            <p className="text-[11px] text-muted-foreground">Create & send</p>
          </div>
        </button>

        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent('bb-navigate', { detail: 'inbox' }));
          }}
          className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-violet-500/15 flex items-center justify-center flex-shrink-0">
            <Inbox size={18} style={{ color: 'var(--bb-purple)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">Inbox</p>
            <p className="text-[11px] text-muted-foreground">{inboxCount} unread</p>
          </div>
        </button>

        <button
          onClick={() => {
            if (approvals.length > 0) handleDismiss(approvals[0].id as string);
          }}
          disabled={approvals.length === 0}
          className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-red-500/15 flex items-center justify-center flex-shrink-0">
            <BellOff size={18} style={{ color: 'var(--bb-status-error)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">Dismiss Top</p>
            <p className="text-[11px] text-muted-foreground">Clear alert</p>
          </div>
        </button>
      </div>

      {/* KPI Widgets */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard
          label="Pending Approvals"
          value={approvals.length}
          icon={<ShieldCheck style={{ color: 'var(--bb-status-warning)' }} />}
        />
        <StatCard
          label="Active Leads"
          value={leads.length}
          icon={<Handshake style={{ color: 'var(--bb-status-info)' }} />}
        />
        <StatCard
          label="Overdue Tasks"
          value={tasks.length}
          icon={<AlertCircle style={{ color: 'var(--bb-status-error)' }} />}
        />
        <StatCard
          label="Unread Messages"
          value={inboxCount}
          icon={<Inbox style={{ color: 'var(--bb-purple)' }} />}
        />
        <StatCard
          label="System Status"
          value="Nominal"
          icon={<CheckCircle2 style={{ color: 'var(--bb-status-success)' }} />}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Approvals - Left Column (spans 2) */}
        <div className="bb-card col-span-1 lg:col-span-2">
          <div className="p-4 border-b border-[var(--border-subtle)]">
            <h2 className="text-lg font-medium flex items-center gap-2">
              <ShieldCheck size={20} style={{ color: 'var(--bb-status-warning)' }} /> Action Required
            </h2>
            <p className="text-xs text-muted-foreground mt-1">{approvals.length} pending approvals</p>
          </div>
          <div className="p-4 space-y-4">
            {approvals.length === 0 ? (
              <EmptyState icon={<ShieldCheck size={32} />} title="No pending approvals" description="Great work! All actions have been reviewed." />
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
              <Zap size={20} style={{ color: 'var(--bb-status-warning)' }} /> Today&apos;s Priorities
            </h2>
          </div>
          <div className="p-4 space-y-3">
            {todaysPriorities.length === 0 ? (
              <EmptyState icon={<Zap size={32} />} title="No high-priority tasks" description="Enjoy the calm — nothing urgent right now." />
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

      {/* Agent Activity Feed + Hot Leads + Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent Activity Feed */}
        <div className="bb-card">
          <div className="p-4 border-b border-[var(--border-subtle)]">
            <h2 className="text-lg font-medium flex items-center gap-2">
              <Activity size={20} style={{ color: 'var(--bb-cyan)' }} /> Agent Activity
            </h2>
            <p className="text-xs text-muted-foreground mt-1">Recent agent runs</p>
          </div>
          <div className="p-4 space-y-3 max-h-64 overflow-y-auto">
            {agentRuns.length === 0 ? (
              <EmptyState icon={<Activity size={32} />} title="No recent agent activity" description="Agents will appear here when they run." />
            ) : (
              agentRuns.map((run) => (
                <div key={run.id} className="flex items-start gap-3 pb-3 border-b border-[var(--border-subtle)] last:border-0">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 mt-2 flex-shrink-0" />
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
              <TrendingUp size={20} style={{ color: 'var(--bb-pink, #EC4899)' }} /> Hot Leads
            </h2>
            <p className="text-xs text-muted-foreground mt-1">Top opportunities this week</p>
          </div>
          <div className="p-4 space-y-3">
            {leads.length === 0 ? (
              <EmptyState icon={<TrendingUp size={32} />} title="No active leads" description="New leads will appear here as they come in." />
            ) : (
              leads.map(lead => (
                <div key={lead.id as string} className="flex items-center justify-between p-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{(lead.name || lead.company || 'Unnamed Lead') as string}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {lead.status === 'new' && 'New Contact'}
                      {lead.status === 'contacted' && 'Contacted'}
                      {lead.status === 'qualified' && 'Qualified'}
                    </p>
                  </div>
                  <div className="text-xs font-medium text-amber-500">{lead.value ? `$${lead.value}` : '--'}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Today's Schedule */}
        <div className="bb-card col-span-1">
          <div className="p-4 border-b border-[var(--border-subtle)]">
            <h2 className="text-lg font-medium flex items-center gap-2">
              <Clock size={20} style={{ color: 'var(--bb-status-info)' }} /> Today&apos;s Schedule
            </h2>
          </div>
          <div className="p-4">
            <div className="text-xs text-muted-foreground mb-4 flex items-center gap-2">
              <Calendar size={14} />
              <span>Connect Google Calendar to see your schedule</span>
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
      <div className="bb-card">
        <div className="p-4 border-b border-[var(--border-subtle)]">
          <h2 className="text-lg font-medium flex items-center gap-2">
            <Users size={20} style={{ color: 'var(--bb-cyan)' }} /> Recent Channel Activity
          </h2>
          <p className="text-xs text-muted-foreground mt-1">Latest messages across all channels</p>
        </div>
        <div className="p-4 space-y-3 max-h-64 overflow-y-auto">
          {recentActivity.length === 0 ? (
            <EmptyState icon={<Users size={32} />} title="No recent activity" description="Channel messages will appear here." />
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
