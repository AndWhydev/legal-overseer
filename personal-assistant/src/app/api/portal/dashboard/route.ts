import { NextResponse } from 'next/server'
import { validatePortalRequest } from '@/lib/portal/middleware'
import { getPortalDashboardStats } from '@/lib/portal/data'

export async function GET() {
  const auth = await validatePortalRequest()
  if (!auth.ok) return auth.response

  const stats = await getPortalDashboardStats(
    auth.access.org_id,
    auth.access.contact_id,
    auth.access.id
  )

  return NextResponse.json({ stats })
}
