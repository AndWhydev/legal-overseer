'use client';

import React, { useMemo } from 'react';
import type { SwarmRunRow } from '@/lib/swarm/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// ── Component ───────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline',
  planning: 'secondary',
  executing: 'default',
  negotiating: 'secondary',
  completed: 'secondary',
  partial: 'outline',
  failed: 'destructive',
  rolled_back: 'outline',
  cancelled: 'outline',
};

interface SwarmRunCardProps {
  run: SwarmRunRow;
  onClick: () => void;
}

export function SwarmRunCard({ run, onClick }: SwarmRunCardProps) {
  const isActive = ['pending', 'planning', 'executing', 'negotiating'].includes(run.status);

  const timeAgo = useMemo(() => {
    const diff = Date.now() - new Date(run.created_at).getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }, [run.created_at]);

  const durationLabel = useMemo(() => {
    if (!run.duration_ms) return null;
    if (run.duration_ms < 1000) return `${run.duration_ms}ms`;
    if (run.duration_ms < 60000) return `${(run.duration_ms / 1000).toFixed(1)}s`;
    return `${(run.duration_ms / 60000).toFixed(1)}m`;
  }, [run.duration_ms]);

  return (
    <Card
      className="cursor-pointer hover:bg-muted/50 transition-colors py-4"
      onClick={onClick}
    >
      <CardContent className="py-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {isActive && (
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            )}
            <span className="text-sm font-medium text-foreground">
              {run.template_slug
                ? run.template_slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
                : 'Custom Swarm'}
            </span>
          </div>
          <Badge variant={STATUS_VARIANT[run.status] ?? 'outline'}>
            {run.status.replace('_', ' ')}
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground truncate">
          {run.trigger_input}
        </p>

        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <span>{timeAgo}</span>
          {durationLabel && <span>{durationLabel}</span>}
          {run.total_cost > 0 && (
            <span className="font-mono">${run.total_cost.toFixed(4)}</span>
          )}
          {run.result_summary && (
            <span className="truncate">
              {run.result_summary.slice(0, 60)}
              {run.result_summary.length > 60 ? '...' : ''}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
