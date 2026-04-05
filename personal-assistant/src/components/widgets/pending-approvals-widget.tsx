'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSubscription } from '@/lib/realtime/supabase-realtime';
import { IconShieldCheck } from '@tabler/icons-react';
import { WidgetCard } from './widget-card';
import { Empty, EmptyTitle, EmptyDescription } from '@/components/ui/empty';

export function PendingApprovalsWidget() {
  const [approvals, setApprovals] = useState<Record<string, unknown>[]>([]);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.from('approval_queue').select('*').eq('status', 'pending').limit(5)
      .then(({ data }) => { if (data) setApprovals(data); });
  }, []);

  useEffect(() => { load(); }, [load]);
  useRealtimeSubscription('approval_queue', { event: '*' }, load);

  const handleAction = async (approvalId: string, decision: 'approved' | 'rejected') => {
    setProcessingIds(prev => new Set(prev).add(approvalId));
    try {
      const response = await fetch('/api/agent/approvals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId, decision }),
      });
      if (response.ok) {
        setApprovals(prev => prev.filter(app => app.id !== approvalId));
      }
    } finally {
      setProcessingIds(prev => { const next = new Set(prev); next.delete(approvalId); return next; });
    }
  };

  return (
    <WidgetCard
      title="Action Required"
      subtitle={`${approvals.length} pending approvals`}
      icon={<IconShieldCheck size={20} className="text-muted-foreground" />}
    >
      <div className="flex flex-col gap-4">
        {approvals.length === 0 ? (
          <Empty><EmptyTitle>No pending approvals</EmptyTitle><EmptyDescription>All actions have been reviewed.</EmptyDescription></Empty>
        ) : (
          approvals.map(app => (
            <div key={app.id as string} className="flex items-center justify-between p-3 rounded-xl bg-muted border border-border">
              <div>
                <p className="font-medium text-sm">{(app.title || app.action_type || 'Approval Request') as string}</p>
                <p className="text-sm text-muted-foreground mt-1">{app.description as string}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAction(app.id as string, 'rejected')}
                  disabled={processingIds.has(app.id as string)}
                  className="px-3 py-1 text-sm font-medium rounded-lg bg-secondary hover:bg-secondary border border-border disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {processingIds.has(app.id as string) ? 'Processing...' : 'Dismiss'}
                </button>
                <button
                  onClick={() => handleAction(app.id as string, 'approved')}
                  disabled={processingIds.has(app.id as string)}
                  className="px-3 py-1 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {processingIds.has(app.id as string) ? 'Processing...' : 'Approve'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </WidgetCard>
  );
}
