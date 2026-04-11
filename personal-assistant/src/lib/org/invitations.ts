import type { SupabaseClient } from '@supabase/supabase-js'

export type InvitationRole = 'admin' | 'member' | 'viewer'

export interface Invitation {
  id: string
  org_id: string
  email: string
  role: InvitationRole
  token: string
  invited_by: string | null
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
  expires_at: string
  accepted_at: string | null
  created_at: string
  updated_at: string
}

/**
 * Invite a user to an organization.
 * Creates an invitation record and returns the invite token.
 */
export async function inviteUser(
  supabase: SupabaseClient,
  orgId: string,
  email: string,
  role: InvitationRole,
  invitedBy?: string
): Promise<{ token: string; invitation: Invitation }> {
  if (!email || !email.includes('@')) {
    throw new Error('Valid email is required')
  }
  if (!['admin', 'member', 'viewer'].includes(role)) {
    throw new Error('Role must be admin, member, or viewer')
  }

  // Check for existing pending invitation
  const { data: existing } = await supabase
    .from('invitations')
    .select('id, token')
    .eq('org_id', orgId)
    .eq('email', email.toLowerCase())
    .eq('status', 'pending')
    .single()

  if (existing) {
    throw new Error('An invitation is already pending for this email')
  }

  // Check if user is already a member
  const { data: existingMember } = await supabase
    .from('profiles')
    .select('id')
    .eq('org_id', orgId)
    .eq('email', email.toLowerCase())
    .single()

  if (existingMember) {
    throw new Error('User is already a member of this organization')
  }

  const { data, error } = await supabase
    .from('invitations')
    .insert({
      org_id: orgId,
      email: email.toLowerCase(),
      role,
      invited_by: invitedBy ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create invitation: ${error.message}`)

  return { token: data.token, invitation: data as Invitation }
}

/**
 * Accept an invitation using a token.
 * Links the current user to the org with the specified role.
 */
export async function acceptInvitation(
  supabase: SupabaseClient,
  token: string
): Promise<{ orgId: string; role: InvitationRole }> {
  // Find the invitation
  const { data: invitation, error: findError } = await supabase
    .from('invitations')
    .select('*')
    .eq('token', token)
    .eq('status', 'pending')
    .single()

  if (findError || !invitation) {
    throw new Error('Invitation not found or already used')
  }

  // Check expiry
  if (new Date(invitation.expires_at) < new Date()) {
    await supabase
      .from('invitations')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', invitation.id)
    throw new Error('Invitation has expired')
  }

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Update user's profile to join the org
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      org_id: invitation.org_id,
      role: invitation.role,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (updateError) {
    throw new Error(`Failed to join organization: ${updateError.message}`)
  }

  // Mark invitation as accepted
  await supabase
    .from('invitations')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', invitation.id)

  return { orgId: invitation.org_id, role: invitation.role as InvitationRole }
}

/**
 * List pending invitations for an organization.
 */
export async function listPendingInvitations(
  supabase: SupabaseClient,
  orgId: string
): Promise<Invitation[]> {
  const { data, error } = await supabase
    .from('invitations')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to list invitations: ${error.message}`)
  return (data ?? []) as Invitation[]
}

/**
 * Revoke a pending invitation.
 */
export async function revokeInvitation(
  supabase: SupabaseClient,
  invitationId: string
): Promise<void> {
  const { error } = await supabase
    .from('invitations')
    .update({ status: 'revoked', updated_at: new Date().toISOString() })
    .eq('id', invitationId)
    .eq('status', 'pending')

  if (error) throw new Error(`Failed to revoke invitation: ${error.message}`)
}
