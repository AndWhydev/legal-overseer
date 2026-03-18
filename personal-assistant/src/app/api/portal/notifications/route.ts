import { NextResponse } from 'next/server'
import { validatePortalRequest } from '@/lib/portal/middleware'
import { getPortalNotifications, markNotificationsRead, getUnreadNotificationCount } from '@/lib/portal/data'

export async function GET() {
  const auth = await validatePortalRequest()
  if (!auth.ok) return auth.response

  const [notifications, unreadCount] = await Promise.all([
    getPortalNotifications(auth.access.id),
    getUnreadNotificationCount(auth.access.id),
  ])

  return NextResponse.json({ notifications, unreadCount })
}

export async function PATCH(request: Request) {
  const auth = await validatePortalRequest()
  if (!auth.ok) return auth.response

  const body = await request.json()
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: 'ids array required' }, { status: 400 })
  }

  await markNotificationsRead(body.ids)
  return NextResponse.json({ success: true })
}
