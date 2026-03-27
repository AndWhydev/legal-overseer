'use client'

import { useState } from 'react'
import { IconPlayerPlay, IconTrendingUp, IconTrendingDown, IconMinus, IconChartBar } from '@tabler/icons-react'

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
      <div className="rounded-xl bg-card backdrop-blur-lg shadow-sm p-5">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Scenario Planner
        </div>
        <div className="text-sm text-muted-foreground mb-3">
          Run "what-if" simulations using Monte Carlo analysis with client-specific churn probability.
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PRESETS.map(preset => (
            <button
              key={preset.name}
              onClick={() => runScenario(preset.name, preset.type, preset.params)}
              disabled={running}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg border border-border text-sm font-medium text-foreground text-left transition-all ${
                activePreset === preset.name
                  ? 'bg-muted'
                  : 'bg-muted/50 hover:bg-muted'
              } ${running ? 'cursor-wait' : 'cursor-pointer'}`}
            >
              <IconPlayerPlay size={12} className="text-foreground" />
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
          <div key={result.id} className="rounded-xl bg-card backdrop-blur-lg shadow-sm p-5">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-sm font-medium text-foreground">
                  {result.name}
                </div>
                <div className="text-sm text-muted-foreground">
                  1,000 simulations • {new Date(result.computed_at).toLocaleString()}
                </div>
              </div>
              <div className={`flex items-center gap-1 ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                {isPositive ? <IconTrendingUp size={16} /> : <IconTrendingDown size={16} />}
                <span className="text-base font-medium font-mono">
                  {isPositive ? '+' : ''}{fmt(result.delta_cents ?? 0)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-2">
              <div>
                <div className="text-sm text-muted-foreground">Current Annual</div>
                <div className="text-base font-medium font-mono text-foreground">
                  {fmt(result.current_annual_cents ?? 0)}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Projected Annual</div>
                <div className={`text-base font-medium font-mono ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                  {fmt(result.projected_annual_cents ?? 0)}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Positive Outcome</div>
                <div className="text-base font-medium font-mono text-foreground">
                  {Math.round((result.probability_positive ?? 0) * 100)}%
                </div>
              </div>
            </div>

            {/* Percentile distribution bar */}
            {p && (
              <div>
                <div className="text-sm text-muted-foreground mb-2">
                  Distribution (P10 → P90)
                </div>
                <div className="flex items-center gap-0.5 h-6 rounded-lg overflow-hidden bg-muted/50">
                  {[
                    { label: 'P10', value: p.p10, color: 'bg-red-500/30' },
                    { label: 'P25', value: p.p25, color: 'bg-amber-500/30' },
                    { label: 'P50', value: p.p50, color: 'bg-blue-500/40' },
                    { label: 'P75', value: p.p75, color: 'bg-green-500/30' },
                    { label: 'P90', value: p.p90, color: 'bg-green-500/40' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className={`flex flex-1 h-full items-center justify-center ${color}`}>
                      <span className="text-xs text-muted-foreground font-mono">
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
