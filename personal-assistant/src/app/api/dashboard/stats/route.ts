import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'

export async function GET() {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)

  try {
    // 1. Active tasks count (status != 'completed')
    const { count: activeTasks } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .neq('status', 'completed')

    // 2. Total revenue (sum of amount from paid invoices)
    const { data: invoiceData } = await supabase
      .from('invoices')
      .select('amount')
      .eq('org_id', orgId)
      .eq('status', 'paid')

    const totalRevenue = (invoiceData || []).reduce((sum, inv) => sum + (inv.amount || 0), 0)

    // 3. Agent runs today (created_at > start of today UTC)
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const todayStart = today.toISOString()

    const { count: agentRunsToday } = await supabase
      .from('agent_runs')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', todayStart)

    // 4. Active contacts count
    const { count: activeContacts } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)

    return NextResponse.json({
      activeTasks: activeTasks || 0,
      totalRevenue,
      agentRunsToday: agentRunsToday || 0,
      activeContacts: activeContacts || 0,
    })
  } catch (error) {
    console.error('Dashboard stats error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats' },
      { status: 500 }
    )
  }
}
