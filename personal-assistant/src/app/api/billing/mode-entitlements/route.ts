/**
 * GET /api/billing/mode-entitlements
 *
 * Returns the workspace's per-mode entitlements derived from `mode-entitlements.ts`
 * (#99). Used by the dashboard mode-switcher to lock tabs the workspace's
 * plan tier hasn't paid for, with a `requiredPlan` hint for the upsell CTA.
 *
 * Response shape:
 *   {
 *     plan: PlanName,
 *     enabledModes: Mode[],
 *     lockedModes: Record<Mode, { requiredPlan: PlanName }>
 *   }
 *
 * Lenient on errors: an unauthenticated or org-less request gets a 401/404,
 * but anything that succeeds in resolving a plan returns the matching
 * entitlements (falling back to free if anything in the resolution chain
 * fails — same posture as the underlying primitive).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  MIN_PLAN_FOR_MODE,
  MODES_BY_PLAN,
  getEnabledModesForPlan,
  getLockedModesForPlan,
} from '@/lib/billing/mode-entitlements'
import type { PlanName } from '@/lib/billing/plan-gates'

const PLAN_ORDER: PlanName[] = ['free', 'starter', 'growth', 'scale', 'enterprise']

function isPlan(v: string | undefined | null): v is PlanName {
  return typeof v === 'string' && PLAN_ORDER.includes(v as PlanName)
}

export async function GET() {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single()

  if (!profile?.org_id) {
    return NextResponse.json({ error: 'No organisation found' }, { status: 404 })
  }

  // Resolve plan via the same path as plan-gates.getOrgPlan: subscription
  // first, then organizations.plan fallback, then free. Inlined here to
  // keep the route a single round-trip pair.
  let plan: PlanName = 'free'

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan, status')
    .eq('org_id', profile.org_id)
    .in('status', ['active', 'trialing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (isPlan(sub?.plan as string | undefined)) {
    plan = sub!.plan as PlanName
  } else {
    const { data: org } = await supabase
      .from('organizations')
      .select('plan')
      .eq('id', profile.org_id)
      .maybeSingle()
    if (isPlan(org?.plan as string | undefined)) {
      plan = org!.plan as PlanName
    }
  }

  const enabledModes = getEnabledModesForPlan(plan)
  const lockedModesArr = getLockedModesForPlan(plan)
  const lockedModes = lockedModesArr.reduce<Record<string, { requiredPlan: PlanName }>>((acc, mode) => {
    acc[mode] = { requiredPlan: MIN_PLAN_FOR_MODE[mode] }
    return acc
  }, {})

  return NextResponse.json({
    plan,
    enabledModes,
    lockedModes,
    /** Echoed for client-side validation that the route + primitive haven't drifted. */
    allModesByPlan: MODES_BY_PLAN,
  })
}
