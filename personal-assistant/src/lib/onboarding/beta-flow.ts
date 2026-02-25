import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BetaOnboardingInput {
  orgName: string
  adminEmail: string
  adminName: string
  channels?: ChannelSetup[]
}

export interface ChannelSetup {
  type: 'outlook' | 'asana' | 'calendly' | 'stripe' | 'whatsapp'
  config: Record<string, string>
}

export interface OnboardingResult {
  orgId: string
  adminUserId: string
  channelsConfigured: string[]
  seedApplied: boolean
}

// ---------------------------------------------------------------------------
// AWU seed template — default config for initial beta client
// ---------------------------------------------------------------------------

const AWU_SEED_CHANNELS: ChannelSetup[] = [
  { type: 'outlook', config: { tenant_id: '', client_id: '' } },
  { type: 'asana', config: { workspace_gid: '' } },
  { type: 'calendly', config: { org_uri: '' } },
  { type: 'stripe', config: { mode: 'test' } },
]

const AWU_SEED_VOICE_PROFILE = {
  tone: 'professional-friendly',
  formality: 0.7,
  persona: 'Andy — digital agency owner, direct but warm',
  signOff: 'Cheers,\nAndy',
}

// ---------------------------------------------------------------------------
// Beta onboarding flow
// ---------------------------------------------------------------------------

export async function runBetaOnboarding(
  client: SupabaseClient,
  input: BetaOnboardingInput,
): Promise<OnboardingResult> {
  // 1. Create organisation
  const { data: org, error: orgErr } = await client
    .from('organisations')
    .insert({ name: input.orgName, plan: 'beta', status: 'active' })
    .select('id')
    .single()

  if (orgErr || !org) {
    throw new Error(`Failed to create organisation: ${orgErr?.message ?? 'unknown'}`)
  }

  const orgId = org.id as string

  // 2. Create admin user profile linked to org
  const { data: profile, error: profileErr } = await client
    .from('profiles')
    .insert({
      org_id: orgId,
      email: input.adminEmail,
      display_name: input.adminName,
      role: 'admin',
    })
    .select('id')
    .single()

  if (profileErr || !profile) {
    throw new Error(`Failed to create admin profile: ${profileErr?.message ?? 'unknown'}`)
  }

  const adminUserId = profile.id as string

  // 3. Configure channels
  const channels = input.channels ?? AWU_SEED_CHANNELS
  const configuredChannels: string[] = []

  for (const ch of channels) {
    const { error: chErr } = await client.from('channel_configs').insert({
      org_id: orgId,
      channel_type: ch.type,
      config: ch.config,
      enabled: true,
    })

    if (!chErr) {
      configuredChannels.push(ch.type)
    }
  }

  // 4. Seed voice profile for AWU
  const isAWU =
    input.orgName.toLowerCase().includes('awu') ||
    input.orgName.toLowerCase().includes('andy')

  if (isAWU) {
    await client.from('voice_profiles').insert({
      org_id: orgId,
      name: 'default',
      profile: AWU_SEED_VOICE_PROFILE,
      is_default: true,
    })
  }

  // 5. Create default agent configs
  const defaultAgents = [
    'channel-triage',
    'client-comms',
    'proposal-bot',
    'onboarding',
  ]

  for (const agentType of defaultAgents) {
    await client.from('agent_configs').insert({
      org_id: orgId,
      agent_type: agentType,
      enabled: true,
      config: {},
    })
  }

  return {
    orgId,
    adminUserId,
    channelsConfigured: configuredChannels,
    seedApplied: isAWU,
  }
}
