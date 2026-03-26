'use client'

import { useState, useEffect, useCallback } from 'react'
import type { SwarmRun } from '@/lib/swarm/types'

const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B',
  running: '#3B82F6',
  paused: '#8B5CF6',
  completed: '#22C55E',
  failed: '#EF4444',
  cancelled: 'rgba(255,255,255,0.3)',
  rolling_back: '#EC4899',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  running: 'Running',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  rolling_back: 'Rolling Back',
}

interface SwarmListProps {
  onSelectRun?: (runId: string) => void
}

export function SwarmList({ onSelectRun }: SwarmListProps) {
  const [runs, setRuns] = useState<SwarmRun[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string | null>(null)

  const fetchRuns = useCallback(async () => {
    try {
      const url = filter ? `/api/swarm?status=${filter}` : '/api/swarm'
      const res = await fetch(url)
      const data = await res.json()
      setRuns(data.runs ?? [])
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    fetchRuns()
    const interval = setInterval(fetchRuns, 5000) // Poll for updates
    return () => clearInterval(interval)
  }, [fetchRuns])

  const formatTime = (iso: string | null) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleString('en-AU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const formatCost = (cents: number) => {
    if (cents === 0) return '—'
    return `$${(cents / 100).toFixed(2)}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 500, color: 'rgba(255,255,255,0.95)', margin: 0 }}>
          Agent Swarms
        </h2>
        <div style={{ display: 'flex', gap: '6px' }}>
          {[null, 'running', 'completed', 'failed'].map(s => (
            <button
              key={s ?? 'all'}
              onClick={() => setFilter(s)}
              style={{
                padding: '4px 12px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                background: filter === s ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
                color: filter === s ? '#F1F5F9' : 'rgba(255,255,255,0.5)',
                transition: 'all 0.15s',
              }}
            >
              {s === null ? 'All' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.4)' }}>
          Loading swarms...
        </div>
      ) : runs.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: 'rgba(255,255,255,0.4)',
          background: 'var(--bg-card, rgba(15,20,30,0.35))',
          borderRadius: '12px',
          backdropFilter: 'blur(20px)',
        }}>
          <div style={{ fontSize: '16px', marginBottom: '12px' }}>No swarms yet</div>
          <p style={{ fontSize: '14px', maxWidth: '300px', margin: '0 auto' }}>
            Trigger a swarm from chat: &quot;Prepare for Thomson pitch&quot; or &quot;Onboard Acme Corp&quot;
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {runs.map(run => (
            <button
              key={run.id}
              onClick={() => onSelectRun?.(run.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '14px 16px',
                background: 'var(--bg-card, rgba(15,20,30,0.35))',
                backdropFilter: 'blur(20px)',
                borderRadius: '12px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(20,28,40,0.7)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(15,20,30,0.35)')}
            >
              {/* Status dot */}
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: STATUS_COLORS[run.status] ?? '#666',
                boxShadow: run.status === 'running' ? `0 0 8px ${STATUS_COLORS.running}` : undefined,
                flexShrink: 0,
              }} />

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'rgba(255,255,255,0.9)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {run.name}
                </div>
                <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
                  {formatTime(run.created_at)} · {run.triggered_by}
                </div>
              </div>

              {/* Status badge */}
              <div style={{
                padding: '4px 8px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: STATUS_COLORS[run.status] ?? '#666',
                background: `${STATUS_COLORS[run.status] ?? '#666'}15`,
              }}>
                {STATUS_LABELS[run.status] ?? run.status}
              </div>

              {/* Cost */}
              <div style={{
                fontSize: '14px',
                color: 'rgba(255,255,255,0.3)',
                fontFamily: 'var(--font-mono, monospace)',
                minWidth: '50px',
                textAlign: 'right',
              }}>
                {formatCost(run.total_cost_cents ?? run.total_cost ?? 0)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
