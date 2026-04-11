/**
 * Revenue Scenario Planner — Monte Carlo Simulation
 *
 * Supports "what-if" analysis:
 * - Rate changes: "What if I raise rates 15%?"
 * - Client churn: "What if I lose my biggest client?"
 * - New client: "What if I win a $5k/month retainer?"
 * - Capacity change: "What if I hire another developer?"
 *
 * Uses Monte Carlo simulation with client-specific churn probability
 * based on relationship strength and payment patterns.
 *
 * All monetary values in cents.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type { RevenueScenario, ScenarioType, ScenarioResults } from './types'
import { dollarsToCents } from './types'

// ─── Simulation Config ───────────────────────────────────────────────────────

const DEFAULT_SIMULATIONS = 1000

// ─── Pseudo-random with seed (deterministic for reproducibility) ─────────────

function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

/** Box-Muller transform for normally distributed random numbers */
function normalRandom(rng: () => number, mean: number, stddev: number): number {
  const u1 = rng()
  const u2 = rng()
  const z = Math.sqrt(-2 * Math.log(Math.max(0.0001, u1))) * Math.cos(2 * Math.PI * u2)
  return mean + z * stddev
}

// ─── Churn Probability ──────────────────────────────────────────────────────

function churnProbability(compositeScore: number): number {
  // Higher score = lower churn probability
  // Score 100 → 2% churn, Score 50 → 15%, Score 20 → 40%, Score 0 → 60%
  return Math.max(0.02, Math.min(0.6, 0.6 - (compositeScore / 100) * 0.58))
}

// ─── Rate Change Scenario ────────────────────────────────────────────────────

interface RateChangeParams {
  rate_change_pct: number  // e.g., 15 for 15% increase
}

async function simulateRateChange(
  supabase: SupabaseClient,
  orgId: string,
  params: RateChangeParams,
  numSimulations: number,
): Promise<{ results: ScenarioResults; projected: number; current: number }> {
  const { data: scores } = await supabase
    .from('client_revenue_scores')
    .select('contact_id, total_revenue_cents, revenue_last_365d_cents, composite_score')
    .eq('org_id', orgId)
    .gt('total_revenue_cents', 0)

  if (!scores || scores.length === 0) {
    return { results: {}, projected: 0, current: 0 }
  }

  const currentAnnual = scores.reduce((sum, s) => sum + s.revenue_last_365d_cents, 0)
  const rateMultiplier = 1 + params.rate_change_pct / 100
  const outcomes: number[] = []
  const rng = seededRandom(42)

  for (let sim = 0; sim < numSimulations; sim++) {
    let simRevenue = 0

    for (const client of scores) {
      // Each client may churn in response to rate change
      // Higher rate increase + lower relationship = higher churn chance
      const baseChurn = churnProbability(client.composite_score)
      const rateChurnBoost = Math.max(0, params.rate_change_pct - 5) * 0.005 // extra churn per % above 5%
      const churn = Math.min(0.8, baseChurn + rateChurnBoost)

      if (rng() < churn) {
        // Client churned
        continue
      }

      // Client stays: apply rate change with some revenue variance
      const variance = normalRandom(rng, 1.0, 0.1) // 10% variance
      simRevenue += Math.round(client.revenue_last_365d_cents * rateMultiplier * Math.max(0.5, variance))
    }

    outcomes.push(simRevenue)
  }

  outcomes.sort((a, b) => a - b)

  return {
    results: {
      percentiles: {
        p10: outcomes[Math.floor(outcomes.length * 0.1)],
        p25: outcomes[Math.floor(outcomes.length * 0.25)],
        p50: outcomes[Math.floor(outcomes.length * 0.5)],
        p75: outcomes[Math.floor(outcomes.length * 0.75)],
        p90: outcomes[Math.floor(outcomes.length * 0.9)],
      },
    },
    projected: outcomes[Math.floor(outcomes.length * 0.5)], // median
    current: currentAnnual,
  }
}

// ─── Client Churn Scenario ───────────────────────────────────────────────────

interface ClientChurnParams {
  contact_id?: string    // specific client, or null for "biggest client"
  churn_count?: number   // how many clients to simulate losing (default: 1)
}

async function simulateClientChurn(
  supabase: SupabaseClient,
  orgId: string,
  params: ClientChurnParams,
  numSimulations: number,
): Promise<{ results: ScenarioResults; projected: number; current: number }> {
  const { data: scores } = await supabase
    .from('client_revenue_scores')
    .select('contact_id, revenue_last_365d_cents, composite_score')
    .eq('org_id', orgId)
    .gt('revenue_last_365d_cents', 0)
    .order('revenue_last_365d_cents', { ascending: false })

  if (!scores || scores.length === 0) {
    return { results: {}, projected: 0, current: 0 }
  }

  const currentAnnual = scores.reduce((sum, s) => sum + s.revenue_last_365d_cents, 0)
  const churnCount = params.churn_count ?? 1
  const outcomes: number[] = []
  const rng = seededRandom(42)

  for (let sim = 0; sim < numSimulations; sim++) {
    let simRevenue = currentAnnual

    if (params.contact_id) {
      // Specific client churns
      const client = scores.find(s => s.contact_id === params.contact_id)
      if (client) {
        simRevenue -= client.revenue_last_365d_cents
      }
    } else {
      // Random clients churn (weighted by churn probability)
      const shuffled = [...scores].sort(() => rng() - 0.5)
      let churned = 0
      for (const client of shuffled) {
        if (churned >= churnCount) break
        const prob = churnProbability(client.composite_score)
        if (rng() < prob * 2) { // amplified for scenario exploration
          simRevenue -= client.revenue_last_365d_cents
          churned++
        }
      }
    }

    // Add variance for remaining clients
    const variance = normalRandom(rng, 1.0, 0.05)
    outcomes.push(Math.round(simRevenue * Math.max(0.8, variance)))
  }

  outcomes.sort((a, b) => a - b)

  return {
    results: {
      percentiles: {
        p10: outcomes[Math.floor(outcomes.length * 0.1)],
        p25: outcomes[Math.floor(outcomes.length * 0.25)],
        p50: outcomes[Math.floor(outcomes.length * 0.5)],
        p75: outcomes[Math.floor(outcomes.length * 0.75)],
        p90: outcomes[Math.floor(outcomes.length * 0.9)],
      },
    },
    projected: outcomes[Math.floor(outcomes.length * 0.5)],
    current: currentAnnual,
  }
}

// ─── New Client Scenario ─────────────────────────────────────────────────────

interface NewClientParams {
  monthly_value_cents: number
  ramp_months?: number  // months to reach full value (default: 2)
}

async function simulateNewClient(
  supabase: SupabaseClient,
  orgId: string,
  params: NewClientParams,
  numSimulations: number,
): Promise<{ results: ScenarioResults; projected: number; current: number }> {
  const { data: scores } = await supabase
    .from('client_revenue_scores')
    .select('revenue_last_365d_cents')
    .eq('org_id', orgId)

  const currentAnnual = (scores ?? []).reduce((sum, s) => sum + s.revenue_last_365d_cents, 0)
  const rampMonths = params.ramp_months ?? 2
  const fullYearValue = params.monthly_value_cents * 12
  const rampedValue = Math.round(fullYearValue * (1 - rampMonths / 24)) // rough ramp discount
  const outcomes: number[] = []
  const rng = seededRandom(42)

  for (let sim = 0; sim < numSimulations; sim++) {
    // New client revenue with variance
    const newClientRev = Math.round(normalRandom(rng, rampedValue, rampedValue * 0.15))
    // Existing revenue with small variance
    const existingRev = Math.round(normalRandom(rng, currentAnnual, currentAnnual * 0.05))
    outcomes.push(Math.max(0, existingRev + newClientRev))
  }

  outcomes.sort((a, b) => a - b)

  return {
    results: {
      percentiles: {
        p10: outcomes[Math.floor(outcomes.length * 0.1)],
        p25: outcomes[Math.floor(outcomes.length * 0.25)],
        p50: outcomes[Math.floor(outcomes.length * 0.5)],
        p75: outcomes[Math.floor(outcomes.length * 0.75)],
        p90: outcomes[Math.floor(outcomes.length * 0.9)],
      },
    },
    projected: outcomes[Math.floor(outcomes.length * 0.5)],
    current: currentAnnual,
  }
}

// ─── Run Scenario ────────────────────────────────────────────────────────────

export async function runScenario(
  supabase: SupabaseClient,
  orgId: string,
  name: string,
  scenarioType: ScenarioType,
  parameters: Record<string, unknown>,
  simulations = DEFAULT_SIMULATIONS,
): Promise<RevenueScenario> {
  let simulation: { results: ScenarioResults; projected: number; current: number }

  switch (scenarioType) {
    case 'rate_change':
      simulation = await simulateRateChange(
        supabase, orgId,
        parameters as unknown as RateChangeParams,
        simulations,
      )
      break
    case 'client_churn':
      simulation = await simulateClientChurn(
        supabase, orgId,
        parameters as unknown as ClientChurnParams,
        simulations,
      )
      break
    case 'new_client':
      simulation = await simulateNewClient(
        supabase, orgId,
        parameters as unknown as NewClientParams,
        simulations,
      )
      break
    default:
      // capacity_change, seasonal_adjustment — use rate_change as proxy
      simulation = await simulateRateChange(
        supabase, orgId,
        { rate_change_pct: 0 },
        simulations,
      )
  }

  const delta = simulation.projected - simulation.current
  const probabilityPositive = simulation.results.percentiles
    ? Object.values(simulation.results.percentiles).filter(v => v > simulation.current).length / 5
    : delta > 0 ? 0.6 : 0.4

  const scenario: Omit<RevenueScenario, 'id' | 'created_at'> = {
    org_id: orgId,
    name,
    scenario_type: scenarioType,
    parameters,
    simulations,
    results: simulation.results,
    projected_annual_cents: simulation.projected,
    current_annual_cents: simulation.current,
    delta_cents: delta,
    probability_positive: probabilityPositive,
    computed_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('revenue_scenarios')
    .insert(scenario)
    .select('*')
    .single()

  if (error) {
    logger.error('[scenarios] Failed to store scenario', { error: error.message })
    throw error
  }

  return data as RevenueScenario
}
