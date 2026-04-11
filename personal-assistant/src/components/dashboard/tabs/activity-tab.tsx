'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { IconLoader2, IconAlertCircle } from '@tabler/icons-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TabSkeleton } from './tab-skeleton';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { logger } from '@/lib/core/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditEntry {
  id: string;
  org_id: string;
  actor_type: string;
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENTITY_TYPES = ['all', 'invoice', 'lead', 'approval', 'contact', 'task', 'message', 'proposal', 'tender', 'watch'] as const;
const ACTOR_TYPES = ['all', 'user', 'agent', 'system', 'cron'] as const;
const ACTION_TYPES = ['all', 'created', 'updated', 'deleted', 'approved', 'rejected', 'sent', 'escalated', 'executed'] as const;

const PAGE_SIZE = 30;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAction(entry: AuditEntry): string {
  const actor = entry.actor_type === 'cron'
    ? entry.actor_id
    : entry.actor_type === 'agent'
      ? `Agent ${entry.actor_id}`
      : entry.actor_id;

  return `${actor} ${entry.action} ${entry.entity_type} ${entry.entity_id.slice(0, 8)}`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const ACTION_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  created: 'default',
  approved: 'default',
  updated: 'secondary',
  sent: 'secondary',
  executed: 'secondary',
  escalated: 'outline',
  rejected: 'destructive',
  deleted: 'destructive',
};

// ---------------------------------------------------------------------------
// Filter option mappings
// ---------------------------------------------------------------------------

const entityTypeOptions = ENTITY_TYPES.map((v) => ({ value: v, label: v === 'all' ? 'All Entities' : v.charAt(0).toUpperCase() + v.slice(1) }));
const actorTypeOptions = ACTOR_TYPES.map((v) => ({ value: v, label: v === 'all' ? 'All Actors' : v.charAt(0).toUpperCase() + v.slice(1) }));
const actionTypeOptions = ACTION_TYPES.map((v) => ({ value: v, label: v === 'all' ? 'All Actions' : v.charAt(0).toUpperCase() + v.slice(1) }));

// ---------------------------------------------------------------------------
// Entry row
// ---------------------------------------------------------------------------

function AuditRow({ entry }: { entry: AuditEntry }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted">
      <Badge variant={ACTION_BADGE_VARIANT[entry.action] ?? 'secondary'} className="mt-0.5 shrink-0">
        {entry.action}
      </Badge>
      <div className="min-w-0 flex-1">
        <div className="text-base">{formatAction(entry)}</div>
        {entry.metadata && Object.keys(entry.metadata).length > 0 && (
          <div className="mt-1 truncate text-base text-muted-foreground">
            {Object.entries(entry.metadata)
              .slice(0, 3)
              .map(([k, v]) => `${k}: ${String(v)}`)
              .join(' | ')}
          </div>
        )}
      </div>
      <span className="shrink-0 text-base text-muted-foreground">{formatTimestamp(entry.created_at)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function ActivityTab() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);

  const [entityType, setEntityType] = useState('all');
  const [actorType, setActorType] = useState('all');
  const [actionType, setActionType] = useState('all');

  const offsetRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const buildUrl = useCallback(
    (offset: number) => {
      const params = new URLSearchParams();
      if (entityType !== 'all') params.set('entity_type', entityType);
      if (actorType !== 'all') params.set('actor_type', actorType);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(offset));
      return `/api/audit?${params.toString()}`;
    },
    [entityType, actorType],
  );

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    offsetRef.current = 0;

    fetch(buildUrl(0))
      .then((r) => r.json())
      .then((data) => {
        if (!mounted) return;
        const fetched = (data.entries ?? []) as AuditEntry[];
        const filtered = actionType !== 'all' ? fetched.filter((e) => e.action === actionType) : fetched;
        setEntries(filtered);
        setTotal(data.total ?? 0);
        setHasMore(fetched.length >= PAGE_SIZE);
        offsetRef.current = fetched.length;
      })
      .catch((err) => {
        logger.error('[activity-tab] fetch error:', err);
        if (mounted) {
          setEntries([]);
          setError('Failed to load activity log');
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => { mounted = false; };
  }, [buildUrl, actionType]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);

    fetch(buildUrl(offsetRef.current))
      .then((r) => r.json())
      .then((data) => {
        const fetched = (data.entries ?? []) as AuditEntry[];
        const filtered = actionType !== 'all' ? fetched.filter((e) => e.action === actionType) : fetched;
        setEntries((prev) => [...prev, ...filtered]);
        setHasMore(fetched.length >= PAGE_SIZE);
        offsetRef.current += fetched.length;
      })
      .catch(() => { /* noop */ })
      .finally(() => setLoadingMore(false));
  }, [buildUrl, actionType, loadingMore, hasMore]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore();
      },
      { rootMargin: '200px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  if (loading) {
    return <TabSkeleton variant="timeline" />;
  }

  if (error && entries.length === 0) {
    return (
      <Empty className="p-12">
        <EmptyMedia variant="icon"><IconAlertCircle size={20} /></EmptyMedia>
        <EmptyTitle>Something went wrong</EmptyTitle>
        <EmptyDescription>{error}</EmptyDescription>
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={() => { setError(null); setLoading(true); }}>Retry</Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <span className="text-base text-muted-foreground">{total} total events</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={entityType} onValueChange={setEntityType}>
          <SelectTrigger><SelectValue placeholder="Entity" /></SelectTrigger>
          <SelectContent>
            {entityTypeOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={actorType} onValueChange={setActorType}>
          <SelectTrigger><SelectValue placeholder="Actor" /></SelectTrigger>
          <SelectContent>
            {actorTypeOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={actionType} onValueChange={setActionType}>
          <SelectTrigger><SelectValue placeholder="Action" /></SelectTrigger>
          <SelectContent>
            {actionTypeOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Timeline */}
      <div className="flex flex-col gap-2">
        {entries.map((entry) => (
          <AuditRow key={entry.id} entry={entry} />
        ))}

        {entries.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No activity yet</EmptyTitle>
              <EmptyDescription>Activity will appear here as things get moving</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-1" />

        {loadingMore && (
          <div className="flex items-center justify-center gap-2 py-4 text-base text-muted-foreground">
            <IconLoader2 className="size-4 animate-spin" />
            Loading more...
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(ActivityTab);
