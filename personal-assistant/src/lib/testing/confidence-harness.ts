import type { ConfidenceScenario } from './confidence-scenarios'
import { AWU_SCENARIOS } from './confidence-scenarios'
import { routeByConfidence, getAgentThresholds } from '../agent/confidence-router'
import type { ConfidenceDecision, ModelTier } from '@/lib/bitbit-core'

// --- Model Tier Analysis ---

export interface ModelTierStats {
  accuracy: number
  falsePositives: number
  falsePositiveRate: number
  decisionChanges: number
}

export interface ModelTierAnalysis {
  byTier: Record<ModelTier, ModelTierStats>
  stabilityScore: number
  riskyCases: Array<{
    scenarioId: string
    description: string
    haikuDecision: ConfidenceDecision
    sonnetDecision: ConfidenceDecision
    opusDecision: ConfidenceDecision
    baseConfidence: number
  }>
}

/**
 * Tier-specific jitter adjustments simulating model precision differences.
 * Haiku: less precise (wider variance), Sonnet: baseline, Opus: most precise.
 */
const TIER_JITTERS: Record<ModelTier, { min: number; max: number }> = {
  haiku: { min: -0.05, max: 0.05 },
  sonnet: { min: 0, max: 0 },
  opus: { min: -0.02, max: 0.02 },
}

function applyTierJitter(confidence: number, tier: ModelTier, scenarioIndex: number): number {
  const jitter = TIER_JITTERS[tier]
  // Deterministic jitter based on scenario index for reproducibility
  // Use a simple spread across the jitter range
  const spread = jitter.min + ((scenarioIndex % 7) / 6) * (jitter.max - jitter.min)
  return Math.max(0, Math.min(1, confidence + spread))
}

/**
 * Simulate how different model tiers affect confidence scoring.
 * Haiku has wider variance, Sonnet is baseline, Opus is most precise.
 */
export function analyzeModelTierBehavior(scenarios: ConfidenceScenario[]): ModelTierAnalysis {
  const tiers: ModelTier[] = ['haiku', 'sonnet', 'opus']
  const tierDecisions: Record<ModelTier, ConfidenceDecision[]> = {
    haiku: [],
    sonnet: [],
    opus: [],
  }

  const byTier: Record<ModelTier, ModelTierStats> = {
    haiku: { accuracy: 0, falsePositives: 0, falsePositiveRate: 0, decisionChanges: 0 },
    sonnet: { accuracy: 0, falsePositives: 0, falsePositiveRate: 0, decisionChanges: 0 },
    opus: { accuracy: 0, falsePositives: 0, falsePositiveRate: 0, decisionChanges: 0 },
  }

  // Run each tier
  for (const tier of tiers) {
    let correct = 0
    let fp = 0
    let changes = 0

    for (let i = 0; i < scenarios.length; i++) {
      const scenario = scenarios[i]
      const adjustedConfidence = applyTierJitter(scenario.confidenceScore, tier, i)
      const thresholds = getAgentThresholds(scenario.agentType)
      const result = routeByConfidence(adjustedConfidence, thresholds)
      tierDecisions[tier].push(result.decision)

      if (result.decision === scenario.expectedDecision) correct++
      if (result.decision === 'act' && scenario.expectedDecision !== 'act') fp++

      // Compare to baseline (Sonnet, no jitter)
      const baseResult = routeByConfidence(scenario.confidenceScore, thresholds)
      if (result.decision !== baseResult.decision) changes++
    }

    byTier[tier].accuracy = scenarios.length > 0 ? correct / scenarios.length : 0
    byTier[tier].falsePositives = fp
    byTier[tier].falsePositiveRate = scenarios.length > 0 ? fp / scenarios.length : 0
    byTier[tier].decisionChanges = changes
  }

  // Stability: % of scenarios where all 3 tiers agree
  let agreeCount = 0
  for (let i = 0; i < scenarios.length; i++) {
    if (
      tierDecisions.haiku[i] === tierDecisions.sonnet[i] &&
      tierDecisions.sonnet[i] === tierDecisions.opus[i]
    ) {
      agreeCount++
    }
  }
  const stabilityScore = scenarios.length > 0 ? agreeCount / scenarios.length : 0

  // Risky cases: Haiku says 'act' but Sonnet or Opus say 'ask' or 'escalate'
  const riskyCases: ModelTierAnalysis['riskyCases'] = []
  for (let i = 0; i < scenarios.length; i++) {
    if (
      tierDecisions.haiku[i] === 'act' &&
      (tierDecisions.sonnet[i] !== 'act' || tierDecisions.opus[i] !== 'act')
    ) {
      riskyCases.push({
        scenarioId: scenarios[i].id,
        description: scenarios[i].description,
        haikuDecision: tierDecisions.haiku[i],
        sonnetDecision: tierDecisions.sonnet[i],
        opusDecision: tierDecisions.opus[i],
        baseConfidence: scenarios[i].confidenceScore,
      })
    }
  }

  return { byTier, stabilityScore, riskyCases }
}

// --- False Positive Analysis ---

export interface FalsePositiveAnalysis {
  totalAutoActions: number
  incorrectAutoActions: number
  falsePositiveRate: number
  details: Array<{
    scenarioId: string
    agentType: string
    confidence: number
    expectedDecision: ConfidenceDecision
    description: string
  }>
  recommendation: string
}

/**
 * Extract detailed false positive analysis from a harness report.
 * Uses the original scenarios to provide full context on each false positive.
 */
export function measureFalsePositives(
  report: ConfidenceHarnessReport,
  scenarios?: ConfidenceScenario[],
): FalsePositiveAnalysis {
  const dataset = scenarios ?? AWU_SCENARIOS

  // Count total auto-actions (scenarios where routing decided 'act')
  let totalAutoActions = 0
  const details: FalsePositiveAnalysis['details'] = []

  for (const scenario of dataset) {
    const thresholds = getAgentThresholds(scenario.agentType)
    const result = routeByConfidence(scenario.confidenceScore, thresholds)

    if (result.decision === 'act') {
      totalAutoActions++

      if (scenario.expectedDecision !== 'act') {
        details.push({
          scenarioId: scenario.id,
          agentType: scenario.agentType,
          confidence: scenario.confidenceScore,
          expectedDecision: scenario.expectedDecision,
          description: scenario.description,
        })
      }
    }
  }

  const incorrectAutoActions = details.length
  const falsePositiveRate = totalAutoActions > 0 ? incorrectAutoActions / totalAutoActions : 0

  const pct = (falsePositiveRate * 100).toFixed(1)
  const recommendation =
    falsePositiveRate < 0.05
      ? `PASS: FP rate ${pct}% below 5% threshold`
      : `FAIL: FP rate ${pct}% exceeds 5% threshold`

  return {
    totalAutoActions,
    incorrectAutoActions,
    falsePositiveRate,
    details,
    recommendation,
  }
}

export interface ConfidenceHarnessReport {
  totalScenarios: number
  correct: number
  accuracy: number
  byAgent: Record<string, { total: number; correct: number; accuracy: number }>
  byCategory: Record<string, { total: number; correct: number; accuracy: number }>
  falsePositives: number
  falsePositiveRate: number
  misses: Array<{
    scenarioId: string
    expected: string
    actual: string
    confidence: number
  }>
  runAt: string
}

/**
 * Run all scenarios through per-agent-type confidence routing and compare
 * predicted decisions against expected human judgment.
 */
export function runConfidenceHarness(
  scenarios?: ConfidenceScenario[],
): ConfidenceHarnessReport {
  const dataset = scenarios ?? AWU_SCENARIOS

  let correct = 0
  let falsePositives = 0
  const misses: ConfidenceHarnessReport['misses'] = []

  const byAgent: Record<string, { total: number; correct: number; accuracy: number }> = {}
  const byCategory: Record<string, { total: number; correct: number; accuracy: number }> = {}

  for (const scenario of dataset) {
    const thresholds = getAgentThresholds(scenario.agentType)
    const result = routeByConfidence(scenario.confidenceScore, thresholds)
    const actual: ConfidenceDecision = result.decision
    const expected = scenario.expectedDecision
    const isCorrect = actual === expected

    if (isCorrect) {
      correct++
    } else {
      misses.push({
        scenarioId: scenario.id,
        expected,
        actual,
        confidence: scenario.confidenceScore,
      })
    }

    // False positive: predicted 'act' when expected 'ask' or 'escalate'
    if (actual === 'act' && expected !== 'act') {
      falsePositives++
    }

    // Tally by agent type
    if (!byAgent[scenario.agentType]) {
      byAgent[scenario.agentType] = { total: 0, correct: 0, accuracy: 0 }
    }
    byAgent[scenario.agentType].total++
    if (isCorrect) byAgent[scenario.agentType].correct++

    // Tally by category
    if (!byCategory[scenario.category]) {
      byCategory[scenario.category] = { total: 0, correct: 0, accuracy: 0 }
    }
    byCategory[scenario.category].total++
    if (isCorrect) byCategory[scenario.category].correct++
  }

  // Compute accuracy ratios
  for (const key of Object.keys(byAgent)) {
    const g = byAgent[key]
    g.accuracy = g.total > 0 ? g.correct / g.total : 0
  }
  for (const key of Object.keys(byCategory)) {
    const g = byCategory[key]
    g.accuracy = g.total > 0 ? g.correct / g.total : 0
  }

  const totalScenarios = dataset.length
  const accuracy = totalScenarios > 0 ? correct / totalScenarios : 0
  const falsePositiveRate = totalScenarios > 0 ? falsePositives / totalScenarios : 0

  return {
    totalScenarios,
    correct,
    accuracy,
    byAgent,
    byCategory,
    falsePositives,
    falsePositiveRate,
    misses,
    runAt: new Date().toISOString(),
  }
}

/**
 * Format a harness report as a human-readable summary table.
 */
export function formatHarnessReport(report: ConfidenceHarnessReport): string {
  const lines: string[] = []

  lines.push('=== Confidence Routing Harness Report ===')
  lines.push(`Run at: ${report.runAt}`)
  lines.push('')
  lines.push(`Total scenarios: ${report.totalScenarios}`)
  lines.push(`Correct: ${report.correct}`)
  lines.push(`Accuracy: ${(report.accuracy * 100).toFixed(1)}%`)
  lines.push(`False positives: ${report.falsePositives} (${(report.falsePositiveRate * 100).toFixed(1)}%)`)
  lines.push('')

  // By agent type
  lines.push('--- By Agent Type ---')
  lines.push(padRow('Agent', 'Total', 'Correct', 'Accuracy'))
  lines.push('-'.repeat(52))
  for (const [agent, stats] of Object.entries(report.byAgent).sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(padRow(agent, String(stats.total), String(stats.correct), `${(stats.accuracy * 100).toFixed(0)}%`))
  }
  lines.push('')

  // By category
  lines.push('--- By Category ---')
  lines.push(padRow('Category', 'Total', 'Correct', 'Accuracy'))
  lines.push('-'.repeat(52))
  for (const [cat, stats] of Object.entries(report.byCategory).sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(padRow(cat, String(stats.total), String(stats.correct), `${(stats.accuracy * 100).toFixed(0)}%`))
  }
  lines.push('')

  // Misses
  if (report.misses.length > 0) {
    lines.push('--- Misses ---')
    for (const miss of report.misses) {
      lines.push(`  ${miss.scenarioId}: expected=${miss.expected}, actual=${miss.actual}, confidence=${miss.confidence}`)
    }
  } else {
    lines.push('--- No Misses ---')
  }

  return lines.join('\n')
}

function padRow(col1: string, col2: string, col3: string, col4: string): string {
  return `${col1.padEnd(22)} ${col2.padStart(5)} ${col3.padStart(7)} ${col4.padStart(10)}`
}
