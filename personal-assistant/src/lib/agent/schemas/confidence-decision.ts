/**
 * ConfidenceDecision Schema — structured output for confidence routing.
 *
 * When Claude needs to decide whether to act, ask, or escalate,
 * this schema ensures a validated decision with reasoning.
 */

import { z } from 'zod'

/**
 * ConfidenceDecisionOutput: the structured output from a confidence decision.
 *
 * Maps to the ConfidenceDecision type from bitbit-core but with
 * full reasoning and supporting evidence.
 */
export const ConfidenceDecisionSchema = z.object({
  /** The routing decision */
  route: z.enum(['act', 'ask', 'escalate']),
  /** Confidence score for the decision (0-1) */
  confidence: z.number().min(0).max(1),
  /** Why this route was chosen */
  reasoning: z.string(),
  /** What information is missing (relevant for 'ask' and 'escalate') */
  missing_context: z.array(z.string()).optional(),
  /** Risk factors considered */
  risk_factors: z.array(z.string()).optional(),
})

export type ConfidenceDecisionOutput = z.infer<typeof ConfidenceDecisionSchema>
