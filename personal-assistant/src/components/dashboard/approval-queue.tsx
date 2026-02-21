'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { ApprovalCard, type ApprovalItem } from './approval-card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

type FilterKey = 'all' | 'urgent' | 'normal';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'urgent', label: 'Urgent' },
  { key: 'normal', label: 'Normal' },
];

interface ApprovalsResponse {
  approvals?: ApprovalItem[];
  error?: string;
}

export function ApprovalQueue() {
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const fetchApprovals = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }

    try {
      const response = await fetch('/api/agent/approvals', {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = (await response.json()) as ApprovalsResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to load pending approvals');
      }

      setApprovals(payload.approvals ?? []);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load pending approvals';
      setError(message);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchApprovals();

    const refreshTimer = window.setInterval(() => {
      fetchApprovals(true);
    }, 30_000);

    return () => {
      window.clearInterval(refreshTimer);
    };
  }, [fetchApprovals]);

  const visibleApprovals = useMemo(() => {
    if (activeFilter === 'all') {
      return approvals;
    }
    return approvals.filter((approval) => approval.priority === activeFilter);
  }, [activeFilter, approvals]);

  const resolveApproval = useCallback(
    async (approvalId: string, decision: 'approved' | 'rejected') => {
      const target = approvals.find((approval) => approval.id === approvalId);
      if (!target) {
        return;
      }

      setResolvingId(approvalId);
      setError(null);
      setApprovals((prev) => prev.filter((approval) => approval.id !== approvalId));

      try {
        const response = await fetch('/api/agent/approvals', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approvalId, decision }),
        });

        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error ?? `Failed to ${decision === 'approved' ? 'approve' : 'reject'} action`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to resolve approval';
        setError(message);
        setApprovals((prev) => [target, ...prev]);
      } finally {
        setResolvingId(null);
      }
    },
    [approvals],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Pending Actions</h2>
          <Badge variant="secondary">{approvals.length}</Badge>
        </div>

        <div className="flex items-center gap-2">
          {FILTERS.map((filter) => (
            <Button
              key={filter.key}
              size="sm"
              variant={activeFilter === filter.key ? 'default' : 'outline'}
              onClick={() => setActiveFilter(filter.key)}
            >
              {filter.label}
            </Button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <div className="space-y-2">
              <p>{error}</p>
              <Button size="sm" variant="outline" onClick={() => fetchApprovals()}>
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading pending approvals...</p>
      ) : null}

      {!loading && visibleApprovals.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No pending approvals</p>
        </div>
      ) : null}

      <div className="space-y-3">
        {visibleApprovals.map((approval) => (
          <ApprovalCard
            key={approval.id}
            approval={approval}
            isResolving={resolvingId === approval.id}
            onApprove={(approvalId) => resolveApproval(approvalId, 'approved')}
            onReject={(approvalId) => resolveApproval(approvalId, 'rejected')}
          />
        ))}
      </div>
    </div>
  );
}
