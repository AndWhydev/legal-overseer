<<<<<<< HEAD
import { NextRequest, NextResponse } from 'next/server'
import { getPortalContext } from '@/lib/portal/auth'
import { getPortalInvoices } from '@/lib/portal/data'

/**
 * GET /api/portal/invoices?slug=org-slug
 * Returns invoices visible to the portal user.
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug')
  if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 })

  const ctx = await getPortalContext(slug)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!ctx.access.permissions.view_invoices) {
    return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
  }

  const invoices = await getPortalInvoices(ctx)
=======
import { NextResponse } from 'next/server'
import { validatePortalRequest } from '@/lib/portal/middleware'
import { getPortalInvoices } from '@/lib/portal/data'

export async function GET() {
  const auth = await validatePortalRequest()
  if (!auth.ok) return auth.response

  const invoices = await getPortalInvoices(auth.access.org_id, auth.access.contact_id)
>>>>>>> v1.5-marketing-launch
  return NextResponse.json({ invoices })
}
