import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { inviteUser, listPendingInvitations, revokeInvitation } from '@/lib/org/invitations'
import type { InvitationRole } from '@/lib/org/invitations'

/**
 * POST /api/org/invite — Create an invitation
 * Body: { email: string, role: InvitationRole }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id, role')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 })
    }

    // Only admins/owners can invite
    if (!['admin', 'owner'].includes(profile.role ?? '')) {
      return NextResponse.json({ error: 'Only admins can send invitations' }, { status: 403 })
    }

    const body = await request.json() as { email: string; role: InvitationRole }

    if (!body.email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }
    if (!body.role || !['admin', 'member', 'viewer'].includes(body.role)) {
      return NextResponse.json({ error: 'Valid role is required (admin, member, viewer)' }, { status: 400 })
    }

    const result = await inviteUser(supabase, profile.org_id, body.email, body.role, user.id)

    return NextResponse.json({
      success: true,
      token: result.token,
      invitation: result.invitation,
    }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('POST invite error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * GET /api/org/invite — List pending invitations for the org
 */
export async function GET() {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 })
    }

    const invitations = await listPendingInvitations(supabase, profile.org_id)

    return NextResponse.json({ invitations })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('GET invitations error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/org/invite — Revoke an invitation
 * Body: { invitation_id: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id, role')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 })
    }

    if (!['admin', 'owner'].includes(profile.role ?? '')) {
      return NextResponse.json({ error: 'Only admins can revoke invitations' }, { status: 403 })
    }

    const body = await request.json() as { invitation_id: string }
    if (!body.invitation_id) {
      return NextResponse.json({ error: 'invitation_id is required' }, { status: 400 })
    }

    await revokeInvitation(supabase, body.invitation_id)

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('DELETE invitation error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
