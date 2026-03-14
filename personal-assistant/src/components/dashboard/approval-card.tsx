'use client';

import { SFArrowClockwise } from 'sf-symbols-lib';
import { useState } from 'react';

export interface ApprovalItem {
  id: string;
  action_summary: string;
  action_type: string;
  confidence_score: number;
  routing_decision: 'ask' | 'escalate';
  priority: 'urgent' | 'normal' | 'low';
  created_at: string;
  context_snapshot: Record<string, unknown>;
  agent_name?: string | null;
}

interface ApprovalCardProps {
  approval: ApprovalItem;
  isResolving?: boolean;
  onApprove: (approvalId: string) => void;
  onReject: (approvalId: string) => void;
}

const relTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function formatRelativeTime(timestamp: string): string {
  const createdAt = new Date(timestamp).getTime();
  const deltaSec = Math.round((createdAt - Date.now()) / 1000);
  const absSec = Math.abs(deltaSec);

  if (absSec < 60) return relTime.format(deltaSec, 'second');

  const deltaMin = Math.round(deltaSec / 60);
  if (Math.abs(deltaMin) < 60) return relTime.format(deltaMin, 'minute');

  const deltaHour = Math.round(deltaMin / 60);
  if (Math.abs(deltaHour) < 24) return relTime.format(deltaHour, 'hour');

  const deltaDay = Math.round(deltaHour / 24);
  return relTime.format(deltaDay, 'day');
}

function getConfidenceColor(confidence: number): string {
  if (confidence < 0.55) return 'var(--bb-red)'; // error red
  if (confidence <= 0.85) return 'var(--bb-amber)'; // warning yellow
  return 'var(--bb-green)'; // success green
}

function getPriorityColor(priority: ApprovalItem['priority']): string {
  if (priority === 'urgent') return 'var(--bb-red)'; // error red
  if (priority === 'normal') return 'var(--bb-amber)'; // warning yellow
  return 'var(--text-secondary)'; // neutral
}

function toPrettyLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function extractContext(approval: ApprovalItem): Array<{ label: string; value: string }> {
  const snapshot = approval.context_snapshot ?? {};

  const candidates: Array<[string, unknown]> = [
    ['Contact', snapshot.contact_name ?? snapshot.contactName],
    ['Project', snapshot.project_name ?? snapshot.projectName ?? snapshot.project],
    ['Amount', snapshot.amount_formatted ?? snapshot.amount],
    ['Invoice', snapshot.invoice_number ?? snapshot.invoiceNumber],
  ];

  return candidates
    .filter(([, value]) => value !== undefined && value !== null && `${value}`.trim().length > 0)
    .map(([label, value]) => ({ label, value: String(value) }));
}

export function ApprovalCard({ approval, isResolving = false, onApprove, onReject }: ApprovalCardProps) {
  const [hovered, setHovered] = useState(false);
  const contextRows = extractContext(approval);
  const confidencePct = Math.round(approval.confidence_score * 100);
  const confidenceColor = getConfidenceColor(approval.confidence_score);
  const priorityColor = getPriorityColor(approval.priority);

  const glassCard: React.CSSProperties = {
    padding: '20px',
    borderRadius: 16,
    background: hovered ? 'var(--bb-surface-hover)' : 'var(--glass-card-bg)',
    backdropFilter: 'var(--glass-card-blur)',
    WebkitBackdropFilter: 'var(--glass-card-blur)',
    border: '1px solid var(--glass-card-border)',
    boxShadow: 'var(--glass-card-inset)',
    transition: 'all 200ms',
  };

  const badge: React.CSSProperties = {
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

  const coloredBadge = (color: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    padding: '3px 10px',
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.02em',
    background: `${color}15`,
    color: color,
  });

  const badgesContainer: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  };

  const titleContainer: React.CSSProperties = {
    marginBottom: 4,
  };

  const cardTitle: React.CSSProperties = {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--text-primary)',
    lineHeight: 1.4,
    margin: 0,
  };

  const subtitle: React.CSSProperties = {
    fontSize: 13,
    color: 'var(--text-secondary)',
    margin: '4px 0 0 0',
  };

  const contextSection: React.CSSProperties = {
    marginTop: 16,
    paddingTop: 16,
    borderTop: '1px solid var(--glass-divider)',
  };

  const sectionLabel: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-dim)',
    marginBottom: 8,
    display: 'block',
  };

  const definitionList: React.CSSProperties = {
    display: 'grid',
    gap: 8,
  };

  const definitionRow: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  };

  const definitionTerm: React.CSSProperties = {
    fontSize: 13,
    color: 'var(--text-secondary)',
  };

  const definitionData: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text-primary)',
    textAlign: 'right' as const,
  };

  const buttonContainer: React.CSSProperties = {
    display: 'flex',
    gap: 8,
    marginTop: 16,
  };

  const approveBtn: React.CSSProperties = {
    flex: 1,
    padding: '8px 16px',
    borderRadius: 10,
    background: '#1A1A1B',
    border: 'none',
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 600,
    cursor: isResolving ? 'not-allowed' : 'pointer',
    transition: 'all 200ms',
    opacity: isResolving ? 0.6 : 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  };

  const rejectBtn: React.CSSProperties = {
    flex: 1,
    padding: '8px 16px',
    borderRadius: 10,
    background: 'transparent',
    border: '1px solid var(--status-error-border)',
    color: 'var(--bb-red)',
    fontSize: 13,
    fontWeight: 600,
    cursor: isResolving ? 'not-allowed' : 'pointer',
    transition: 'all 200ms',
    opacity: isResolving ? 0.6 : 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  };

  return (
    <div
      style={glassCard}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={badgesContainer}>
        <span style={badge}>{approval.agent_name ?? 'Agent'}</span>
        <span style={coloredBadge(confidenceColor)}>{confidencePct}% confidence</span>
        <span style={coloredBadge(priorityColor)}>{toPrettyLabel(approval.priority)}</span>
        <span style={badge}>{toPrettyLabel(approval.routing_decision)}</span>
      </div>

      <div style={titleContainer}>
        <p style={cardTitle}>{approval.action_summary}</p>
        <p style={subtitle}>
          {toPrettyLabel(approval.action_type)} · {formatRelativeTime(approval.created_at)}
        </p>
      </div>

      {contextRows.length > 0 ? (
        <div style={contextSection}>
          <label style={sectionLabel}>Context</label>
          <dl style={definitionList}>
            {contextRows.map((row) => (
              <div key={row.label} style={definitionRow}>
                <dt style={definitionTerm}>{row.label}</dt>
                <dd style={definitionData}>{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      <div style={buttonContainer}>
        <button
          style={approveBtn}
          disabled={isResolving}
          onClick={() => onApprove(approval.id)}
        >
          {isResolving ? <SFArrowClockwise size={16} style={{ animation: 'spin 1s linear infinite' }} /> : null}
          Approve
        </button>
        <button
          style={rejectBtn}
          disabled={isResolving}
          onClick={() => onReject(approval.id)}
        >
          {isResolving ? <SFArrowClockwise size={16} style={{ animation: 'spin 1s linear infinite' }} /> : null}
          Reject
        </button>
      </div>
    </div>
  );
}
