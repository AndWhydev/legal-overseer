import type { SupabaseClient } from '@supabase/supabase-js'
import type { RoleInsight } from '../role-registry'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WinLossResult {
  learnings: WinLossLearning[]
  pricingPatterns: Record<string, { avgPrice: number; count: number }>
  stats: {
    totalWins: number
    totalLosses: number
    winRate: number
    avgWinValue: number
    avgLossValue: number
    avgTimeToClose: number
  }
}

export interface WinLossLearning {
  summary: string
  details: Record<string, unknown>
  priority: 'high' | 'medium' | 'low'
}

interface ProposalOutcome {
  id: string
  projectType: string
  status: 'accepted' | 'declined'
  pricing: Array<{ tier: string; price: number }>
  createdAt: string
  acceptedAt: string | null
  sentAt: string | null
  clientContactId: string | null
  timeline: string | null
}

// ---------------------------------------------------------------------------
// Win/Loss Pattern Analysis
// ---------------------------------------------------------------------------

/**
 * Analyze proposal outcomes to learn pricing/timing patterns from
 * wins vs losses. Generates actionable insights and updates pricing
 * patterns in role state.
 *
 * Runs weekly to accumulate enough data for meaningful patterns.
 */
export async function analyzeWinLossPatterns(
  supabase: SupabaseClient,
  orgId: string,
): Promise<WinLossResult> {
  const tag = `[win-loss-learner:${orgId.slice(0, 8)}]`

  // Fetch all resolved proposals (accepted or declined)
  const { data: proposals, error } = await supabase
    .from('proposals')
    .select('id, project_type, status, pricing, created_at, accepted_at, sent_at, client_contact_id, timeline')
    .eq('org_id', orgId)
    .in('status', ['accepted', 'declined'])
    .order('created_at', { ascending: false })
    .limit(100)

  if (error || !proposals || proposals.length === 0) {
    logger.info(`${tag} No resolved proposals found for analysis`)
    return {
      learnings: [],
      pricingPatterns: {},
      stats: { totalWins: 0, totalLosses: 0, winRate: 0, avgWinValue: 0, avgLossValue: 0, avgTimeToClose: 0 },
    }
  }

  // Parse proposals into structured outcomes
  const outcomes: ProposalOutcome[] = proposals.map((p) => {
    let pricing: Array<{ tier: string; price: number }> = []
    try {
      const raw = typeof p.pricing === 'string' ? JSON.parse(p.pricing) : p.pricing
      if (Array.isArray(raw)) pricing = raw
    } catch {
      // Skip malformed pricing
    }

    return {
      id: p.id as string,
      projectType: p.project_type as string,
      status: p.status as 'accepted' | 'declined',
      pricing,
      createdAt: p.created_at as string,
      acceptedAt: p.accepted_at as string | null,
      sentAt: p.sent_at as string | null,
      clientContactId: p.client_contact_id as string | null,
      timeline: p.timeline as string | null,
    }
  })

  const wins = outcomes.filter((o) => o.status === 'accepted')
  const losses = outcomes.filter((o) => o.status === 'declined')

  // Calculate basic stats
  const getStandardPrice = (pricing: Array<{ tier: string; price: number }>): number => {
    const standard = pricing.find((t) => t.tier.toLowerCase().includes('standard'))
    return standard?.price ?? pricing[0]?.price ?? 0
  }

  const winValues = wins.map((w) => getStandardPrice(w.pricing)).filter((v) => v > 0)
  const lossValues = losses.map((l) => getStandardPrice(l.pricing)).filter((v) => v > 0)

  const avgWinValue = winValues.length > 0
    ? Math.round(winValues.reduce((a, b) => a + b, 0) / winValues.length)
    : 0
  const avgLossValue = lossValues.length > 0
    ? Math.round(lossValues.reduce((a, b) => a + b, 0) / lossValues.length)
    : 0

  // Time to close (days from sent to accepted)
  const closeTimes = wins
    .filter((w) => w.sentAt && w.acceptedAt)
    .map((w) => {
      const sent = new Date(w.sentAt!).getTime()
      const accepted = new Date(w.acceptedAt!).getTime()
      return Math.floor((accepted - sent) / (1000 * 60 * 60 * 24))
    })
    .filter((d) => d >= 0)

  const avgTimeToClose = closeTimes.length > 0
    ? Math.round(closeTimes.reduce((a, b) => a + b, 0) / closeTimes.length)
    : 0

  const winRate = outcomes.length > 0
    ? Math.round((wins.length / outcomes.length) * 100)
    : 0

  const stats = {
    totalWins: wins.length,
    totalLosses: losses.length,
    winRate,
    avgWinValue,
    avgLossValue,
    avgTimeToClose,
  }

  // ---------------------------------------------------------------------------
  // Build Pricing Patterns by Project Type
  // ---------------------------------------------------------------------------
  const pricingPatterns: Record<string, { avgPrice: number; count: number }> = {}

  // Group wins by project type for pricing intelligence
  const winsByType = new Map<string, number[]>()
  for (const win of wins) {
    const price = getStandardPrice(win.pricing)
    if (price <= 0) continue
    const existing = winsByType.get(win.projectType) ?? []
    existing.push(price)
    winsByType.set(win.projectType, existing)
  }

  for (const [type, prices] of winsByType) {
    const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
    pricingPatterns[type] = { avgPrice: avg, count: prices.length }
  }

  // ---------------------------------------------------------------------------
  // Generate Learnings
  // ---------------------------------------------------------------------------
  const learnings: WinLossLearning[] = []

  // Learning 1: Overall win rate
  if (outcomes.length >= 5) {
    const priority = winRate >= 60 ? 'low' : winRate >= 40 ? 'medium' : 'high'
    learnings.push({
      summary: `Win rate: ${winRate}% (${wins.length} won, ${losses.length} lost from ${outcomes.length} proposals)`,
      details: { winRate, wins: wins.length, losses: losses.length, total: outcomes.length },
      priority,
    })
  }

  // Learning 2: Price sensitivity (if losses are priced higher than wins)
  if (avgWinValue > 0 && avgLossValue > 0 && avgLossValue > avgWinValue * 1.3) {
    learnings.push({
      summary: `Price sensitivity detected: declined proposals average $${avgLossValue} vs won proposals at $${avgWinValue} (${Math.round((avgLossValue / avgWinValue - 1) * 100)}% higher)`,
      details: { avgWinValue, avgLossValue, difference: avgLossValue - avgWinValue },
      priority: 'high',
    })
  }

  // Learning 3: Time to close patterns
  if (closeTimes.length >= 3) {
    learnings.push({
      summary: `Average time to close: ${avgTimeToClose} days (from ${closeTimes.length} proposals)`,
      details: { avgTimeToClose, sampleSize: closeTimes.length, min: Math.min(...closeTimes), max: Math.max(...closeTimes) },
      priority: 'low',
    })
  }

  // Learning 4: Best performing project types
  const typeWinRates = new Map<string, { wins: number; total: number }>()
  for (const o of outcomes) {
    const existing = typeWinRates.get(o.projectType) ?? { wins: 0, total: 0 }
    existing.total++
    if (o.status === 'accepted') existing.wins++
    typeWinRates.set(o.projectType, existing)
  }

  for (const [type, data] of typeWinRates) {
    if (data.total < 3) continue // Need enough data
    const typeRate = Math.round((data.wins / data.total) * 100)
    if (typeRate >= 70) {
      learnings.push({
        summary: `Strong in ${type}: ${typeRate}% win rate (${data.wins}/${data.total})`,
        details: { projectType: type, winRate: typeRate, wins: data.wins, total: data.total },
        priority: 'medium',
      })
    } else if (typeRate <= 30) {
      learnings.push({
        summary: `Weak in ${type}: ${typeRate}% win rate (${data.wins}/${data.total}) -- consider pricing or positioning adjustments`,
        details: { projectType: type, winRate: typeRate, wins: data.wins, total: data.total },
        priority: 'high',
      })
    }
  }

  logger.info(
    `${tag} Analysis: ${wins.length} wins, ${losses.length} losses, ${winRate}% rate, ` +
    `${learnings.length} learnings, ${Object.keys(pricingPatterns).length} type patterns`,
  )

  return { learnings, pricingPatterns, stats }
}
