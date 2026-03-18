'use client';

import React, { useMemo } from 'react';
import type { SwarmRunRow } from '@/lib/swarm/types';

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = {
  card: {
    background: 'rgba(15, 20, 30, 0.35)',
    backdropFilter: 'blur(20px)',
    borderRadius: '12px',
    padding: '16px 20px',
    border: '1px solid rgba(255, 255, 255, 0.04)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  cardHover: {
    background: 'rgba(20, 28, 40, 0.5)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  templateName: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.9)',
    letterSpacing: '-0.01em',
  },
  statusBadge: (status: string) => {
    const colors: Record<string, { bg: string; text: string }> = {
      pending: { bg: 'rgba(255, 255, 255, 0.06)', text: 'rgba(255, 255, 255, 0.4)' },
      planning: { bg: 'rgba(59, 130, 246, 0.1)', text: '#3B82F6' },
      executing: { bg: 'rgba(255, 90, 31, 0.1)', text: '#FF7A45' },
      negotiating: { bg: 'rgba(139, 92, 246, 0.1)', text: '#8B5CF6' },
      completed: { bg: 'rgba(34, 197, 94, 0.1)', text: '#22C55E' },
      partial: { bg: 'rgba(245, 158, 11, 0.1)', text: '#F59E0B' },
      failed: { bg: 'rgba(239, 68, 68, 0.1)', text: '#EF4444' },
      rolled_back: { bg: 'rgba(255, 255, 255, 0.06)', text: 'rgba(255, 255, 255, 0.4)' },
      cancelled: { bg: 'rgba(255, 255, 255, 0.06)', text: 'rgba(255, 255, 255, 0.3)' },
    };
    const c = colors[status] || colors.pending;
    return {
      padding: '2px 8px',
      borderRadius: '9999px',
      fontSize: '11px',
      fontWeight: 500,
      background: c.bg,
      color: c.text,
    };
  },
  triggerText: {
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.5)',
    lineHeight: 1.5,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
  bottomRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginTop: '10px',
  },
  meta: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.3)',
  },
  costBadge: {
    fontSize: '11px',
    color: 'rgba(255, 90, 31, 0.7)',
    fontFamily: 'var(--font-mono, monospace)',
  },
  executingDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#FF7A45',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
};

// ── Component ───────────────────────────────────────────────────────────────

interface SwarmRunCardProps {
  run: SwarmRunRow;
  onClick: () => void;
}

export function SwarmRunCard({ run, onClick }: SwarmRunCardProps) {
  const [hovered, setHovered] = React.useState(false);

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
    <div
      style={{
        ...styles.card,
        ...(hovered ? styles.cardHover : {}),
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={styles.topRow}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isActive && <div style={styles.executingDot} />}
          <span style={styles.templateName}>
            {run.template_slug
              ? run.template_slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
              : 'Custom Swarm'}
          </span>
        </div>
        <span style={styles.statusBadge(run.status)}>
          {run.status.replace('_', ' ')}
        </span>
      </div>

      <div style={styles.triggerText}>
        {run.trigger_input}
      </div>

      <div style={styles.bottomRow}>
        <span style={styles.meta}>{timeAgo}</span>
        {durationLabel && <span style={styles.meta}>{durationLabel}</span>}
        {run.total_cost > 0 && (
          <span style={styles.costBadge}>${run.total_cost.toFixed(4)}</span>
        )}
        {run.result_summary && (
          <span style={styles.meta}>
            {run.result_summary.slice(0, 60)}
            {run.result_summary.length > 60 ? '...' : ''}
          </span>
        )}
      </div>
    </div>
  );
}
