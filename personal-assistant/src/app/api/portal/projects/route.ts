import { NextResponse } from 'next/server'
import { validatePortalRequest } from '@/lib/portal/middleware'
import { getPortalProjects } from '@/lib/portal/data'

export async function GET() {
  const auth = await validatePortalRequest()
  if (!auth.ok) return auth.response

  const projects = await getPortalProjects(auth.access.org_id, auth.access.contact_id)
  return NextResponse.json({ projects })
}
