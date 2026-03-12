import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

interface PatternResult {
  patternType: string
  data: Record<string, unknown>
  sampleCount: number
  confidence: number
}

export async function extractPaymentPattern(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string
): Promise<PatternResult | null> {
  const { data: events } = await supabase
    .from('entity_timeline')
    .select('event_type, event_data, created_at')
    .eq('org_id', orgId)
    .eq('entity_id', contactId)
    .in('event_type', ['invoice_created', 'invoice_paid'])
    .order('created_at', { ascending: true })

  if (!events || events.length < 2) return null

  const pairs: number[] = []
  const created = events.filter(e => e.event_type === 'invoice_created')
  const paid = events.filter(e => e.event_type === 'invoice_paid')

  for (const c of created) {
    const invoiceId = (c.event_data as Record<string, unknown>)?.invoice_id
    const match = paid.find(p => (p.event_data as Record<string, unknown>)?.invoice_id === invoiceId)
    if (match) {
      const days = (new Date(match.created_at).getTime() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24)
      if (days >= 0 && days < 365) pairs.push(days)
    }
  }

  if (pairs.length < 2) return null

  const avg = pairs.reduce((a, b) => a + b, 0) / pairs.length
  const stdDev = Math.sqrt(pairs.reduce((sum, d) => sum + (d - avg) ** 2, 0) / pairs.length)
  const confidence = Math.min(0.95, 0.5 + pairs.length * 0.1)

  return {
    patternType: 'payment_timing',
    data: { avg_days: Math.round(avg * 10) / 10, std_dev: Math.round(stdDev * 10) / 10, samples: pairs },
    sampleCount: pairs.length,
    confidence,
  }
}

export async function extractResponseLatency(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string
): Promise<PatternResult | null> {
  const { data: events } = await supabase
    .from('entity_timeline')
    .select('event_type, created_at')
    .eq('org_id', orgId)
    .eq('entity_id', contactId)
    .in('event_type', ['message_sent', 'message_received'])
    .order('created_at', { ascending: true })

  if (!events || events.length < 4) return null

  const latencies: number[] = []
  for (let i = 0; i < events.length - 1; i++) {
    if (events[i].event_type === 'message_sent' && events[i + 1].event_type === 'message_received') {
      const hours = (new Date(events[i + 1].created_at).getTime() - new Date(events[i].created_at).getTime()) / (1000 * 60 * 60)
      if (hours >= 0 && hours < 168) latencies.push(hours)
    }
  }

  if (latencies.length < 2) return null

  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length
  const confidence = Math.min(0.95, 0.5 + latencies.length * 0.1)

  return {
    patternType: 'response_latency',
    data: { avg_hours: Math.round(avg * 10) / 10, samples: latencies.length },
    sampleCount: latencies.length,
    confidence,
  }
}

export async function extractActivityFrequency(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string
): Promise<PatternResult | null> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  const { data: events } = await supabase
    .from('entity_timeline')
    .select('created_at')
    .eq('org_id', orgId)
    .eq('entity_id', contactId)
    .gte('created_at', ninetyDaysAgo)
    .order('created_at', { ascending: true })

  if (!events || events.length < 3) return null

  // Events per week (over 90 days ≈ ~13 weeks)
  const earliest = new Date(events[0].created_at).getTime()
  const latest = new Date(events[events.length - 1].created_at).getTime()
  const spanWeeks = Math.max(1, (latest - earliest) / (7 * 24 * 60 * 60 * 1000))
  const eventsPerWeek = Math.round((events.length / spanWeeks) * 10) / 10

  // Most active day of week (0=Sun, 6=Sat)
  const dayCounts = new Array(7).fill(0)
  const hourCounts = new Array(24).fill(0)
  for (const e of events) {
    const d = new Date(e.created_at)
    dayCounts[d.getUTCDay()]++
    hourCounts[d.getUTCHours()]++
  }
  const mostActiveDay = dayCounts.indexOf(Math.max(...dayCounts))
  const mostActiveHour = hourCounts.indexOf(Math.max(...hourCounts))

  // Trend: compare last 30d vs prior 30d
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
  const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000
  let recentCount = 0
  let priorCount = 0
  for (const e of events) {
    const t = new Date(e.created_at).getTime()
    if (t >= thirtyDaysAgo) recentCount++
    else if (t >= sixtyDaysAgo) priorCount++
  }
  const trend = priorCount === 0
    ? (recentCount > 0 ? 'increasing' : 'stable')
    : recentCount > priorCount * 1.2
      ? 'increasing'
      : recentCount < priorCount * 0.8
        ? 'decreasing'
        : 'stable'

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const confidence = Math.min(0.95, 0.4 + events.length * 0.02)

  return {
    patternType: 'activity_frequency',
    data: {
      events_per_week: eventsPerWeek,
      most_active_day: dayNames[mostActiveDay],
      most_active_hour: mostActiveHour,
      trend,
      recent_30d: recentCount,
      prior_30d: priorCount,
    },
    sampleCount: events.length,
    confidence,
  }
}

export async function extractChannelPreference(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string
): Promise<PatternResult | null> {
  const { data: events } = await supabase
    .from('entity_timeline')
    .select('event_type, channel_source, created_at')
    .eq('org_id', orgId)
    .eq('entity_id', contactId)
    .not('channel_source', 'is', null)
    .order('created_at', { ascending: false })

  if (!events || events.length < 2) return null

  // Group by channel
  const channels: Record<string, { total: number; inbound: number; outbound: number; lastActive: string }> = {}
  for (const e of events) {
    const ch = e.channel_source as string
    if (!channels[ch]) {
      channels[ch] = { total: 0, inbound: 0, outbound: 0, lastActive: e.created_at }
    }
    channels[ch].total++
    if (e.event_type === 'message_received') channels[ch].inbound++
    if (e.event_type === 'message_sent') channels[ch].outbound++
  }

  const sorted = Object.entries(channels).sort((a, b) => b[1].total - a[1].total)
  if (sorted.length === 0) return null

  const primaryChannel = sorted[0][0]
  const secondaryChannel = sorted.length > 1 ? sorted[1][0] : null

  // Response rate per channel: inbound / (inbound + outbound) — measures their engagement
  const responseRates: Record<string, number> = {}
  for (const [ch, stats] of sorted) {
    const messageTotal = stats.inbound + stats.outbound
    if (messageTotal > 0) {
      responseRates[ch] = Math.round((stats.inbound / messageTotal) * 100) / 100
    }
  }

  const confidence = Math.min(0.95, 0.4 + events.length * 0.02)

  return {
    patternType: 'channel_preference',
    data: {
      primary_channel: primaryChannel,
      secondary_channel: secondaryChannel,
      channel_stats: Object.fromEntries(sorted.map(([ch, s]) => [ch, {
        event_count: s.total,
        last_active: s.lastActive,
      }])),
      response_rates: responseRates,
    },
    sampleCount: events.length,
    confidence,
  }
}

export async function upsertPattern(
  supabase: SupabaseClient,
  orgId: string,
  entityType: string,
  entityId: string,
  pattern: PatternResult
): Promise<void> {
  const { error } = await supabase.from('entity_patterns').upsert(
    {
      org_id: orgId,
      entity_type: entityType,
      entity_id: entityId,
      pattern_type: pattern.patternType,
      pattern_data: pattern.data,
      sample_count: pattern.sampleCount,
      confidence: pattern.confidence,
      extracted_at: new Date().toISOString(),
      valid_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
    { onConflict: 'org_id,entity_type,entity_id,pattern_type' }
  )
  if (error) logger.error('Failed to upsert entity pattern', { err: error.message })
}
