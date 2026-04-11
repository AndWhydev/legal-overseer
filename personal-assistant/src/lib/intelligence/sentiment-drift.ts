/**
 * Sentiment Drift Detection
 *
 * Tracks longitudinal sentiment per contact across all channels.
 * Detects drift (positive→neutral→negative trend) and generates
 * alerts when client satisfaction appears to be declining.
 *
 * Uses entity_profiles.sentiment_trajectory to store rolling scores.
 * Designed to run as a cron job (daily) via /api/cron/sentiment-drift.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { analyzeSentimentFast, type SentimentResult } from '@/lib/agent/sentiment'
import { logger } from '@/lib/core/logger'

// ─── Types ──────────────────────────────────────────────────────────────────

export type DriftDirection = 'improving' | 'stable' | 'declining' | 'critical'

export interface SentimentSnapshot {
  date: string // ISO date (YYYY-MM-DD)
  score: number // -1 to 1
  sampleSize: number
}

export interface DriftResult {
  contactId: string
  contactName: string
  contactType: string
  direction: DriftDirection
  currentScore: number
  previousScore: number
  delta: number
  trajectory: SentimentSnapshot[]
  correlations: string[] // suspected root causes
}

export interface DriftScanResult {
  scanned: number
  alerts: DriftResult[]
  errors: number
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Minimum messages in the window to produce a confident reading. */
const MIN_MESSAGES_PER_WINDOW = 3

/** Number of days per analysis window. */
const WINDOW_DAYS = 7

/** Number of windows to compare (current vs previous). */
const LOOKBACK_WINDOWS = 4

/** Score delta threshold to flag as "declining". */
const DECLINE_THRESHOLD = -0.15

/** Score delta threshold to flag as "critical". */
const CRITICAL_THRESHOLD = -0.3

// ─── Core ───────────────────────────────────────────────────────────────────

/**
 * Scan all active contacts for an org and detect sentiment drift.
 * Returns alerts for contacts whose sentiment is declining.
 */
export async function scanSentimentDrift(
  supabase: SupabaseClient,
  orgId: string,
): Promise<DriftScanResult> {
  const result: DriftScanResult = { scanned: 0, alerts: [], errors: 0 }

  // Get contacts with recent inbound messages
  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('id, name, type')
    .eq('org_id', orgId)
    .in('type', ['client', 'lead', 'partner'])
    .limit(100)

  if (error || !contacts) {
    logger.error('[sentiment-drift] Failed to fetch contacts', { error })
    return result
  }

  for (const contact of contacts) {
    result.scanned++
    try {
      const drift = await analyzeContactDrift(supabase, orgId, contact.id, contact.name, contact.type)
      if (drift && (drift.direction === 'declining' || drift.direction === 'critical')) {
        result.alerts.push(drift)
      }
    } catch (err) {
      result.errors++
      logger.warn('[sentiment-drift] Error analyzing contact', {
        contactId: contact.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  logger.info('[sentiment-drift] Scan complete', {
    orgId,
    scanned: result.scanned,
    alerts: result.alerts.length,
    errors: result.errors,
  })

  return result
}

/**
 * Analyze sentiment drift for a single contact.
 * Compares recent message sentiment against historical baseline.
 */
async function analyzeContactDrift(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string,
  contactName: string,
  contactType: string,
): Promise<DriftResult | null> {
  const now = new Date()
  const lookbackMs = LOOKBACK_WINDOWS * WINDOW_DAYS * 24 * 60 * 60 * 1000
  const since = new Date(now.getTime() - lookbackMs).toISOString()

  // Fetch inbound messages from this contact
  const { data: messages } = await supabase
    .from('channel_messages')
    .select('body, received_at')
    .eq('org_id', orgId)
    .eq('sender_contact_id', contactId)
    .gte('received_at', since)
    .order('received_at', { ascending: true })
    .limit(200)

  if (!messages || messages.length < MIN_MESSAGES_PER_WINDOW * 2) {
    return null // not enough data
  }

  // Bucket messages into weekly windows and compute avg sentiment
  const trajectory: SentimentSnapshot[] = []

  for (let w = 0; w < LOOKBACK_WINDOWS; w++) {
    const windowEnd = new Date(now.getTime() - w * WINDOW_DAYS * 24 * 60 * 60 * 1000)
    const windowStart = new Date(windowEnd.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000)

    const windowMessages = messages.filter(m => {
      const t = new Date(m.received_at).getTime()
      return t >= windowStart.getTime() && t < windowEnd.getTime()
    })

    if (windowMessages.length < MIN_MESSAGES_PER_WINDOW) continue

    const sentiments: SentimentResult[] = windowMessages.map(m =>
      analyzeSentimentFast(m.body ?? '')
    )
    const avgScore = sentiments.reduce((sum, s) => sum + s.score, 0) / sentiments.length

    trajectory.unshift({
      date: windowStart.toISOString().slice(0, 10),
      score: Math.round(avgScore * 100) / 100,
      sampleSize: windowMessages.length,
    })
  }

  if (trajectory.length < 2) return null // need at least 2 windows to compare

  const currentScore = trajectory[trajectory.length - 1].score
  const previousScore = trajectory[0].score
  const delta = currentScore - previousScore

  let direction: DriftDirection
  if (delta <= CRITICAL_THRESHOLD) direction = 'critical'
  else if (delta <= DECLINE_THRESHOLD) direction = 'declining'
  else if (delta >= Math.abs(DECLINE_THRESHOLD)) direction = 'improving'
  else direction = 'stable'

  // Correlate with potential causes
  const correlations = await findCorrelations(supabase, orgId, contactId)

  return {
    contactId,
    contactName,
    contactType,
    direction,
    currentScore,
    previousScore,
    delta: Math.round(delta * 100) / 100,
    trajectory,
    correlations,
  }
}

/**
 * Find potential root causes for sentiment decline.
 * Checks: overdue invoices, missed deadlines, slow response times.
 */
async function findCorrelations(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string,
): Promise<string[]> {
  const causes: string[] = []

  // Check overdue invoices
  const { data: overdueInvoices } = await supabase
    .from('invoices')
    .select('invoice_number, total')
    .eq('org_id', orgId)
    .eq('client_contact_id', contactId)
    .eq('status', 'overdue')
    .limit(3)

  if (overdueInvoices && overdueInvoices.length > 0) {
    const total = overdueInvoices.reduce((sum, inv) => sum + (inv.total ?? 0), 0)
    causes.push(`${overdueInvoices.length} overdue invoice(s) totaling $${total}`)
  }

  // Check overdue tasks
  const { data: overdueTasks } = await supabase
    .from('tasks')
    .select('title')
    .eq('org_id', orgId)
    .eq('contact_id', contactId)
    .in('status', ['pending', 'in_progress'])
    .lt('due_date', new Date().toISOString())
    .limit(3)

  if (overdueTasks && overdueTasks.length > 0) {
    causes.push(`${overdueTasks.length} overdue task(s)`)
  }

  // Check response time (avg time to reply to their messages)
  const { data: recentOutbound } = await supabase
    .from('channel_messages')
    .select('received_at')
    .eq('org_id', orgId)
    .eq('recipient_contact_id', contactId)
    .gte('received_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
    .limit(1)

  if (!recentOutbound || recentOutbound.length === 0) {
    causes.push('No outbound messages in 14 days')
  }

  return causes
}
