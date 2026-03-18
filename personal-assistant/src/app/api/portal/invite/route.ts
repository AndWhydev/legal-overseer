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
}
