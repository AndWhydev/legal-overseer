import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/auth-context'
import { initiateConnectionByAppKey } from '@/lib/composio'
import { isComposioEnabled } from '@/lib/composio'

export const dynamic = 'force-dynamic'

/**
 * POST /api/connections/composio/connect
 *
 * Initiate a Composio OAuth flow for any app in the Composio catalog.
 * Body: { appKey: string }
 * Returns: { redirectUrl: string, connectionRequestId: string }
 */
export async function POST(request: NextRequest) {
  let ctx: Awaited<ReturnType<typeof getAuthContext>>
  try {
    ctx = await getAuthContext(request)
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isComposioEnabled()) {
    return NextResponse.json(
      { error: 'Composio is not configured. Set COMPOSIO_API_KEY to enable integrations.' },
      { status: 503 },
    )
  }

  let body: { appKey: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { appKey } = body
  if (!appKey || typeof appKey !== 'string') {
    return NextResponse.json({ error: 'appKey is required' }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.bitbit.chat'
  const callbackUrl = `${appUrl}/api/connections/composio/callback`

  const result = await initiateConnectionByAppKey(
    ctx.orgId,
    appKey,
    callbackUrl,
  )

  if (!result) {
    return NextResponse.json(
      { error: `Failed to initiate connection for "${appKey}".` },
      { status: 500 },
    )
  }

  return NextResponse.json({
    redirectUrl: result.redirectUrl,
    connectionRequestId: result.connectionRequestId,
  })
}
