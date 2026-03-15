import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/core/logger';
import { randomBytes } from 'crypto';

interface TeamMember {
  id: string;
  email: string;
  display_name: string | null;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  created_at: string;
}

interface TeamInvite {
  id: string;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  created_at: string;
  expires_at: string;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's org
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.org_id) {
      logger.error('Failed to get user org:', profileError);
      return NextResponse.json({ error: 'User not in an organization' }, { status: 403 });
    }

    // Get team members
    const { data: members, error: membersError } = await supabase
      .from('profiles')
      .select('id, email: id, display_name, role, created_at')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: true });

    if (membersError) {
      logger.error('Failed to fetch team members:', membersError);
      return NextResponse.json({ error: membersError.message }, { status: 500 });
    }

    // Get email from auth for each member
    const membersWithEmail: TeamMember[] = [];
    if (members) {
      for (const member of members) {
        const { data: { user: memberUser } } = await supabase.auth.admin.getUserById(member.id as string);
        if (memberUser) {
          membersWithEmail.push({
            id: member.id as string,
            email: memberUser.email || '',
            display_name: member.display_name as string | null,
            role: (member.role || 'member') as TeamMember['role'],
            created_at: member.created_at as string,
          });
        }
      }
    }

    // Get pending invites
    const { data: invites, error: invitesError } = await supabase
      .from('team_invites')
      .select('*')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false });

    if (invitesError) {
      logger.error('Failed to fetch team invites:', invitesError);
      return NextResponse.json({ error: invitesError.message }, { status: 500 });
    }

    return NextResponse.json({
      members: membersWithEmail,
      invites: invites || [],
    });
  } catch (err) {
    logger.error('Unexpected error in GET /api/team:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is admin/owner
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('org_id, role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.org_id) {
      logger.error('Failed to get user profile:', profileError);
      return NextResponse.json({ error: 'User not found' }, { status: 403 });
    }

    if (profile.role !== 'owner' && profile.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can invite members' }, { status: 403 });
    }

    const body = await request.json() as { email?: string; role?: string };
    const { email, role } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }

    const validRoles = ['owner', 'admin', 'member', 'viewer'];
    const inviteRole = validRoles.includes(role as string) ? role : 'member';

    // Check if user already in org or pending invite
    const { data: existingMember } = await supabase
      .from('profiles')
      .select('id')
      .eq('org_id', profile.org_id)
      .ilike('email', email)
      .single();

    if (existingMember) {
      return NextResponse.json({ error: 'User already in organization' }, { status: 409 });
    }

    const { data: existingInvite } = await supabase
      .from('team_invites')
      .select('id')
      .eq('org_id', profile.org_id)
      .ilike('email', email)
      .eq('status', 'pending')
      .single();

    if (existingInvite) {
      return NextResponse.json({ error: 'Pending invite already exists' }, { status: 409 });
    }

    // Create invite
    const token = randomBytes(32).toString('hex');
    const { data: invite, error: inviteError } = await supabase
      .from('team_invites')
      .insert({
        org_id: profile.org_id,
        email: email.toLowerCase(),
        role: inviteRole,
        invited_by: user.id,
        token,
        status: 'pending',
      })
      .select('*')
      .single();

    if (inviteError) {
      logger.error('Failed to create team invite:', inviteError);
      return NextResponse.json({ error: inviteError.message }, { status: 500 });
    }

    logger.info('Team invite created', {
      orgId: profile.org_id,
      invitedEmail: email,
      role: inviteRole,
      invitedBy: user.id,
    });

    return NextResponse.json({ invite });
  } catch (err) {
    logger.error('Unexpected error in POST /api/team:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
