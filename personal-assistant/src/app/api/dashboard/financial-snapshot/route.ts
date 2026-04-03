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

  const { data: invoices } = await supabase
    .from('invoices')
    .select('total, status, created_at, paid_date')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })

  let totalInvoiced = 0, totalPaid = 0, overdue = 0, pending = 0
  const monthly: Record<string, { invoiced: number; received: number }> = {}

  for (const inv of invoices ?? []) {
    const month = (inv.created_at as string).slice(0, 7)
    if (!monthly[month]) monthly[month] = { invoiced: 0, received: 0 }
    monthly[month].invoiced += inv.total || 0
    totalInvoiced += inv.total || 0

    if (inv.status === 'paid') {
      totalPaid += inv.total || 0
      const paidMonth = inv.paid_date ? (inv.paid_date as string).slice(0, 7) : month
      if (!monthly[paidMonth]) monthly[paidMonth] = { invoiced: 0, received: 0 }
      monthly[paidMonth].received += inv.total || 0
    } else if (inv.status === 'overdue') {
      overdue++
    } else if (inv.status === 'sent' || inv.status === 'viewed') {
      pending++
    }
  }

  const timeline = Object.entries(monthly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({ month, ...data }))

  return NextResponse.json({ totalInvoiced, totalPaid, overdue, pending, outstanding: totalInvoiced - totalPaid, timeline })
}
