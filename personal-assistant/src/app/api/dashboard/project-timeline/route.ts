import { NextRequest, NextResponse } from 'next/server'
import { createClient, isDevBypass } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service-client'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
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

  const projectId = request.nextUrl.searchParams.get('projectId')
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

  // Fetch project with contact
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, contact_id, metadata')
    .eq('id', projectId).eq('org_id', orgId).single()

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  type TimelineEntry = { date: string; type: string; summary: string }
  const entries: TimelineEntry[] = []

  // Messages from/to this contact
  if (project.contact_id) {
    const { data: timeline } = await supabase
      .from('entity_timeline')
      .select('event_type, event_data, occurred_at')
      .eq('org_id', orgId).eq('entity_id', project.contact_id)
      .order('occurred_at', { ascending: false }).limit(20)

    for (const t of timeline ?? []) {
      const data = (t.event_data ?? {}) as Record<string, unknown>
      const summary = (data.summary as string) || (data.subject as string) || (data.title as string) || t.event_type
      entries.push({ date: t.occurred_at, type: t.event_type, summary: summary.slice(0, 100) })
    }

    // Also grab recent channel messages for this contact
    const { data: msgs } = await supabase
      .from('channel_messages')
      .select('channel, subject, direction, metadata, created_at')
      .eq('org_id', orgId).eq('contact_id', project.contact_id)
      .order('created_at', { ascending: false }).limit(15)

    for (const m of msgs ?? []) {
      const meta = (m.metadata ?? {}) as Record<string, unknown>
      const who = m.direction === 'inbound' ? (meta.from_name as string || m.channel) : 'You'
      const subj = m.subject ? `: ${(m.subject as string).slice(0, 60)}` : ''
      entries.push({ date: m.created_at, type: m.direction === 'inbound' ? 'received' : 'sent', summary: `${who}${subj}` })
    }
  }

  // Invoices linked to this project or contact
  if (project.contact_id) {
    const { data: invoices } = await supabase
      .from('invoices')
      .select('invoice_number, total, status, created_at, paid_date')
      .eq('org_id', orgId).eq('client_contact_id', project.contact_id)
      .order('created_at', { ascending: false }).limit(5)

    for (const inv of invoices ?? []) {
      entries.push({ date: inv.created_at, type: 'invoice', summary: `${inv.invoice_number} $${inv.total} (${inv.status})` })
      if (inv.paid_date) {
        entries.push({ date: inv.paid_date, type: 'payment', summary: `${inv.invoice_number} paid $${inv.total}` })
      }
    }
  }

  // Deduplicate and sort
  const seen = new Set<string>()
  const unique = entries.filter(e => {
    const key = `${e.date.slice(0, 16)}_${e.summary.slice(0, 30)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  unique.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return NextResponse.json({ project: project.name, entries: unique.slice(0, 25) })
}
