import { NextRequest, NextResponse } from 'next/server'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { runBetaOnboarding } from '@/lib/onboarding/beta-flow'
import { createOrg, setupChannels } from '@/lib/onboarding/multi-tenant'
import { loadOnboardingProfile } from '@/lib/onboarding/profile'
import { getWorkspaceConfirmationTargetId, getWorkspaceId } from '@/lib/onboarding/state'
import { logger } from '@/lib/core/logger'

type ProfileRecord = {
  org_id?: string | null
  personal_org_id?: string | null
  active_org_id?: string | null
  preferences?: Record<string, unknown> | null
}

function isLegacyProfileSchemaError(error: { message?: string } | null | undefined) {
  const message = error?.message ?? ''
  return (
    message.includes('column profiles.personal_org_id does not exist') ||
    message.includes('column profiles.active_org_id does not exist') ||
    message.includes("Could not find the 'personal_org_id' column of 'profiles' in the schema cache") ||
    message.includes("Could not find the 'active_org_id' column of 'profiles' in the schema cache")
  )
}

function isLegacyOrganisationIndustryError(error: { message?: string } | null | undefined) {
  const message = error?.message ?? ''
  return (
    message.includes('column organisations.industry does not exist') ||
    message.includes('column organizations.industry does not exist') ||
    message.includes("Could not find the 'industry' column of 'organisations' in the schema cache") ||
    message.includes("Could not find the 'industry' column of 'organizations' in the schema cache")
  )
}

function isMissingOrganisationsTableError(error: { message?: string } | null | undefined) {
  const message = error?.message ?? ''
  return message.includes("Could not find the table 'public.organisations'")
}

async function updateOrganisationWorkspace(
  client: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  orgUpdates: Record<string, unknown>,
) {
  async function updateInTable(table: 'organisations' | 'organizations', updates: Record<string, unknown>) {
    return client!
      .from(table)
      .update(updates)
      .eq('id', workspaceId)
      .select('id')
      .maybeSingle()
  }

  const preferredTable = 'organisations'
  const fallbackTable = 'organizations'

  let result = await updateInTable(preferredTable, orgUpdates)
  let activeTable: 'organisations' | 'organizations' = preferredTable

  if (isMissingOrganisationsTableError(result.error)) {
    result = await updateInTable(fallbackTable, orgUpdates)
    activeTable = fallbackTable
  }

  if (result.error && isLegacyOrganisationIndustryError(result.error)) {
    result = await updateInTable(activeTable, { name: orgUpdates.name })
  }

  return result
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function resolveOwnerName(user: { email?: string | null; user_metadata?: Record<string, unknown> }, rawOwnerName: unknown) {
  const ownerName = normalizeString(rawOwnerName)

  if (ownerName) {
    return ownerName
  }

  const metadataName = normalizeString(user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? user.user_metadata?.name)
  if (metadataName) {
    return metadataName
  }

  return user.email?.split('@')[0] ?? 'Owner'
}

function mergeWorkspaceSetupPreferences(preferences: Record<string, unknown> | null | undefined) {
  return {
    ...(preferences ?? {}),
    workspace_setup_completed: true,
  }
}

async function markWorkspaceSetupCompleted(
  client: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  preferences: Record<string, unknown> | null | undefined,
) {
  const { error } = await client!
    .from('profiles')
    .update({
      preferences: mergeWorkspaceSetupPreferences(preferences),
    })
    .eq('id', userId)

  if (error) {
    throw new Error(`Failed to save workspace setup state: ${error.message}`)
  }
}

async function confirmExistingWorkspace(
  client: Awaited<ReturnType<typeof createClient>>,
  user: { id: string },
  profile: ProfileRecord,
  input: {
    name: string
    ownerName: string
    industry?: string
  },
) {
  const workspaceId = getWorkspaceConfirmationTargetId(profile)

  if (!workspaceId) {
    throw new Error('Workspace confirmation requires an existing workspace')
  }

  const orgUpdates: Record<string, unknown> = {
    name: input.name,
  }

  if (input.industry) {
    orgUpdates.industry = input.industry
  }

  const { data: updatedOrg, error: orgError } = await updateOrganisationWorkspace(
    client,
    workspaceId,
    orgUpdates,
  )

  let finalUpdatedOrg = updatedOrg

  if (orgError && !isLegacyOrganisationIndustryError(orgError)) {
    throw new Error(`Failed to update workspace: ${orgError.message}`)
  }

  if (orgError && isLegacyOrganisationIndustryError(orgError)) {
    const {
      data: legacyUpdatedOrg,
      error: legacyOrgError,
    } = await client!
      .from('organisations')
      .update({ name: input.name })
      .eq('id', workspaceId)
      .select('id')
      .maybeSingle()

    if (legacyOrgError) {
      throw new Error(`Failed to update workspace: ${legacyOrgError.message}`)
    }

    finalUpdatedOrg = legacyUpdatedOrg
  }

  if (!finalUpdatedOrg) {
    throw new Error('Workspace not found while confirming setup')
  }

  const modernProfileUpdate = {
    org_id: workspaceId,
    personal_org_id: profile.personal_org_id ?? workspaceId,
    active_org_id: workspaceId,
    display_name: input.ownerName,
    preferences: mergeWorkspaceSetupPreferences(profile.preferences),
  }

  const {
    data: updatedProfile,
    error: profileError,
  } = await client!
    .from('profiles')
    .update(modernProfileUpdate)
    .eq('id', user.id)
    .select('id')
    .maybeSingle()

  if (profileError && !isLegacyProfileSchemaError(profileError)) {
    throw new Error(`Failed to confirm workspace setup: ${profileError.message}`)
  }

  let finalUpdatedProfile = updatedProfile

  if (profileError && isLegacyProfileSchemaError(profileError)) {
    const {
      data: legacyUpdatedProfile,
      error: legacyProfileError,
    } = await client!
      .from('profiles')
      .update({
        org_id: workspaceId,
        display_name: input.ownerName,
        preferences: mergeWorkspaceSetupPreferences(profile.preferences),
      })
      .eq('id', user.id)
      .select('id')
      .maybeSingle()

    if (legacyProfileError) {
      throw new Error(`Failed to confirm workspace setup: ${legacyProfileError.message}`)
    }

    finalUpdatedProfile = legacyUpdatedProfile
  }

  if (!finalUpdatedProfile) {
    throw new Error('Profile not found while confirming workspace setup')
  }

  return {
    orgId: workspaceId,
    ownerId: user.id,
    rlsConfigured: true,
  }
}

// POST /api/onboarding — create org (self-serve or beta)
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const client = await createClient()
  if (!client) {
    return NextResponse.json({ error: 'Failed to create database client' }, { status: 500 })
  }

  // Verify authenticated
  const { data: { user } } = await client.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const action = body.action as string | undefined

  try {
    if (action === 'beta') {
      // Beta onboarding (AWU seed)
      const orgName = body.orgName as string
      const adminEmail = body.adminEmail as string
      const adminName = body.adminName as string

      if (!orgName || !adminEmail || !adminName) {
        return NextResponse.json(
          { error: 'Missing required fields: orgName, adminEmail, adminName' },
          { status: 400 },
        )
      }

      const result = await runBetaOnboarding(client, {
        orgName,
        adminEmail,
        adminName,
        channels: body.channels as Parameters<typeof runBetaOnboarding>[1]['channels'],
      })

      return NextResponse.json(result, { status: 201 })
    }

    if (action === 'setup-channels') {
      // Add channels to existing org
      const orgId = body.orgId as string
      const channels = body.channels as Parameters<typeof setupChannels>[1]['channels']

      if (!orgId || !channels || !Array.isArray(channels)) {
        return NextResponse.json(
          { error: 'Missing required fields: orgId, channels[]' },
          { status: 400 },
        )
      }

      const result = await setupChannels(client, { orgId, channels })
      return NextResponse.json(result)
    }

    // Default: self-serve org creation
    const name = normalizeString(body.name)
    const industry = normalizeString(body.industry) || undefined
    const ownerName = resolveOwnerName(user, body.ownerName)

    if (!name) {
      return NextResponse.json(
        { error: 'Missing required field: name' },
        { status: 400 },
      )
    }

    const { data: profile, error: profileError } = await loadOnboardingProfile(
      client as never,
      user.id,
    ) as { data: ProfileRecord | null; error: { message?: string } | null }

    if (profileError) {
      throw new Error(`Failed to load profile: ${profileError.message}`)
    }

    const workspaceId = getWorkspaceId(profile)

    if (workspaceId) {
      const result = await confirmExistingWorkspace(client, user, profile ?? {}, {
        name,
        ownerName,
        industry,
      })

      return NextResponse.json(result, { status: 201 })
    }

    const result = await createOrg(client, {
      name,
      ownerEmail: user.email ?? '',
      ownerName,
      plan: 'starter',
      industry,
    })

    await markWorkspaceSetupCompleted(client, user.id, profile?.preferences)

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    logger.error('[onboarding] error:', err)
    return NextResponse.json(
      { error: 'Onboarding failed', details: String(err) },
      { status: 500 },
    )
  }
}
