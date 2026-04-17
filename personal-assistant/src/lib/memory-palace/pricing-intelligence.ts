/**
 * Memory Palace Pricing Intelligence — Cross-reference invoice amounts
 * with project types, contact entities, and memory entries to answer
 * questions like "What did we charge for the last 3 WordPress builds?"
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PricingQuery {
  orgId: string
  projectType?: string       // e.g., "WordPress", "Shopify"
  contactId?: string         // specific client
  limit?: number
}

export interface PricingDataPoint {
  invoiceId: string
  invoiceNumber: string
  clientName: string
  clientId: string
  projectDescription: string
  total: number
  currency: string
  issuedAt: string
  paidAt: string | null
  status: string
  lineItems: PricingLineItem[]
}

export interface PricingLineItem {
  description: string
  quantity: number
  rate: number
  amount: number
}

export interface PricingAnalysis {
  dataPoints: PricingDataPoint[]
  summary: PricingSummary
}

export interface PricingSummary {
  count: number
  totalRevenue: number
  avgInvoiceAmount: number
  minAmount: number
  maxAmount: number
  medianAmount: number
  avgPaymentDays: number | null
  projectType: string | null
}

// ─── Pricing Intelligence ────────────────────────────────────────────────────

export class PricingIntelligence {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Query pricing history with optional filters.
   * Combines invoice data with memory context for rich results.
   */
  async queryPricing(query: PricingQuery): Promise<PricingAnalysis> {
    const { orgId, projectType, contactId, limit = 10 } = query

    try {
      // 1. Build invoice query
      let invoiceQuery = this.supabase
        .from('invoices')
        .select(`
          id,
          invoice_number,
          client_contact_id,
          description,
          total,
          currency,
          status,
          issue_date,
          paid_date,
          line_items,
          metadata
        `)
        .eq('org_id', orgId)
        .order('issue_date', { ascending: false })
        .limit(limit)

      if (contactId) {
        invoiceQuery = invoiceQuery.eq('client_contact_id', contactId)
      }

      if (projectType) {
        // Search in description and line items for project type
        invoiceQuery = invoiceQuery.ilike('description', `%${projectType}%`)
      }

      const { data: invoices, error } = await invoiceQuery

      if (error) {
        logger.error('[pricing-intelligence] Invoice query failed', { error: error.message })
        return { dataPoints: [], summary: this.emptySummary(projectType) }
      }

      if (!invoices || invoices.length === 0) {
        // Fallback: search memory_palace_entries for pricing memories
        return this.searchPricingMemories(orgId, projectType, contactId, limit)
      }

      // 2. Resolve client names
      const clientIds = [...new Set(invoices.map(i => i.client_contact_id).filter(Boolean))]
      const clientNames = await this.resolveClientNames(orgId, clientIds as string[])

      // 3. Build data points
      const dataPoints: PricingDataPoint[] = invoices.map(inv => ({
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number ?? '',
        clientName: clientNames.get(inv.client_contact_id) ?? 'Unknown',
        clientId: inv.client_contact_id ?? '',
        projectDescription: inv.description ?? '',
        total: Number(inv.total ?? 0),
        currency: inv.currency ?? 'AUD',
        issuedAt: inv.issue_date ?? inv.metadata?.created_at ?? '',
        paidAt: inv.paid_date ?? null,
        status: inv.status ?? 'draft',
        lineItems: this.parseLineItems(inv.line_items),
      }))

      // 4. Calculate summary
      const summary = this.calculateSummary(dataPoints, projectType)

      return { dataPoints, summary }
    } catch (err) {
      logger.error('[pricing-intelligence] queryPricing failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      return { dataPoints: [], summary: this.emptySummary(projectType) }
    }
  }

  /**
   * Get pricing comparison: how our rates compare across clients for similar work.
   */
  async getPricingComparison(
    orgId: string,
    projectType: string,
  ): Promise<{
    byClient: { clientName: string; avgRate: number; invoiceCount: number }[]
    overallAvg: number
  }> {
    const analysis = await this.queryPricing({
      orgId,
      projectType,
      limit: 50,
    })

    const clientMap = new Map<string, { total: number; count: number; name: string }>()

    for (const dp of analysis.dataPoints) {
      const existing = clientMap.get(dp.clientId) ?? { total: 0, count: 0, name: dp.clientName }
      existing.total += dp.total
      existing.count++
      clientMap.set(dp.clientId, existing)
    }

    const byClient = [...clientMap.values()]
      .map(c => ({
        clientName: c.name,
        avgRate: c.count > 0 ? Math.round(c.total / c.count) : 0,
        invoiceCount: c.count,
      }))
      .sort((a, b) => b.avgRate - a.avgRate)

    return {
      byClient,
      overallAvg: analysis.summary.avgInvoiceAmount,
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async resolveClientNames(
    orgId: string,
    clientIds: string[],
  ): Promise<Map<string, string>> {
    if (clientIds.length === 0) return new Map()

    const { data } = await this.supabase
      .from('contacts')
      .select('id, name')
      .eq('org_id', orgId)
      .in('id', clientIds)

    const map = new Map<string, string>()
    for (const c of data ?? []) {
      map.set(c.id, c.name)
    }
    return map
  }

  private parseLineItems(raw: unknown): PricingLineItem[] {
    if (!raw || !Array.isArray(raw)) return []

    return raw.map((item: Record<string, unknown>) => ({
      description: String(item.description ?? ''),
      quantity: Number(item.quantity ?? 1),
      rate: Number(item.rate ?? item.unit_price ?? 0),
      amount: Number(item.amount ?? item.total ?? 0),
    }))
  }

  private calculateSummary(
    dataPoints: PricingDataPoint[],
    projectType: string | null | undefined,
  ): PricingSummary {
    if (dataPoints.length === 0) return this.emptySummary(projectType ?? null)

    const amounts = dataPoints.map(d => d.total).sort((a, b) => a - b)
    const totalRevenue = amounts.reduce((a, b) => a + b, 0)

    // Calculate average payment time
    const paymentDays: number[] = []
    for (const dp of dataPoints) {
      if (dp.paidAt && dp.issuedAt) {
        const days = (new Date(dp.paidAt).getTime() - new Date(dp.issuedAt).getTime()) / (86400000)
        if (days >= 0 && days < 365) paymentDays.push(days)
      }
    }
    const avgPaymentDays = paymentDays.length > 0
      ? Math.round(paymentDays.reduce((a, b) => a + b, 0) / paymentDays.length)
      : null

    return {
      count: dataPoints.length,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      avgInvoiceAmount: Math.round((totalRevenue / dataPoints.length) * 100) / 100,
      minAmount: amounts[0],
      maxAmount: amounts[amounts.length - 1],
      medianAmount: amounts[Math.floor(amounts.length / 2)],
      avgPaymentDays,
      projectType: projectType ?? null,
    }
  }

  private emptySummary(projectType: string | null | undefined): PricingSummary {
    return {
      count: 0,
      totalRevenue: 0,
      avgInvoiceAmount: 0,
      minAmount: 0,
      maxAmount: 0,
      medianAmount: 0,
      avgPaymentDays: null,
      projectType: projectType ?? null,
    }
  }

  /**
   * Fallback: search pricing-category memories when no invoices match.
   */
  private async searchPricingMemories(
    orgId: string,
    projectType: string | null | undefined,
    contactId: string | null | undefined,
    limit: number,
  ): Promise<PricingAnalysis> {
    let q = this.supabase
      .from('memory_palace_entries')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .eq('category', 'pricing')
      .order('confidence', { ascending: false })
      .limit(limit)

    if (projectType) {
      q = q.ilike('content', `%${projectType}%`)
    }
    if (contactId) {
      q = q.contains('entity_ids', [contactId])
    }

    const { data } = await q

    // Convert memories to pseudo-pricing data points
    const dataPoints: PricingDataPoint[] = (data ?? []).map(mem => ({
      invoiceId: mem.id,
      invoiceNumber: '',
      clientName: (mem.entity_names as string[])?.[0] ?? 'Unknown',
      clientId: (mem.entity_ids as string[])?.[0] ?? '',
      projectDescription: mem.content,
      total: 0,
      currency: 'AUD',
      issuedAt: mem.created_at,
      paidAt: null,
      status: 'memory',
      lineItems: [],
    }))

    return { dataPoints, summary: this.emptySummary(projectType) }
  }
}
