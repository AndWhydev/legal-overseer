import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CalibratedThresholds {
  act: number
  ask: number
  escalate: number
  sampleSize: number
  lastCalibrated: string // ISO date
}

export interface ActionOutcome {
  org_id: string
  agent_type: string
  action_type: string
  confidence_score: number
  was_approved: boolean
  was_correct?: boolean | null
  threshold_source?: string
}

export interface ConfidenceBandStats {
  band: string
  lower: number
  upper: number
  total: number
  approved: number
  approvalRate: number
}

// ---------------------------------------------------------------------------
// Safety Rails
// ---------------------------------------------------------------------------

/** Act threshold can never go below this value */
const MIN_ACT_THRESHOLD = 0.70

/** Ask threshold can never go below this value */
const MIN_ASK_THRESHOLD = 0.45

/** Minimum samples per confidence band before adjusting */
const MIN_SAMPLES_PER_BAND = 20

/** Minimum total samples before calibrated thresholds are used */
const MIN_TOTAL_SAMPLES = 50

/** Confidence bands for analysis */
const CONFIDENCE_BANDS: Array<{ label: string; lower: number; upper: number }> = [
  { label: '0.50-0.60', lower: 0.50, upper: 0.60 },
  { label: '0.60-0.70', lower: 0.60, upper: 0.70 },
  { label: '0.70-0.80', lower: 0.70, upper: 0.80 },
  { label: '0.80-0.90', lower: 0.80, upper: 0.90 },
  { label: '0.90-1.00', lower: 0.90, upper: 1.00 },
]

/** Approval rate required for auto-act (95%) */
const ACT_APPROVAL_RATE = 0.95

/** Approval rate required for ask (70%) */
const ASK_APPROVAL_RATE = 0.70

// ---------------------------------------------------------------------------
// Record Action Outcome
// ---------------------------------------------------------------------------

/**
 * Record the outcome of an agent action for future calibration.
 * Never throws -- logging outcomes should not break agent execution.
 */
export async function recordActionOutcome(
  supabase: SupabaseClient,
  orgId: string,
  agentType: string,
  actionType: string,
  confidence: number,
  wasApproved: boolean,
  wasCorrect?: boolean | null,
  thresholdSource: string = 'static',
): Promise<void> {
  try {
    const { error } = await supabase
      .from('action_outcomes')
      .insert({
        org_id: orgId,
        agent_type: agentType,
        action_type: actionType,
        confidence_score: Math.max(0, Math.min(1, confidence)),
        was_approved: wasApproved,
        was_correct: wasCorrect ?? null,
        threshold_source: thresholdSource,
      })

    if (error) {
      logger.warn('[confidence-calibrator] Failed to record action outcome:', error.message)
    }
  } catch (err) {
    logger.warn('[confidence-calibrator] Unexpected error recording outcome:', err)
  }
}

// ---------------------------------------------------------------------------
// Calibrate Thresholds
// ---------------------------------------------------------------------------

/**
 * Analyze the last 30 days of action outcomes for an org+agent type
 * and compute optimal confidence thresholds.
 *
 * Returns null if insufficient data (< MIN_TOTAL_SAMPLES total outcomes).
 */
export async function calibrateThresholds(
  supabase: SupabaseClient,
  orgId: string,
  agentType: string,
): Promise<CalibratedThresholds | null> {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: outcomes, error } = await supabase
    .from('action_outcomes')
    .select('confidence_score, was_approved')
    .eq('org_id', orgId)
    .eq('agent_type', agentType)
    .gte('created_at', thirtyDaysAgo.toISOString())
    .order('created_at', { ascending: false })

  if (error) {
    logger.warn('[confidence-calibrator] Failed to fetch outcomes:', error.message)
    return null
  }

  if (!outcomes || outcomes.length < MIN_TOTAL_SAMPLES) {
    logger.info(
      `[confidence-calibrator] Insufficient samples for ${agentType}: ${outcomes?.length ?? 0}/${MIN_TOTAL_SAMPLES}`,
    )
    return null
  }

  // Calculate approval rate by confidence band
  const bandStats = calculateBandStats(outcomes)

  // Determine optimal thresholds
  const thresholds = deriveThresholds(bandStats)

  return {
    ...thresholds,
    sampleSize: outcomes.length,
    lastCalibrated: new Date().toISOString(),
  }
}

/**
 * Calculate approval statistics for each confidence band.
 * Exported for testing.
 */
export function calculateBandStats(
  outcomes: Array<{ confidence_score: number; was_approved: boolean }>,
): ConfidenceBandStats[] {
  return CONFIDENCE_BANDS.map(band => {
    const inBand = outcomes.filter(
      o => o.confidence_score >= band.lower && o.confidence_score < band.upper,
    )
    // Special case: include 1.0 in the last band
    if (band.upper === 1.0) {
      const atUpperBound = outcomes.filter(o => o.confidence_score === 1.0)
      inBand.push(...atUpperBound.filter(o => !inBand.includes(o)))
    }

    const approved = inBand.filter(o => o.was_approved).length

    return {
      band: band.label,
      lower: band.lower,
      upper: band.upper,
      total: inBand.length,
      approved,
      approvalRate: inBand.length > 0 ? approved / inBand.length : 0,
    }
  })
}

/**
 * Derive act/ask/escalate thresholds from band statistics.
 * Exported for testing.
 */
export function deriveThresholds(
  bandStats: ConfidenceBandStats[],
): { act: number; ask: number; escalate: number } {
  // Find lowest band with sufficient samples AND approval rate >= 95% for auto-act
  let actThreshold = 1.0 // default: never auto-act if no qualifying band
  for (const band of bandStats) {
    if (band.total >= MIN_SAMPLES_PER_BAND && band.approvalRate >= ACT_APPROVAL_RATE) {
      actThreshold = band.lower
      break
    }
  }

  // Find lowest band with sufficient samples AND approval rate >= 70% for ask
  let askThreshold = 1.0 // default: always escalate if no qualifying band
  for (const band of bandStats) {
    if (band.total >= MIN_SAMPLES_PER_BAND && band.approvalRate >= ASK_APPROVAL_RATE) {
      askThreshold = band.lower
      break
    }
  }

  // Apply safety rails
  actThreshold = Math.max(actThreshold, MIN_ACT_THRESHOLD)
  askThreshold = Math.max(askThreshold, MIN_ASK_THRESHOLD)

  // Ensure act > ask (if they converged, bump act up)
  if (actThreshold <= askThreshold) {
    actThreshold = Math.min(askThreshold + 0.10, 1.0)
  }

  return {
    act: actThreshold,
    ask: askThreshold,
    escalate: askThreshold, // below ask = escalate
  }
}

// ---------------------------------------------------------------------------
// Store Calibrated Thresholds
// ---------------------------------------------------------------------------

/**
 * Store calibrated thresholds in the agent_configs table.
 */
export async function storeCalibratedThresholds(
  supabase: SupabaseClient,
  orgId: string,
  agentType: string,
  thresholds: CalibratedThresholds,
): Promise<void> {
  const { error } = await supabase
    .from('agent_configs')
    .update({ calibrated_thresholds: thresholds })
    .eq('org_id', orgId)
    .eq('agent_type', agentType)

  if (error) {
    logger.warn(
      `[confidence-calibrator] Failed to store calibrated thresholds for ${agentType}:`,
      error.message,
    )
  }
}

// ---------------------------------------------------------------------------
// Retrieve Calibrated Thresholds
// ---------------------------------------------------------------------------

/**
 * Retrieve calibrated thresholds for an org+agent type.
 * Returns null if not calibrated or insufficient sample size.
 */
export async function getCalibratedThresholds(
  supabase: SupabaseClient,
  orgId: string,
  agentType: string,
): Promise<CalibratedThresholds | null> {
  const { data, error } = await supabase
    .from('agent_configs')
    .select('calibrated_thresholds')
    .eq('org_id', orgId)
    .eq('agent_type', agentType)
    .eq('enabled', true)
    .single()

  if (error || !data?.calibrated_thresholds) {
    return null
  }

  const calibrated = data.calibrated_thresholds as CalibratedThresholds

  // Only use calibrated thresholds if sample size is sufficient
  if (calibrated.sampleSize < MIN_TOTAL_SAMPLES) {
    return null
  }

  return calibrated
}

// ---------------------------------------------------------------------------
// Get Calibration Status (for API/dashboard)
// ---------------------------------------------------------------------------

export interface CalibrationStatus {
  agentType: string
  isCalibrated: boolean
  thresholds: CalibratedThresholds | null
  bandStats: ConfidenceBandStats[]
  staticThresholds: { act: number; ask: number }
  totalOutcomes: number
}

/**
 * Get full calibration status for an org+agent type, including band stats and comparison.
 */
export async function getCalibrationStatus(
  supabase: SupabaseClient,
  orgId: string,
  agentType: string,
  staticThresholds: { act: number; ask: number },
): Promise<CalibrationStatus> {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: outcomes } = await supabase
    .from('action_outcomes')
    .select('confidence_score, was_approved')
    .eq('org_id', orgId)
    .eq('agent_type', agentType)
    .gte('created_at', thirtyDaysAgo.toISOString())

  const bandStats = calculateBandStats(outcomes ?? [])
  const calibrated = await getCalibratedThresholds(supabase, orgId, agentType)

  return {
    agentType,
    isCalibrated: calibrated !== null,
    thresholds: calibrated,
    bandStats,
    staticThresholds,
    totalOutcomes: outcomes?.length ?? 0,
  }
}
