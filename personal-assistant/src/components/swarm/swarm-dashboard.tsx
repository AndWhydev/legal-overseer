'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { IconBolt } from '@tabler/icons-react';
import { SwarmRunCard } from './swarm-run-card';
import { SwarmRunDetail } from './swarm-run-detail';
import { SwarmTriggerInput } from './swarm-trigger-input';
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import type { SwarmRunRow } from '@/lib/swarm/types';

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
    <div className="flex flex-col gap-6 p-6 h-full overflow-auto">
      {/* Header */}
      <div>
        <h2 className="text-base font-medium text-foreground tracking-tight">
          Agent Swarms
        </h2>
        <p className="text-base text-muted-foreground mt-0.5">
          Coordinate multi-agent teams for complex operations
        </p>
      </div>

      {/* Trigger Input */}
      <SwarmTriggerInput onTrigger={handleTrigger} />

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {FILTER_OPTIONS.map(opt => (
          <Button
            key={opt.id}
            variant={filter === opt.id ? 'secondary' : 'ghost'}
            size="sm"
            className={`rounded-full ${filter !== opt.id ? 'text-muted-foreground' : ''}`}
            onClick={() => setFilter(opt.id)}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {/* Runs List */}
      <div className="flex flex-col gap-3">
        {loading ? (
          <div className="text-center py-16 text-muted-foreground text-base">
            Loading swarms...
          </div>
        ) : runs.length === 0 ? (
          <Empty>
            <EmptyMedia><IconBolt size={24} /></EmptyMedia>
            <EmptyTitle>No swarm activity</EmptyTitle>
            <EmptyDescription>Lead Swarm automatically qualifies and routes incoming leads. Activity appears here as leads come in.</EmptyDescription>
            <EmptyContent>
              <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: 'settings-connections' } }))} className="mt-2 rounded-lg bg-primary px-4 py-2 text-base font-medium text-primary-foreground hover:opacity-90 transition-opacity">Connect email</button>
            </EmptyContent>
          </Empty>
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
