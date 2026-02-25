'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { StatCard, StatusBadge, ProcessPipeline, TimelineBar } from '@/components/ui/data-viz';
import { AlertCircle, Clock, ShieldCheck, Zap, Handshake, Users, CheckCircle2, Link as LinkIcon, TrendingUp, Calendar, ReceiptText, MessageSquare, BellOff } from 'lucide-react';
import { TabSkeleton } from './tab-skeleton';

function CommandCenterTab() {
  const [loading, setLoading] = useState(true);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) { setLoading(false); return; }

    Promise.all([
      supabase.from('approval_queue').select('*').eq('status', 'pending').limit(5),
      supabase.from('leads').select('*').in('status', ['new', 'contacted', 'qualified']).order('created_at', { ascending: false }).limit(3),
      supabase.from('tasks').select('*').eq('status', 'todo').lt('due_date', new Date().toISOString()).limit(5),
      supabase.from('channel_messages').select('*').order('received_at', { ascending: false }).limit(5),
    ]).then(([appRes, leadRes, taskRes, actRes]) => {
      setApprovals(appRes.data || []);
      setLeads(leadRes.data || []);
      setTasks(taskRes.data || []);
      setRecentActivity(actRes.data || []);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, []);

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
    <div className="flex-1 overflow-y-auto h-full p-4 md:p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Command Center</h1>
        <p className="text-muted-foreground mt-1">What needs attention NOW.</p>
      </div>

      {/* Quick Actions Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => {
            if (approvals.length > 0) handleApprove(approvals[0].id);
          }}
          disabled={approvals.length === 0}
          className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0">
            <ShieldCheck size={18} className="text-amber-500" />
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
            <ReceiptText size={18} className="text-emerald-500" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">New Invoice</p>
            <p className="text-[11px] text-muted-foreground">Create & send</p>
          </div>
        </button>

        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent('bb-navigate', { detail: 'chat' }));
          }}
          className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center flex-shrink-0">
            <MessageSquare size={18} className="text-blue-500" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">Reply Message</p>
            <p className="text-[11px] text-muted-foreground">Open chat</p>
          </div>
        </button>

        <button
          onClick={() => {
            if (approvals.length > 0) handleDismiss(approvals[0].id);
          }}
          disabled={approvals.length === 0}
          className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-red-500/15 flex items-center justify-center flex-shrink-0">
            <BellOff size={18} className="text-red-500" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">Dismiss Top</p>
            <p className="text-[11px] text-muted-foreground">Clear alert</p>
          </div>
        </button>
      </div>

      {/* KPI Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Pending Approvals"
          value={approvals.length}
          icon={<ShieldCheck className="text-amber-500" />}
        />
        <StatCard
          label="Hot Leads"
          value={leads.length}
          icon={<Handshake className="text-blue-500" />}
        />
        <StatCard
          label="Overdue Tasks"
          value={tasks.length}
          icon={<AlertCircle className="text-red-500" />}
        />
        <StatCard
          label="System Status"
          value="Nominal"
          icon={<CheckCircle2 className="text-emerald-500" />}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Approvals - Left Column (spans 2) */}
        <div className="bb-card col-span-1 lg:col-span-2">
          <div className="p-4 border-b border-[var(--border-subtle)]">
            <h2 className="text-lg font-medium flex items-center gap-2">
              <ShieldCheck size={20} className="text-amber-500" /> Action Required
            </h2>
            <p className="text-xs text-muted-foreground mt-1">{approvals.length} pending approvals</p>
          </div>
          <div className="p-4 space-y-4">
            {approvals.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">No pending approvals. Great work!</p>
            ) : (
              approvals.map(app => (
                <div key={app.id} className="flex items-center justify-between p-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                  <div>
                    <p className="font-medium text-sm">{app.title || app.action_type || 'Approval Request'}</p>
                    <p className="text-xs text-muted-foreground mt-1">{app.description}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDismiss(app.id)}
                      disabled={processingIds.has(app.id)}
                      className="px-3 py-1 text-xs font-medium rounded-md bg-[var(--bg-element)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {processingIds.has(app.id) ? 'Processing...' : 'Dismiss'}
                    </button>
                    <button
                      onClick={() => handleApprove(app.id)}
                      disabled={processingIds.has(app.id)}
                      className="px-3 py-1 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {processingIds.has(app.id) ? 'Processing...' : 'Approve'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Today's Schedule - Right Column */}
        <div className="bb-card col-span-1">
          <div className="p-4 border-b border-[var(--border-subtle)]">
            <h2 className="text-lg font-medium flex items-center gap-2">
              <Clock size={20} className="text-blue-500" /> Today's Schedule
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

      {/* Hot Leads + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hot Leads */}
        <div className="bb-card">
          <div className="p-4 border-b border-[var(--border-subtle)]">
            <h2 className="text-lg font-medium flex items-center gap-2">
              <TrendingUp size={20} className="text-pink-500" /> Hot Leads
            </h2>
            <p className="text-xs text-muted-foreground mt-1">Top opportunities this week</p>
          </div>
          <div className="p-4 space-y-3">
            {leads.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">No active leads at the moment.</p>
            ) : (
              leads.map(lead => (
                <div key={lead.id} className="flex items-center justify-between p-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{lead.name || lead.company || 'Unnamed Lead'}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {lead.status === 'new' && '📞 New Contact'}
                      {lead.status === 'contacted' && '💬 Contacted'}
                      {lead.status === 'qualified' && '✓ Qualified'}
                    </p>
                  </div>
                  <div className="text-xs font-medium text-amber-500">{lead.value ? `$${lead.value}` : '—'}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bb-card">
          <div className="p-4 border-b border-[var(--border-subtle)]">
            <h2 className="text-lg font-medium flex items-center gap-2">
              <Users size={20} className="text-cyan-500" /> Recent Activity
            </h2>
            <p className="text-xs text-muted-foreground mt-1">Latest interactions</p>
          </div>
          <div className="p-4 space-y-3 max-h-64 overflow-y-auto">
            {recentActivity.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">No recent activity.</p>
            ) : (
              recentActivity.map((activity, idx) => (
                <div key={activity.id || idx} className="flex items-start gap-3 pb-3 border-b border-[var(--border-subtle)] last:border-0">
                  <div className="w-2 h-2 rounded-full bg-[var(--accent)] mt-2 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">
                      {activity.content || activity.message || 'Activity Update'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {activity.received_at || activity.created_at ? (
                        new Date(activity.received_at || activity.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      ) : 'Just now'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default React.memo(CommandCenterTab);
