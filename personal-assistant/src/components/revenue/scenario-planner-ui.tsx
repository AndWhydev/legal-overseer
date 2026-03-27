'use client'

import React, { useState } from 'react'
import { GlassDropdown } from '@/components/ui/glass-dropdown'
import { useScenarios } from '@/hooks/use-revenue-data'
import { formatCents } from '@/lib/revenue/types'
import type { RevenueScenario } from '@/lib/revenue/types'
import { S, C } from '@/lib/styles/design-tokens'

// ─── Styles ─────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const formCardStyle: React.CSSProperties = {
  padding: '20px',
  borderRadius: 'var(--radius-xl)',
  background: 'var(--bg-card)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 'var(--radius-md)',
  border: 'none',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  fontSize: 14,
  fontFamily: 'var(--font-sans)',
  outline: 'none',
  width: '100%',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none',
  cursor: 'pointer',
}

const buttonStyle: React.CSSProperties = {
  padding: '12px 20px',
  borderRadius: 'var(--radius-md)',
  border: 'none',
  background: 'var(--bb-orange)',
  color: 'var(--text-on-accent)',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'opacity var(--duration-fast) var(--ease-default)',
  alignSelf: 'flex-start',
}

const labelStyle: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontWeight: 500,
}

const scenarioCardStyle: React.CSSProperties = {
  padding: '16px 20px',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--bg-card)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const resultRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr 1fr',
  gap: 16,
  marginTop: 4,
}

const resultCellStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

const resultLabelStyle: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const resultValueStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 500,
  fontFamily: 'var(--font-mono)',
  letterSpacing: '-0.02em',
}

// ─── Scenario Type Config ───────────────────────────────────────────────────

const SCENARIO_TYPES = [
  { value: 'rate_change', label: 'Rate Change', desc: 'What if I change my rates?' },
  { value: 'client_churn', label: 'Client Churn', desc: 'What if I lose a client?' },
  { value: 'capacity_change', label: 'Capacity Change', desc: 'What if I hire/cut capacity?' },
  { value: 'new_client', label: 'New Client', desc: 'What if I land a new client?' },
  { value: 'custom', label: 'Custom', desc: 'Model a custom revenue impact' },
]

// ─── Component ──────────────────────────────────────────────────────────────

export function ScenarioPlannerUI() {
  const { scenarios, loading, createScenario } = useScenarios()
  const [creating, setCreating] = useState(false)
  const [formOpen, setFormOpen] = useState(false)

  // Form state
  const [name, setName] = useState('')
  const [type, setType] = useState('rate_change')
  const [rateChangePct, setRateChangePct] = useState(10)
  const [monthlyRevenue, setMonthlyRevenue] = useState(5000)
  const [probability, setProbability] = useState(0.7)
  const [hoursDelta, setHoursDelta] = useState(40)
  const [revenueImpact, setRevenueImpact] = useState(10000)

  const handleSubmit = async () => {
    if (!name.trim()) return
    setCreating(true)

    let parameters: Record<string, unknown>

    switch (type) {
      case 'rate_change':
        parameters = { type: 'rate_change', rate_change_pct: rateChangePct }
        break
      case 'client_churn':
        parameters = { type: 'client_churn', client_ids: [], churn_probability: probability }
        break
      case 'capacity_change':
        parameters = { type: 'capacity_change', hours_delta: hoursDelta, effective_date: new Date().toISOString().slice(0, 10) }
        break
      case 'new_client':
        parameters = { type: 'new_client', estimated_monthly_revenue_cents: monthlyRevenue * 100, probability }
        break
      case 'custom':
      default:
        parameters = { type: 'custom', description: name, revenue_impact_cents: revenueImpact * 100 }
    }

    await createScenario({
      name,
      scenario_type: type,
      parameters,
    })

    setName('')
    setFormOpen(false)
    setCreating(false)
  }

  return (
    <div style={containerStyle}>
      {/* Create button / form */}
      {!formOpen ? (
        <button
          style={buttonStyle}
          onClick={() => setFormOpen(true)}
        >
          + New Scenario
        </button>
      ) : (
        <div style={formCardStyle}>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
            Create What-If Scenario
          </span>

          <div>
            <span style={labelStyle}>Scenario Name</span>
            <input
              style={inputStyle}
              placeholder="What if I raise rates 15%?"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div>
            <span style={labelStyle}>Type</span>
            <GlassDropdown
              options={SCENARIO_TYPES.map(st => ({ value: st.value, label: `${st.label} — ${st.desc}` }))}
              value={type}
              onChange={v => setType(v)}
            />
          </div>

          {/* Type-specific fields */}
          {type === 'rate_change' && (
            <div>
              <span style={labelStyle}>Rate Change %</span>
              <input
                style={inputStyle}
                type="number"
                value={rateChangePct}
                onChange={e => setRateChangePct(Number(e.target.value))}
                placeholder="15"
              />
            </div>
          )}

          {type === 'new_client' && (
            <>
              <div>
                <span style={labelStyle}>Est. Monthly Revenue ($)</span>
                <input
                  style={inputStyle}
                  type="number"
                  value={monthlyRevenue}
                  onChange={e => setMonthlyRevenue(Number(e.target.value))}
                />
              </div>
              <div>
                <span style={labelStyle}>Probability (0-1)</span>
                <input
                  style={inputStyle}
                  type="number"
                  step="0.1"
                  min="0"
                  max="1"
                  value={probability}
                  onChange={e => setProbability(Number(e.target.value))}
                />
              </div>
            </>
          )}

          {type === 'capacity_change' && (
            <div>
              <span style={labelStyle}>Hours Delta (per week)</span>
              <input
                style={inputStyle}
                type="number"
                value={hoursDelta}
                onChange={e => setHoursDelta(Number(e.target.value))}
              />
            </div>
          )}

          {type === 'custom' && (
            <div>
              <span style={labelStyle}>Revenue Impact ($)</span>
              <input
                style={inputStyle}
                type="number"
                value={revenueImpact}
                onChange={e => setRevenueImpact(Number(e.target.value))}
              />
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              style={{ ...buttonStyle, opacity: creating ? 0.6 : 1 }}
              onClick={handleSubmit}
              disabled={creating || !name.trim()}
            >
              {creating ? 'Computing...' : 'Run Simulation'}
            </button>
            <button
              style={{ ...buttonStyle, background: 'var(--bg-input)', color: 'var(--text-secondary)' }}
              onClick={() => setFormOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Existing Scenarios */}
      {loading ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Loading scenarios...</div>
      ) : scenarios.length === 0 ? (
        <div style={{
          padding: '24px',
          textAlign: 'center',
          color: 'var(--text-secondary)',
          fontSize: 14,
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-card)',
        }}>
          No scenarios yet. Create one to model what-if revenue impacts.
        </div>
      ) : (
        scenarios.map(scenario => (
          <ScenarioCard key={scenario.id} scenario={scenario} />
        ))
      )}
    </div>
  )
}

// ─── Scenario Result Card ───────────────────────────────────────────────────

function ScenarioCard({ scenario }: { scenario: RevenueScenario }) {
  const isPositive = (scenario.revenue_delta_cents ?? 0) >= 0
  const deltaColor = isPositive ? 'var(--bb-green)' : 'var(--bb-red)'

  return (
    <div style={scenarioCardStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
          {scenario.name}
        </span>
        <span style={{
          fontSize: 14,
          fontWeight: 500,
          padding: '2px 8px',
          borderRadius: 'var(--radius-sm)',
          background: `${deltaColor}15`,
          color: deltaColor,
          textTransform: 'uppercase',
        }}>
          {isPositive ? '+' : ''}{scenario.revenue_delta_pct}%
        </span>
      </div>

      {/* Impact summary */}
      {scenario.impact_summary && (
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
          {scenario.impact_summary}
        </div>
      )}

      {/* Results grid */}
      <div style={resultRowStyle}>
        <div style={resultCellStyle}>
          <span style={resultLabelStyle}>Baseline</span>
          <span style={{ ...resultValueStyle, color: 'var(--text-secondary)' }}>
            {formatCents(scenario.baseline_revenue_cents ?? 0)}
          </span>
        </div>
        <div style={resultCellStyle}>
          <span style={resultLabelStyle}>Projected (P50)</span>
          <span style={{ ...resultValueStyle, color: deltaColor }}>
            {formatCents(scenario.p50_revenue_cents ?? 0)}
          </span>
        </div>
        <div style={resultCellStyle}>
          <span style={resultLabelStyle}>Delta</span>
          <span style={{ ...resultValueStyle, color: deltaColor }}>
            {isPositive ? '+' : ''}{formatCents(scenario.revenue_delta_cents ?? 0)}
          </span>
        </div>
      </div>

      {/* P10/P90 range */}
      <div style={{
        display: 'flex',
        gap: 12,
        fontSize: 14,
        color: 'var(--text-secondary)',
        fontFamily: 'var(--font-mono)',
      }}>
        <span>P10: {formatCents(scenario.p10_revenue_cents ?? 0)}</span>
        <span>P90: {formatCents(scenario.p90_revenue_cents ?? 0)}</span>
        <span>{scenario.simulation_runs} runs</span>
      </div>

      {/* Risk factors */}
      {scenario.risk_factors && scenario.risk_factors.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {scenario.risk_factors.map((rf, i) => (
            <span key={i} style={{
              fontSize: 14,
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              background: C.statusErrorBg,
              color: 'var(--bb-red)',
            }}>
              {rf}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
