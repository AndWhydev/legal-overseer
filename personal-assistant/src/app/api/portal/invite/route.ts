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
}
