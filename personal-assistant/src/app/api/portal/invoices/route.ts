import { NextResponse } from 'next/server'
import { validatePortalRequest } from '@/lib/portal/middleware'
import { getPortalInvoices } from '@/lib/portal/data'

export async function GET() {
  const auth = await validatePortalRequest()
  if (!auth.ok) return auth.response

  const invoices = await getPortalInvoices(auth.access.org_id, auth.access.contact_id)
  return NextResponse.json({ invoices })
}
