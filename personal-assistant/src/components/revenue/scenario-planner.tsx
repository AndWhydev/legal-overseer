'use client'

import { useState } from 'react'
import { Play, TrendingUp, TrendingDown, Minus, BarChart3 } from 'lucide-react'
import { S, C } from '@/lib/styles/design-tokens'

interface ScenarioResult {
  id: string
  name: string
  scenario_type: string
  projected_annual_cents: number | null
  current_annual_cents: number | null
  delta_cents: number | null
  probability_positive: number | null
  results: {
    percentiles?: { p10: number; p25: number; p50: number; p75: number; p90: number }
  }
  computed_at: string
}

const card: React.CSSProperties = {
  borderRadius: 12,
  background: 'var(--glass-bg)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  boxShadow: 'var(--card-shadow), var(--card-inset)',
  padding: '20px',
}

const input: React.CSSProperties = {
  background: 'var(--bg-input)',
  border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
  borderRadius: 8,
  padding: '8px 12px',
  color: 'var(--text-primary)',
  fontSize: 14,
  width: '100%',
  outline: 'none',
}

function fmt(cents: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

const PRESETS = [
  { name: 'Raise rates 10%', type: 'rate_change', params: { rate_change_pct: 10 } },
  { name: 'Raise rates 20%', type: 'rate_change', params: { rate_change_pct: 20 } },
  { name: 'Lose biggest client', type: 'client_churn', params: { churn_count: 1 } },
  { name: 'Win $3k/mo retainer', type: 'new_client', params: { monthly_value_cents: 300000, ramp_months: 2 } },
  { name: 'Win $5k/mo retainer', type: 'new_client', params: { monthly_value_cents: 500000, ramp_months: 3 } },
] as const

export function ScenarioPlanner() {
  const [results, setResults] = useState<ScenarioResult[]>([])
  const [running, setRunning] = useState(false)
  const [activePreset, setActivePreset] = useState<string | null>(null)

  const runScenario = async (name: string, type: string, params: Record<string, unknown>) => {
    setRunning(true)
    setActivePreset(name)
    try {
      const res = await fetch('/api/revenue/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          scenario_type: type,
          parameters: params,
          simulations: 1000,
        }),
      })
      if (res.ok) {
        const { scenario } = await res.json()
        setResults(prev => [scenario, ...prev.slice(0, 4)])
      }
    } catch { /* silent */ }
    setRunning(false)
    setActivePreset(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>
          Scenario Planner
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 12 }}>
          Run "what-if" simulations using Monte Carlo analysis with client-specific churn probability.
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PRESETS.map(preset => (
            <button
              key={preset.name}
              onClick={() => runScenario(preset.name, preset.type, preset.params)}
              disabled={running}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 16px',
                borderRadius: 8,
                background: activePreset === preset.name
                  ? C.bgHoverStrong
                  : C.bgHover,
                border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
                color: 'var(--text-primary)',
                cursor: running ? 'wait' : 'pointer',
                fontSize: 14,
                fontWeight: 500,
                transition: 'all 150ms',
                textAlign: 'left',
              }}
            >
              <Play size={12} color="var(--text-primary, #F1F5F9)" />
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {results.map(result => {
        const isPositive = (result.delta_cents ?? 0) > 0
        const p = result.results.percentiles

        return (
          <div key={result.id} style={card}>
            <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                  {result.name}
                </div>
                <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>
                  1,000 simulations • {new Date(result.computed_at).toLocaleString()}
                </div>
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                color: isPositive ? 'var(--bb-green)' : 'var(--bb-red)',
              }}>
                {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                <span style={{ fontSize: 16, fontWeight: 500, fontFamily: 'var(--font-mono)' }}>
                  {isPositive ? '+' : ''}{fmt(result.delta_cents ?? 0)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3" style={{ marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>Current Annual</div>
                <div style={{ fontSize: 16, fontWeight: 500, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  {fmt(result.current_annual_cents ?? 0)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>Projected Annual</div>
                <div style={{
                  fontSize: 16, fontWeight: 500, fontFamily: 'var(--font-mono)',
                  color: isPositive ? 'var(--bb-green)' : 'var(--bb-red)',
                }}>
                  {fmt(result.projected_annual_cents ?? 0)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>Positive Outcome</div>
                <div style={{ fontSize: 16, fontWeight: 500, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  {Math.round((result.probability_positive ?? 0) * 100)}%
                </div>
              </div>
            </div>

            {/* Percentile distribution bar */}
            {p && (
              <div>
                <div style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 8 }}>
                  Distribution (P10 → P90)
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  height: 24,
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: C.bgHover,
                }}>
                  {[
                    { label: 'P10', value: p.p10, color: 'rgba(239, 68, 68, 0.3)' },
                    { label: 'P25', value: p.p25, color: 'rgba(245, 158, 11, 0.3)' },
                    { label: 'P50', value: p.p50, color: 'rgba(59, 130, 246, 0.4)' },
                    { label: 'P75', value: p.p75, color: 'rgba(34, 197, 94, 0.3)' },
                    { label: 'P90', value: p.p90, color: 'rgba(34, 197, 94, 0.4)' },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{
                      flex: 1,
                      height: '100%',
                      background: color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: 14, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                        {fmt(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
