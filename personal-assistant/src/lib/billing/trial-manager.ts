import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger';

/**
 * Trial status for an organization.
 */
export interface TrialStatus {
  status: 'active' | 'grace' | 'expired'
  trialEndsAt: string | null
  daysRemaining: number
  gracePeriodDays: number
}

const TRIAL_PERIOD_DAYS = 30
const GRACE_PERIOD_DAYS = 3

/**
 * Create a trial subscription for an organization.
 * Never throws — logging should not break operations.
 */
export async function createTrial(
  supabase: SupabaseClient,
  orgId: string,
  tier: 'starter' | 'growth' | 'scale',
): Promise<void> {
  try {
    const trialEndsAt = new Date()
    trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_PERIOD_DAYS)

    await supabase.from('subscriptions').insert({
      org_id: orgId,
      tier,
      plan: tier,
      status: 'trialing',
      trial_ends_at: trialEndsAt.toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  } catch (err) {
    logger.warn('[trial-manager] Failed to create trial:', err)
  }
}

/**
 * Check the trial status for an organization.
 * Returns 'expired' on error.
 */
export async function checkTrialStatus(
  supabase: SupabaseClient,
  orgId: string,
): Promise<TrialStatus> {
  try {
    const { data: sub, error } = await supabase
      .from('subscriptions')
      .select('trial_ends_at, status')
      .eq('org_id', orgId)
      .in('status', ['trialing', 'active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !sub) {
      return {
        status: 'expired',
        trialEndsAt: null,
        daysRemaining: 0,
        gracePeriodDays: GRACE_PERIOD_DAYS,
      }
    }

    const trialEndsAt = sub.trial_ends_at as string | null
    if (!trialEndsAt) {
      return {
        status: 'expired',
        trialEndsAt: null,
        daysRemaining: 0,
        gracePeriodDays: GRACE_PERIOD_DAYS,
      }
    }

    const trialEndDate = new Date(trialEndsAt)
    const now = new Date()
    const daysRemaining = Math.max(
      0,
      Math.ceil((trialEndDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
    )

    // Determine status based on days remaining
    let status: 'active' | 'grace' | 'expired' = 'expired'
    if (daysRemaining > GRACE_PERIOD_DAYS) {
      status = 'active'
    } else if (daysRemaining > 0) {
      status = 'grace'
    }

    return {
      status,
      trialEndsAt,
      daysRemaining,
      gracePeriodDays: GRACE_PERIOD_DAYS,
    }
  } catch (err) {
    logger.warn('[trial-manager] Failed to check trial status:', err)
    return {
      status: 'expired',
      trialEndsAt: null,
      daysRemaining: 0,
      gracePeriodDays: GRACE_PERIOD_DAYS,
    }
  }
}

/**
 * Convert a trial subscription to active paid subscription.
 * Never throws — logging should not break operations.
 */
export async function convertTrial(
  supabase: SupabaseClient,
  orgId: string,
  planId: string,
): Promise<void> {
  try {
    // Update subscription
    await supabase
      .from('subscriptions')
      .update({
        status: 'active',
        plan: planId,
        trial_ends_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId)

    // Update organisation
    await supabase
      .from('organizations')
      .update({ plan: planId })
      .eq('id', orgId)
  } catch (err) {
    logger.warn('[trial-manager] Failed to convert trial:', err)
  }
}
