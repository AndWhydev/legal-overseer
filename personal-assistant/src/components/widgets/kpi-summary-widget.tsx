'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { StatCard } from '@/components/ui/data-viz';

export function KpiSummaryWidget() {
  const [approvalCount, setApprovalCount] = useState(0);
  const [leadCount, setLeadCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [inboxCount, setInboxCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    Promise.all([
      supabase.from('approval_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('leads').select('id', { count: 'exact', head: true }).in('status', ['new', 'contacted', 'qualified']),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'todo').lt('due_date', new Date().toISOString()),
      supabase.from('channel_messages').select('id', { count: 'exact', head: true }).eq('processed', false),
    ]).then(([appRes, leadRes, taskRes, inboxRes]) => {
      setApprovalCount(appRes.count || 0);
      setLeadCount(leadRes.count || 0);
      setOverdueCount(taskRes.count || 0);
      setInboxCount(inboxRes.count || 0);
    });
  }, []);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      <StatCard
        label="Pending Approvals"
        value={approvalCount}
        subtitle="Awaiting review"
        color="var(--bb-status-warning)"
      />
      <StatCard
        label="Active Leads"
        value={leadCount}
        subtitle="In pipeline"
        color="var(--bb-status-info)"
      />
      <StatCard
        label="Overdue Tasks"
        value={overdueCount}
        subtitle="Past due date"
        color="var(--bb-status-error)"
      />
      <StatCard
        label="Unread Messages"
        value={inboxCount}
        subtitle="Inbox"
        color="var(--bb-purple)"
      />
      <StatCard
        label="System Status"
        value="Nominal"
        subtitle="All systems go"
        color="var(--bb-status-success)"
      />
    </div>
  );
}
