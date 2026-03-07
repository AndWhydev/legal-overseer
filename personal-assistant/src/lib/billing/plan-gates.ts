import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger';

// ---------------------------------------------------------------------------
// Plan types
// ---------------------------------------------------------------------------

export type PlanName = 'free' | 'starter' | 'growth' | 'scale'

export interface PlanFeatures {
  maxChannels: number
  maxLeads: number
  maxInvoicesPerMonth: number
  agents: string[]
  whatsapp: boolean
  proposals: boolean
  multiUser: boolean
  maxUsers?: number
}

// ---------------------------------------------------------------------------
// Feature definitions per plan
// ---------------------------------------------------------------------------

export const PLAN_FEATURES: Record<PlanName, PlanFeatures> = {
  free: {
    maxChannels: 1,
    maxLeads: 50,
    maxInvoicesPerMonth: 5,
    agents: ['sentry'],
    whatsapp: false,
    proposals: false,
    multiUser: false,
  },
  starter: {
    maxChannels: 3,
    maxLeads: 500,
    maxInvoicesPerMonth: 50,
    agents: ['sentry', 'lead-swarm', 'invoice-flow'],
    whatsapp: true,
    proposals: false,
    multiUser: false,
  },
  growth: {
    maxChannels: 10,
    maxLeads: 2000,
    maxInvoicesPerMonth: 200,
    agents: [
      'sentry',
      'lead-swarm',
      'invoice-flow',
      'channel-triage',
      'client-comms',
      'proposal-bot',
    ],
    whatsapp: true,
    proposals: true,
    multiUser: true,
    maxUsers: 5,
  },
  scale: {
    maxChannels: 99,
    maxLeads: 99999,
    maxInvoicesPerMonth: 9999,
    agents: ['all'],
    whatsapp: true,
    proposals: true,
    multiUser: true,
    maxUsers: 99,
  },
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const VALID_PLANS = new Set<string>(['free', 'starter', 'growth', 'scale'])

function isPlanName(value: string): value is PlanName {
  return VALID_PLANS.has(value)
}

/** Look up the current plan for an organisation. Defaults to 'free'. */
export async function getOrgPlan(
  client: SupabaseClient,
  orgId: string,
): Promise<PlanName> {
  const { data } = await client
    .from('subscriptions')
    .select('plan, status')
    .eq('org_id', orgId)
    .in('status', ['active', 'trialing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const plan = data?.plan as string | undefined
  if (plan && isPlanName(plan)) return plan
  return 'free'
}

/** Get the feature set for a given plan. */
export function getPlanFeatures(plan: PlanName): PlanFeatures {
  return PLAN_FEATURES[plan]
}

/** Check whether a specific feature key is enabled/truthy for a plan. */
export function isFeatureEnabled(
  plan: PlanName,
  featureKey: keyof PlanFeatures,
): boolean {
  const features = PLAN_FEATURES[plan]
  const value = features[featureKey]
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  if (Array.isArray(value)) return value.length > 0
  return false
}

// ---------------------------------------------------------------------------
// Plan gate enforcement
// ---------------------------------------------------------------------------

export type GateAction =
  | 'agent_runs'
  | 'channels'
  | 'storage'
  | 'whatsapp'
  | 'proposals'
  | 'multi_user'

/**
 * Check if an organization can perform a gated action.
 * Returns true (allow) on error to be lenient.
 */
export async function checkPlanGate(
  client: SupabaseClient,
  orgId: string,
  action: GateAction,
): Promise<boolean> {
  try {
    const plan = await getOrgPlan(client, orgId)

    // Feature gates: check if feature is enabled for this plan
    if (action === 'whatsapp') {
      return isFeatureEnabled(plan, 'whatsapp')
    }
    if (action === 'proposals') {
      return isFeatureEnabled(plan, 'proposals')
    }
    if (action === 'multi_user') {
      return isFeatureEnabled(plan, 'multiUser')
    }

    // Usage-based gates: check current usage against limits
    if (action === 'agent_runs') {
      // No limit on agent runs for now
      return true
    }

    if (action === 'channels') {
      const features = getPlanFeatures(plan)
      const { data: channels, error } = await client
        .from('channel_configs')
        .select('id')
        .eq('org_id', orgId)

      if (error) {
        logger.warn('[plan-gates] Failed to count channels:', error.message)
        return true // Allow on error
      }

      const currentChannels = (channels ?? []).length
      return currentChannels < features.maxChannels
    }

    if (action === 'storage') {
      // Plan storage limits: free=100MB, starter=500MB, growth=2000MB, scale=unlimited
      const storageLimits: Record<PlanName, number> = {
        free: 100,
        starter: 500,
        growth: 2000,
        scale: 99999,
      }

      const limit = storageLimits[plan]

      // Query current storage usage (simplified: count attachments)
      const { data: files, error } = await client
        .from('attachments')
        .select('size:sum')
        .eq('org_id', orgId)

      if (error) {
        logger.warn('[plan-gates] Failed to check storage:', error.message)
        return true // Allow on error
      }

      const currentUsageMB = ((files?.[0]?.size as number) ?? 0) / (1024 * 1024)
      return currentUsageMB < limit
    }

    // Unknown action: allow
    return true
  } catch (err) {
    logger.warn('[plan-gates] Error checking plan gate:', action, err)
    return true // Allow on error
  }
}
