'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { SwarmRunRow, SwarmStepRow, SwarmMessageRow } from '@/lib/swarm/types';

// ── Styles ──────────────────────────────────────────────────────────────────

const s = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
    padding: '24px',
    height: '100%',
    overflow: 'auto',
  },
  backRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: '14px',
    width: 'fit-content',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '16px',
  },
  title: {
    fontSize: '16px',
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.95)',
    letterSpacing: '-0.02em',
  },
  triggerText: {
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: '4px',
  },
  metaRow: {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap' as const,
    marginTop: '6px',
  },
  metaPill: {
    padding: '4px 12px',
    borderRadius: '9999px',
    fontSize: '14px',
    fontWeight: 500,
    background: 'var(--hover-bg)',
    color: 'rgba(255, 255, 255, 0.4)',
  },
  rollbackBtn: {
    padding: '8px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    background: 'rgba(239, 68, 68, 0.08)',
    color: '#EF4444',
    transition: 'all 0.15s ease',
  },
  sectionLabel: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.3)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    marginBottom: '8px',
  },
  timeline: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    position: 'relative' as const,
  },
  stepCard: (status: string) => {
    const border: Record<string, string> = {
      completed: 'rgba(34, 197, 94, 0.15)',
      executing: 'rgba(255, 255, 255, 0.12)',
      failed: 'rgba(239, 68, 68, 0.15)',
      negotiating: 'rgba(139, 92, 246, 0.15)',
      skipped: 'rgba(255, 255, 255, 0.04)',
      blocked: 'rgba(255, 255, 255, 0.04)',
      pending: 'rgba(255, 255, 255, 0.04)',
      ready: 'rgba(59, 130, 246, 0.1)',
      rolled_back: 'rgba(255, 255, 255, 0.04)',
    };
    return {
      background: 'var(--bg-card, rgba(15, 20, 30, 0.4))',
      backdropFilter: 'blur(12px)',
      borderRadius: '12px',
      padding: '16px 16px',
      borderLeft: `3px solid ${border[status] || border.pending}`,
    };
  },
  stepTopRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },
  stepLabel: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  stepRole: {
    fontSize: '14px',
    fontWeight: 500,
    padding: '2px 8px',
    borderRadius: '8px',
    background: 'var(--hover-bg)',
    color: 'rgba(255, 255, 255, 0.4)',
  },
  stepStatus: (status: string) => {
    const colors: Record<string, string> = {
      completed: '#22C55E',
      executing: '#E2E8F0',
      failed: '#EF4444',
      negotiating: '#8B5CF6',
      skipped: 'rgba(255,255,255,0.3)',
      blocked: 'rgba(255,255,255,0.25)',
      pending: 'rgba(255,255,255,0.2)',
      ready: '#3B82F6',
      rolled_back: 'rgba(255,255,255,0.3)',
    };
    return {
      fontSize: '14px',
      fontWeight: 500,
      color: colors[status] || colors.pending,
    };
  },
  stepMeta: {
    display: 'flex',
    gap: '12px',
    marginTop: '6px',
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.3)',
  },
  stepOutput: {
    marginTop: '8px',
    padding: '8px 12px',
    borderRadius: '8px',
    background: 'rgba(0, 0, 0, 0.2)',
    fontSize: '14px',
    fontFamily: 'var(--font-mono, monospace)',
    color: 'rgba(255, 255, 255, 0.5)',
    maxHeight: '120px',
    overflow: 'auto',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  messagesSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  messageCard: (type: string) => {
    const bg: Record<string, string> = {
      finding: 'rgba(59, 130, 246, 0.06)',
      warning: 'rgba(245, 158, 11, 0.06)',
      blocker: 'rgba(239, 68, 68, 0.08)',
      completion: 'rgba(34, 197, 94, 0.04)',
      negotiation: 'rgba(139, 92, 246, 0.06)',
      status: 'rgba(255, 255, 255, 0.02)',
      handoff: 'rgba(255, 255, 255, 0.02)',
    };
    return {
      padding: '8px 12px',
      borderRadius: '8px',
      background: bg[type] || bg.status,
      fontSize: '14px',
      color: 'rgba(255, 255, 255, 0.6)',
    };
  },
  msgFrom: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.3)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    marginBottom: '2px',
  },
  msgType: (type: string) => {
    const colors: Record<string, string> = {
      finding: '#3B82F6',
      warning: '#F59E0B',
      blocker: '#EF4444',
      completion: '#22C55E',
      negotiation: '#8B5CF6',
      status: 'rgba(255,255,255,0.35)',
      handoff: 'rgba(255,255,255,0.35)',
    };
    return {
      fontSize: '14px',
      fontWeight: 500,
      color: colors[type] || colors.status,
      textTransform: 'uppercase' as const,
    };
  },
  loadingState: {
    display: 'flex',
    justifyContent: 'center',
    padding: '40px',
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: '14px',
  },
};

// ── Status Icons ────────────────────────────────────────────────────────────

const STATUS_ICONS: Record<string, string> = {
  completed: '\u2713',
  executing: '\u25CF',
  failed: '\u2717',
  negotiating: '\u2194',
  skipped: '\u2013',
  blocked: '\u2016',
  pending: '\u25CB',
  ready: '\u25CF',
  rolled_back: '\u21B6',
};

const ROLE_LABELS: Record<string, string> = {
  sales: 'Sales',
  finance: 'Finance',
  comms: 'Comms',
  operations: 'Ops',
  research: 'Research',
  coordinator: 'Coordinator',
};

// ── Component ───────────────────────────────────────────────────────────────

interface SwarmRunDetailProps {
  runId: string;
  onBack: () => void;
  onRollback: () => void;
}

export function SwarmRunDetail({ runId, onBack, onRollback }: SwarmRunDetailProps) {
  const [run, setRun] = useState<SwarmRunRow | null>(null);
  const [steps, setSteps] = useState<SwarmStepRow[]>([]);
  const [messages, setMessages] = useState<SwarmMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const fetchDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/swarm/runs/${runId}`);
      if (res.ok) {
        const data = await res.json();
        setRun(data.run);
        setSteps(data.steps || []);
        setMessages(data.messages || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    fetchDetail();
    const isActive = run && ['pending', 'planning', 'executing', 'negotiating'].includes(run.status);
    const interval = setInterval(fetchDetail, isActive ? 3000 : 15000);
    return () => clearInterval(interval);
  }, [fetchDetail, run?.status]);

  const canRollback = useMemo(() => {
    if (!run) return false;
    return ['completed', 'partial', 'failed'].includes(run.status);
  }, [run]);

  const durationLabel = useMemo(() => {
    if (!run?.duration_ms) return null;
    if (run.duration_ms < 1000) return `${run.duration_ms}ms`;
    if (run.duration_ms < 60000) return `${(run.duration_ms / 1000).toFixed(1)}s`;
    return `${(run.duration_ms / 60000).toFixed(1)}m`;
  }, [run?.duration_ms]);

  const filteredMessages = useMemo(() => {
    // Exclude completion messages to reduce noise — those are shown in step cards
    return messages.filter(m => m.message_type !== 'completion' && m.message_type !== 'status');
  }, [messages]);

  if (loading) {
    return <div style={s.loadingState}>Loading swarm details...</div>;
  }

  if (!run) {
    return <div style={s.loadingState}>Swarm run not found</div>;
  }

  return (
    <div style={s.container}>
      {/* Back button */}
      <div style={s.backRow} onClick={onBack}>
        &larr; Back to swarms
      </div>

      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={s.title}>
            {run.template_slug
              ? run.template_slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
              : 'Custom Swarm'}
          </div>
          <div style={s.triggerText}>{run.trigger_input}</div>
          <div style={s.metaRow}>
            <span style={s.metaPill}>{run.status.replace('_', ' ')}</span>
            {durationLabel && <span style={s.metaPill}>{durationLabel}</span>}
            <span style={s.metaPill}>{steps.length} steps</span>
          </div>
          <button
            onClick={() => setShowDetails(d => !d)}
            style={{
              marginTop: '8px',
              padding: '4px 12px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 500,
              background: 'var(--hover-bg)',
              color: 'rgba(255, 255, 255, 0.4)',
              border: 'none',
              cursor: 'pointer',
              transition: 'color 0.15s ease',
            }}
          >
            {showDetails ? 'Hide details' : 'Show details'}
          </button>
          {showDetails && (
            <div style={{ ...s.metaRow, marginTop: '8px' }}>
              {run.total_cost > 0 && (
                <span style={s.metaPill}>${run.total_cost.toFixed(4)}</span>
              )}
              {run.total_tokens_in + run.total_tokens_out > 0 && (
                <span style={s.metaPill}>
                  {((run.total_tokens_in + run.total_tokens_out) / 1000).toFixed(1)}k tokens
                </span>
              )}
            </div>
          )}
        </div>
        {canRollback && (
          <button style={s.rollbackBtn} onClick={onRollback}>
            Rollback
          </button>
        )}
      </div>

      {/* Execution Timeline */}
      {showDetails && (
      <div>
        <div style={s.sectionLabel}>Execution Timeline</div>
        <div style={s.timeline}>
          {steps.map(step => (
            <div
              key={step.id}
              style={s.stepCard(step.status)}
              onClick={() => setExpandedStep(expandedStep === step.step_key ? null : step.step_key)}
            >
              <div style={s.stepTopRow}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={s.stepStatus(step.status)}>
                    {STATUS_ICONS[step.status] || STATUS_ICONS.pending}
                  </span>
                  <span style={s.stepLabel}>{step.step_key.replace(/_/g, ' ')}</span>
                  {step.agent_role && (
                    <span style={s.stepRole}>
                      {ROLE_LABELS[step.agent_role] || step.agent_role}
                    </span>
                  )}
                </div>
                <span style={s.stepStatus(step.status)}>{step.status}</span>
              </div>

              <div style={s.stepMeta}>
                {step.duration_ms != null && step.duration_ms > 0 && (
                  <span>{step.duration_ms < 1000 ? `${step.duration_ms}ms` : `${(step.duration_ms / 1000).toFixed(1)}s`}</span>
                )}
                {step.cost_estimate > 0 && (
                  <span>${step.cost_estimate.toFixed(4)}</span>
                )}
                {step.model_used && (
                  <span>{step.model_used.replace('claude-', '').split('-')[0]}</span>
                )}
                {step.error_message && (
                  <span style={{ color: '#EF4444' }}>
                    {step.error_message.slice(0, 80)}
                  </span>
                )}
              </div>

              {/* Expanded output */}
              {expandedStep === step.step_key && step.output_data && (
                <div style={s.stepOutput}>
                  {JSON.stringify(step.output_data, null, 2)}
                </div>
              )}

              {/* Negotiation display */}
              {step.negotiation && (
                <div style={{
                  ...s.stepOutput,
                  borderLeft: '2px solid rgba(139, 92, 246, 0.3)',
                }}>
                  <div style={{ color: '#8B5CF6', marginBottom: '4px', fontWeight: 500 }}>
                    Agent Pushback
                  </div>
                  {(step.negotiation as { counterProposal?: string }).counterProposal || 'Negotiation in progress'}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      )}

      {/* Inter-Agent Messages */}
      {filteredMessages.length > 0 && (
        <div>
          <div style={s.sectionLabel}>Agent Communications ({filteredMessages.length})</div>
          <div style={s.messagesSection}>
            {filteredMessages.map(msg => (
              <div key={msg.id} style={s.messageCard(msg.message_type)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                  <span style={s.msgFrom}>
                    {msg.from_step_key.replace(/_/g, ' ')}
                  </span>
                  <span style={s.msgType(msg.message_type)}>
                    {msg.message_type}
                  </span>
                  {msg.to_step_key && (
                    <span style={{ ...s.msgFrom, color: 'rgba(255,255,255,0.2)' }}>
                      &rarr; {msg.to_step_key.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
                {msg.content}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Result Summary */}
      {run.result_summary && (
        <div>
          <div style={s.sectionLabel}>Result Summary</div>
          <div style={{
            padding: '12px 16px',
            borderRadius: '12px',
            background: 'var(--bg-card, rgba(15, 20, 30, 0.4))',
            fontSize: '14px',
            color: 'rgba(255, 255, 255, 0.65)',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap' as const,
          }}>
            {run.result_summary}
          </div>
        </div>
      )}
    </div>
  );
}
