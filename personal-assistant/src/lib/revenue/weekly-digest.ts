/**
 * Weekly Revenue Digest Generator
 *
 * Auto-generates a comprehensive weekly revenue summary:
 * - Invoiced, received, overdue, projected, unbilled
 * - Client highlights (new, growing, at-risk)
 * - Actionable insights
 *
 * Designed for cron execution. Stores digest in semantic_memories
 * so the agent can reference it in conversation.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type { WeeklyDigest, RevenueInsight } from './types'
import { formatCents, dollarsToCents } from './types'

// ─── Digest Generation ──────────────────────────────────────────────────────

/**
 * Generate a weekly revenue digest for an org.
 */
export async function generateWeeklyDigest(
  supabase: SupabaseClient,
  orgId: string,
): Promise<WeeklyDigest | null> {
  try {
    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setDate(weekStart.getDate() - 7)
    const weekStartStr = weekStart.toISOString()
    const weekEndStr = now.toISOString()

    // Batch fetch all needed data
    const [
      weekInvoicesResult,
      outstandingResult,
      overdueResult,
      projectionsResult,
      insightsResult,
      clientScoresResult,
    ] = await Promise.all([
      // Invoices created this week
      supabase
        .from('invoices')
        .select('id, total, status, client_contact_id')
        .eq('org_id', orgId)
        .gte('created_at', weekStartStr)
        .lte('created_at', weekEndStr),

      // Outstanding invoices
      supabase
        .from('invoices')
        .select('id, total')
        .eq('org_id', orgId)
        .in('status', ['sent', 'viewed']),

      // Overdue invoices
      supabase
        .from('invoices')
        .select('id, total')
        .eq('org_id', orgId)
        .eq('status', 'overdue'),

      // Latest 30-day projection
      supabase
        .from('cash_flow_projections')
        .select('projected_inflow_cents')
        .eq('org_id', orgId)
        .eq('horizon_days', 30)
        .order('projection_date', { ascending: false })
        .limit(1),

      // Active insights
      supabase
        .from('revenue_insights')
        .select('*')
        .eq('org_id', orgId)
        .eq('status', 'active')
        .order('severity', { ascending: true })
        .limit(10),

      // Client scores with contact names
      supabase
        .from('client_revenue_scores')
        .select('contact_id, overall_score, trend_direction, total_revenue_cents, revenue_last_30d_cents')
        .eq('org_id', orgId)
        .order('overall_score', { ascending: false })
        .limit(10),
    ])

    const weekInvoices = weekInvoicesResult.data ?? []
    const outstanding = outstandingResult.data ?? []
    const overdue = overdueResult.data ?? []
    const projections = projectionsResult.data ?? []
    const insights = (insightsResult.data ?? []) as RevenueInsight[]
    const clientScores = clientScoresResult.data ?? []

    // Calculate weekly totals
    const invoicedCents = weekInvoices
      .filter(i => i.status !== 'cancelled' && i.status !== 'draft')
      .reduce((sum, i) => sum + dollarsToCents(i.total ?? 0), 0)

    const collectedCents = weekInvoices
      .filter(i => i.status === 'paid')
      .reduce((sum, i) => sum + dollarsToCents(i.total ?? 0), 0)

    const overdueCents = overdue.reduce((sum, i) => sum + dollarsToCents(i.total ?? 0), 0)

    const projected30dCents = projections[0]?.projected_inflow_cents ?? 0

    const unbilledCents = insights
      .filter(i => i.insight_type === 'unbilled_work')
      .reduce((sum, i) => sum + (i.amount_cents ?? 0), 0)

    // Get contact names for client highlights
    const contactIds = clientScores.map((c: { contact_id: string }) => c.contact_id)
    const contacts = new Map<string, string>()
    if (contactIds.length > 0) {
      const { data: contactData } = await supabase
        .from('contacts')
        .select('id, name')
        .in('id', contactIds)

      for (const c of contactData ?? []) {
        contacts.set(c.id, c.name)
      }
    }

    const clientHighlights = clientScores.map((c: {
      contact_id: string
      trend_direction: string
      revenue_last_30d_cents: number
    }) => ({
      contact_id: c.contact_id,
      contact_name: contacts.get(c.contact_id) ?? 'Unknown',
      trend: c.trend_direction as WeeklyDigest['client_highlights'][0]['trend'],
      revenue_cents: c.revenue_last_30d_cents ?? 0,
    }))

    return {
      period_start: weekStart.toISOString().slice(0, 10),
      period_end: now.toISOString().slice(0, 10),
      invoiced_cents: invoicedCents,
      collected_cents: collectedCents,
      overdue_cents: overdueCents,
      projected_30d_cents: projected30dCents,
      unbilled_cents: unbilledCents,
      insights,
      client_highlights: clientHighlights,
    }
  } catch (err) {
    logger.error('[weekly-digest] Failed to generate digest', {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Format a digest into a human-readable text summary.
 */
export function formatDigestText(digest: WeeklyDigest): string {
  const lines: string[] = []

  lines.push(`Revenue Digest: ${digest.period_start} to ${digest.period_end}`)
  lines.push('─'.repeat(50))
  lines.push('')
  lines.push(`Invoiced this week:   ${formatCents(digest.invoiced_cents)}`)
  lines.push(`Collected this week:  ${formatCents(digest.collected_cents)}`)
  lines.push(`Currently overdue:    ${formatCents(digest.overdue_cents)}`)
  lines.push(`30-day projection:    ${formatCents(digest.projected_30d_cents)}`)

  if (digest.unbilled_cents > 0) {
    lines.push(`Unbilled work found:  ${formatCents(digest.unbilled_cents)}`)
  }

  // Active insights
  if (digest.insights.length > 0) {
    lines.push('')
    lines.push('Action Items:')
    for (const insight of digest.insights.slice(0, 5)) {
      const icon = insight.severity === 'critical' ? '[!!!]' :
                   insight.severity === 'high' ? '[!!]' :
                   insight.severity === 'medium' ? '[!]' : '[i]'
      lines.push(`  ${icon} ${insight.title}`)
      if (insight.recommended_action) {
        lines.push(`      → ${insight.recommended_action}`)
      }
    }
  }

  // Client highlights
  if (digest.client_highlights.length > 0) {
    lines.push('')
    lines.push('Client Highlights:')
    for (const client of digest.client_highlights.slice(0, 5)) {
      const trendIcon = client.trend === 'growing' ? '↑' :
                        client.trend === 'declining' ? '↓' :
                        client.trend === 'churned' ? '✗' : '→'
      lines.push(`  ${trendIcon} ${client.contact_name}: ${formatCents(client.revenue_cents)} (last 30d)`)
    }
  }

  return lines.join('\n')
}

/**
 * Store digest in semantic_memories for agent reference.
 */
export async function storeDigestInMemory(
  supabase: SupabaseClient,
  orgId: string,
  digest: WeeklyDigest,
): Promise<boolean> {
  const text = formatDigestText(digest)

  // Expire old digests
  await supabase
    .from('semantic_memories')
    .update({ is_active: false })
    .eq('org_id', orgId)
    .ilike('content', '[revenue-digest]%')

  const { error } = await supabase
    .from('semantic_memories')
    .insert({
      org_id: orgId,
      content: `[revenue-digest] ${text}`,
      category: 'financial',
      confidence: 0.95,
      is_active: true,
      decay_rate: 'normal',
    })

  if (error) {
    logger.error('[weekly-digest] Failed to store digest', { error: error.message })
    return false
  }

  logger.info('[weekly-digest] Digest stored', { orgId })
  return true
}

/**
 * Run the full weekly digest pipeline.
 * Designed to be called from cron.
 */
export async function runWeeklyDigest(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ digest: WeeklyDigest | null; stored: boolean }> {
  const digest = await generateWeeklyDigest(supabase, orgId)
  if (!digest) return { digest: null, stored: false }

  const stored = await storeDigestInMemory(supabase, orgId, digest)
  return { digest, stored }
}
