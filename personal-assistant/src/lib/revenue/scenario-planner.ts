/**
 * Scenario Planner
 *
 * Models "what-if" scenarios using Monte Carlo simulation:
 * - Rate changes: "What if I raise rates 15%?"
 * - Client churn: "What if I lose Client X?"
 * - Capacity changes: "What if I hire another developer?"
 * - New clients: "What if I land a $5k/mo client?"
 *
 * Uses client churn probability and historical data to produce
 * probability-weighted outcomes (P10, P50, P90).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type {
  RevenueScenario,
  ScenarioParams,
  ScenarioType,
  ClientRevenueScore,
} from './types'

// ─── Monte Carlo Configuration ──────────────────────────────────────────────

const DEFAULT_SIMULATION_RUNS = 1000
const ANNUAL_MONTHS = 12

// ─── Random Number Generation ───────────────────────────────────────────────

/**
 * Simple seeded PRNG for reproducible simulations.
 * Uses a linear congruential generator.
 */
function createRng(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) & 0x7fffffff
    return state / 0x7fffffff
  }
}

/**
 * Box-Muller transform for normal distribution.
 */
function normalRandom(rng: () => number, mean: number, stddev: number): number {
  const u1 = rng()
  const u2 = rng()
  const z = Math.sqrt(-2 * Math.log(Math.max(u1, 0.0001))) * Math.cos(2 * Math.PI * u2)
  return mean + z * stddev
}

// ─── Simulation Functions ───────────────────────────────────────────────────

interface SimulationInput {
  baselineAnnualCents: number
  clientScores: ClientRevenueScore[]
  params: ScenarioParams
  runs: number
}

interface SimulationResult {
  results: number[]
  p10: number
  p50: number
  p90: number
  mean: number
  stddev: number
}

/**
 * Run Monte Carlo simulation for a scenario.
 */
function runSimulation(input: SimulationInput): SimulationResult {
  const { baselineAnnualCents, clientScores, params, runs } = input
  const rng = createRng(Date.now())
  const results: number[] = []

  for (let i = 0; i < runs; i++) {
    let projectedCents = 0

    switch (params.type) {
      case 'rate_change': {
        const changeMultiplier = 1 + (params.rate_change_pct / 100)
        const targetClients = params.apply_to_clients ?? clientScores.map(c => c.contact_id)

        for (const client of clientScores) {
          const isTarget = targetClients.includes(client.contact_id)
          const annualRevenue = client.total_revenue_cents > 0
            ? client.total_revenue_cents
            : client.revenue_last_90d_cents * 4

          if (isTarget) {
            // Churn risk increases with rate hike
            const churnRisk = estimateChurnRisk(client, params.rate_change_pct)
            const churns = rng() < churnRisk

            if (churns) {
              // Client churns — partial year revenue
              const monthsBeforeChurn = Math.max(1, Math.round(normalRandom(rng, 3, 1)))
              projectedCents += Math.round(annualRevenue * changeMultiplier * (monthsBeforeChurn / ANNUAL_MONTHS))
            } else {
              projectedCents += Math.round(annualRevenue * changeMultiplier)
            }
          } else {
            projectedCents += annualRevenue
          }
        }
        break
      }

      case 'client_churn': {
        for (const client of clientScores) {
          const isChurnTarget = params.client_ids.includes(client.contact_id)
          const annualRevenue = client.total_revenue_cents > 0
            ? client.total_revenue_cents
            : client.revenue_last_90d_cents * 4

          if (isChurnTarget) {
            const churnProb = params.churn_probability ?? 0.8
            const churns = rng() < churnProb
            if (!churns) {
              projectedCents += annualRevenue
            }
          } else {
            projectedCents += annualRevenue
          }
        }
        break
      }

      case 'capacity_change': {
        // More capacity = potential to take on more work
        // Model as revenue increase proportional to capacity increase
        const utilizationRate = 0.75 + normalRandom(rng, 0, 0.1)
        const hourlyRate = baselineAnnualCents > 0 && clientScores.length > 0
          ? baselineAnnualCents / (clientScores.length * 1600) // ~1600 billable hrs/year
          : 15000 // $150/hr default

        const additionalRevenue = Math.round(
          params.hours_delta * hourlyRate * utilizationRate * ANNUAL_MONTHS / 12
        )

        projectedCents = baselineAnnualCents + additionalRevenue
        break
      }

      case 'new_client': {
        // New client with probability of closing
        const closes = rng() < params.probability
        const monthlyVariation = normalRandom(rng, 1, 0.15)
        const annualNewRevenue = closes
          ? Math.round(params.estimated_monthly_revenue_cents * ANNUAL_MONTHS * Math.max(0.5, monthlyVariation))
          : 0

        projectedCents = baselineAnnualCents + annualNewRevenue
        break
      }

      case 'custom': {
        const variation = normalRandom(rng, 1, 0.1)
        projectedCents = baselineAnnualCents + Math.round(params.revenue_impact_cents * Math.max(0.5, variation))
        break
      }
    }

    results.push(Math.max(0, projectedCents))
  }

  // Sort for percentile calculation
  results.sort((a, b) => a - b)

  const p10Index = Math.floor(results.length * 0.1)
  const p50Index = Math.floor(results.length * 0.5)
  const p90Index = Math.floor(results.length * 0.9)

  const mean = Math.round(results.reduce((a, b) => a + b, 0) / results.length)
  const variance = results.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / results.length

  return {
    results,
    p10: results[p10Index],
    p50: results[p50Index],
    p90: results[p90Index],
    mean,
    stddev: Math.round(Math.sqrt(variance)),
  }
}

/**
 * Estimate churn risk when raising rates.
 * Higher risk for at-risk clients, lower for loyal high-scoring clients.
 */
function estimateChurnRisk(client: ClientRevenueScore, rateChangePct: number): number {
  // Base churn probability from rate increase
  const baseChurn = Math.max(0, rateChangePct) / 100 * 0.3 // 15% rate hike → 4.5% base churn

  // Adjust by client risk
  const riskMultiplier = {
    low: 0.5,
    medium: 1.0,
    high: 1.5,
    critical: 2.5,
  }[client.risk_level]

  // Adjust by score (high score = lower churn risk)
  const scoreAdjustment = (100 - client.overall_score) / 100 * 0.1

  return Math.min(0.95, baseChurn * riskMultiplier + scoreAdjustment)
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Create and compute a scenario.
 */
export async function computeScenario(
  supabase: SupabaseClient,
  orgId: string,
  input: {
    name: string
    description?: string
    scenarioType: ScenarioType
    parameters: ScenarioParams
    runs?: number
    createdBy?: string
  },
): Promise<RevenueScenario | null> {
  try {
    // Get current client scores for simulation
    const { data: clientScores } = await supabase
      .from('client_revenue_scores')
      .select('*')
      .eq('org_id', orgId)

    const scores = (clientScores ?? []) as ClientRevenueScore[]

    // Calculate baseline annual revenue
    const baselineAnnualCents = scores.reduce((sum, c) => {
      const annual = c.total_revenue_cents > 0
        ? c.total_revenue_cents
        : c.revenue_last_90d_cents * 4
      return sum + annual
    }, 0)

    // Run simulation
    const simulation = runSimulation({
      baselineAnnualCents,
      clientScores: scores,
      params: input.parameters,
      runs: input.runs ?? DEFAULT_SIMULATION_RUNS,
    })

    // Build impact summary
    const deltaCents = simulation.p50 - baselineAnnualCents
    const deltaPct = baselineAnnualCents > 0
      ? Math.round((deltaCents / baselineAnnualCents) * 10000) / 100
      : 0

    const direction = deltaCents > 0 ? 'increase' : deltaCents < 0 ? 'decrease' : 'no change'
    const impactSummary = `Projected ${direction} of $${Math.abs(deltaCents / 100).toFixed(2)} (${deltaPct > 0 ? '+' : ''}${deltaPct}%) in annual revenue. P10: $${(simulation.p10 / 100).toFixed(2)}, P50: $${(simulation.p50 / 100).toFixed(2)}, P90: $${(simulation.p90 / 100).toFixed(2)}.`

    // Determine affected clients
    const affectedClients = input.parameters.type === 'client_churn'
      ? input.parameters.client_ids
      : input.parameters.type === 'rate_change' && input.parameters.apply_to_clients
        ? input.parameters.apply_to_clients
        : scores.map(c => c.contact_id)

    // Risk factors
    const riskFactors: string[] = []
    if (deltaPct < -10) riskFactors.push('Significant revenue decrease projected')
    if (simulation.stddev > baselineAnnualCents * 0.3) riskFactors.push('High uncertainty in projections')
    if (input.parameters.type === 'rate_change' && input.parameters.rate_change_pct > 20) {
      riskFactors.push('Rate increase exceeds 20% — elevated churn risk')
    }

    // Save scenario
    const scenario: Omit<RevenueScenario, 'id' | 'created_at' | 'updated_at'> = {
      org_id: orgId,
      name: input.name,
      description: input.description ?? null,
      scenario_type: input.scenarioType,
      parameters: input.parameters,
      baseline_revenue_cents: baselineAnnualCents,
      projected_revenue_cents: simulation.p50,
      revenue_delta_cents: deltaCents,
      revenue_delta_pct: deltaPct,
      simulation_runs: input.runs ?? DEFAULT_SIMULATION_RUNS,
      p10_revenue_cents: simulation.p10,
      p50_revenue_cents: simulation.p50,
      p90_revenue_cents: simulation.p90,
      impact_summary: impactSummary,
      affected_clients: affectedClients,
      risk_factors: riskFactors,
      status: 'computed',
      computed_at: new Date().toISOString(),
      created_by: input.createdBy ?? null,
    }

    const { data, error } = await supabase
      .from('revenue_scenarios')
      .insert(scenario)
      .select('*')
      .single()

    if (error) {
      logger.error('[scenario-planner] Failed to save scenario', { error: error.message })
      return null
    }

    logger.info('[scenario-planner] Scenario computed', {
      orgId,
      name: input.name,
      type: input.scenarioType,
      deltaPct,
    })

    return data as RevenueScenario
  } catch (err) {
    logger.error('[scenario-planner] Failed to compute scenario', {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Get saved scenarios for an org.
 */
export async function getScenarios(
  supabase: SupabaseClient,
  orgId: string,
  options: { status?: string[]; limit?: number } = {},
): Promise<RevenueScenario[]> {
  let query = supabase
    .from('revenue_scenarios')
    .select('*')
    .eq('org_id', orgId)

  if (options.status && options.status.length > 0) {
    query = query.in('status', options.status)
  }

  query = query
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 20)

  const { data, error } = await query

  if (error) {
    logger.warn('[scenario-planner] Failed to get scenarios', { error: error.message })
    return []
  }

  return (data ?? []) as RevenueScenario[]
}
