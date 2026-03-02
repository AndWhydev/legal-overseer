import type { ConfidenceScenario } from './confidence-scenarios'
import { AWU_SCENARIOS } from './confidence-scenarios'
import { routeByConfidence, getAgentThresholds } from '../agent/confidence-router'
import type { ConfidenceDecision } from '@/lib/bitbit-core'

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
