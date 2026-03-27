'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { SwarmRunCard } from './swarm-run-card';
import { SwarmRunDetail } from './swarm-run-detail';
import { SwarmTriggerInput } from './swarm-trigger-input';
import { S, C } from '@/lib/styles/design-tokens';
import type { SwarmRunRow } from '@/lib/swarm/types';

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
    padding: '24px',
    height: '100%',
    overflow: 'auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
  },
  title: {
    fontSize: '16px',
    fontWeight: 500,
    color: C.textPrimary,
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: '14px',
    color: C.textSecondary,
    marginTop: '2px',
  },
  filterRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
  },
  filterButton: (active: boolean) => ({
    padding: '8px 16px',
    borderRadius: '9999px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    border: 'none',
    transition: 'all 0.15s ease',
    background: active ? 'var(--hover-bg-strong)' : 'var(--hover-bg)',
    color: active ? C.textPrimary : C.textPlaceholder,
  }),
  runsList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 24px',
    gap: '12px',
  },
  emptyIcon: {
    fontSize: '16px',
    opacity: 0.4,
  },
  emptyText: {
    fontSize: '14px',
    color: C.textSecondary,
    textAlign: 'center' as const,
  },
  emptyHint: {
    fontSize: '14px',
    color: C.textMuted,
    textAlign: 'center' as const,
    maxWidth: '400px',
  },
};

// ── Filters ─────────────────────────────────────────────────────────────────

type FilterStatus = 'all' | 'active' | 'completed' | 'failed';

const FILTER_OPTIONS: { id: FilterStatus; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed' },
  { id: 'failed', label: 'Failed' },
];

const STATUS_MAP: Record<FilterStatus, string[] | undefined> = {
  all: undefined,
  active: ['pending', 'planning', 'executing', 'negotiating'],
  completed: ['completed', 'partial'],
  failed: ['failed', 'rolled_back', 'cancelled'],
};

// ── Component ───────────────────────────────────────────────────────────────

export function SwarmDashboard() {
  const [runs, setRuns] = useState<SwarmRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const fetchRuns = useCallback(async () => {
    try {
      const statuses = STATUS_MAP[filter];
      const statusParam = statuses ? `?status=${statuses.join(',')}` : '';
      const res = await fetch(`/api/swarm/runs${statusParam}`);
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs || []);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchRuns();
    // Poll every 10s for active swarms
    const interval = setInterval(fetchRuns, 10000);
    return () => clearInterval(interval);
  }, [fetchRuns]);

  const handleTrigger = useCallback(async (input: string, templateSlug?: string) => {
    try {
      const res = await fetch('/api/swarm/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, templateSlug }),
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedRunId(data.runId);
        fetchRuns();
      }
    } catch {
      // Error handled by UI
    }
  }, [fetchRuns]);

  const handleRollback = useCallback(async (runId: string) => {
    try {
      await fetch(`/api/swarm/runs/${runId}/rollback`, { method: 'POST' });
      fetchRuns();
    } catch {
      // Error handled by UI
    }
  }, [fetchRuns]);

  if (selectedRunId) {
    return (
      <SwarmRunDetail
        runId={selectedRunId}
        onBack={() => setSelectedRunId(null)}
        onRollback={() => handleRollback(selectedRunId)}
      />
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Agent Swarms</div>
          <div style={styles.subtitle}>
            Coordinate multi-agent teams for complex operations
          </div>
        </div>
      </div>

      {/* Trigger Input */}
      <SwarmTriggerInput onTrigger={handleTrigger} />

      {/* Filters */}
      <div style={styles.filterRow}>
        {FILTER_OPTIONS.map(opt => (
          <button
            key={opt.id}
            style={styles.filterButton(filter === opt.id)}
            onClick={() => setFilter(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Runs List */}
      <div style={styles.runsList}>
        {loading ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyText}>Loading swarms...</div>
          </div>
        ) : runs.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>&#x1F9E0;</div>
            <div style={styles.emptyText}>No swarm operations yet</div>
            <div style={styles.emptyHint}>
              Try &quot;Prepare pitch for Thomson&quot; or &quot;Onboard Acme Corp&quot; to see
              coordinated multi-agent teams in action.
            </div>
          </div>
        ) : (
          runs.map(run => (
            <SwarmRunCard
              key={run.id}
              run={run}
              onClick={() => setSelectedRunId(run.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
