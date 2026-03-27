'use client'

import React, { useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useScenarios } from '@/hooks/use-revenue-data'
import { formatCents } from '@/lib/revenue/types'
import type { RevenueScenario } from '@/lib/revenue/types'

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
    <div className="flex flex-col gap-4">
      {/* Create button / form */}
      {!formOpen ? (
        <button
          className="self-start px-5 py-3 rounded-md border-none bg-primary text-primary-foreground text-sm font-medium cursor-pointer transition-opacity hover:opacity-80"
          onClick={() => setFormOpen(true)}
        >
          + New Scenario
        </button>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl bg-card backdrop-blur-lg p-5">
          <span className="text-sm font-medium text-foreground">
            Create What-If Scenario
          </span>

          <div>
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Scenario Name</span>
            <input
              className="w-full mt-1 px-3 py-2 rounded-md border-none bg-input text-foreground text-sm outline-none"
              placeholder="What if I raise rates 15%?"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div>
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Type</span>
            <Select value={type} onValueChange={v => setType(v)}>
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCENARIO_TYPES.map(st => (
                  <SelectItem key={st.value} value={st.value}>
                    {st.label} — {st.desc}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Type-specific fields */}
          {type === 'rate_change' && (
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Rate Change %</span>
              <input
                className="w-full mt-1 px-3 py-2 rounded-md border-none bg-input text-foreground text-sm outline-none"
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
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Est. Monthly Revenue ($)</span>
                <input
                  className="w-full mt-1 px-3 py-2 rounded-md border-none bg-input text-foreground text-sm outline-none"
                  type="number"
                  value={monthlyRevenue}
                  onChange={e => setMonthlyRevenue(Number(e.target.value))}
                />
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Probability (0-1)</span>
                <input
                  className="w-full mt-1 px-3 py-2 rounded-md border-none bg-input text-foreground text-sm outline-none"
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
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Hours Delta (per week)</span>
              <input
                className="w-full mt-1 px-3 py-2 rounded-md border-none bg-input text-foreground text-sm outline-none"
                type="number"
                value={hoursDelta}
                onChange={e => setHoursDelta(Number(e.target.value))}
              />
            </div>
          )}

          {type === 'custom' && (
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Revenue Impact ($)</span>
              <input
                className="w-full mt-1 px-3 py-2 rounded-md border-none bg-input text-foreground text-sm outline-none"
                type="number"
                value={revenueImpact}
                onChange={e => setRevenueImpact(Number(e.target.value))}
              />
            </div>
          )}

          <div className="flex gap-2">
            <button
              className="px-5 py-3 rounded-md border-none bg-primary text-primary-foreground text-sm font-medium cursor-pointer transition-opacity hover:opacity-80 disabled:opacity-60"
              onClick={handleSubmit}
              disabled={creating || !name.trim()}
            >
              {creating ? 'Computing...' : 'Run Simulation'}
            </button>
            <button
              className="px-5 py-3 rounded-md border-none bg-input text-muted-foreground text-sm font-medium cursor-pointer transition-opacity hover:opacity-80"
              onClick={() => setFormOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Existing Scenarios */}
      {loading ? (
        <div className="text-muted-foreground text-sm">Loading scenarios...</div>
      ) : scenarios.length === 0 ? (
        <div className="p-6 text-center text-muted-foreground text-sm rounded-lg bg-card">
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
  const deltaColor = isPositive ? 'text-green-500' : 'text-red-500'
  const deltaBg = isPositive ? 'bg-green-500/10' : 'bg-red-500/10'

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-card backdrop-blur-lg p-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-foreground">
          {scenario.name}
        </span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded uppercase ${deltaBg} ${deltaColor}`}>
          {isPositive ? '+' : ''}{scenario.revenue_delta_pct}%
        </span>
      </div>

      {/* Impact summary */}
      {scenario.impact_summary && (
        <div className="text-sm text-muted-foreground leading-relaxed">
          {scenario.impact_summary}
        </div>
      )}

      {/* Results grid */}
      <div className="grid grid-cols-3 gap-4 mt-1">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Baseline</span>
          <span className="text-base font-medium font-mono tracking-tight text-muted-foreground">
            {formatCents(scenario.baseline_revenue_cents ?? 0)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Projected (P50)</span>
          <span className={`text-base font-medium font-mono tracking-tight ${deltaColor}`}>
            {formatCents(scenario.p50_revenue_cents ?? 0)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Delta</span>
          <span className={`text-base font-medium font-mono tracking-tight ${deltaColor}`}>
            {isPositive ? '+' : ''}{formatCents(scenario.revenue_delta_cents ?? 0)}
          </span>
        </div>
      </div>

      {/* P10/P90 range */}
      <div className="flex gap-3 text-sm text-muted-foreground font-mono">
        <span>P10: {formatCents(scenario.p10_revenue_cents ?? 0)}</span>
        <span>P90: {formatCents(scenario.p90_revenue_cents ?? 0)}</span>
        <span>{scenario.simulation_runs} runs</span>
      </div>

      {/* Risk factors */}
      {scenario.risk_factors && scenario.risk_factors.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {scenario.risk_factors.map((rf, i) => (
            <span key={i} className="text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-500">
              {rf}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
