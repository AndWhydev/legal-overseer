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
