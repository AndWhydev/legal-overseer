import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChurnRiskOrg {
  orgId: string
  orgName: string
  riskScore: number        // 0-100
  signals: ChurnSignal[]
  lastActivity: string | null
  plan: string
}

export interface ChurnSignal {
  type: 'low_usage' | 'declining_engagement' | 'no_login' | 'failed_payment' | 'support_ticket'
  description: string
  weight: number
}

export interface RetentionAction {
  orgId: string
  action: 'email_checkin' | 'feature_highlight' | 'discount_offer' | 'account_review'
  reason: string
  priority: 'high' | 'medium' | 'low'
}

// ---------------------------------------------------------------------------
// Churn detection
// ---------------------------------------------------------------------------

export async function detectChurnRisk(
  client: SupabaseClient,
  lookbackDays = 30,
): Promise<ChurnRiskOrg[]> {
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)

  // Get all active orgs
  const { data: orgs } = await client
    .from('organisations')
    .select('id, name, plan, updated_at')
    .in('status', ['active', 'trialing'])

  if (!orgs || orgs.length === 0) return []

  const results: ChurnRiskOrg[] = []

  for (const org of orgs) {
    const orgId = org.id as string
    const signals: ChurnSignal[] = []

    // Signal 1: Low agent activity
    const { count: activityCount } = await client
      .from('agent_activity')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', cutoff.toISOString())

    if ((activityCount ?? 0) < 5) {
      signals.push({
        type: 'low_usage',
        description: `Only ${activityCount ?? 0} agent actions in ${lookbackDays} days`,
        weight: 35,
      })
    }

    // Signal 2: No recent login (via profiles last_sign_in)
    const { data: profiles } = await client
      .from('profiles')
      .select('last_sign_in_at')
      .eq('org_id', orgId)
      .order('last_sign_in_at', { ascending: false })
      .limit(1)

    const lastLogin = profiles?.[0]?.last_sign_in_at as string | null
    if (!lastLogin || new Date(lastLogin) < cutoff) {
      signals.push({
        type: 'no_login',
        description: lastLogin
          ? `Last login: ${new Date(lastLogin).toLocaleDateString()}`
          : 'No login recorded',
        weight: 30,
      })
    }

    // Signal 3: Declining engagement (compare current vs previous period)
    const prevCutoff = new Date(cutoff.getTime() - lookbackDays * 24 * 60 * 60 * 1000)

    const { count: prevCount } = await client
      .from('agent_activity')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', prevCutoff.toISOString())
      .lt('created_at', cutoff.toISOString())

    const current = activityCount ?? 0
    const previous = prevCount ?? 0

    if (previous > 0 && current < previous * 0.5) {
      signals.push({
        type: 'declining_engagement',
        description: `Activity dropped ${Math.round((1 - current / previous) * 100)}% vs previous period`,
        weight: 25,
      })
    }

    // Signal 4: Failed payment
    const { count: failedPayments } = await client
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'past_due')

    if ((failedPayments ?? 0) > 0) {
      signals.push({
        type: 'failed_payment',
        description: 'Subscription payment past due',
        weight: 40,
      })
    }

    if (signals.length === 0) continue

    const riskScore = Math.min(
      100,
      signals.reduce((sum, s) => sum + s.weight, 0),
    )

    results.push({
      orgId,
      orgName: org.name as string,
      riskScore,
      signals,
      lastActivity: lastLogin,
      plan: org.plan as string,
    })
  }

  return results.sort((a, b) => b.riskScore - a.riskScore)
}

// ---------------------------------------------------------------------------
// Retention workflow triggers
// ---------------------------------------------------------------------------

export function generateRetentionActions(
  risks: ChurnRiskOrg[],
): RetentionAction[] {
  const actions: RetentionAction[] = []

  for (const risk of risks) {
    if (risk.riskScore >= 70) {
      actions.push({
        orgId: risk.orgId,
        action: 'account_review',
        reason: `High churn risk (${risk.riskScore}): ${risk.signals.map((s) => s.type).join(', ')}`,
        priority: 'high',
      })
    } else if (risk.riskScore >= 50) {
      const hasLowUsage = risk.signals.some((s) => s.type === 'low_usage')
      actions.push({
        orgId: risk.orgId,
        action: hasLowUsage ? 'feature_highlight' : 'email_checkin',
        reason: `Medium churn risk (${risk.riskScore}): ${risk.signals[0]?.description ?? ''}`,
        priority: 'medium',
      })
    } else if (risk.riskScore >= 25) {
      actions.push({
        orgId: risk.orgId,
        action: 'email_checkin',
        reason: `Low churn risk (${risk.riskScore})`,
        priority: 'low',
      })
    }
  }

  return actions
}
