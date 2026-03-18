/**
 * Memory Palace Pattern Detector — Identifies recurring behaviors across
 * entities and time, then stores them as memory_patterns.
 *
 * Patterns detected:
 * - Payment timing (avg days to pay, trend)
 * - Response latency (how quickly they respond)
 * - Scope creep (project overruns)
 * - Pricing trends (rate changes over time)
 * - Communication style (channel preference, formality)
 *
 * Uses existing entity_timeline and invoice data as source material.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type { PatternType, MemoryPattern } from './types'

// ─── Pattern Detection Results ───────────────────────────────────────────────

interface DetectedPattern {
  type: PatternType
  description: string
  data: Record<string, unknown>
  confidence: number
  sampleCount: number
  entityIds: string[]
  entityNames: string[]
}

// ─── Pattern Detector ────────────────────────────────────────────────────────

export class PatternDetector {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Run all pattern detectors for a specific entity.
   */
  async detectForEntity(
    orgId: string,
    entityId: string,
    entityName: string,
  ): Promise<DetectedPattern[]> {
    const patterns: DetectedPattern[] = []

    const detectors = [
      this.detectPaymentTiming(orgId, entityId, entityName),
      this.detectResponseLatency(orgId, entityId, entityName),
      this.detectPricingTrend(orgId, entityId, entityName),
      this.detectCommunicationStyle(orgId, entityId, entityName),
    ]

    const results = await Promise.allSettled(detectors)

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        patterns.push(result.value)
      }
    }

    return patterns
  }

  /**
   * Persist detected patterns to the database.
   */
  async persistPatterns(orgId: string, patterns: DetectedPattern[]): Promise<number> {
    let stored = 0

    for (const pattern of patterns) {
      const { error } = await this.supabase.from('memory_patterns').upsert(
        {
          org_id: orgId,
          pattern_type: pattern.type,
          description: pattern.description,
          pattern_data: pattern.data,
          entity_ids: pattern.entityIds,
          entity_names: pattern.entityNames,
          sample_count: pattern.sampleCount,
          confidence: pattern.confidence,
          last_observed_at: new Date().toISOString(),
          status: 'active',
        },
        {
          onConflict: 'org_id,pattern_type,entity_ids',
          ignoreDuplicates: false,
        },
      )

      if (!error) stored++
      else {
        logger.warn('[pattern-detector] Failed to persist pattern', {
          type: pattern.type,
          error: error.message,
        })
      }
    }

    return stored
  }

  // ─── Individual Detectors ─────────────────────────────────────────────────

  /**
   * Detect payment timing patterns from invoice history.
   */
  private async detectPaymentTiming(
    orgId: string,
    entityId: string,
    entityName: string,
  ): Promise<DetectedPattern | null> {
    const { data: invoices } = await this.supabase
      .from('invoices')
      .select('id, issue_date, paid_date, status, total')
      .eq('org_id', orgId)
      .eq('client_contact_id', entityId)
      .not('paid_date', 'is', null)
      .order('issue_date', { ascending: true })

    if (!invoices || invoices.length < 2) return null

    const paymentDays: number[] = []
    for (const inv of invoices) {
      if (inv.issue_date && inv.paid_date) {
        const days = (new Date(inv.paid_date).getTime() - new Date(inv.issue_date).getTime()) / 86400000
        if (days >= 0 && days < 365) paymentDays.push(days)
      }
    }

    if (paymentDays.length < 2) return null

    const avg = paymentDays.reduce((a, b) => a + b, 0) / paymentDays.length
    const stdDev = Math.sqrt(
      paymentDays.reduce((sum, d) => sum + (d - avg) ** 2, 0) / paymentDays.length,
    )

    // Trend: compare recent vs older
    const midpoint = Math.floor(paymentDays.length / 2)
    const olderAvg = paymentDays.slice(0, midpoint).reduce((a, b) => a + b, 0) / midpoint
    const recentAvg = paymentDays.slice(midpoint).reduce((a, b) => a + b, 0) / (paymentDays.length - midpoint)
    const trend = recentAvg > olderAvg * 1.15 ? 'slowing' :
      recentAvg < olderAvg * 0.85 ? 'improving' : 'stable'

    const confidence = Math.min(0.95, 0.4 + paymentDays.length * 0.08)

    const avgRounded = Math.round(avg)
    const description = `${entityName} typically pays invoices in ${avgRounded} days (${trend} trend, based on ${paymentDays.length} invoices)`

    return {
      type: 'payment_timing',
      description,
      data: {
        avg_days: Math.round(avg * 10) / 10,
        std_dev: Math.round(stdDev * 10) / 10,
        trend,
        samples: paymentDays,
        latest_payment_days: paymentDays[paymentDays.length - 1],
      },
      confidence,
      sampleCount: paymentDays.length,
      entityIds: [entityId],
      entityNames: [entityName],
    }
  }

  /**
   * Detect response latency patterns from entity timeline.
   */
  private async detectResponseLatency(
    orgId: string,
    entityId: string,
    entityName: string,
  ): Promise<DetectedPattern | null> {
    const { data: events } = await this.supabase
      .from('entity_timeline')
      .select('event_type, occurred_at')
      .eq('org_id', orgId)
      .eq('entity_id', entityId)
      .in('event_type', ['message_sent', 'message_received'])
      .order('occurred_at', { ascending: true })
      .limit(200)

    if (!events || events.length < 4) return null

    const latencies: number[] = []
    for (let i = 0; i < events.length - 1; i++) {
      if (events[i].event_type === 'message_sent' && events[i + 1].event_type === 'message_received') {
        const hours = (new Date(events[i + 1].occurred_at).getTime() - new Date(events[i].occurred_at).getTime()) / 3600000
        if (hours >= 0 && hours < 168) latencies.push(hours)
      }
    }

    if (latencies.length < 3) return null

    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length
    const confidence = Math.min(0.95, 0.4 + latencies.length * 0.06)

    const avgHours = Math.round(avg * 10) / 10
    const speed = avgHours < 1 ? 'very responsive' :
      avgHours < 4 ? 'responsive' :
      avgHours < 24 ? 'within a day' :
      avgHours < 72 ? 'takes a few days' : 'slow to respond'

    return {
      type: 'response_latency',
      description: `${entityName} is ${speed} — average response time ${avgHours}h (${latencies.length} exchanges)`,
      data: {
        avg_hours: avgHours,
        speed_category: speed,
        sample_count: latencies.length,
      },
      confidence,
      sampleCount: latencies.length,
      entityIds: [entityId],
      entityNames: [entityName],
    }
  }

  /**
   * Detect pricing trends from invoice history.
   */
  private async detectPricingTrend(
    orgId: string,
    entityId: string,
    entityName: string,
  ): Promise<DetectedPattern | null> {
    const { data: invoices } = await this.supabase
      .from('invoices')
      .select('total, issue_date, description')
      .eq('org_id', orgId)
      .eq('client_contact_id', entityId)
      .not('total', 'is', null)
      .order('issue_date', { ascending: true })
      .limit(20)

    if (!invoices || invoices.length < 3) return null

    const amounts = invoices.map(i => Number(i.total ?? 0)).filter(a => a > 0)
    if (amounts.length < 3) return null

    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length
    const minAmount = Math.min(...amounts)
    const maxAmount = Math.max(...amounts)

    // Trend: linear regression approximation
    const midpoint = Math.floor(amounts.length / 2)
    const olderAvg = amounts.slice(0, midpoint).reduce((a, b) => a + b, 0) / midpoint
    const recentAvg = amounts.slice(midpoint).reduce((a, b) => a + b, 0) / (amounts.length - midpoint)
    const trend = recentAvg > olderAvg * 1.1 ? 'increasing' :
      recentAvg < olderAvg * 0.9 ? 'decreasing' : 'stable'

    const confidence = Math.min(0.9, 0.3 + amounts.length * 0.07)

    return {
      type: 'pricing_trend',
      description: `${entityName} project values are ${trend} — avg $${Math.round(avgAmount)}, range $${Math.round(minAmount)}-$${Math.round(maxAmount)} (${amounts.length} invoices)`,
      data: {
        avg_amount: Math.round(avgAmount * 100) / 100,
        min_amount: minAmount,
        max_amount: maxAmount,
        trend,
        invoice_count: amounts.length,
      },
      confidence,
      sampleCount: amounts.length,
      entityIds: [entityId],
      entityNames: [entityName],
    }
  }

  /**
   * Detect communication style patterns from channel usage.
   */
  private async detectCommunicationStyle(
    orgId: string,
    entityId: string,
    entityName: string,
  ): Promise<DetectedPattern | null> {
    const { data: events } = await this.supabase
      .from('entity_timeline')
      .select('event_type, channel_source, occurred_at')
      .eq('org_id', orgId)
      .eq('entity_id', entityId)
      .not('channel_source', 'is', null)
      .order('occurred_at', { ascending: false })
      .limit(100)

    if (!events || events.length < 5) return null

    // Channel preference
    const channelCounts: Record<string, number> = {}
    for (const e of events) {
      const ch = e.channel_source as string
      channelCounts[ch] = (channelCounts[ch] ?? 0) + 1
    }

    const sorted = Object.entries(channelCounts).sort((a, b) => b[1] - a[1])
    const primaryChannel = sorted[0]?.[0] ?? 'unknown'
    const primaryPct = Math.round((sorted[0]?.[1] ?? 0) / events.length * 100)

    // Day/hour analysis
    const hourCounts = new Array(24).fill(0)
    for (const e of events) {
      const h = new Date(e.occurred_at).getUTCHours()
      hourCounts[h]++
    }
    const peakHour = hourCounts.indexOf(Math.max(...hourCounts))

    const confidence = Math.min(0.9, 0.3 + events.length * 0.03)

    return {
      type: 'communication_style',
      description: `${entityName} prefers ${primaryChannel} (${primaryPct}% of interactions), most active around ${peakHour}:00 UTC`,
      data: {
        primary_channel: primaryChannel,
        primary_pct: primaryPct,
        channel_breakdown: channelCounts,
        peak_hour: peakHour,
        total_interactions: events.length,
      },
      confidence,
      sampleCount: events.length,
      entityIds: [entityId],
      entityNames: [entityName],
    }
  }
}
