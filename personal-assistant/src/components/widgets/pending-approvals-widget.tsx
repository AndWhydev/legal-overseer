'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSubscription } from '@/lib/realtime/supabase-realtime';
import { ShieldCheck } from 'lucide-react';
import { WidgetCard } from './widget-card';
import { EmptyState } from '@/components/ui/empty-state';

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
      icon={<ShieldCheck size={20} style={{ color: 'var(--bb-status-warning)' }} />}
    >
      <div className="space-y-4">
        {approvals.length === 0 ? (
          <EmptyState icon={<ShieldCheck size={32} />} title="No pending approvals" description="All actions have been reviewed." />
        ) : (
          approvals.map(app => (
            <div key={app.id as string} className="flex items-center justify-between p-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
              <div>
                <p className="font-medium text-sm">{(app.title || app.action_type || 'Approval Request') as string}</p>
                <p className="text-xs text-muted-foreground mt-1">{app.description as string}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAction(app.id as string, 'rejected')}
                  disabled={processingIds.has(app.id as string)}
                  className="px-3 py-1 text-xs font-medium rounded-md bg-[var(--bg-element)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processingIds.has(app.id as string) ? 'Processing...' : 'Dismiss'}
                </button>
                <button
                  onClick={() => handleAction(app.id as string, 'approved')}
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
    </WidgetCard>
  );
}
