// Types matching @bitbit/core definitions
export interface ConfidenceThresholds {
  act: number   // >= this -> auto-execute
  ask: number   // >= this -> request approval; below -> escalate
}

export type ConfidenceDecision = 'act' | 'ask' | 'escalate'

export const DEFAULT_THRESHOLDS: ConfidenceThresholds = {
  act: 0.85,
  ask: 0.55,
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
    console.warn(
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
 * Convenience function: resolve thresholds from agent config and org settings, then route.
 */
export function routeAgentAction(
  confidence: number,
  agentConfig?: { confidence_thresholds?: Partial<ConfidenceThresholds> },
  orgSettings?: { confidence_thresholds?: Partial<ConfidenceThresholds> },
): ConfidenceRoutingResult {
  const thresholds = getEffectiveThresholds(
    agentConfig?.confidence_thresholds,
    orgSettings?.confidence_thresholds,
  )
  return routeByConfidence(confidence, thresholds)
}
