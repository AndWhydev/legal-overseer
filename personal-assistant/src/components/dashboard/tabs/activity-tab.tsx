'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { TabSkeleton } from './tab-skeleton';

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

const ACTION_COLORS: Record<string, string> = {
  created: '#22c55e',
  approved: '#3b82f6',
  rejected: '#ef4444',
  deleted: '#ef4444',
  sent: '#8b5cf6',
  executed: '#f59e0b',
  escalated: '#f97316',
  updated: '#6b7280',
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
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary, #999)', fontWeight: 500 }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          fontSize: 13,
          padding: '4px 8px',
          borderRadius: 6,
          border: '1px solid var(--border, #333)',
          background: 'var(--bg-elevated, #1a1a2e)',
          color: 'var(--text-primary, #eee)',
          cursor: 'pointer',
        }}
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
  const color = ACTION_COLORS[entry.action] ?? '#6b7280';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '10px 0',
        borderBottom: '1px solid var(--border, #222)',
      }}
    >
      {/* Dot */}
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: color,
          marginTop: 6,
          flexShrink: 0,
        }}
      />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: 'var(--text-primary, #eee)' }}>
          {formatAction(entry)}
        </div>
        {entry.metadata && Object.keys(entry.metadata).length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary, #888)', marginTop: 2 }}>
            {Object.entries(entry.metadata)
              .slice(0, 3)
              .map(([k, v]) => `${k}: ${String(v)}`)
              .join(' | ')}
          </div>
        )}
      </div>

      {/* Timestamp */}
      <div style={{ fontSize: 12, color: 'var(--text-secondary, #888)', whiteSpace: 'nowrap', flexShrink: 0 }}>
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
      .catch(() => {
        if (mounted) setEntries([]);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary, #eee)', margin: 0 }}>
          Activity Timeline
        </h1>
        <span style={{ fontSize: 13, color: 'var(--text-secondary, #888)' }}>
          {total} total events
        </span>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <FilterPill label="Entity" options={ENTITY_TYPES} value={entityType} onChange={setEntityType} />
        <FilterPill label="Actor" options={ACTOR_TYPES} value={actorType} onChange={setActorType} />
        <FilterPill label="Action" options={ACTION_TYPES} value={actionType} onChange={setActionType} />
      </div>

      {/* Timeline */}
      <div>
        {entries.map((entry) => (
          <AuditRow key={entry.id} entry={entry} />
        ))}

        {entries.length === 0 && (
          <p style={{ textAlign: 'center', padding: '48px 0', fontSize: 14, color: 'var(--text-secondary, #888)' }}>
            No audit events found. Agent actions will appear here.
          </p>
        )}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} style={{ height: 1 }} />

        {loadingMore && (
          <div style={{ textAlign: 'center', padding: 16, fontSize: 13, color: 'var(--text-secondary, #888)' }}>
            Loading more...
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(ActivityTab);
