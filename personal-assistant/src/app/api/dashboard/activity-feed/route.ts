import { NextResponse } from 'next/server'
import { createClient, isDevBypass } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service-client'

export const dynamic = 'force-dynamic'

export async function GET() {
  let supabase, orgId: string
  if (isDevBypass()) {
    supabase = getServiceClient()
    orgId = '7abcbfb1-67e5-4a3b-aa08-a17cfd2867e9'
  } else {
    const client = await createClient()
    if (!client) return NextResponse.json({ error: 'Not configured' }, { status: 503 })
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: profile } = await client.from('profiles').select('org_id').eq('id', user.id).single()
    if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 400 })
    supabase = client
    orgId = profile.org_id
  }

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

  const [runs, timeline, messages] = await Promise.all([
    supabase.from('agent_runs')
      .select('id, trigger_type, result_summary, tool_calls, confidence_score, routing_decision, created_at, status')
      .eq('org_id', orgId).gte('created_at', threeDaysAgo)
      .order('created_at', { ascending: false }).limit(20),
    supabase.from('entity_timeline')
      .select('id, entity_type, event_type, event_data, occurred_at')
      .eq('org_id', orgId).gte('occurred_at', threeDaysAgo)
      .order('occurred_at', { ascending: false }).limit(20),
    supabase.from('channel_messages')
      .select('id, channel, sender_name, subject, is_actionable, created_at')
      .eq('org_id', orgId).gte('created_at', threeDaysAgo)
      .order('created_at', { ascending: false }).limit(15),
  ])

  type FeedItem = { time: string; type: string; summary: string; meta?: Record<string, unknown> }
  const feed: FeedItem[] = []

  for (const r of runs.data ?? []) {
    const summary = r.result_summary
      ? r.result_summary.slice(0, 120).replace(/\n/g, ' ')
      : r.status === 'success' ? `${r.tool_calls} tools, ${(r.confidence_score * 100).toFixed(0)}% confidence` : r.status
    feed.push({ time: r.created_at, type: 'agent_run', summary, meta: { tools: r.tool_calls, confidence: r.confidence_score } })
  }

  for (const t of timeline.data ?? []) {
    const data = (t.event_data ?? {}) as Record<string, unknown>
    const summary = (data.summary as string) || (data.title as string) || `${t.event_type} on ${t.entity_type}`
    feed.push({ time: t.occurred_at, type: t.event_type, summary: summary.slice(0, 120) })
  }

  for (const m of messages.data ?? []) {
    const who = m.sender_name || m.channel
    const subj = m.subject ? `: ${m.subject}` : ''
    feed.push({ time: m.created_at, type: 'message', summary: `${who}${subj}`.slice(0, 120), meta: { channel: m.channel, actionable: m.is_actionable } })
  }

  feed.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())

  return NextResponse.json({ feed: feed.slice(0, 30) })
}
