import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RevenueOpportunity {
  type: 'upsell' | 'stale_client' | 'pricing_gap' | 'repeat_potential'
  contactId: string
  contactName: string
  summary: string
  estimatedValue: number
  confidence: number
  details: Record<string, unknown>
}

export interface RevenueRadarResult {
  opportunities: RevenueOpportunity[]
  totalEstimatedValue: number
  clientsAnalyzed: number
  gatheringData: boolean
  computedAt: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum invoices needed before revenue analysis is meaningful */
const MIN_INVOICES = 3

/** Days without activity before a client is considered stale */
const STALE_CLIENT_DAYS = 90

/** Days since last project without follow-up that signals upsell potential */
const UPSELL_WINDOW_DAYS = 60

/** Cache metric type for bi_snapshots */
const CACHE_METRIC_TYPE = 'revenue_radar'

/** Cache TTL: 24 hours */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Main: Analyze Revenue Opportunities
// ---------------------------------------------------------------------------

/**
 * Scan client history for upsell opportunities, stale clients, and pricing gaps.
 * Caches results in bi_snapshots with 24h TTL.
 */
export async function analyzeRevenueOpportunities(
  supabase: SupabaseClient,
  orgId: string,
): Promise<RevenueRadarResult> {
  const tag = `[revenue-radar:${orgId.slice(0, 8)}]`

  // Check cache
  const cached = await getCachedResult(supabase, orgId)
  if (cached) {
    logger.info(`${tag} Returning cached revenue radar result`)
    return cached
  }

  // Check minimum data threshold
  const { count: invoiceCount } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)

  if ((invoiceCount ?? 0) < MIN_INVOICES) {
    const result: RevenueRadarResult = {
      opportunities: [],
      totalEstimatedValue: 0,
      clientsAnalyzed: 0,
      gatheringData: true,
      computedAt: new Date().toISOString(),
    }
    await cacheResult(supabase, orgId, result)
    logger.info(`${tag} Gathering data: only ${invoiceCount ?? 0} invoices (need ${MIN_INVOICES})`)
    return result
  }

  const opportunities: RevenueOpportunity[] = []
  const now = new Date()

  // -------------------------------------------------------------------------
  // 1. Fetch contacts with their invoice history
  // -------------------------------------------------------------------------
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, name, emails, last_activity_at, created_at')
    .eq('org_id', orgId)

  if (!contacts || contacts.length === 0) {
    const result: RevenueRadarResult = {
      opportunities: [],
      totalEstimatedValue: 0,
      clientsAnalyzed: 0,
      gatheringData: false,
      computedAt: now.toISOString(),
    }
    await cacheResult(supabase, orgId, result)
    return result
  }

  // -------------------------------------------------------------------------
  // 2. Fetch all invoices for this org (grouped analysis)
  // -------------------------------------------------------------------------
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, client_contact_id, total, status, created_at, paid_date, currency')
    .eq('org_id', orgId)

  const allInvoices = invoices ?? []

  // Group invoices by contact
  const invoicesByContact: Record<string, typeof allInvoices> = {}
  for (const inv of allInvoices) {
    const cid = inv.client_contact_id as string
    if (!cid) continue
    if (!invoicesByContact[cid]) invoicesByContact[cid] = []
    invoicesByContact[cid].push(inv)
  }

  // -------------------------------------------------------------------------
  // 3. Fetch completed projects for upsell detection
  // -------------------------------------------------------------------------
  const { data: projects } = await supabase
    .from('projects')
    .select('id, contact_id, name, status, completed_at, created_at')
    .eq('org_id', orgId)

  const allProjects = projects ?? []
  const projectsByContact: Record<string, typeof allProjects> = {}
  for (const proj of allProjects) {
    const cid = proj.contact_id as string
    if (!cid) continue
    if (!projectsByContact[cid]) projectsByContact[cid] = []
    projectsByContact[cid].push(proj)
  }

  // -------------------------------------------------------------------------
  // 4. Analyze each contact
  // -------------------------------------------------------------------------
  for (const contact of contacts) {
    const contactInvoices = invoicesByContact[contact.id] ?? []
    const contactProjects = projectsByContact[contact.id] ?? []

    // --- Stale client detection ---
    const lastActivityStr = contact.last_activity_at as string | null
    const lastInvoiceDate = contactInvoices.length > 0
      ? Math.max(
          ...contactInvoices.map((i) =>
            new Date(i.created_at as string).getTime(),
          ),
        )
      : 0

    const lastActivity = lastActivityStr
      ? new Date(lastActivityStr).getTime()
      : lastInvoiceDate

    if (lastActivity > 0) {
      const daysSinceActivity = Math.floor(
        (now.getTime() - lastActivity) / (1000 * 60 * 60 * 24),
      )

      if (daysSinceActivity >= STALE_CLIENT_DAYS && contactInvoices.length >= 1) {
        const avgInvoiceValue = contactInvoices.reduce(
          (sum, i) => sum + (Number(i.total) || 0),
          0,
        ) / contactInvoices.length

        opportunities.push({
          type: 'stale_client',
          contactId: contact.id,
          contactName: contact.name as string,
          summary: `${contact.name} has been inactive for ${daysSinceActivity} days (${contactInvoices.length} past invoices, avg $${avgInvoiceValue.toFixed(0)})`,
          estimatedValue: avgInvoiceValue,
          confidence: Math.min(0.9, 0.5 + contactInvoices.length * 0.1),
          details: {
            daysSinceActivity,
            invoiceCount: contactInvoices.length,
            avgInvoiceValue,
            lastActivityDate: lastActivityStr ?? new Date(lastInvoiceDate).toISOString(),
          },
        })
      }
    }

    // --- Upsell: completed project without follow-up ---
    const completedProjects = contactProjects.filter(
      (p) => p.status === 'completed' && p.completed_at,
    )

    for (const proj of completedProjects) {
      const completedDate = new Date(proj.completed_at as string)
      const daysSinceCompleted = Math.floor(
        (now.getTime() - completedDate.getTime()) / (1000 * 60 * 60 * 24),
      )

      if (daysSinceCompleted >= UPSELL_WINDOW_DAYS && daysSinceCompleted < STALE_CLIENT_DAYS * 2) {
        // Check if any new project or proposal was created after completion
        const hasFollowUp = contactProjects.some(
          (p) =>
            p.id !== proj.id &&
            new Date(p.created_at as string) > completedDate,
        )

        if (!hasFollowUp) {
          const avgValue = contactInvoices.length > 0
            ? contactInvoices.reduce((sum, i) => sum + (Number(i.total) || 0), 0) / contactInvoices.length
            : 0

          opportunities.push({
            type: 'upsell',
            contactId: contact.id,
            contactName: contact.name as string,
            summary: `"${proj.name}" completed ${daysSinceCompleted} days ago for ${contact.name} -- no follow-up project started`,
            estimatedValue: avgValue,
            confidence: 0.7,
            details: {
              projectId: proj.id,
              projectName: proj.name,
              daysSinceCompleted,
              avgInvoiceValue: avgValue,
            },
          })
        }
      }
    }

    // --- Pricing gap: client's average is significantly below org average ---
    if (contactInvoices.length >= 2) {
      const contactAvg = contactInvoices.reduce(
        (sum, i) => sum + (Number(i.total) || 0),
        0,
      ) / contactInvoices.length

      const orgAvg = allInvoices.length > 0
        ? allInvoices.reduce((sum, i) => sum + (Number(i.total) || 0), 0) / allInvoices.length
        : 0

      // Flag if client avg is 40%+ below org average (potential undercharging)
      if (orgAvg > 0 && contactAvg < orgAvg * 0.6) {
        const gap = orgAvg - contactAvg

        opportunities.push({
          type: 'pricing_gap',
          contactId: contact.id,
          contactName: contact.name as string,
          summary: `${contact.name} avg invoice $${contactAvg.toFixed(0)} is ${Math.round((1 - contactAvg / orgAvg) * 100)}% below org average $${orgAvg.toFixed(0)}`,
          estimatedValue: gap,
          confidence: 0.6,
          details: {
            contactAvg,
            orgAvg,
            gapPercent: Math.round((1 - contactAvg / orgAvg) * 100),
            invoiceCount: contactInvoices.length,
          },
        })
      }
    }

    // --- Repeat potential: client paid well and hasn't been invoiced recently ---
    const paidInvoices = contactInvoices.filter((i) => i.status === 'paid')
    if (paidInvoices.length >= 2) {
      const avgGapMs = computeAverageInvoiceGap(paidInvoices)
      if (avgGapMs > 0) {
        const lastInvoiceTime = Math.max(
          ...contactInvoices.map((i) => new Date(i.created_at as string).getTime()),
        )
        const timeSinceLastInvoice = now.getTime() - lastInvoiceTime
        const avgGapDays = Math.floor(avgGapMs / (1000 * 60 * 60 * 24))

        // If time since last invoice is 50%+ over their average gap
        if (timeSinceLastInvoice > avgGapMs * 1.5) {
          const daysSinceLast = Math.floor(timeSinceLastInvoice / (1000 * 60 * 60 * 24))
          const avgValue = paidInvoices.reduce(
            (sum, i) => sum + (Number(i.total) || 0),
            0,
          ) / paidInvoices.length

          opportunities.push({
            type: 'repeat_potential',
            contactId: contact.id,
            contactName: contact.name as string,
            summary: `${contact.name} usually invoiced every ~${avgGapDays} days but last invoice was ${daysSinceLast} days ago`,
            estimatedValue: avgValue,
            confidence: Math.min(0.85, 0.5 + paidInvoices.length * 0.1),
            details: {
              avgGapDays,
              daysSinceLastInvoice: daysSinceLast,
              paidInvoiceCount: paidInvoices.length,
              avgValue,
            },
          })
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 5. Sort by estimated value (highest first), dedupe by contact+type
  // -------------------------------------------------------------------------
  const seen = new Set<string>()
  const dedupedOpps: RevenueOpportunity[] = []
  for (const opp of opportunities.sort((a, b) => b.estimatedValue - a.estimatedValue)) {
    const key = `${opp.contactId}:${opp.type}`
    if (seen.has(key)) continue
    seen.add(key)
    dedupedOpps.push(opp)
  }

  const totalEstimatedValue = dedupedOpps.reduce((sum, o) => sum + o.estimatedValue, 0)

  const result: RevenueRadarResult = {
    opportunities: dedupedOpps,
    totalEstimatedValue,
    clientsAnalyzed: contacts.length,
    gatheringData: false,
    computedAt: now.toISOString(),
  }

  // Cache
  await cacheResult(supabase, orgId, result)

  logger.info(
    `${tag} Found ${dedupedOpps.length} opportunities ($${totalEstimatedValue.toFixed(0)} est.) from ${contacts.length} clients`,
  )

  return result
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute average time gap between paid invoices (in ms). */
function computeAverageInvoiceGap(
  paidInvoices: Array<{ created_at: unknown }>,
): number {
  if (paidInvoices.length < 2) return 0

  const sorted = paidInvoices
    .map((i) => new Date(i.created_at as string).getTime())
    .sort((a, b) => a - b)

  let totalGap = 0
  for (let i = 1; i < sorted.length; i++) {
    totalGap += sorted[i] - sorted[i - 1]
  }

  return totalGap / (sorted.length - 1)
}

// ---------------------------------------------------------------------------
// Cache Helpers (bi_snapshots)
// ---------------------------------------------------------------------------

async function getCachedResult(
  supabase: SupabaseClient,
  orgId: string,
): Promise<RevenueRadarResult | null> {
  try {
    const { data } = await supabase
      .from('bi_snapshots')
      .select('data, expires_at')
      .eq('org_id', orgId)
      .eq('metric_type', CACHE_METRIC_TYPE)
      .single()

    if (!data) return null

    const expiresAt = new Date(data.expires_at as string)
    if (expiresAt <= new Date()) return null

    return data.data as RevenueRadarResult
  } catch {
    return null
  }
}

async function cacheResult(
  supabase: SupabaseClient,
  orgId: string,
  result: RevenueRadarResult,
): Promise<void> {
  try {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + CACHE_TTL_MS).toISOString()

    await supabase.from('bi_snapshots').upsert(
      {
        org_id: orgId,
        metric_type: CACHE_METRIC_TYPE,
        data: result,
        computed_at: now.toISOString(),
        expires_at: expiresAt,
      },
      { onConflict: 'org_id,metric_type' },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.warn(`[revenue-radar] Cache write failed: ${message}`)
  }
}
