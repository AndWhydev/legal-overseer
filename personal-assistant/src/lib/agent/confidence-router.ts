import type { ConfidenceThresholds, ConfidenceDecision } from '@/lib/bitbit-core'
export type { ConfidenceThresholds, ConfidenceDecision }

export const DEFAULT_THRESHOLDS: ConfidenceThresholds = {
  act: 0.85,
  ask: 0.55,
}

/**
 * Per-agent threshold overrides reflecting risk profiles.
 * Higher-stakes agents (invoice, proposal, quote) require higher confidence to auto-act.
 * Lower-stakes agents (sentry, ad-script) can act with lower confidence.
 */
export const AGENT_THRESHOLDS: Record<string, ConfidenceThresholds> = {
  'invoice-flow': { act: 0.92, ask: 0.60 },     // High stakes: money leaves the business
  'lead-swarm': { act: 0.85, ask: 0.55 },        // Default: standard lead processing
  'sentry': { act: 0.75, ask: 0.45 },            // Low stakes: alerting, not acting
  'channel-triage': { act: 0.80, ask: 0.50 },    // Medium: routing decisions
  'client-comms': { act: 0.88, ask: 0.58 },      // High: sends messages as Andy
  'proposal-bot': { act: 0.90, ask: 0.60 },      // High: financial proposals
  'client-onboarding': { act: 0.82, ask: 0.52 }, // Medium: setup tasks
  'quote-bot': { act: 0.90, ask: 0.58 },         // High: pricing commitments
  'tender-hunter': { act: 0.80, ask: 0.50 },     // Medium: sourcing, no commitment
  'ad-script-gen': { act: 0.78, ask: 0.48 },     // Low: content generation, reversible
}

/**
 * Look up per-agent thresholds, falling back to DEFAULT_THRESHOLDS for unknown agent types.
 */
export function getAgentThresholds(agentType: string): ConfidenceThresholds {
  return AGENT_THRESHOLDS[agentType] ?? { ...DEFAULT_THRESHOLDS }
}

export interface ConfidenceRoutingResult {
  decision: ConfidenceDecision
  confidence: number
  thresholds: ConfidenceThresholds
  reasoning: string
}

/**
 * Resolve threshold cascade: agent-level > org-level > defaults.
 * For each field, use the most specific non-undefined value.
 */
export function getEffectiveThresholds(
  agentThresholds?: Partial<ConfidenceThresholds>,
  orgThresholds?: Partial<ConfidenceThresholds>,
): ConfidenceThresholds {
  const raw: ConfidenceThresholds = {
    act: agentThresholds?.act ?? orgThresholds?.act ?? DEFAULT_THRESHOLDS.act,
    ask: agentThresholds?.ask ?? orgThresholds?.ask ?? DEFAULT_THRESHOLDS.ask,
  }

  // Clamp to 0-1
  const clamped: ConfidenceThresholds = {
    act: Math.max(0, Math.min(1, raw.act)),
    ask: Math.max(0, Math.min(1, raw.ask)),
  }

  // Validate: act must be > ask
  if (clamped.act <= clamped.ask) {
    logger.warn(
      `Invalid thresholds: act (${clamped.act}) <= ask (${clamped.ask}). Using defaults.`,
    )
    return { ...DEFAULT_THRESHOLDS }
  }

  return clamped
}

/**
 * Route based on confidence score and thresholds.
 */
export function routeByConfidence(
  confidence: number,
  thresholds?: ConfidenceThresholds,
): ConfidenceRoutingResult {
  const effective = thresholds ?? DEFAULT_THRESHOLDS

  if (confidence >= effective.act) {
    return {
      decision: 'act',
      confidence,
      thresholds: effective,
      reasoning: `Confidence ${confidence} >= act threshold ${effective.act}`,
    }
  }

  if (confidence >= effective.ask) {
    return {
      decision: 'ask',
      confidence,
      thresholds: effective,
      reasoning: `Confidence ${confidence} between ask (${effective.ask}) and act (${effective.act}) thresholds`,
    }
  }

  return {
    decision: 'escalate',
    confidence,
    thresholds: effective,
    reasoning: `Confidence ${confidence} < ask threshold ${effective.ask}`,
  }
}

/**
 * Convenience function: resolve thresholds from agent config, agent type, and org settings, then route.
 *
 * Cascade order (most specific wins):
 *   1. Explicit agentConfig.confidence_thresholds
 *   2. AGENT_THRESHOLDS[agentType] (per-agent-type defaults)
 *   3. orgSettings.confidence_thresholds
 *   4. DEFAULT_THRESHOLDS
 */
export function routeAgentAction(
  confidence: number,
  agentConfig?: { confidence_thresholds?: Partial<ConfidenceThresholds> },
  orgSettings?: { confidence_thresholds?: Partial<ConfidenceThresholds> },
  agentType?: string,
): ConfidenceRoutingResult {
  // If explicit agent config thresholds exist, use them (original behavior)
  if (agentConfig?.confidence_thresholds) {
    const thresholds = getEffectiveThresholds(
      agentConfig.confidence_thresholds,
      orgSettings?.confidence_thresholds,
    )
    return routeByConfidence(confidence, thresholds)
  }

  // If agentType provided and has per-type thresholds, use those as agent-level overrides
  if (agentType && AGENT_THRESHOLDS[agentType]) {
    const thresholds = getEffectiveThresholds(
      AGENT_THRESHOLDS[agentType],
      orgSettings?.confidence_thresholds,
    )
    return routeByConfidence(confidence, thresholds)
  }

  // Fall back to org settings > defaults
  const thresholds = getEffectiveThresholds(
    undefined,
    orgSettings?.confidence_thresholds,
  )
  return routeByConfidence(confidence, thresholds)
}
