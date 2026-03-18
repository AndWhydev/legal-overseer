import { NextRequest, NextResponse } from 'next/server'
import { validatePortalRequest } from '@/lib/portal/middleware'
import { getPortalActivity, markActivityRead } from '@/lib/portal/data'

export async function GET(request: NextRequest) {
  const auth = await validatePortalRequest()
  if (!auth.ok) return auth.response

  const limit = Number(request.nextUrl.searchParams.get('limit')) || 50
  const offset = Number(request.nextUrl.searchParams.get('offset')) || 0

  const activity = await getPortalActivity(auth.access.org_id, auth.access.contact_id, { limit, offset })
  return NextResponse.json({ activity })
}

export async function PATCH(request: Request) {
  const auth = await validatePortalRequest()
  if (!auth.ok) return auth.response

  const body = await request.json()
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: 'ids array required' }, { status: 400 })
  }

  await markActivityRead(body.ids)
  return NextResponse.json({ success: true })
}
