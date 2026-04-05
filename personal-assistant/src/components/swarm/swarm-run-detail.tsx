'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { SwarmRunRow, SwarmStepRow, SwarmMessageRow } from '@/lib/swarm/types';

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

const statusBorderColors: Record<string, string> = {
  completed: 'border-l-green-500/40',
  executing: 'border-l-muted',
  failed: 'border-l-red-500/40',
  negotiating: 'border-l-purple-500/40',
  skipped: 'border-l-border',
  blocked: 'border-l-border',
  pending: 'border-l-border',
  ready: 'border-l-blue-500/30',
  rolled_back: 'border-l-border',
};

const statusTextColors: Record<string, string> = {
  completed: 'text-green-500',
  executing: 'text-foreground',
  failed: 'text-red-500',
  negotiating: 'text-purple-500',
  skipped: 'text-muted-foreground',
  blocked: 'text-muted-foreground',
  pending: 'text-muted-foreground',
  ready: 'text-blue-500',
  rolled_back: 'text-muted-foreground',
};

const messageTypeColors: Record<string, string> = {
  finding: 'text-blue-500',
  warning: 'text-amber-500',
  blocker: 'text-red-500',
  completion: 'text-green-500',
  negotiation: 'text-purple-500',
  status: 'text-muted-foreground',
  handoff: 'text-muted-foreground',
};

const messageBgColors: Record<string, string> = {
  finding: 'bg-blue-500/[0.06]',
  warning: 'bg-amber-500/10',
  blocker: 'bg-red-500/10',
  completion: 'bg-green-500/10',
  negotiation: 'bg-purple-500/[0.06]',
  status: 'bg-muted',
  handoff: 'bg-muted',
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
    return messages.filter(m => m.message_type !== 'completion' && m.message_type !== 'status');
  }, [messages]);

  if (loading) {
    return <div className="flex justify-center p-10 text-muted-foreground text-sm">Loading swarm details...</div>;
  }

  if (!run) {
    return <div className="flex justify-center p-10 text-muted-foreground text-sm">Swarm run not found</div>;
  }

  return (
    <div className="flex flex-col gap-5 p-6 h-full overflow-auto">
      {/* Back button */}
      <div
        className="flex items-center gap-2 cursor-pointer text-muted-foreground text-sm w-fit hover:text-foreground transition-colors"
        onClick={onBack}
      >
        &larr; Back to swarms
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-base font-medium text-foreground tracking-tight">
            {run.template_slug
              ? run.template_slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
              : 'Custom Swarm'}
          </div>
          <div className="text-sm text-muted-foreground mt-1">{run.trigger_input}</div>
          <div className="flex gap-4 flex-wrap mt-1.5">
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-muted text-muted-foreground">{run.status.replace('_', ' ')}</span>
            {durationLabel && <span className="px-3 py-1 rounded-full text-sm font-medium bg-muted text-muted-foreground">{durationLabel}</span>}
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-muted text-muted-foreground">{steps.length} steps</span>
          </div>
          <button
            onClick={() => setShowDetails(d => !d)}
            className="mt-2 px-3 py-1 rounded-lg text-sm font-medium bg-muted text-muted-foreground border-none cursor-pointer transition-colors hover:text-foreground"
          >
            {showDetails ? 'Hide details' : 'Show details'}
          </button>
          {showDetails && (
            <div className="flex gap-4 flex-wrap mt-2">
              {run.total_cost > 0 && (
                <span className="px-3 py-1 rounded-full text-sm font-medium bg-muted text-muted-foreground">${run.total_cost.toFixed(4)}</span>
              )}
              {run.total_tokens_in + run.total_tokens_out > 0 && (
                <span className="px-3 py-1 rounded-full text-sm font-medium bg-muted text-muted-foreground">
                  {((run.total_tokens_in + run.total_tokens_out) / 1000).toFixed(1)}k tokens
                </span>
              )}
            </div>
          )}
        </div>
        {canRollback && (
          <button
            className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer border border-red-500 bg-red-500/10 text-red-500 transition-all hover:bg-red-500/20"
            onClick={onRollback}
          >
            Rollback
          </button>
        )}
      </div>

      {/* Execution Timeline */}
      {showDetails && (
        <div>
          <div className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-2">Execution Timeline</div>
          <div className="flex flex-col gap-0.5 relative">
            {steps.map(step => (
              <div
                key={step.id}
                className={`rounded-xl bg-card p-4 border-l-[3px] cursor-pointer ${statusBorderColors[step.status] || 'border-l-border'}`}
                onClick={() => setExpandedStep(expandedStep === step.step_key ? null : step.step_key)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${statusTextColors[step.status] || 'text-muted-foreground'}`}>
                      {STATUS_ICONS[step.status] || STATUS_ICONS.pending}
                    </span>
                    <span className="text-sm font-medium text-foreground">{step.step_key.replace(/_/g, ' ')}</span>
                    {step.agent_role && (
                      <span className="text-sm font-medium px-2 py-0.5 rounded-lg bg-muted text-muted-foreground">
                        {ROLE_LABELS[step.agent_role] || step.agent_role}
                      </span>
                    )}
                  </div>
                  <span className={`text-sm font-medium ${statusTextColors[step.status] || 'text-muted-foreground'}`}>{step.status}</span>
                </div>

                <div className="flex gap-3 mt-1.5 text-sm text-muted-foreground">
                  {step.duration_ms != null && step.duration_ms > 0 && (
                    <span>{step.duration_ms < 1000 ? `${step.duration_ms}ms` : `${(step.duration_ms / 1000).toFixed(1)}s`}</span>
                  )}
                  {step.cost_estimate > 0 && (
                    <span>${step.cost_estimate.toFixed(4)}</span>
                  )}
                  {step.model_used && (
                    <span>{step.model_used.replace(/^[^-]+-/, '').split('-')[0]}</span>
                  )}
                  {step.error_message && (
                    <span className="text-red-500">
                      {step.error_message.slice(0, 80)}
                    </span>
                  )}
                </div>

                {/* Expanded output */}
                {expandedStep === step.step_key && step.output_data && (
                  <div className="mt-2 p-2 rounded-lg bg-muted text-sm font-mono text-muted-foreground max-h-[120px] overflow-auto whitespace-pre-wrap break-words">
                    {JSON.stringify(step.output_data, null, 2)}
                  </div>
                )}

                {/* Negotiation display */}
                {step.negotiation && (
                  <div className="mt-2 p-2 rounded-lg bg-muted text-sm font-mono text-muted-foreground max-h-[120px] overflow-auto whitespace-pre-wrap break-words border-l-2 border-l-purple-500/30">
                    <div className="text-purple-500 mb-1 font-medium font-sans">
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
          <div className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-2">Agent Communications ({filteredMessages.length})</div>
          <div className="flex flex-col gap-1.5">
            {filteredMessages.map(msg => (
              <div key={msg.id} className={`p-2 rounded-lg text-sm text-muted-foreground ${messageBgColors[msg.message_type] || 'bg-muted'}`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    {msg.from_step_key.replace(/_/g, ' ')}
                  </span>
                  <span className={`text-sm font-medium uppercase ${messageTypeColors[msg.message_type] || 'text-muted-foreground'}`}>
                    {msg.message_type}
                  </span>
                  {msg.to_step_key && (
                    <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
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
          <div className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-2">Result Summary</div>
          <div className="p-3 rounded-xl bg-card text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {run.result_summary}
          </div>
        </div>
      )}
    </div>
  );
}