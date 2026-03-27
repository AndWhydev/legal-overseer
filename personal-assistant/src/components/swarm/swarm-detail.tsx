'use client'

import { useState, useEffect, useCallback } from 'react'
import type { SwarmRun, SwarmStep, SwarmMessage } from '@/lib/swarm/types'
import { S, C } from '@/lib/styles/design-tokens'

const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B',
  running: '#3B82F6',
  completed: '#22C55E',
  failed: '#EF4444',
  skipped: C.textMuted,
  rolled_back: '#EC4899',
}

const AGENT_COLORS: Record<string, string> = {
  finance: '#22C55E',
  comms: '#3B82F6',
  sales: 'var(--text-primary, #F1F5F9)',
  generic: '#8B5CF6',
}

interface SwarmDetailProps {
  runId: string
  onBack?: () => void
}

export function SwarmDetail({ runId, onBack }: SwarmDetailProps) {
  const [run, setRun] = useState<SwarmRun | null>(null)
  const [steps, setSteps] = useState<SwarmStep[]>([])
  const [messages, setMessages] = useState<SwarmMessage[]>([])
  const [loading, setLoading] = useState(true)

  const fetchDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/swarm/${runId}`)
      const data = await res.json()
      setRun(data.run)
      setSteps(data.steps ?? [])
      setMessages(data.messages ?? [])
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [runId])

  useEffect(() => {
    fetchDetail()
    // Poll while running
    const interval = setInterval(() => {
      if (run?.status === 'executing' || run?.status === 'pending') {
        fetchDetail()
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [fetchDetail, run?.status])

  const handleCancel = async () => {
    await fetch(`/api/swarm/${runId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    })
    fetchDetail()
  }

  const formatDuration = (start: string | null, end: string | null) => {
    if (!start) return '—'
    const startMs = new Date(start).getTime()
    const endMs = end ? new Date(end).getTime() : Date.now()
    const durationSec = Math.round((endMs - startMs) / 1000)
    if (durationSec < 60) return `${durationSec}s`
    return `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: C.textDim }}>
        Loading swarm details...
      </div>
    )
  }

  if (!run) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: C.textDim }}>
        Swarm not found
      </div>
    )
  }

  const completedSteps = steps.filter(s => s.status === 'completed').length
  const totalSteps = steps.length
  const progress = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {onBack && (
          <button
            onClick={onBack}
            style={{
              background: 'var(--hover-bg)',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 12px',
              color: C.textSecondary,
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Back
          </button>
        )}
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: '16px', fontWeight: 500, color: C.textPrimary, margin: 0 }}>
            {run.trigger_input}
          </h2>
          <div style={{ fontSize: '14px', color: C.textDim, marginTop: '2px' }}>
            {run.trigger_type} · {formatDuration(run.started_at, run.completed_at)}
          </div>
        </div>
        {(run.status === 'executing' || run.status === 'pending') && (
          <button
            onClick={handleCancel}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: C.statusErrorBg,
              color: '#EF4444',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div style={{
        background: 'var(--bg-card, rgba(15,20,30,0.35))',
        borderRadius: '12px',
        padding: '16px',
        backdropFilter: 'blur(20px)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '14px', color: C.textSecondary }}>
            {completedSteps}/{totalSteps} steps
          </span>
          <span style={{ fontSize: '14px', color: C.textDim }}>
            {progress}%
          </span>
        </div>
        <div style={{
          height: '4px',
          background: 'var(--hover-bg-strong)',
          borderRadius: '8px',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${progress}%`,
            background: run.status === 'failed' ? '#EF4444' : 'var(--text-primary, #F1F5F9)',
            borderRadius: '8px',
            transition: 'width 0.3s ease',
          }} />
        </div>
        <div style={{
          display: 'flex',
          gap: '16px',
          marginTop: '12px',
          fontSize: '14px',
          color: C.textDim,
        }}>
          <span>Cost: ${(run.total_cost / 100).toFixed(2)}</span>
          <span>Tokens: {(run.total_tokens_in + run.total_tokens_out).toLocaleString()}</span>
        </div>
      </div>

      {/* Steps timeline */}
      <div style={{
        background: 'var(--bg-card, rgba(15,20,30,0.35))',
        borderRadius: '12px',
        padding: '16px',
        backdropFilter: 'blur(20px)',
      }}>
        <h3 style={{ fontSize: '14px', fontWeight: 500, color: C.textSecondary, margin: '0 0 12px' }}>
          Execution Timeline
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {steps.map((step, i) => (
            <div
              key={step.id}
              style={{
                display: 'flex',
                gap: '12px',
                padding: '12px 0',
                borderBottom: i < steps.length - 1 ? `1px solid ${C.borderSubtle}` : undefined,
              }}
            >
              {/* Timeline line + dot */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                width: '20px',
                flexShrink: 0,
              }}>
                <div style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: STATUS_COLORS[step.status] ?? '#666',
                  boxShadow: step.status === 'executing' ? `0 0 8px ${STATUS_COLORS.running}` : undefined,
                }} />
                {i < steps.length - 1 && (
                  <div style={{
                    width: '2px',
                    flex: 1,
                    background: 'var(--hover-bg-strong)',
                    marginTop: '4px',
                  }} />
                )}
              </div>

              {/* Step info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    color: C.textPrimary,
                  }}>
                    {step.step_key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </span>
                  <span style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    padding: '4px 8px',
                    borderRadius: '8px',
                    background: `${AGENT_COLORS[step.agent_type ?? step.agent_role ?? 'generic'] ?? '#8B5CF6'}20`,
                    color: AGENT_COLORS[step.agent_type ?? step.agent_role ?? 'generic'] ?? '#8B5CF6',
                    textTransform: 'uppercase',
                  }}>
                    {step.agent_type ?? step.agent_role ?? 'agent'}
                  </span>
                </div>

                {step.error && (
                  <div style={{ fontSize: '14px', color: '#EF4444', marginTop: '4px' }}>
                    {step.error}
                  </div>
                )}

                {step.status === 'completed' && step.output && Object.keys(step.output).length > 0 && (
                  <details style={{ marginTop: '8px' }}>
                    <summary style={{
                      fontSize: '14px',
                      color: C.textDim,
                      cursor: 'pointer',
                      listStyle: 'none',
                    }}>
                      View output
                    </summary>
                    <pre style={{
                      fontSize: '14px',
                      color: C.textPlaceholder,
                      background: C.bgOverlay,
                      padding: '8px',
                      borderRadius: '8px',
                      marginTop: '4px',
                      overflow: 'auto',
                      maxHeight: '150px',
                    }}>
                      {JSON.stringify(step.output, null, 2)}
                    </pre>
                  </details>
                )}
              </div>

              {/* Duration + cost */}
              <div style={{
                fontSize: '14px',
                color: C.textMuted,
                textAlign: 'right',
                whiteSpace: 'nowrap',
              }}>
                <div>{formatDuration(step.started_at, step.completed_at)}</div>
                {(step.cost_cents ?? 0) > 0 && (
                  <div style={{ marginTop: '2px' }}>
                    ${((step.cost_cents ?? 0) / 100).toFixed(2)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Messages */}
      {messages.length > 0 && (
        <div style={{
          background: 'var(--bg-card, rgba(15,20,30,0.35))',
          borderRadius: '12px',
          padding: '16px',
          backdropFilter: 'blur(20px)',
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: 500, color: C.textSecondary, margin: '0 0 12px' }}>
            Agent Messages ({messages.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {messages.map(msg => (
              <div
                key={msg.id}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: msg.message_type === 'conflict'
                    ? 'rgba(239,68,68,0.08)'
                    : msg.message_type === 'resolution'
                      ? 'rgba(34,197,94,0.08)'
                      : 'var(--hover-bg)',
                }}
              >
                <div style={{ display: 'flex', gap: '8px', fontSize: '14px', marginBottom: '4px' }}>
                  <span style={{
                    fontWeight: 500,
                    color: AGENT_COLORS[msg.from_step_id ?? msg.from_step_key ?? ''] ?? 'rgba(255,255,255,0.6)',
                  }}>
                    {msg.from_step_id}
                  </span>
                  <span style={{ color: C.textMuted }}>
                    {msg.to_step_id ? `to ${msg.to_step_id}` : 'broadcast'}
                  </span>
                  <span style={{
                    padding: '0 4px',
                    borderRadius: '8px',
                    background: 'var(--hover-bg)',
                    color: C.textDim,
                  }}>
                    {msg.message_type}
                  </span>
                </div>
                <div style={{ fontSize: '14px', color: C.textSecondary }}>
                  {typeof msg.content === 'string'
                    ? msg.content
                    : (msg.content as Record<string, unknown>).summary as string
                      ?? JSON.stringify(msg.content).slice(0, 200)
                  }
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
