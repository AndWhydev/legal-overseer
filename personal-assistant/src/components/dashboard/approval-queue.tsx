'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SFExclamationmarkCircle, SFCheckmarkCircle, SFArrowClockwise } from 'sf-symbols-lib';
import { ApprovalCard, type ApprovalItem } from './approval-card';
import { AlertBanner } from '../ui/alert-banner';
import { EmptyState } from '../ui/empty-state';

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
  const [hoveredFilter, setHoveredFilter] = useState<FilterKey | null>(null);

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

  const pageTitle: React.CSSProperties = {
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--text-primary)',
    letterSpacing: '-0.02em',
  };

  const countBadge: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '3px 10px',
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.02em',
    background: 'var(--glass-hover-bg)',
    color: 'var(--text-secondary)',
  };

  const pillBtn: React.CSSProperties = {
    padding: '6px 14px',
    borderRadius: 20,
    background: 'var(--glass-pill-bg)',
    backdropFilter: 'var(--glass-card-blur)',
    WebkitBackdropFilter: 'var(--glass-card-blur)',
    boxShadow: 'var(--glass-pill-inset)',
    border: 'none',
    fontSize: 12,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all 200ms',
  };

  const pillBtnActive: React.CSSProperties = {
    ...pillBtn,
    color: 'var(--text-primary)',
    background: 'rgba(255, 90, 31, 0.15)',
    border: '1px solid var(--status-orange-border)',
  };

  const emptyState: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
    gap: 12,
    borderRadius: 16,
    background: 'var(--glass-card-bg)',
    backdropFilter: 'var(--glass-card-blur)',
    WebkitBackdropFilter: 'var(--glass-card-blur)',
    border: '1px solid var(--glass-card-border)',
    boxShadow: 'var(--glass-card-inset)',
  };

  const emptyStateIcon: React.CSSProperties = {
    color: 'var(--text-dim)',
  };

  const emptyStateText: React.CSSProperties = {
    fontSize: 14,
    color: 'var(--text-secondary)',
  };

  const loadingText: React.CSSProperties = {
    fontSize: 13,
    color: 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  };

  const headerContainer: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  };

  const titleContainer: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  };

  const filtersContainer: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  };

  const contentContainer: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  };

  return (
    <div style={contentContainer}>
      <div style={headerContainer}>
        <div style={titleContainer}>
          <h2 style={pageTitle}>Pending Actions</h2>
          <span style={countBadge}>{approvals.length}</span>
        </div>

        <div style={filtersContainer}>
          {FILTERS.map((filter) => (
            <button
              key={filter.key}
              style={activeFilter === filter.key ? pillBtnActive : pillBtn}
              onMouseEnter={() => setHoveredFilter(filter.key)}
              onMouseLeave={() => setHoveredFilter(null)}
              onClick={() => setActiveFilter(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <AlertBanner variant="error">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p>{error}</p>
            <button
              style={{
                padding: '8px 16px',
                borderRadius: 10,
                background: 'transparent',
                border: '1px solid var(--glass-hover-bg)',
                color: 'var(--text-primary)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 200ms',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                width: 'fit-content',
              }}
              onClick={() => fetchApprovals()}
            >
              <SFArrowClockwise size={16} />
              Retry
            </button>
          </div>
        </AlertBanner>
      ) : null}

      {loading ? (
        <div style={loadingText}>
          <SFArrowClockwise size={16} style={{ animation: 'spin 1s linear infinite' }} />
          Loading pending approvals...
        </div>
      ) : null}

      {!loading && visibleApprovals.length === 0 ? (
        <EmptyState
          icon={<SFCheckmarkCircle size={48} />}
          title="No approvals pending"
          description="When agents need your sign-off, requests will appear here"
        />
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
