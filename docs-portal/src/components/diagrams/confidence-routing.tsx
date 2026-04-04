'use client'

import { useState } from 'react'

export function ConfidenceRouting() {
  const [confidence, setConfidence] = useState(0.75)

  const getDecision = (c: number) => {
    if (c >= 0.90) return { label: 'Auto-execute', color: '#16A34A', bg: '#F0FDF4', desc: 'Tool runs immediately, user notified after' }
    if (c >= 0.60) return { label: 'Propose to user', color: '#D97706', bg: '#FFFBEB', desc: 'Action queued in approval queue for confirmation' }
    return { label: 'Escalate', color: '#DC2626', bg: '#FEF2F2', desc: 'Requires explicit human approval before proceeding' }
  }

  const decision = getDecision(confidence)

  return (
    <figure style={{
      margin: '2rem 0',
      padding: '1.5rem',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-default)',
      borderRadius: '12px',
    }}>
      <div style={{ marginBottom: '1rem', textAlign: 'center' }}>
        <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>
          Confidence Score: <strong style={{ color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace' }}>{confidence.toFixed(2)}</strong>
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={confidence}
          onChange={e => setConfidence(parseFloat(e.target.value))}
          style={{ width: '100%', maxWidth: '400px', cursor: 'pointer' }}
        />
      </div>

      {/* Scale bar */}
      <div style={{ display: 'flex', maxWidth: '400px', margin: '0 auto 1rem', borderRadius: '6px', overflow: 'hidden', height: '32px' }}>
        <div style={{ flex: 6, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6875rem', fontWeight: 600, color: '#DC2626', borderRight: '2px solid white' }}>
          Escalate (0-0.60)
        </div>
        <div style={{ flex: 3, background: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6875rem', fontWeight: 600, color: '#D97706', borderRight: '2px solid white' }}>
          Ask (0.60-0.90)
        </div>
        <div style={{ flex: 1, background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6875rem', fontWeight: 600, color: '#16A34A' }}>
          Act (0.90+)
        </div>
      </div>

      {/* Result */}
      <div style={{
        padding: '1rem',
        background: decision.bg,
        borderRadius: '8px',
        borderLeft: `3px solid ${decision.color}`,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '1.125rem', fontWeight: 600, color: decision.color }}>{decision.label}</div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{decision.desc}</div>
      </div>
    </figure>
  )
}
