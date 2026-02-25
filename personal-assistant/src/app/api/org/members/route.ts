import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/org/members — List members of the current org
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

    const { data: members, error } = await supabase
      .from('profiles')
      .select('id, display_name, email, role, avatar_url, created_at')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: true })

    if (error) throw new Error(error.message)

    return NextResponse.json({ members: members ?? [] })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('GET members error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PATCH /api/org/members — Update a member's role
 * Body: { user_id: string, role: string }
 */
export async function PATCH(request: NextRequest) {
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
      return NextResponse.json({ error: 'Only admins can change roles' }, { status: 403 })
    }

    const body = await request.json() as { user_id: string; role: string }

    if (!body.user_id) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
    }
    if (!body.role || !['admin', 'member', 'viewer'].includes(body.role)) {
      return NextResponse.json({ error: 'Valid role is required (admin, member, viewer)' }, { status: 400 })
    }

    // Prevent self-demotion for owners
    if (body.user_id === user.id && profile.role === 'owner') {
      return NextResponse.json({ error: 'Cannot change owner role' }, { status: 403 })
    }

    const { error } = await supabase
      .from('profiles')
      .update({ role: body.role, updated_at: new Date().toISOString() })
      .eq('id', body.user_id)
      .eq('org_id', profile.org_id)

    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('PATCH member error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/org/members — Remove a member from the org
 * Body: { user_id: string }
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
      return NextResponse.json({ error: 'Only admins can remove members' }, { status: 403 })
    }

    const body = await request.json() as { user_id: string }

    if (!body.user_id) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
    }

    // Prevent removing self
    if (body.user_id === user.id) {
      return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 403 })
    }

    // Set org_id to null (remove from org)
    const { error } = await supabase
      .from('profiles')
      .update({ org_id: null, role: null, updated_at: new Date().toISOString() })
      .eq('id', body.user_id)
      .eq('org_id', profile.org_id)

    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('DELETE member error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
