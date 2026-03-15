import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/core/logger';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  try {
    const { memberId } = await params;
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is admin/owner
    const { data: userProfile, error: userProfileError } = await supabase
      .from('profiles')
      .select('org_id, role')
      .eq('id', user.id)
      .single();

    if (userProfileError || !userProfile?.org_id) {
      logger.error('Failed to get user profile:', userProfileError);
      return NextResponse.json({ error: 'User not found' }, { status: 403 });
    }

    if (userProfile.role !== 'owner' && userProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can update roles' }, { status: 403 });
    }

    // Get member to update
    const { data: member, error: memberError } = await supabase
      .from('profiles')
      .select('org_id, role, id')
      .eq('id', memberId)
      .single();

    if (memberError || !member) {
      logger.error('Failed to find member:', memberError);
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Verify member is in same org
    if (member.org_id !== userProfile.org_id) {
      return NextResponse.json({ error: 'Cannot modify members from other organizations' }, { status: 403 });
    }

    // Prevent changing owner role
    if (member.role === 'owner') {
      return NextResponse.json({ error: 'Cannot modify owner role' }, { status: 403 });
    }

    const body = await request.json() as { role?: string };
    const { role } = body;

    if (!role || typeof role !== 'string') {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const validRoles = ['admin', 'member', 'viewer'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Update role
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', memberId);

    if (updateError) {
      logger.error('Failed to update member role:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    logger.info('Member role updated', {
      orgId: userProfile.org_id,
      memberId,
      newRole: role,
      updatedBy: user.id,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('Unexpected error in PATCH /api/team/[memberId]:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  try {
    const { memberId } = await params;
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is admin/owner
    const { data: userProfile, error: userProfileError } = await supabase
      .from('profiles')
      .select('org_id, role')
      .eq('id', user.id)
      .single();

    if (userProfileError || !userProfile?.org_id) {
      logger.error('Failed to get user profile:', userProfileError);
      return NextResponse.json({ error: 'User not found' }, { status: 403 });
    }

    if (userProfile.role !== 'owner' && userProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can remove members' }, { status: 403 });
    }

    // Get member to remove
    const { data: member, error: memberError } = await supabase
      .from('profiles')
      .select('org_id, role')
      .eq('id', memberId)
      .single();

    if (memberError || !member) {
      logger.error('Failed to find member:', memberError);
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Verify member is in same org
    if (member.org_id !== userProfile.org_id) {
      return NextResponse.json({ error: 'Cannot remove members from other organizations' }, { status: 403 });
    }

    // Prevent removing owner
    if (member.role === 'owner') {
      return NextResponse.json({ error: 'Cannot remove owner' }, { status: 403 });
    }

    // Prevent self-removal
    if (memberId === user.id) {
      return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 403 });
    }

    // Delete profile (cascades to related data)
    const { error: deleteError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', memberId);

    if (deleteError) {
      logger.error('Failed to delete member:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    logger.info('Team member removed', {
      orgId: userProfile.org_id,
      memberId,
      removedBy: user.id,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('Unexpected error in DELETE /api/team/[memberId]:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
