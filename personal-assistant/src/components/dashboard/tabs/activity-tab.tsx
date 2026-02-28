'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { TabSkeleton } from './tab-skeleton';
import { TabShell } from '@/components/ui/tab-shell';

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

// Map actions to data attribute values
const ACTION_DATA_MAP: Record<string, string> = {
  created: 'create',
  approved: 'update',
  rejected: 'delete',
  deleted: 'delete',
  sent: 'update',
  executed: 'update',
  escalated: 'update',
  updated: 'update',
};

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

function FilterPill({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const id = `activity-filter-${label.toLowerCase()}`;
  return (
    <div className="bb-activity-filter">
      <label htmlFor={id} className="bb-activity-filter__label">{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bb-activity-filter__select"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o === 'all' ? 'All' : o.charAt(0).toUpperCase() + o.slice(1)}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entry row
// ---------------------------------------------------------------------------

function AuditRow({ entry }: { entry: AuditEntry }) {
  const actionType = ACTION_DATA_MAP[entry.action] ?? 'update';

  return (
    <div className="bb-activity-row" data-action={actionType}>
      {/* Dot */}
      <div className="bb-activity-row__dot" data-action={actionType} />

      {/* Content */}
      <div className="bb-activity-row__content">
        <div className="bb-activity-row__action">
          {formatAction(entry)}
        </div>
        {entry.metadata && Object.keys(entry.metadata).length > 0 && (
          <div className="bb-activity-row__metadata">
            {Object.entries(entry.metadata)
              .slice(0, 3)
              .map(([k, v]) => `${k}: ${String(v)}`)
              .join(' | ')}
          </div>
        )}
      </div>

      {/* Timestamp */}
      <div className="bb-activity-row__timestamp">
        {formatTimestamp(entry.created_at)}
      </div>
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

  // Filters
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

  // Initial + filter-change fetch
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    offsetRef.current = 0;

    fetch(buildUrl(0))
      .then((r) => r.json())
      .then((data) => {
        if (!mounted) return;
        const fetched = (data.entries ?? []) as AuditEntry[];
        // Client-side action filter (server doesn't support action filter directly)
        const filtered = actionType !== 'all' ? fetched.filter((e) => e.action === actionType) : fetched;
        setEntries(filtered);
        setTotal(data.total ?? 0);
        setHasMore(fetched.length >= PAGE_SIZE);
        offsetRef.current = fetched.length;
      })
      .catch((err) => {
        console.error('[activity-tab] fetch error:', err);
        if (mounted) {
          setEntries([]);
          setError('Failed to load activity log');
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [buildUrl, actionType]);

  // Load more
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

  // Infinite scroll observer
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

  if (loading) return <TabSkeleton />;

  if (error && entries.length === 0) {
    return (
      <TabShell>
        <div className="bb-tab-error">
          <p className="bb-tab-error__text">{error}</p>
          <button className="bb-btn bb-btn--ghost bb-btn--sm" onClick={() => { setError(null); setLoading(true); }}>
            Retry
          </button>
        </div>
      </TabShell>
    );
  }

  return (
    <TabShell>
      <div className="bb-activity-main">
        <div className="bb-activity-header">
          <span className="bb-activity-header__text">
            {total} total events
          </span>
        </div>

        {/* Filters */}
        <div className="bb-activity-filters">
          <FilterPill label="Entity" options={ENTITY_TYPES} value={entityType} onChange={setEntityType} />
          <FilterPill label="Actor" options={ACTOR_TYPES} value={actorType} onChange={setActorType} />
          <FilterPill label="Action" options={ACTION_TYPES} value={actionType} onChange={setActionType} />
        </div>

        {/* Timeline */}
        <div className="bb-activity-timeline">
          {entries.map((entry) => (
            <AuditRow key={entry.id} entry={entry} />
          ))}

          {entries.length === 0 && (
            <p className="bb-activity-empty">
              No audit events found. Agent actions will appear here.
            </p>
          )}

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="bb-activity-sentinel" />

          {loadingMore && (
            <div className="bb-activity-loading">
              Loading more...
            </div>
          )}
        </div>
      </div>
    </TabShell>
  );
}

export default React.memo(ActivityTab);
