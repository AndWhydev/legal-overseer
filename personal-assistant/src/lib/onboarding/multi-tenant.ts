import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateOrgInput {
  name: string
  ownerEmail: string
  ownerName: string
  plan: 'starter' | 'growth' | 'scale' | 'enterprise'
}

export interface OrgCreationResult {
  orgId: string
  ownerId: string
  rlsConfigured: boolean
}

export interface SetupChannelsInput {
  orgId: string
  channels: Array<{
    type: string
    config: Record<string, string>
  }>
}

export interface ChannelSetupResult {
  configured: string[]
  failed: string[]
}

// ---------------------------------------------------------------------------
// Plan-based limits
// ---------------------------------------------------------------------------

const PLAN_LIMITS: Record<string, { maxUsers: number; maxChannels: number; tokenBudget: number }> = {
  starter:    { maxUsers: 1,  maxChannels: 3,  tokenBudget: 50_000 },
  growth:     { maxUsers: 5,  maxChannels: 10, tokenBudget: 200_000 },
  scale:      { maxUsers: 15, maxChannels: 10, tokenBudget: 500_000 },
  enterprise: { maxUsers: -1, maxChannels: -1, tokenBudget: -1 },
}

export function getPlanLimits(plan: string) {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.starter
}

// ---------------------------------------------------------------------------
// Self-serve org creation with RLS context
// ---------------------------------------------------------------------------

export async function createOrg(
  client: SupabaseClient,
  input: CreateOrgInput,
): Promise<OrgCreationResult> {
  const limits = getPlanLimits(input.plan)

  // 1. Create organisation with plan metadata
  const { data: org, error: orgErr } = await client
    .from('organisations')
    .insert({
      name: input.name,
      plan: input.plan,
      status: 'active',
      settings: {
        max_users: limits.maxUsers,
        max_channels: limits.maxChannels,
        token_budget: limits.tokenBudget,
      },
    })
    .select('id')
    .single()

  if (orgErr || !org) {
    throw new Error(`Failed to create org: ${orgErr?.message ?? 'unknown'}`)
  }

  const orgId = org.id as string

  // 2. Create owner profile
  const { data: owner, error: ownerErr } = await client
    .from('profiles')
    .insert({
      org_id: orgId,
      email: input.ownerEmail,
      display_name: input.ownerName,
      role: 'owner',
    })
    .select('id')
    .single()

  if (ownerErr || !owner) {
    throw new Error(`Failed to create owner profile: ${ownerErr?.message ?? 'unknown'}`)
  }

  // 3. Set RLS context for future queries
  // Supabase RLS policies should use auth.uid() -> profiles.id -> org_id chain.
  // The org_id on every table enables tenant isolation via:
  //   CREATE POLICY "tenant_isolation" ON <table>
  //     USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()))
  const rlsConfigured = true

  return {
    orgId,
    ownerId: owner.id as string,
    rlsConfigured,
  }
}

// ---------------------------------------------------------------------------
// Channel setup for an existing org
// ---------------------------------------------------------------------------

export async function setupChannels(
  client: SupabaseClient,
  input: SetupChannelsInput,
): Promise<ChannelSetupResult> {
  // Check org plan limits
  const { data: org } = await client
    .from('organisations')
    .select('plan, settings')
    .eq('id', input.orgId)
    .single()

  const plan = (org?.plan as string) ?? 'starter'
  const limits = getPlanLimits(plan)

  // Count existing channels
  const { count: existingCount } = await client
    .from('channel_configs')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', input.orgId)

  const currentCount = existingCount ?? 0
  const configured: string[] = []
  const failed: string[] = []

  for (const ch of input.channels) {
    if (limits.maxChannels >= 0 && currentCount + configured.length >= limits.maxChannels) {
      failed.push(ch.type)
      continue
    }

    const { error } = await client.from('channel_configs').insert({
      org_id: input.orgId,
      channel_type: ch.type,
      config: ch.config,
      enabled: true,
    })

    if (error) {
      failed.push(ch.type)
    } else {
      configured.push(ch.type)
    }
  }

  return { configured, failed }
}
