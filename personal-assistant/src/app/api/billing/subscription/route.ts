import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { type PlanName, getPlanFeatures } from '@/lib/billing/plan-gates'

const PLAN_ORDER: PlanName[] = ['free', 'starter', 'growth', 'scale', 'enterprise']

export async function GET() {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get user's org
  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single()

  if (!profile?.org_id) {
    return NextResponse.json({ error: 'No organisation found' }, { status: 404 })
  }

  // Query active subscription
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan, status, current_period_end, trial_ends_at')
    .eq('org_id', profile.org_id)
    .in('status', ['active', 'trialing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const plan = (sub?.plan ?? 'free') as PlanName
  const validPlan = PLAN_ORDER.includes(plan) ? plan : 'free'
  const features = getPlanFeatures(validPlan)
  const status = (sub?.status as string) ?? 'none'
  const currentPeriodEnd = sub?.current_period_end as string | null
  const trialEndsAt = sub?.trial_ends_at as string | null

  const now = Date.now()
  const endMs = currentPeriodEnd ? new Date(currentPeriodEnd).getTime() : null
  const daysRemaining = endMs ? Math.max(0, Math.ceil((endMs - now) / 86_400_000)) : null

  const currentIdx = PLAN_ORDER.indexOf(validPlan)
  const canUpgrade = validPlan !== 'scale'
  const nextTier = canUpgrade ? PLAN_ORDER[currentIdx + 1] : null

  return NextResponse.json({
    plan: validPlan,
    status,
    currentPeriodEnd,
    trialEndsAt,
    daysRemaining,
    features,
    canUpgrade,
    nextTier,
  })
}
