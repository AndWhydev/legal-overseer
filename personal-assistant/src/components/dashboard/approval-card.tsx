'use client';

import { Loader2 } from 'lucide-react';
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
  if (confidence < 0.55) return '#ef4444'; // error red
  if (confidence <= 0.85) return '#eab308'; // warning yellow
  return '#22c55e'; // success green
}

function getPriorityColor(priority: ApprovalItem['priority']): string {
  if (priority === 'urgent') return '#ef4444'; // error red
  if (priority === 'normal') return '#eab308'; // warning yellow
  return '#94A3B8'; // neutral
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
    background: hovered ? 'rgba(20, 28, 40, 0.7)' : 'rgba(15, 20, 30, 0.6)',
    backdropFilter: 'blur(20px) saturate(1.2)',
    WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
    border: '1px solid rgba(255, 255, 255, 0.03)',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
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
    background: 'rgba(255, 255, 255, 0.06)',
    color: 'var(--text-secondary, #94A3B8)',
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
    color: 'var(--text-primary, #F1F5F9)',
    lineHeight: 1.4,
    margin: 0,
  };

  const subtitle: React.CSSProperties = {
    fontSize: 13,
    color: 'var(--text-secondary, #94A3B8)',
    margin: '4px 0 0 0',
  };

  const contextSection: React.CSSProperties = {
    marginTop: 16,
    paddingTop: 16,
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
  };

  const sectionLabel: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-dim, #475569)',
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
    color: 'var(--text-secondary, #94A3B8)',
  };

  const definitionData: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text-primary, #F1F5F9)',
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
    background: '#FF5A1F',
    border: 'none',
    color: '#000',
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
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#ef4444',
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
          {isResolving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : null}
          Approve
        </button>
        <button
          style={rejectBtn}
          disabled={isResolving}
          onClick={() => onReject(approval.id)}
        >
          {isResolving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : null}
          Reject
        </button>
      </div>
    </div>
  );
}
