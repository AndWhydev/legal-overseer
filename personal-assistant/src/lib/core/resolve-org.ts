import { getServiceClient } from '@/lib/supabase/service-client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from './logger'

function isLegacyProfileSchemaError(error: { message?: string } | null): boolean {
  const message = error?.message ?? ''
  return (
    message.includes('column profiles.personal_org_id does not exist') ||
    message.includes('column profiles.active_org_id does not exist')
  )
}

/**
 * Resolve org_id from webhook channel credentials.
 *
 * Looks up the channel_credentials table to find which org owns the given channel
 * and external identifier (phone number, workspace ID, etc.).
 */
export async function resolveOrgFromWebhook(
  channel: string,
  externalId?: string
): Promise<string | null> {
  const supabase = getServiceClient()

  let query = supabase
    .from('channel_credentials')
    .select('org_id')
    .eq('channel', channel)
    .eq('is_active', true)

  if (externalId) {
    query = query.eq('external_id', externalId)
  }

  const { data, error } = await query.limit(1).single()

  if (error) {
    logger.warn(
      `[resolve-org] Failed to resolve org for channel=${channel}, externalId=${externalId}: ${error.message}`
    )
    return null
  }

  return data?.org_id ?? null
}

/**
 * Resolve org_id from the authenticated user's session.
 *
 * This should be used in API routes that have a user session available.
 */
export async function resolveOrgFromSession(supabase: SupabaseClient): Promise<string | null> {
  const { data: authData, error: authError } = await supabase.auth.getUser()
  const user = authData?.user

  if (authError || !user) {
    logger.warn(`[resolve-org] Failed to get authenticated user: ${authError?.message ?? 'user not found'}`)
    return null
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('personal_org_id, active_org_id')
    .eq('id', user.id)
    .single()

  if (isLegacyProfileSchemaError(profileError)) {
    const { data: legacyProfile, error: legacyError } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (legacyError || !legacyProfile) {
      logger.warn(
        `[resolve-org] Failed to get legacy profile for user ${user.id}: ${legacyError?.message ?? 'profile not found'}`
      )
      return null
    }

    return legacyProfile.org_id ?? null
  }

  if (profileError || !profile) {
    logger.warn(
      `[resolve-org] Failed to get profile for user ${user.id}: ${profileError?.message ?? 'profile not found'}`
    )
    return null
  }

  // Return active_org_id if set, otherwise fall back to personal_org_id
  return profile.active_org_id ?? profile.personal_org_id ?? null
}
