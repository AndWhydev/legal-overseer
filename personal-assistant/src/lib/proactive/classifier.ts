/**
 * Proactive Signal Classifier — Decision Engine
 *
 * Takes accumulated intelligence signals and determines if BitBit should act.
 * Uses generateObject() with a Zod schema to get structured decisions from
 * the LLM. Respects autonomy levels from src/lib/intelligence/autonomy-levels.ts.
 *
 * Uses models.fast (Haiku) to keep costs low on high-volume signal classification.
 *
 * @module proactive/classifier
 */

import { generateObject } from 'ai'
import { z } from 'zod'
import { models } from '@/lib/ai'
import { logger } from '@/lib/core/logger'
import type { ProactiveSignal, ProactiveDecision, OrgProactiveConfig } from './types'

// ---------------------------------------------------------------------------
// Zod Schemas for LLM structured output
// ---------------------------------------------------------------------------

const decisionSchema = z.object({
  shouldAct: z
    .boolean()
    .describe('Whether BitBit should take proactive action based on these signals'),
  action: z
    .enum([
      'alert_user',
      'draft_message',
      'create_task',
      'update_contact',
      'flag_risk',
      'suggest_opportunity',
      'send_digest',
      'none',
    ])
    .describe('What type of proactive action to take'),
  confidence: z
    .number()
    .describe('Confidence score between 0 and 1 that this action is appropriate'),
  reasoning: z
    .string()
    .describe('Brief explanation of why this action was chosen'),
  urgency: z
    .enum(['immediate', 'today', 'this_week', 'whenever'])
    .describe('How urgently should this be acted on'),
  channel: z
    .enum(['chat_whisper', 'email_digest', 'push_notification', 'whatsapp', 'sms'])
    .optional()
    .describe('Preferred delivery channel for this action'),
})

// ---------------------------------------------------------------------------
// Autonomy Level Mapping
// ---------------------------------------------------------------------------

/**
 * Map action + confidence + urgency to the appropriate autonomy level.
 *
 * The autonomy level determines HOW the action is executed:
 *   L4 (4) = Act Silently — low-risk, execute without asking
 *   L3 (3) = Act + Notify — execute and send notification
 *   L2 (2) = Propose First — suggest, wait for confirmation
 *   L1 (1) = Always Ask — require explicit approval
 *
 * Higher confidence + higher urgency → higher autonomy (more autonomous).
 * Lower confidence or lower urgency → lower autonomy (more cautious).
 */
function mapAutonomyLevel(
  action: string,
  confidence: number,
  urgency: string,
  config: OrgProactiveConfig,
): 1 | 2 | 3 | 4 {
  // Actions that are always low-risk → L4 silent
  const silentActions = ['update_contact', 'flag_risk']
  if (silentActions.includes(action) && confidence >= config.minConfidenceForAutoAction) {
    return 4
  }

  // Actions that are always high-risk → L1 always ask
  const alwaysAskActions = ['draft_message']
  if (alwaysAskActions.includes(action)) {
    // Even high confidence draft messages should be proposed, not auto-sent
    return confidence >= config.minConfidenceForAutoAction ? 2 : 1
  }

  // High confidence + immediate/today urgency → L3 act + notify
  if (confidence >= config.minConfidenceForAutoAction && (urgency === 'immediate' || urgency === 'today')) {
    return 3
  }

  // Medium confidence or lower urgency → L2 propose
  if (confidence >= config.minConfidenceForSuggestion) {
    return 2
  }

  // Low confidence → L1 always ask
  return 1
}

// ---------------------------------------------------------------------------
// Main Classifier
// ---------------------------------------------------------------------------

/**
 * Classify an array of proactive signals to determine what actions BitBit
 * should take. Batches signals into a single LLM call for efficiency.
 *
 * @param signals - Accumulated intelligence signals
 * @param orgConfig - Per-org proactive configuration
 * @returns Array of decisions (may be empty if no action warranted)
 */
export async function classifySignals(
  signals: ProactiveSignal[],
  orgConfig: OrgProactiveConfig,
): Promise<ProactiveDecision[]> {
  if (signals.length === 0) {
    return []
  }

  // Group signals by type for more coherent analysis
  const signalGroups = groupSignalsByType(signals)
  const decisions: ProactiveDecision[] = []

  for (const [signalType, groupedSignals] of Object.entries(signalGroups)) {
    try {
      const decision = await classifySignalGroup(signalType, groupedSignals, orgConfig)
      if (decision.shouldAct) {
        decisions.push(decision)
      }
    } catch (err) {
      logger.error(`[proactive/classifier] Failed to classify signal group "${signalType}"`, {
        error: err instanceof Error ? err.message : String(err),
        signalCount: groupedSignals.length,
      })
      // Continue processing other groups — don't let one failure block all
    }
  }

  return decisions
}

/**
 * Classify a group of related signals (same type) into a single decision.
 */
async function classifySignalGroup(
  signalType: string,
  signals: ProactiveSignal[],
  orgConfig: OrgProactiveConfig,
): Promise<ProactiveDecision> {
  const signalSummary = signals.map((s, i) => {
    const dataStr = Object.entries(s.data)
      .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(', ')
    return `Signal ${i + 1} [${s.severity}] from ${s.source}: ${dataStr}`
  }).join('\n')

  const maxSeverity = getMaxSeverity(signals)

  const systemPrompt = `You are BitBit's proactive intelligence engine. Your job is to analyze accumulated signals and decide if autonomous action is warranted.

RULES:
- Only recommend action when the signals clearly warrant it
- Be conservative: false positives cause alert fatigue
- Critical/high severity signals with clear actionability → shouldAct: true
- Vague or low-severity signals → shouldAct: false (or send_digest at most)
- Consider signal recency: older signals are less actionable
- If multiple signals point to the same issue, that increases confidence
- "none" action means no action needed right now

URGENCY MAPPING:
- "immediate": requires attention within minutes (e.g., payment failure, system down)
- "today": should be handled today (e.g., overdue invoice, hot lead)
- "this_week": can wait a few days (e.g., follow-up reminder)
- "whenever": informational, no time pressure (e.g., contact update)`

  const userPrompt = `Analyze these ${signals.length} "${signalType}" signal(s) and decide if proactive action is needed:

${signalSummary}

Maximum severity in this group: ${maxSeverity}
Earliest signal: ${signals[0].timestamp}
Latest signal: ${signals[signals.length - 1].timestamp}`

  const { object } = await generateObject({
    model: models.fast,
    schema: decisionSchema,
    system: systemPrompt,
    prompt: userPrompt,
  })

  // Map to autonomy level based on confidence and urgency
  const autonomyLevel = mapAutonomyLevel(
    object.action,
    object.confidence,
    object.urgency,
    orgConfig,
  )

  return {
    shouldAct: object.shouldAct,
    action: object.action,
    confidence: object.confidence,
    reasoning: object.reasoning,
    urgency: object.urgency,
    channel: object.channel,
    autonomyLevel,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupSignalsByType(signals: ProactiveSignal[]): Record<string, ProactiveSignal[]> {
  const groups: Record<string, ProactiveSignal[]> = {}
  for (const signal of signals) {
    if (!groups[signal.type]) {
      groups[signal.type] = []
    }
    groups[signal.type].push(signal)
  }
  return groups
}

function getMaxSeverity(signals: ProactiveSignal[]): string {
  const severityRank: Record<string, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  }
  let max = 'low'
  let maxRank = 0
  for (const s of signals) {
    const rank = severityRank[s.severity] ?? 0
    if (rank > maxRank) {
      maxRank = rank
      max = s.severity
    }
  }
  return max
}
