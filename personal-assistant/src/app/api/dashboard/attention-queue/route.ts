import { NextResponse } from 'next/server'
import { createClient, isDevBypass } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service-client'

export const dynamic = 'force-dynamic'

type Attention = { priority: number; label: string; detail: string; type: string; age?: string }

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

  const items: Attention[] = []
  const now = Date.now()
  const daysAgo = (iso: string) => Math.floor((now - new Date(iso).getTime()) / 86400000)

  // Overdue project actions
  const { data: projects } = await supabase
    .from('projects').select('name, status, metadata')
    .eq('org_id', orgId).in('status', ['active', 'blocked'])

  for (const p of projects ?? []) {
    const meta = (p.metadata ?? {}) as Record<string, unknown>
    const due = meta.next_action_due as string | undefined
    if (due && new Date(due) < new Date()) {
      const d = daysAgo(due)
      items.push({ priority: 90, label: p.name, detail: (meta.next_action as string) || 'Action overdue', type: 'overdue', age: `${d}d overdue` })
    }
    const blockers = Array.isArray(meta.blockers) ? meta.blockers : []
    for (const b of blockers) {
      const bl = b as Record<string, unknown>
      const since = bl.since as string | undefined
      if (since) {
        const d = daysAgo(since)
        if (d > 7) items.push({ priority: 80, label: p.name, detail: (bl.description as string) || 'Blocked', type: 'blocked', age: `${d}d` })
      }
    }
  }

  // Overdue invoices
  const { data: invoices } = await supabase
    .from('invoices').select('invoice_number, total, due_date, client_contact_id, contacts(name)')
    .eq('org_id', orgId).eq('status', 'overdue').limit(5)

  for (const inv of invoices ?? []) {
    const contact = (inv as Record<string, unknown>).contacts as { name: string } | null
    const d = inv.due_date ? daysAgo(inv.due_date) : 0
    items.push({ priority: 85, label: `Invoice ${inv.invoice_number}`, detail: `$${inv.total} to ${contact?.name || 'unknown'}`, type: 'invoice', age: `${d}d overdue` })
  }

  // Unanswered messages (>48h, actionable)
  const twoDaysAgo = new Date(now - 2 * 86400000).toISOString()
  const { data: stale } = await supabase
    .from('channel_messages').select('sender_name, subject, channel, created_at')
    .eq('org_id', orgId).eq('is_actionable', true).eq('direction', 'inbound')
    .lte('created_at', twoDaysAgo)
    .order('created_at', { ascending: false }).limit(5)

  for (const m of stale ?? []) {
    const d = daysAgo(m.created_at)
    items.push({ priority: 60, label: m.sender_name || m.channel, detail: m.subject || 'Unanswered message', type: 'unanswered', age: `${d}d` })
  }

  items.sort((a, b) => b.priority - a.priority)

  return NextResponse.json({ items: items.slice(0, 10) })
}
