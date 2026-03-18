import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PipelineSnapshot {
  period: string
  totalLeads: number
  hotLeads: number
  warmLeads: number
  coldLeads: number
  totalProposals: number
  proposalsSent: number
  proposalsAccepted: number
  proposalsDeclined: number
  activeClients: number
  pipelineValue: number
  conversionRate: number
  alerts: PipelineAlert[]
}

export interface PipelineAlert {
  summary: string
  details: Record<string, unknown>
  priority: 'high' | 'medium' | 'low'
}

interface PipelineStage {
  stage: string
  count: number
  value: number
}

// ---------------------------------------------------------------------------
// Pipeline Snapshot Computation
// ---------------------------------------------------------------------------

/**
 * Compute a full pipeline snapshot: leads -> proposals -> active -> closed
 * with conversion metrics. Cached in bi_snapshots with 24h TTL.
 */
export async function computePipelineSnapshot(
  supabase: SupabaseClient,
  orgId: string,
): Promise<PipelineSnapshot> {
  const tag = `[pipeline-tracker:${orgId.slice(0, 8)}]`

  // Check cache first
  const cached = await getCachedSnapshot(supabase, orgId)
  if (cached) return cached

  // -----------------------------------------------------------------------
  // 1. Lead counts by score
  // -----------------------------------------------------------------------
  const { data: leads } = await supabase
    .from('leads')
    .select('id, score, estimated_value, status')
    .eq('org_id', orgId)

  const allLeads = leads ?? []
  const activeLeads = allLeads.filter((l) =>
    ['new', 'qualified', 'contacted'].includes(l.status as string),
  )

  const hotLeads = activeLeads.filter((l) => l.score === 'hot').length
  const warmLeads = activeLeads.filter((l) => l.score === 'warm').length
  const coldLeads = activeLeads.filter((l) => l.score === 'cold').length
  const totalLeads = activeLeads.length

  // -----------------------------------------------------------------------
  // 2. Proposal counts and values
  // -----------------------------------------------------------------------
  const { data: proposals } = await supabase
    .from('proposals')
    .select('id, status, pricing, created_at')
    .eq('org_id', orgId)

  const allProposals = proposals ?? []
  const totalProposals = allProposals.length
  const proposalsSent = allProposals.filter((p) =>
    ['sent', 'viewed'].includes(p.status as string),
  ).length
  const proposalsAccepted = allProposals.filter((p) => p.status === 'accepted').length
  const proposalsDeclined = allProposals.filter((p) => p.status === 'declined').length

  // Pipeline value: sum of standard tier prices for active proposals
  let pipelineValue = 0
  for (const prop of allProposals) {
    if (['draft', 'sent', 'viewed'].includes(prop.status as string)) {
      try {
        const pricing = typeof prop.pricing === 'string'
          ? JSON.parse(prop.pricing)
          : prop.pricing
        if (Array.isArray(pricing)) {
          const standard = pricing.find((t: { tier: string }) =>
            t.tier.toLowerCase().includes('standard'),
          )
          pipelineValue += standard?.price ?? pricing[0]?.price ?? 0
        }
      } catch {
        // Skip malformed pricing
      }
    }
  }

  // -----------------------------------------------------------------------
  // 3. Active clients (from onboardings or accepted proposals)
  // -----------------------------------------------------------------------
  const { count: activeClientCount } = await supabase
    .from('onboardings')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('status', 'active')

  const activeClients = activeClientCount ?? proposalsAccepted

  // -----------------------------------------------------------------------
  // 4. Conversion rate
  // -----------------------------------------------------------------------
  const totalResolved = proposalsAccepted + proposalsDeclined
  const conversionRate = totalResolved > 0
    ? Math.round((proposalsAccepted / totalResolved) * 100)
    : 0

  // -----------------------------------------------------------------------
  // 5. Generate alerts
  // -----------------------------------------------------------------------
  const alerts: PipelineAlert[] = []

  // Alert: Pipeline drying up (few active leads)
  if (totalLeads < 3 && totalProposals > 0) {
    alerts.push({
      summary: `Pipeline running dry: only ${totalLeads} active lead${totalLeads !== 1 ? 's' : ''}. Consider outreach or marketing.`,
      details: { totalLeads, threshold: 3 },
      priority: 'high',
    })
  }

  // Alert: Low conversion rate
  if (totalResolved >= 5 && conversionRate < 30) {
    alerts.push({
      summary: `Low conversion rate: ${conversionRate}% (${proposalsAccepted}/${totalResolved}). Review pricing or proposal quality.`,
      details: { conversionRate, accepted: proposalsAccepted, total: totalResolved },
      priority: 'high',
    })
  }

  // Alert: Large pipeline value at risk (sent but not viewed)
  const sentNotViewed = allProposals.filter((p) => p.status === 'sent')
  if (sentNotViewed.length >= 3) {
    alerts.push({
      summary: `${sentNotViewed.length} proposals sent but not yet viewed. Consider follow-ups.`,
      details: { count: sentNotViewed.length },
      priority: 'medium',
    })
  }

  // Alert: Hot leads without proposals
  if (hotLeads > 0) {
    alerts.push({
      summary: `${hotLeads} hot lead${hotLeads > 1 ? 's' : ''} in pipeline -- prioritize proposal generation`,
      details: { hotLeads },
      priority: 'high',
    })
  }

  const snapshot: PipelineSnapshot = {
    period: 'current',
    totalLeads,
    hotLeads,
    warmLeads,
    coldLeads,
    totalProposals,
    proposalsSent,
    proposalsAccepted,
    proposalsDeclined,
    activeClients,
    pipelineValue: Math.round(pipelineValue),
    conversionRate,
    alerts,
  }

  // Cache the snapshot
  await cacheSnapshot(supabase, orgId, snapshot)

  logger.info(
    `${tag} Pipeline: ${totalLeads} leads (${hotLeads}H/${warmLeads}W/${coldLeads}C), ` +
    `${totalProposals} proposals, ${conversionRate}% conversion, $${pipelineValue} value`,
  )

  return snapshot
}

// ---------------------------------------------------------------------------
// Cache Management (bi_snapshots table)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

async function getCachedSnapshot(
  supabase: SupabaseClient,
  orgId: string,
): Promise<PipelineSnapshot | null> {
  try {
    const { data } = await supabase
      .from('bi_snapshots')
      .select('data, expires_at')
      .eq('org_id', orgId)
      .eq('metric_type', 'sales_pipeline')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!data) return null

    const expiresAt = data.expires_at as string
    if (new Date(expiresAt).getTime() <= Date.now()) {
      return null // Expired
    }

    return data.data as PipelineSnapshot
  } catch {
    return null
  }
}

async function cacheSnapshot(
  supabase: SupabaseClient,
  orgId: string,
  snapshot: PipelineSnapshot,
): Promise<void> {
  try {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + CACHE_TTL_MS).toISOString()

    await supabase.from('bi_snapshots').upsert(
      {
        org_id: orgId,
        metric_type: 'sales_pipeline',
        data: snapshot,
        expires_at: expiresAt,
        created_at: now.toISOString(),
      },
      { onConflict: 'org_id,metric_type' },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.warn(`[pipeline-tracker] Cache write failed: ${message}`)
  }
}
