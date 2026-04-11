import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClientHealthScore {
  contactId: string
  contactName: string
  score: number // 0-100
  grade: 'excellent' | 'good' | 'fair' | 'poor' | 'critical'
  breakdown: {
    responsiveness: number  // 0-25 (based on message response times)
    paymentHealth: number   // 0-25 (based on invoice payment behavior)
    projectProgress: number // 0-25 (based on project delivery)
    engagement: number      // 0-25 (based on communication frequency)
  }
  flags: string[]
  lastUpdated: string
}

export interface ClientHealthResult {
  scores: ClientHealthScore[]
  averageScore: number
  clientsScored: number
  gatheringData: boolean
  computedAt: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum contacts with activity needed before health scoring is meaningful */
const MIN_ACTIVE_CONTACTS = 2

/** Cache metric type for bi_snapshots */
const CACHE_METRIC_TYPE = 'client_health'

/** Cache TTL: 24 hours */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Main: Compute Client Health Scores
// ---------------------------------------------------------------------------

/**
 * Compute per-client health scores (0-100) from response times, payment behavior,
 * project progress, and communication frequency.
 * Caches results in bi_snapshots with 24h TTL.
 */
export async function computeClientHealth(
  supabase: SupabaseClient,
  orgId: string,
): Promise<ClientHealthResult> {
  const tag = `[client-health:${orgId.slice(0, 8)}]`

  // Check cache
  const cached = await getCachedResult(supabase, orgId)
  if (cached) {
    logger.info(`${tag} Returning cached client health scores`)
    return cached
  }

  // Fetch contacts with some activity
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, name, last_activity_at, created_at')
    .eq('org_id', orgId)

  const activeContacts = (contacts ?? []).filter(
    (c) => c.last_activity_at || c.created_at,
  )

  if (activeContacts.length < MIN_ACTIVE_CONTACTS) {
    const result: ClientHealthResult = {
      scores: [],
      averageScore: 0,
      clientsScored: 0,
      gatheringData: true,
      computedAt: new Date().toISOString(),
    }
    await cacheResult(supabase, orgId, result)
    logger.info(`${tag} Gathering data: only ${activeContacts.length} active contacts`)
    return result
  }

  // -------------------------------------------------------------------------
  // Fetch supporting data for all contacts at once (batch queries)
  // -------------------------------------------------------------------------

  // Invoices
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, client_contact_id, status, total, due_date, paid_date, created_at')
    .eq('org_id', orgId)

  const allInvoices = invoices ?? []
  const invoicesByContact: Record<string, typeof allInvoices> = {}
  for (const inv of allInvoices) {
    const cid = inv.client_contact_id as string
    if (!cid) continue
    if (!invoicesByContact[cid]) invoicesByContact[cid] = []
    invoicesByContact[cid].push(inv)
  }

  // Projects
  const { data: projects } = await supabase
    .from('projects')
    .select('id, contact_id, status, created_at, completed_at')
    .eq('org_id', orgId)

  const allProjects = projects ?? []
  const projectsByContact: Record<string, typeof allProjects> = {}
  for (const proj of allProjects) {
    const cid = proj.contact_id as string
    if (!cid) continue
    if (!projectsByContact[cid]) projectsByContact[cid] = []
    projectsByContact[cid].push(proj)
  }

  // Channel messages (recent 90 days for response time analysis)
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const { data: messages } = await supabase
    .from('channel_messages')
    .select('id, contact_id, direction, received_at, processed')
    .eq('org_id', orgId)
    .gte('received_at', ninetyDaysAgo)

  const allMessages = messages ?? []
  const messagesByContact: Record<string, typeof allMessages> = {}
  for (const msg of allMessages) {
    const cid = msg.contact_id as string
    if (!cid) continue
    if (!messagesByContact[cid]) messagesByContact[cid] = []
    messagesByContact[cid].push(msg)
  }

  // -------------------------------------------------------------------------
  // Score each contact
  // -------------------------------------------------------------------------
  const scores: ClientHealthScore[] = []
  const now = new Date()

  for (const contact of activeContacts) {
    const contactInvoices = invoicesByContact[contact.id] ?? []
    const contactProjects = projectsByContact[contact.id] ?? []
    const contactMessages = messagesByContact[contact.id] ?? []

    const flags: string[] = []

    // --- Dimension 1: Responsiveness (0-25) ---
    const responsiveness = scoreResponsiveness(contactMessages, flags)

    // --- Dimension 2: Payment Health (0-25) ---
    const paymentHealth = scorePaymentHealth(contactInvoices, flags)

    // --- Dimension 3: Project Progress (0-25) ---
    const projectProgress = scoreProjectProgress(contactProjects, flags)

    // --- Dimension 4: Engagement (0-25) ---
    const engagement = scoreEngagement(
      contactMessages,
      contact.last_activity_at as string | null,
      now,
      flags,
    )

    const totalScore = Math.round(responsiveness + paymentHealth + projectProgress + engagement)
    const clampedScore = Math.max(0, Math.min(100, totalScore))

    scores.push({
      contactId: contact.id,
      contactName: contact.name as string,
      score: clampedScore,
      grade: scoreToGrade(clampedScore),
      breakdown: {
        responsiveness: Math.round(responsiveness),
        paymentHealth: Math.round(paymentHealth),
        projectProgress: Math.round(projectProgress),
        engagement: Math.round(engagement),
      },
      flags,
      lastUpdated: now.toISOString(),
    })
  }

  // Sort by score ascending (worst first -- most attention needed)
  scores.sort((a, b) => a.score - b.score)

  const averageScore = scores.length > 0
    ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length)
    : 0

  const result: ClientHealthResult = {
    scores,
    averageScore,
    clientsScored: scores.length,
    gatheringData: false,
    computedAt: now.toISOString(),
  }

  await cacheResult(supabase, orgId, result)

  logger.info(
    `${tag} Scored ${scores.length} clients: avg=${averageScore}, ` +
    `critical=${scores.filter((s) => s.grade === 'critical').length}, ` +
    `poor=${scores.filter((s) => s.grade === 'poor').length}`,
  )

  return result
}

// ---------------------------------------------------------------------------
// Scoring Functions (each returns 0-25)
// ---------------------------------------------------------------------------

/** Score responsiveness based on inbound message frequency and response presence. */
function scoreResponsiveness(
  messages: Array<{ direction: unknown; received_at: unknown }>,
  flags: string[],
): number {
  if (messages.length === 0) return 12.5 // Neutral if no messages

  const inbound = messages.filter((m) => m.direction === 'inbound')
  const outbound = messages.filter((m) => m.direction === 'outbound')

  if (inbound.length === 0) return 20 // They respond to us, that's good

  // Response ratio: outbound / inbound
  const responseRatio = outbound.length / inbound.length

  if (responseRatio >= 0.8) return 25
  if (responseRatio >= 0.5) return 20
  if (responseRatio >= 0.3) return 15

  if (responseRatio < 0.2) {
    flags.push('Low response rate')
  }

  return Math.max(5, responseRatio * 25)
}

/** Score payment health based on invoice payment timing and status. */
function scorePaymentHealth(
  invoices: Array<{
    status: unknown
    due_date: unknown
    paid_date: unknown
    total: unknown
    created_at: unknown
  }>,
  flags: string[],
): number {
  if (invoices.length === 0) return 12.5 // Neutral if no invoices

  let score = 25
  const paidInvoices = invoices.filter((i) => i.status === 'paid')
  const overdueInvoices = invoices.filter((i) =>
    i.status === 'overdue' || (
      ['sent', 'viewed'].includes(i.status as string) &&
      i.due_date &&
      new Date(i.due_date as string) < new Date()
    ),
  )

  // Penalty for overdue invoices
  if (overdueInvoices.length > 0) {
    const overdueRatio = overdueInvoices.length / invoices.length
    score -= overdueRatio * 15
    flags.push(`${overdueInvoices.length} overdue invoice${overdueInvoices.length > 1 ? 's' : ''}`)
  }

  // Bonus for on-time payments
  let onTimeCount = 0
  for (const inv of paidInvoices) {
    if (inv.due_date && inv.paid_date) {
      const dueDate = new Date(inv.due_date as string)
      const paidDate = new Date(inv.paid_date as string)
      if (paidDate <= dueDate) {
        onTimeCount++
      }
    }
  }

  if (paidInvoices.length > 0) {
    const onTimeRatio = onTimeCount / paidInvoices.length
    if (onTimeRatio >= 0.9) {
      score = Math.min(25, score + 3)
    } else if (onTimeRatio < 0.5) {
      score -= 5
      flags.push('Frequently pays late')
    }
  }

  return Math.max(0, Math.min(25, score))
}

/** Score project progress based on completion rate and status. */
function scoreProjectProgress(
  projects: Array<{
    status: unknown
    completed_at: unknown
    created_at: unknown
  }>,
  flags: string[],
): number {
  if (projects.length === 0) return 12.5 // Neutral if no projects

  const completed = projects.filter((p) => p.status === 'completed')
  const active = projects.filter((p) => p.status === 'active')
  const cancelled = projects.filter((p) => p.status === 'cancelled')

  const completionRatio = projects.length > 0
    ? completed.length / projects.length
    : 0

  let score = completionRatio * 20

  // Active projects are positive signal
  if (active.length > 0) {
    score += 5
  }

  // Cancelled projects are negative signal
  if (cancelled.length > 0) {
    const cancelRatio = cancelled.length / projects.length
    score -= cancelRatio * 10
    if (cancelRatio > 0.3) {
      flags.push('High project cancellation rate')
    }
  }

  return Math.max(0, Math.min(25, score))
}

/** Score engagement based on recent communication frequency. */
function scoreEngagement(
  messages: Array<{ received_at: unknown; direction: unknown }>,
  lastActivityAt: string | null,
  now: Date,
  flags: string[],
): number {
  // Days since last activity
  const lastActivity = lastActivityAt ? new Date(lastActivityAt) : null
  const daysSinceActivity = lastActivity
    ? Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
    : 999

  if (daysSinceActivity > 180) {
    flags.push('No activity in 6+ months')
    return 2
  }

  if (daysSinceActivity > 90) {
    flags.push('No activity in 3+ months')
    return 5
  }

  // Recent message volume (last 30 days)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const recentMessages = messages.filter(
    (m) => new Date(m.received_at as string) >= thirtyDaysAgo,
  )

  if (recentMessages.length === 0 && daysSinceActivity > 30) {
    flags.push('No recent communication')
    return 8
  }

  // Score based on frequency
  if (recentMessages.length >= 10) return 25
  if (recentMessages.length >= 5) return 20
  if (recentMessages.length >= 2) return 15

  return 10
}

// ---------------------------------------------------------------------------
// Grade Conversion
// ---------------------------------------------------------------------------

function scoreToGrade(score: number): ClientHealthScore['grade'] {
  if (score >= 80) return 'excellent'
  if (score >= 60) return 'good'
  if (score >= 40) return 'fair'
  if (score >= 20) return 'poor'
  return 'critical'
}

// ---------------------------------------------------------------------------
// Cache Helpers (bi_snapshots)
// ---------------------------------------------------------------------------

async function getCachedResult(
  supabase: SupabaseClient,
  orgId: string,
): Promise<ClientHealthResult | null> {
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

    return data.data as ClientHealthResult
  } catch {
    return null
  }
}

async function cacheResult(
  supabase: SupabaseClient,
  orgId: string,
  result: ClientHealthResult,
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
    logger.warn(`[client-health] Cache write failed: ${message}`)
  }
}
