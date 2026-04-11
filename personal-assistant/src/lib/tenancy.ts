import type { SupabaseClient } from '@supabase/supabase-js'
import type { Organization, OrgMembership, TenancyContext } from './types'

interface ProfileTenancyRow {
  personal_org_id: string | null
  active_org_id: string | null
}

interface LegacyProfileRow {
  org_id: string | null
}

interface OrganizationRow {
  id: string
  name: string
  slug: string
  plan: string
  tier: 'personal' | 'shared'
  settings: Record<string, unknown> | null
}

interface LegacyOrganizationRow {
  id: string
  name: string
  slug: string
  plan: string
  settings: Record<string, unknown> | null
}

function toOrganization(row: OrganizationRow): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: row.plan,
    tier: row.tier,
    settings: row.settings ?? {},
  }
}

function getSupabaseErrorMessage(error: { message?: string } | null): string {
  return error?.message ?? 'unknown error'
}

function isLegacySchemaError(error: { message?: string } | null): boolean {
  const message = error?.message ?? ''
  return (
    message.includes('column profiles.personal_org_id does not exist') ||
    message.includes('column profiles.active_org_id does not exist') ||
    message.includes("Could not find the table 'public.org_members' in the schema cache") ||
    message.includes('column organizations.tier does not exist')
  )
}

async function loadLegacyOrgId(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', userId)
    .single<LegacyProfileRow>()

  if (error || !profile) {
    throw new Error(`Failed to load legacy profile: ${getSupabaseErrorMessage(error)}`)
  }

  if (!profile.org_id) {
    throw new Error('User has no org_id in legacy profile')
  }

  return profile.org_id
}

async function loadLegacyOrganization(
  supabase: SupabaseClient,
  orgId: string
): Promise<Organization | null> {
  const { data, error } = await supabase
    .from('organisations')
    .select('id, name, slug, plan, settings')
    .eq('id', orgId)
    .maybeSingle<LegacyOrganizationRow>()

  if (error) {
    throw new Error(`Failed to load legacy organization: ${getSupabaseErrorMessage(error)}`)
  }

  if (!data) {
    return null
  }

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    plan: data.plan,
    tier: 'personal',
    settings: data.settings ?? {},
  }
}

function buildAccessibleOrgIds(
  personalOrgId: string,
  memberships: OrgMembership[]
): string[] {
  const accessible = new Set<string>([personalOrgId])
  for (const membership of memberships) {
    accessible.add(membership.org_id)
  }
  return [...accessible]
}

export async function getTenancyContext(
  supabase: SupabaseClient,
  userId: string
): Promise<TenancyContext> {
  const [{ data: profile, error: profileError }, { data: membershipsData, error: membershipsError }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('personal_org_id, active_org_id')
        .eq('id', userId)
        .single<ProfileTenancyRow>(),
      supabase
        .from('org_members')
        .select('id, org_id, user_id, role, created_at')
        .eq('user_id', userId)
        .returns<OrgMembership[]>(),
    ])

  if (isLegacySchemaError(profileError) || isLegacySchemaError(membershipsError)) {
    const orgId = await loadLegacyOrgId(supabase, userId)
    const activeOrg = await loadLegacyOrganization(supabase, orgId)

    return {
      userId,
      personalOrgId: orgId,
      activeOrgId: orgId,
      accessibleOrgIds: [orgId],
      activeOrg,
      memberships: [],
    }
  }

  if (profileError || !profile) {
    throw new Error(`Failed to load profile tenancy context: ${getSupabaseErrorMessage(profileError)}`)
  }

  if (membershipsError) {
    throw new Error(`Failed to load org memberships: ${getSupabaseErrorMessage(membershipsError)}`)
  }

  const personalOrgId = profile.personal_org_id
  if (!personalOrgId) {
    throw new Error('User has no personal org — run backfill migration')
  }

  const activeOrgId = profile.active_org_id ?? personalOrgId
  const memberships = membershipsData ?? []

  const { data: activeOrgData, error: activeOrgError } = await supabase
    .from('organisations')
    .select('id, name, slug, plan, tier, settings')
    .eq('id', activeOrgId)
    .maybeSingle<OrganizationRow>()

  if (activeOrgError) {
    throw new Error(`Failed to load active organization: ${getSupabaseErrorMessage(activeOrgError)}`)
  }

  return {
    userId,
    personalOrgId,
    activeOrgId,
    accessibleOrgIds: buildAccessibleOrgIds(personalOrgId, memberships),
    activeOrg: activeOrgData ? toOrganization(activeOrgData) : null,
    memberships,
  }
}

export async function switchActiveOrg(
  supabase: SupabaseClient,
  userId: string,
  targetOrgId: string
): Promise<void> {
  const { data: membership, error: membershipError } = await supabase
    .from('org_members')
    .select('id')
    .eq('user_id', userId)
    .eq('org_id', targetOrgId)
    .maybeSingle()

  if (isLegacySchemaError(membershipError)) {
    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update({ org_id: targetOrgId })
      .eq('id', userId)
      .select('id')
      .maybeSingle()

    if (updateError) {
      throw new Error(`Failed to switch legacy org: ${getSupabaseErrorMessage(updateError)}`)
    }

    if (!updatedProfile) {
      throw new Error('Profile not found while switching active organization')
    }

    return
  }

  if (membershipError) {
    throw new Error(`Failed to verify organization access: ${getSupabaseErrorMessage(membershipError)}`)
  }

  if (!membership) {
    throw new Error('User does not have access to target organization')
  }

  const { data: updatedProfile, error: updateError } = await supabase
    .from('profiles')
    .update({ active_org_id: targetOrgId })
    .eq('id', userId)
    .select('id')
    .maybeSingle()

  if (updateError) {
    throw new Error(`Failed to switch active organization: ${getSupabaseErrorMessage(updateError)}`)
  }

  if (!updatedProfile) {
    throw new Error('Profile not found while switching active organization')
  }
}

export async function getActiveOrgId(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('personal_org_id, active_org_id')
    .eq('id', userId)
    .single<ProfileTenancyRow>()

  if (isLegacySchemaError(profileError)) {
    return loadLegacyOrgId(supabase, userId)
  }

  if (profileError || !profile) {
    throw new Error(`Failed to load profile: ${getSupabaseErrorMessage(profileError)}`)
  }

  if (!profile.personal_org_id) {
    throw new Error('User has no personal org — run backfill migration')
  }

  return profile.active_org_id ?? profile.personal_org_id
}
