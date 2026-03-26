'use client'

import React, { memo } from 'react'
import type { ScoreBreakdown } from '@/lib/leads/types'

interface ScoreBreakdownPanelProps {
  fitScore: number
  opportunityScore: number
  fitBreakdown: ScoreBreakdown | null
  opportunityBreakdown: ScoreBreakdown | null
}

// ─── Hoisted Styles ─────────────────────────────────────────────────────────
const sectionTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--text-dim, #475569)',
  margin: '0 0 12px',
}

const gaugeLabel: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text-secondary, #94A3B8)',
}

const gaugeValueStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 500,
  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
  color: 'var(--text-primary, #F1F5F9)',
}

const gaugeTrack: React.CSSProperties = {
  height: 6,
  borderRadius: 8,
  background: 'var(--hover-bg, rgba(255, 255, 255, 0.04))',
  overflow: 'hidden',
}

const factorRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '4px 0',
}

const factorLabel: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-secondary, #94A3B8)',
}

const factorNote: React.CSSProperties = {
  color: 'var(--text-dim, #475569)',
  marginLeft: 4,
}

const subLabel: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text-dim, #475569)',
  marginBottom: 8,
}

// ─── Sub-components ─────────────────────────────────────────────────────────
function ScoreGauge({ label, score }: { label: string; score: number }) {
  const pct = Math.min(score, 100)
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={gaugeLabel}>{label}</span>
        <span style={gaugeValueStyle} aria-label={`${label} score: ${score}`}>{score}</span>
      </div>
      <div style={gaugeTrack}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          borderRadius: 8,
          background: 'var(--text-primary, #F1F5F9)',
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
        <div key={i} style={factorRow}>
          <span style={factorLabel}>
            {c.factor}
            {c.note && <span style={factorNote}>({c.note})</span>}
          </span>
          <span style={{
            fontSize: 14,
            fontWeight: 500,
            fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
            padding: '2px 8px',
            borderRadius: 8,
            background: 'transparent',
            color: 'var(--text-primary, #F1F5F9)',
          }}>
            {c.points > 0 ? '+' : ''}{c.points}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────
function ScoreBreakdownPanelInner({ fitScore, opportunityScore, fitBreakdown, opportunityBreakdown }: ScoreBreakdownPanelProps) {
  return (
    <div>
      <h4 style={sectionTitle}>Score Breakdown</h4>

      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <ScoreGauge label="Fit" score={fitScore} />
        <ScoreGauge label="Opportunity" score={opportunityScore} />
      </div>

      {fitBreakdown && (
        <div style={{ marginBottom: 12 }}>
          <div style={subLabel}>Fit Factors</div>
          <FactorList breakdown={fitBreakdown} />
        </div>
      )}

      {opportunityBreakdown && (
        <div>
          <div style={subLabel}>Opportunity Factors</div>
          <FactorList breakdown={opportunityBreakdown} />
        </div>
      )}
    </div>
  )
}

export const ScoreBreakdownPanel = memo(ScoreBreakdownPanelInner)
