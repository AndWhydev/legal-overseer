import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUsage } from '@/lib/billing/usage-metering'
import { getOrgPlan, getPlanFeatures, type PlanName } from '@/lib/billing/plan-gates'
import { logger } from '@/lib/core/logger';

export async function GET() {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get user's org
  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single()

  if (!profile?.org_id) {
    return NextResponse.json({ error: 'No organisation found' }, { status: 404 })
  }

  try {
    const orgId = profile.org_id as string

    // Get usage for current billing period
    const usage = await getUsage(supabase, orgId, 'current_billing_period')

    // Get plan and features
    const plan = (await getOrgPlan(supabase, orgId)) as PlanName
    const features = getPlanFeatures(plan)

    return NextResponse.json({
      usage,
      plan,
      features,
    })
  } catch (err) {
    logger.error('[billing/usage] error:', err)
    return NextResponse.json(
      { error: 'Failed to fetch usage data', details: String(err) },
      { status: 500 },
    )
  }
}
