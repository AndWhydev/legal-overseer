/**
 * Revenue Intelligence Agent Tool
 *
 * Single tool that gives the agent access to the full revenue
 * intelligence engine. Handles natural language queries about:
 * - Revenue health / overview
 * - Client scoring and rankings
 * - Unbilled work detection
 * - Cash flow projections
 * - Collection status
 * - What-if scenarios
 */

import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getRevenueHealthOverview, getRevenueRadar } from '@/lib/revenue/health-overview'
import { getClientScores, getAtRiskClients } from '@/lib/revenue/client-scoring'
import { getLatestProjections } from '@/lib/revenue/cashflow-engine'
import { findOverdueInvoices, getCollectionSummary } from '@/lib/revenue/collection-engine'
import { detectUnbilledWork } from '@/lib/revenue/unbilled-detector'
import { generateWeeklyDigest, formatDigestText } from '@/lib/revenue/weekly-digest'
import { formatCents } from '@/lib/revenue/types'
import { logger } from '@/lib/core/logger'

export const revenueToolDefinition: Anthropic.Tool = {
  name: 'revenue_intelligence',
  description: 'Query the revenue intelligence engine. Use this for questions about revenue health, client scoring, unbilled work, cash flow projections, overdue invoices, and collection status. Returns structured data about the business financial state.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query_type: {
        type: 'string',
        enum: ['health', 'radar', 'clients', 'at_risk', 'cashflow', 'overdue', 'unbilled', 'digest', 'collection_summary'],
        description: 'Type of revenue query: "health" for full overview, "radar" for recoverable revenue, "clients" for scored client list, "at_risk" for flagged clients, "cashflow" for 30/60/90 day projections, "overdue" for overdue invoices, "unbilled" for unbilled work detection, "digest" for weekly summary, "collection_summary" for collection status.',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default: 10)',
      },
    },
    required: ['query_type'],
  },
}

interface RevenueToolInput {
  query_type: 'health' | 'radar' | 'clients' | 'at_risk' | 'cashflow' | 'overdue' | 'unbilled' | 'digest' | 'collection_summary'
  limit?: number
}

export async function handleRevenueIntelligence(
  input: RevenueToolInput,
  orgId: string,
  supabase: SupabaseClient,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const limit = input.limit ?? 10

  try {
    switch (input.query_type) {
      case 'health': {
        const overview = await getRevenueHealthOverview(supabase, orgId)

        // Enrich client names
        const clientIds = [
          ...(overview.top_clients?.map(c => c.contact_id) ?? []),
          ...(overview.at_risk_clients?.map(c => c.contact_id) ?? []),
        ]
        const names = await fetchContactNames(supabase, clientIds)

        return {
          success: true,
          data: {
            summary: buildHealthSummary(overview),
            snapshot: overview.snapshot ? {
              invoiced: formatCents(overview.snapshot.total_invoiced_cents),
              collected: formatCents(overview.snapshot.total_collected_cents),
              outstanding: formatCents(overview.snapshot.total_outstanding_cents),
              overdue: formatCents(overview.snapshot.total_overdue_cents),
              collection_rate: `${overview.collection_rate_pct}%`,
            } : null,
            cash_flow: overview.cash_flow_30d ? {
              '30d': formatCents(overview.cash_flow_30d.projected_inflow_cents),
              '60d': overview.cash_flow_60d ? formatCents(overview.cash_flow_60d.projected_inflow_cents) : null,
              '90d': overview.cash_flow_90d ? formatCents(overview.cash_flow_90d.projected_inflow_cents) : null,
            } : null,
            recoverable_revenue: formatCents(overview.total_recoverable_cents),
            active_insights: overview.active_insights_count,
            overdue_count: overview.overdue_invoices_count,
            at_risk_clients: overview.at_risk_clients?.map(c => ({
              name: names.get(c.contact_id) ?? 'Unknown',
              score: c.overall_score,
              risk: c.risk_level,
              trend: c.trend_direction,
            })),
          },
        }
      }

      case 'radar': {
        const radar = await getRevenueRadar(supabase, orgId)
        return {
          success: true,
          data: {
            total_recoverable: formatCents(radar.total_recoverable_cents),
            insights_count: radar.insights.length,
            client_count: radar.client_count,
            top_opportunities: radar.top_opportunities.slice(0, limit).map(i => ({
              title: i.title,
              amount: formatCents(i.amount_cents),
              type: i.insight_type,
              severity: i.severity,
              action: i.recommended_action,
            })),
          },
        }
      }

      case 'clients': {
        const clients = await getClientScores(supabase, orgId, { limit })
        const names = await fetchContactNames(supabase, clients.map(c => c.contact_id))

        return {
          success: true,
          data: {
            clients: clients.map(c => ({
              name: names.get(c.contact_id) ?? 'Unknown',
              score: c.overall_score,
              revenue: formatCents(c.total_revenue_cents),
              trend: c.trend_direction,
              risk: c.risk_level,
              avg_days_to_pay: c.avg_days_to_pay,
              on_time_rate: `${c.on_time_rate_pct}%`,
            })),
          },
        }
      }

      case 'at_risk': {
        const clients = await getAtRiskClients(supabase, orgId)
        const names = await fetchContactNames(supabase, clients.map(c => c.contact_id))

        return {
          success: true,
          data: {
            count: clients.length,
            clients: clients.map(c => ({
              name: names.get(c.contact_id) ?? 'Unknown',
              score: c.overall_score,
              risk: c.risk_level,
              risk_factors: c.risk_factors,
              revenue: formatCents(c.total_revenue_cents),
              trend: c.trend_direction,
            })),
          },
        }
      }

      case 'cashflow': {
        const projections = await getLatestProjections(supabase, orgId)
        return {
          success: true,
          data: {
            projections: projections.map(p => ({
              horizon: `${p.horizon_days} days`,
              projected_inflow: formatCents(p.projected_inflow_cents),
              confidence_range: `${formatCents(p.confidence_low_cents)} - ${formatCents(p.confidence_high_cents)}`,
              confidence: `${Math.round(p.confidence_pct * 100)}%`,
              from_outstanding: formatCents(p.from_outstanding_cents),
              from_recurring: formatCents(p.from_recurring_cents),
            })),
          },
        }
      }

      case 'overdue': {
        const overdue = await findOverdueInvoices(supabase, orgId)
        return {
          success: true,
          data: {
            count: overdue.length,
            total: formatCents(overdue.reduce((s, i) => s + i.total_cents, 0)),
            invoices: overdue.slice(0, limit).map(i => ({
              invoice_number: i.invoice_number,
              client: i.client_name ?? 'Unknown',
              amount: formatCents(i.total_cents),
              days_overdue: i.days_overdue,
              recommended_action: i.recommended_tier,
            })),
          },
        }
      }

      case 'unbilled': {
        const proposals = await detectUnbilledWork(supabase, orgId)
        return {
          success: true,
          data: {
            count: proposals.length,
            total_recoverable: formatCents(proposals.reduce((s, p) => s + p.suggested_amount_cents, 0)),
            proposals: proposals.slice(0, limit).map(p => ({
              client: p.contact_name ?? 'Unknown',
              tasks: p.tasks.length,
              suggested_amount: formatCents(p.suggested_amount_cents),
              confidence: `${Math.round(p.confidence * 100)}%`,
              gap: p.evidence.gap_description,
            })),
          },
        }
      }

      case 'digest': {
        const digest = await generateWeeklyDigest(supabase, orgId)
        if (!digest) return { success: false, error: 'Failed to generate digest' }
        return {
          success: true,
          data: {
            text: formatDigestText(digest),
            invoiced: formatCents(digest.invoiced_cents),
            collected: formatCents(digest.collected_cents),
            overdue: formatCents(digest.overdue_cents),
            projected_30d: formatCents(digest.projected_30d_cents),
            unbilled: formatCents(digest.unbilled_cents),
          },
        }
      }

      case 'collection_summary': {
        const summary = await getCollectionSummary(supabase, orgId)
        return {
          success: true,
          data: {
            total_overdue: formatCents(summary.total_overdue_cents),
            overdue_count: summary.overdue_count,
            avg_days_overdue: summary.avg_days_overdue,
            by_tier: {
              gentle: summary.by_tier.gentle.length,
              firm: summary.by_tier.firm.length,
              urgent: summary.by_tier.urgent.length,
              final: summary.by_tier.final.length,
            },
            worst_offenders: summary.worst_offenders.map(o => ({
              client: o.contact_name ?? 'Unknown',
              overdue_count: o.overdue_count,
              total_overdue: formatCents(o.total_overdue_cents),
              avg_days: o.avg_days_overdue,
            })),
          },
        }
      }

      default:
        return { success: false, error: `Unknown query type: ${input.query_type}` }
    }
  } catch (err) {
    logger.error('[revenue-tool] Query failed', {
      queryType: input.query_type,
      error: err instanceof Error ? err.message : String(err),
    })
    return { success: false, error: `Revenue query failed: ${err instanceof Error ? err.message : String(err)}` }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function fetchContactNames(
  supabase: SupabaseClient,
  contactIds: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  if (contactIds.length === 0) return names

  const uniqueIds = [...new Set(contactIds)]
  const { data } = await supabase
    .from('contacts')
    .select('id, name')
    .in('id', uniqueIds)

  for (const c of data ?? []) {
    names.set(c.id, c.name)
  }

  return names
}

function buildHealthSummary(overview: Awaited<ReturnType<typeof getRevenueHealthOverview>>): string {
  const parts: string[] = []

  if (overview.snapshot) {
    parts.push(`This month: ${formatCents(overview.snapshot.total_invoiced_cents)} invoiced, ${formatCents(overview.snapshot.total_collected_cents)} collected.`)
  }

  if (overview.total_recoverable_cents > 0) {
    parts.push(`${formatCents(overview.total_recoverable_cents)} in recoverable revenue found.`)
  }

  if (overview.overdue_invoices_count > 0) {
    parts.push(`${overview.overdue_invoices_count} overdue invoice(s).`)
  }

  if (overview.at_risk_clients && overview.at_risk_clients.length > 0) {
    parts.push(`${overview.at_risk_clients.length} client(s) at risk.`)
  }

  if (overview.cash_flow_30d) {
    parts.push(`30-day projection: ${formatCents(overview.cash_flow_30d.projected_inflow_cents)}.`)
  }

  return parts.join(' ')
}
