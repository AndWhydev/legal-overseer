'use client'

import type { ScoreBreakdown } from '@/lib/leads/types'

interface ScoreBreakdownPanelProps {
  fitScore: number
  opportunityScore: number
  fitBreakdown: ScoreBreakdown | null
  opportunityBreakdown: ScoreBreakdown | null
}

function ScoreGauge({ label, score, color }: { label: string; score: number; color: string }) {
  const pct = Math.min(score, 100)

  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color }}>{score}</span>
      </div>
      <div style={{
        height: 6,
        borderRadius: 3,
        background: 'var(--hover-bg)',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          borderRadius: 3,
          background: color,
          transition: 'width 0.5s ease',
        }} />
      </div>
    </div>
  )
}

function FactorList({ breakdown }: { breakdown: ScoreBreakdown | null }) {
  if (!breakdown?.components?.length) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {breakdown.components.map((c, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            {c.factor}
            {c.note && <span style={{ color: 'var(--text-dim)', marginLeft: 4 }}>({c.note})</span>}
          </span>
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            fontFamily: 'var(--font-mono)',
            padding: '2px 8px',
            borderRadius: 10,
            background: c.points > 0 ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            color: c.points > 0 ? 'var(--bb-green)' : 'var(--bb-red)',
          }}>
            {c.points > 0 ? '+' : ''}{c.points}
          </span>
        </div>
      ))}
    </div>
  )
}

export function ScoreBreakdownPanel({ fitScore, opportunityScore, fitBreakdown, opportunityBreakdown }: ScoreBreakdownPanelProps) {
  return (
    <div>
      <h4 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)', margin: '0 0 12px' }}>
        Score Breakdown
      </h4>

      {/* Gauges side by side */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <ScoreGauge label="Fit" score={fitScore} color="var(--bb-cyan)" />
        <ScoreGauge label="Opportunity" score={opportunityScore} color="var(--bb-amber)" />
      </div>

      {/* Factor breakdowns */}
      {fitBreakdown && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>Fit Factors</div>
          <FactorList breakdown={fitBreakdown} />
        </div>
      )}

      {opportunityBreakdown && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>Opportunity Factors</div>
          <FactorList breakdown={opportunityBreakdown} />
        </div>
      )}
    </div>
  )
}
