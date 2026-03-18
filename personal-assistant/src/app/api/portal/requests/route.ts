import { NextResponse } from 'next/server'
import { validatePortalRequest } from '@/lib/portal/middleware'
import { getPortalRequests, createPortalRequest } from '@/lib/portal/data'

export async function GET() {
  const auth = await validatePortalRequest()
  if (!auth.ok) return auth.response

  const requests = await getPortalRequests(auth.access.org_id, auth.access.contact_id)
  return NextResponse.json({ requests })
}

export async function POST(request: Request) {
  const auth = await validatePortalRequest()
  if (!auth.ok) return auth.response

  const body = await request.json()

  if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  const result = await createPortalRequest({
    org_id: auth.access.org_id,
    contact_id: auth.access.contact_id,
    submitted_by: auth.userId,
    title: body.title.trim(),
    description: body.description?.trim(),
    request_type: body.request_type,
    priority: body.priority,
  })

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ request: result.request }, { status: 201 })
}
