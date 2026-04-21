import { zScore, addToMean } from 'simple-statistics'
import { gateway, generateText } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { models } from '@/lib/ai'
import { logger } from '@/lib/core/logger'
import { dispatchNotification } from '@/lib/notifications/dispatcher'
import type {
  KnowledgeLogEntry,
  AnomalyBaseline,
  MetricName,
  MetricExtraction,
  AlertSeverity,
} from './types'

export const MIN_SAMPLE_SIZE = 5
export const ALERT_BUDGET_MAX = 3
export const Z_SCORE_ALERT_THRESHOLD = 3
export const Z_SCORE_CROSS_ENTITY_THRESHOLD = 2
export const CROSS_ENTITY_MIN_COUNT = 3
const CONSOLIDATION_WINDOW_MINUTES = 30

// -- Z-score computation (ANOM-01) --
export function computeZScore(
  value: number,
  baseline: Pick<AnomalyBaseline, 'mean' | 'stddev' | 'sample_count'>,
): number | null {
  if (baseline.sample_count < MIN_SAMPLE_SIZE) return null
  if (baseline.stddev === 0) return null
  return zScore(value, baseline.mean, baseline.stddev)
}

// -- Welford-style incremental baseline update --
// Uses Bessel-corrected sample variance (N-1) to avoid the low-bias that
// inflates false-positive z-scores during baseline warm-up (REVIEW MD-05).
// For N=1 we return stddev=0 (variance is undefined with a single sample).
export function updateBaseline(
  baseline: Pick<AnomalyBaseline, 'mean' | 'stddev' | 'sample_count'>,
  newValue: number,
): { mean: number; stddev: number; sample_count: number } {
  if (baseline.sample_count === 0) {
    return { mean: newValue, stddev: 0, sample_count: 1 }
  }
  const newMean = addToMean(baseline.mean, baseline.sample_count, newValue)
  const newCount = baseline.sample_count + 1
  // Welford's online M2 uses population variance; convert to sample variance
  // for stddev storage. Reconstruct M2 from stored stddev assuming it was
  // also sample-variance-based (stddev^2 * (N-1)).
  const oldM2 =
    baseline.sample_count > 1
      ? baseline.stddev * baseline.stddev * (baseline.sample_count - 1)
      : 0
  const newM2 = oldM2 + (newValue - baseline.mean) * (newValue - newMean)
  const newVariance = newCount > 1 ? newM2 / (newCount - 1) : 0
  const newStddev = Math.sqrt(Math.max(0, newVariance))
  return { mean: newMean, stddev: newStddev, sample_count: newCount }
}

// -- Rule-based metric extraction (ANOM-01, no LLM) --
// TODO(phase-47): response_latency extraction requires cross-entry timestamp correlation
//                 between consecutive message pairs per entity. Deferred until sent-message
//                 capture (Epic B1) is available.
// message_frequency is aggregated as a count per entity per batch — emitting
// a constant 1 per message collapsed the baseline to mean=1, stddev=0 and made
// the metric dead (REVIEW HI-01).
export function extractMetrics(entries: KnowledgeLogEntry[]): MetricExtraction[] {
  const out: MetricExtraction[] = []
  const messageCounts = new Map<string, number>()
  for (const entry of entries) {
    if (!entry.entity_ids || entry.entity_ids.length === 0) continue
    const entityId = entry.entity_ids[0]
    if (entry.signal_type === 'invoice') {
      // $X,XXX.XX amount
      const amountMatch = entry.content.match(/\$\s?([\d,]+(?:\.\d+)?)/)
      if (amountMatch) {
        const value = parseFloat(amountMatch[1].replace(/,/g, ''))
        if (!Number.isNaN(value)) {
          out.push({ entity_id: entityId, metric_name: 'payment_amount', value })
        }
      }
      // "N days late/overdue/after"
      const timingMatch = entry.content.match(/(\d+)\s+days?\s+(late|overdue|after)/i)
      if (timingMatch) {
        const days = parseInt(timingMatch[1], 10)
        if (!Number.isNaN(days)) {
          out.push({ entity_id: entityId, metric_name: 'payment_timing', value: days })
        }
      }
    } else if (entry.signal_type === 'message') {
      messageCounts.set(entityId, (messageCounts.get(entityId) ?? 0) + 1)
    }
  }
  for (const [entityId, count] of messageCounts) {
    out.push({ entity_id: entityId, metric_name: 'message_frequency', value: count })
  }
  return out
}

// -- Alert budget check (ANOM-03) --
// Pass entityId=null for an org-wide budget check (used for cross-entity
// pattern breaks that aren't attributable to a single entity). The budget is
// scoped per alert_type so learning prompts don't consume anomaly budget and
// vice versa (REVIEW MD-02, HI-02).
export async function isWithinAlertBudget(
  supabase: SupabaseClient,
  orgId: string,
  entityId: string | null,
  alertType: 'anomaly' | 'pattern_break' | 'learning_prompt',
  maxAlerts: number = ALERT_BUDGET_MAX,
): Promise<boolean> {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    let query = supabase
      .from('brain_alerts')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('alert_type', alertType)
      .gte('created_at', twentyFourHoursAgo)
    if (entityId !== null) {
      query = query.eq('entity_id', entityId)
    }
    const { count, error } = await query
    if (error) {
      logger.warn('[anomaly-detector] alert budget query error, failing closed', { error })
      return false
    }
    return (count ?? 0) < maxAlerts
  } catch (err) {
    logger.warn('[anomaly-detector] alert budget check threw', { err })
    return false
  }
}

// -- Anomaly explanation via LLM (ANOM-05 baseline comparison) --
export async function generateAnomalyExplanation(
  metricName: MetricName,
  value: number,
  baseline: Pick<AnomalyBaseline, 'mean' | 'stddev'>,
  zScoreValue: number,
): Promise<string> {
  try {
    const { text } = await generateText({
      model: gateway(models.fast),
      system:
        'You are a personal assistant surfacing anomalies. Produce one sentence explaining the anomaly in natural language. Include baseline comparison (usual value vs current). Do not use statistical jargon like z-score.',
      prompt: `Metric: ${metricName}\nCurrent value: ${value}\nBaseline mean: ${baseline.mean}\nZ-score: ${zScoreValue}`,
    })
    return text.trim()
  } catch (err) {
    logger.warn('[anomaly-detector] explanation LLM failed, using fallback', { err })
    return `${metricName} anomaly detected (z=${zScoreValue.toFixed(1)}, baseline: ${baseline.mean.toFixed(1)})`
  }
}

function severityFromZScore(z: number): AlertSeverity {
  const abs = Math.abs(z)
  if (abs >= 5) return 'critical'
  if (abs >= 4) return 'high'
  if (abs >= 3) return 'medium'
  return 'low'
}

function urgencyFromSeverity(sev: AlertSeverity): 'critical' | 'high' | 'normal' {
  if (sev === 'critical') return 'critical'
  if (sev === 'high') return 'high'
  return 'normal'
}

// -- Detect anomalies + deliver alerts to user (ANOM-02) --
export async function detectAndAlertAnomalies(
  supabase: SupabaseClient,
  orgId: string,
  entityId: string,
  entries: KnowledgeLogEntry[],
): Promise<{ anomaliesDetected: number; alertsSent: number }> {
  try {
    const metrics = extractMetrics(entries)
    let anomaliesDetected = 0
    let alertsSent = 0
    for (const extraction of metrics) {
      if (extraction.entity_id !== entityId) continue
      // Load baseline
      const { data: baselineRow } = await supabase
        .from('anomaly_baselines')
        .select('*')
        .eq('org_id', orgId)
        .eq('entity_id', entityId)
        .eq('metric_name', extraction.metric_name)
        .maybeSingle()
      const baseline: AnomalyBaseline = baselineRow ?? {
        id: '',
        org_id: orgId,
        entity_id: entityId,
        metric_name: extraction.metric_name,
        mean: 0,
        stddev: 0,
        sample_count: 0,
        last_computed: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      // Compute z-score before update
      const z = computeZScore(extraction.value, baseline)
      // Update baseline with new value
      const updated = updateBaseline(baseline, extraction.value)
      const { error: upsertError } = await supabase.from('anomaly_baselines').upsert(
        {
          org_id: orgId,
          entity_id: entityId,
          metric_name: extraction.metric_name,
          mean: updated.mean,
          stddev: updated.stddev,
          sample_count: updated.sample_count,
          last_computed: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'org_id,entity_id,metric_name' },
      )
      if (upsertError) {
        // Silent baseline write failures reset the z-score clock on next
        // run without signal (REVIEW MD-04).
        logger.warn('[anomaly-detector] baseline upsert failed', {
          upsertError,
          entityId,
          metric: extraction.metric_name,
        })
      }
      if (z === null) continue
      if (Math.abs(z) < Z_SCORE_ALERT_THRESHOLD) continue
      anomaliesDetected++
      if (!(await isWithinAlertBudget(supabase, orgId, entityId, 'anomaly'))) continue
      const severity = severityFromZScore(z)
      const explanation = await generateAnomalyExplanation(
        extraction.metric_name,
        extraction.value,
        { mean: baseline.mean, stddev: baseline.stddev },
        z,
      )
      const baselineText = `usually ${baseline.mean.toFixed(1)} (z=${z.toFixed(1)})`
      // Insert alert record
      const { error: insertError } = await supabase.from('brain_alerts').insert({
        org_id: orgId,
        entity_id: entityId,
        alert_type: 'anomaly',
        metric_name: extraction.metric_name,
        z_score: z,
        baseline_text: baselineText,
        explanation,
        severity,
      })
      if (insertError) {
        logger.warn('[anomaly-detector] brain_alerts insert failed', { insertError })
        continue
      }
      // ANOM-02: deliver to user via channel-agnostic dispatcher
      try {
        await dispatchNotification(supabase, {
          orgId,
          type: 'alert_escalation',
          title: `Anomaly: ${extraction.metric_name}`,
          body: explanation,
          urgency: urgencyFromSeverity(severity),
          metadata: {
            entityId,
            metricName: extraction.metric_name,
            zScore: z,
            alertType: 'anomaly',
          },
        })
        alertsSent++
      } catch (dispatchErr) {
        logger.warn('[anomaly-detector] dispatchNotification failed; alert recorded but not delivered', {
          dispatchErr,
        })
      }
    }
    return { anomaliesDetected, alertsSent }
  } catch (err) {
    logger.warn('[anomaly-detector] detectAndAlertAnomalies top-level error', { err })
    return { anomaliesDetected: 0, alertsSent: 0 }
  }
}

// -- Cross-entity pattern break detection (ANOM-04) --
export async function detectCrossEntityPatternBreaks(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ breaksDetected: number; alertsSent: number }> {
  try {
    const windowStart = new Date(
      Date.now() - CONSOLIDATION_WINDOW_MINUTES * 60 * 1000,
    ).toISOString()
    const { data: anomalies, error } = await supabase
      .from('brain_alerts')
      .select('entity_id, metric_name, z_score')
      .eq('org_id', orgId)
      .eq('alert_type', 'anomaly')
      .gte('created_at', windowStart)
    if (error || !anomalies) {
      logger.warn('[anomaly-detector] pattern-break query failed', { error })
      return { breaksDetected: 0, alertsSent: 0 }
    }
    // Group by metric_name. The dead `(a.z_score ?? 0) === null` check was
    // removed — `?? 0` already coerces null to 0, and the abs-threshold on
    // the next line correctly filters zero-valued rows (REVIEW MD-01).
    const byMetric = new Map<string, Set<string>>()
    for (const a of anomalies as Array<{ entity_id: string; metric_name: string | null; z_score: number | null }>) {
      if (!a.metric_name) continue
      if (a.z_score === null) continue
      if (Math.abs(a.z_score) < Z_SCORE_CROSS_ENTITY_THRESHOLD) continue
      if (!byMetric.has(a.metric_name)) byMetric.set(a.metric_name, new Set())
      byMetric.get(a.metric_name)!.add(a.entity_id)
    }
    let breaksDetected = 0
    let alertsSent = 0
    for (const [metricName, entitySet] of byMetric.entries()) {
      if (entitySet.size < CROSS_ENTITY_MIN_COUNT) continue
      breaksDetected++
      const affectedIds = [...entitySet]
      // Cross-entity pattern breaks are org-wide signals — use an org-wide
      // budget (entityId=null) instead of charging an arbitrary entity and
      // losing the alert when that entity is at its per-entity cap
      // (REVIEW HI-02 part 1).
      if (!(await isWithinAlertBudget(supabase, orgId, null, 'pattern_break'))) continue
      // Picking a representative entity_id is forced by the NOT NULL column
      // constraint; the full affected list is encoded into baseline_text so
      // the signal is recoverable from the table (REVIEW HI-02 part 2).
      const representativeEntity = affectedIds[0]
      const shownIds = affectedIds.slice(0, 5).join(', ')
      const ellipsis = affectedIds.length > 5 ? `, +${affectedIds.length - 5} more` : ''
      const explanation = `${affectedIds.length} entities with ${metricName} anomalies this window — cross-entity pattern break.`
      const baselineText = `${affectedIds.length} anomalous entities on ${metricName}: ${shownIds}${ellipsis}`
      const { error: insertError } = await supabase.from('brain_alerts').insert({
        org_id: orgId,
        entity_id: representativeEntity,
        alert_type: 'pattern_break',
        metric_name: metricName,
        z_score: null,
        baseline_text: baselineText,
        explanation,
        severity: 'high' as AlertSeverity,
      })
      if (insertError) {
        logger.warn('[anomaly-detector] pattern_break insert failed', { insertError })
        continue
      }
      try {
        await dispatchNotification(supabase, {
          orgId,
          type: 'alert_escalation',
          title: `Pattern break: ${metricName}`,
          body: explanation,
          urgency: 'high',
          metadata: {
            metricName,
            affectedEntityIds: affectedIds,
            affectedEntityCount: affectedIds.length,
            alertType: 'pattern_break',
          },
        })
        alertsSent++
      } catch (dispatchErr) {
        logger.warn('[anomaly-detector] pattern_break dispatch failed', { dispatchErr })
      }
    }
    return { breaksDetected, alertsSent }
  } catch (err) {
    logger.warn('[anomaly-detector] detectCrossEntityPatternBreaks top-level error', { err })
    return { breaksDetected: 0, alertsSent: 0 }
  }
}
