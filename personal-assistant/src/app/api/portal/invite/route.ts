<<<<<<< HEAD
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service-client'

/**
 * POST /api/portal/invite — Agency staff invites a client to the portal
 * Body: { contact_id: string, email: string, permissions?: object }
 *
 * Creates portal_access record and sends magic link via Supabase Auth.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify caller is agency staff
  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const body = await request.json()
  const { contact_id, email, permissions } = body

  if (!contact_id || !email) {
    return NextResponse.json({ error: 'contact_id and email required' }, { status: 400 })
  }

  // Verify contact exists in caller's org
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, name')
    .eq('id', contact_id)
    .eq('org_id', profile.org_id)
    .single()

  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

  // Get org slug for the portal URL
  const { data: org } = await supabase
    .from('organizations')
    .select('slug, name')
    .eq('id', profile.org_id)
    .single()

  if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

  // Upsert portal access (re-invite if revoked/existing)
  const serviceClient = getServiceClient()
  const { data: access, error } = await serviceClient
    .from('portal_access')
    .upsert({
      org_id: profile.org_id,
      contact_id,
      email,
      status: 'invited',
      invite_token: crypto.randomUUID(),
      permissions: permissions || {
        view_projects: true,
        view_invoices: true,
        upload_files: true,
        submit_requests: true,
      },
    }, { onConflict: 'org_id,email' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send magic link via Supabase Auth — creates user if needed
  const portalUrl = `${request.nextUrl.origin}/portal/${org.slug}`
  const { error: authError } = await serviceClient.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: {
      redirectTo: `${request.nextUrl.origin}/api/portal/auth/callback?token=${access.invite_token}&next=${encodeURIComponent(portalUrl)}`,
      data: {
        portal_invite: true,
        org_id: profile.org_id,
        contact_id,
        contact_name: contact.name,
      },
    },
  })

  if (authError) {
    return NextResponse.json({ error: `Auth error: ${authError.message}` }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    access_id: access.id,
    portal_url: portalUrl,
  }, { status: 201 })
}

/**
 * GET /api/portal/invite — List portal invites for the current org
 */
export async function GET() {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('portal_access')
    .select('*, contacts(name, emails)')
    .order('created_at', { ascending: false })

  return NextResponse.json({ invites: data || [] })
=======
import { NextResponse } from 'next/server'
import { validateAgencyRequest } from '@/lib/portal/middleware'
import { inviteClientToPortal, revokePortalAccess } from '@/lib/portal/auth'
import { createClient } from '@/lib/supabase/server'

/** Invite a client contact to the portal */
export async function POST(request: Request) {
  const auth = await validateAgencyRequest()
  if (!auth.ok) return auth.response

  const body = await request.json()

  if (!body.contact_id || !body.email) {
    return NextResponse.json({ error: 'contact_id and email are required' }, { status: 400 })
  }

  // Verify the contact belongs to this org
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: contact } = await supabase
    .from('contacts')
    .select('id, org_id')
    .eq('id', body.contact_id)
    .eq('org_id', auth.orgId)
    .single()

  if (!contact) {
    return NextResponse.json({ error: 'Contact not found in your organization' }, { status: 404 })
  }

  const result = await inviteClientToPortal({
    orgId: auth.orgId,
    contactId: body.contact_id,
    email: body.email,
    invitedBy: auth.userId,
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ success: true }, { status: 201 })
}

/** Revoke portal access */
export async function DELETE(request: Request) {
  const auth = await validateAgencyRequest()
  if (!auth.ok) return auth.response

  const body = await request.json()
  if (!body.access_id) {
    return NextResponse.json({ error: 'access_id is required' }, { status: 400 })
  }

  // Verify the access belongs to this org
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: access } = await supabase
    .from('portal_access')
    .select('id, org_id')
    .eq('id', body.access_id)
    .eq('org_id', auth.orgId)
    .single()

  if (!access) {
    return NextResponse.json({ error: 'Access record not found' }, { status: 404 })
  }

  const result = await revokePortalAccess(body.access_id)
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

/** List portal access for this org */
export async function GET() {
  const auth = await validateAgencyRequest()
  if (!auth.ok) return auth.response

  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data, error } = await supabase
    .from('portal_access')
    .select('*, contacts(name, emails)')
    .eq('org_id', auth.orgId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ access: data })
>>>>>>> v1.5-marketing-launch
}
