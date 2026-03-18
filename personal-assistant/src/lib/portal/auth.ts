import { createClient } from '@/lib/supabase/server'
<<<<<<< HEAD
import type { PortalContext } from './types'

/**
 * Validates portal access for the current authenticated user against an org slug.
 * Returns PortalContext if valid, null otherwise.
 *
 * This is the SINGLE security gate for all portal operations.
 * Every portal API route and page MUST call this first.
=======
import type { PortalAccess, PortalBranding, PortalContext } from './types'

/**
 * Authenticate a portal user and return their full portal context.
 * Returns null if the user is not authenticated or has no active portal access.
>>>>>>> v1.5-marketing-launch
 */
export async function getPortalContext(orgSlug: string): Promise<PortalContext | null> {
  const supabase = await createClient()
  if (!supabase) return null

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

<<<<<<< HEAD
  // Get org by slug
=======
  // Resolve org from slug
>>>>>>> v1.5-marketing-launch
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, slug')
    .eq('slug', orgSlug)
    .single()

  if (!org) return null

<<<<<<< HEAD
  // Check portal access — user must have active access to this org
=======
  // Check portal access
>>>>>>> v1.5-marketing-launch
  const { data: access } = await supabase
    .from('portal_access')
    .select('*')
    .eq('user_id', user.id)
    .eq('org_id', org.id)
    .eq('status', 'active')
    .single()

  if (!access) return null

<<<<<<< HEAD
  // Get contact info
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, name, emails')
    .eq('id', access.contact_id)
    .single()

  if (!contact) return null

  // Get branding (optional)
=======
  // Load branding
>>>>>>> v1.5-marketing-launch
  const { data: branding } = await supabase
    .from('portal_branding')
    .select('*')
    .eq('org_id', org.id)
    .single()

<<<<<<< HEAD
  // Update last login
  await supabase
    .from('portal_access')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', access.id)

  return {
    access,
    branding,
    contact: {
      id: contact.id,
      name: contact.name,
      email: contact.emails?.[0] || access.email,
    },
    org: {
      id: org.id,
      name: org.name,
      slug: org.slug,
    },
=======
  // Load contact name
  const { data: contact } = await supabase
    .from('contacts')
    .select('name')
    .eq('id', (access as PortalAccess).contact_id)
    .single()

  // Update last_login_at
  await supabase
    .from('portal_access')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', (access as PortalAccess).id)

  return {
    access: access as PortalAccess,
    branding: (branding as PortalBranding) ?? null,
    orgName: org.name,
    contactName: contact?.name ?? 'Client',
>>>>>>> v1.5-marketing-launch
  }
}

/**
<<<<<<< HEAD
 * Validates an invite token and returns the portal access record.
 * Used during the magic link accept flow.
 */
export async function validateInviteToken(token: string) {
  const supabase = await createClient()
  if (!supabase) return null

  const { data } = await supabase
    .from('portal_access')
    .select('*, contacts(name, emails), organizations(name, slug)')
    .eq('invite_token', token)
    .eq('status', 'invited')
    .single()

  return data
=======
 * Check if a user is an agency member for a given org (not a portal client).
 * Used by agency-side portal management.
 */
export async function isAgencyMember(orgId: string): Promise<boolean> {
  const supabase = await createClient()
  if (!supabase) return false

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single()

  if (profile?.org_id === orgId) return true

  // Also check org_members table
  const { count } = await supabase
    .from('org_members')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('org_id', orgId)

  return (count ?? 0) > 0
}

/**
 * Send a magic link invite to a client contact for portal access.
 */
export async function inviteClientToPortal(params: {
  orgId: string
  contactId: string
  email: string
  invitedBy: string
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  if (!supabase) return { success: false, error: 'Not configured' }

  // Check if already invited
  const { data: existing } = await supabase
    .from('portal_access')
    .select('id, status')
    .eq('org_id', params.orgId)
    .eq('email', params.email)
    .single()

  if (existing && (existing as { status: string }).status === 'active') {
    return { success: false, error: 'User already has active portal access' }
  }

  // Get org slug for redirect URL
  const { data: org } = await supabase
    .from('organizations')
    .select('slug')
    .eq('id', params.orgId)
    .single()

  if (!org) return { success: false, error: 'Organization not found' }

  // Create or update portal_access row
  if (existing) {
    await supabase
      .from('portal_access')
      .update({ status: 'invited', invited_by: params.invitedBy, invited_at: new Date().toISOString() })
      .eq('id', (existing as { id: string }).id)
  } else {
    const { error: insertError } = await supabase
      .from('portal_access')
      .insert({
        org_id: params.orgId,
        contact_id: params.contactId,
        email: params.email,
        invited_by: params.invitedBy,
        status: 'invited',
      })

    if (insertError) return { success: false, error: insertError.message }
  }

  // Send magic link via Supabase Auth
  const portalUrl = `/portal/${org.slug}`
  const { error: authError } = await supabase.auth.admin.inviteUserByEmail(params.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.bitbit.chat'}/auth/confirm?next=${encodeURIComponent(portalUrl)}`,
  })

  if (authError) {
    // If admin invite fails (common with anon key), try signInWithOtp as fallback
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: params.email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.bitbit.chat'}/auth/confirm?next=${encodeURIComponent(portalUrl)}`,
        shouldCreateUser: true,
      },
    })

    if (otpError) return { success: false, error: otpError.message }
  }

  return { success: true }
}

/**
 * Activate portal access when user first confirms magic link.
 * Called from auth callback when redirect target is /portal/*.
 */
export async function activatePortalAccess(userId: string, email: string): Promise<void> {
  const supabase = await createClient()
  if (!supabase) return

  await supabase
    .from('portal_access')
    .update({ user_id: userId, status: 'active', last_login_at: new Date().toISOString() })
    .eq('email', email)
    .eq('status', 'invited')
}

/**
 * Revoke portal access for a client.
 */
export async function revokePortalAccess(accessId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  if (!supabase) return { success: false, error: 'Not configured' }

  const { error } = await supabase
    .from('portal_access')
    .update({ status: 'revoked' })
    .eq('id', accessId)

  if (error) return { success: false, error: error.message }
  return { success: true }
>>>>>>> v1.5-marketing-launch
}
