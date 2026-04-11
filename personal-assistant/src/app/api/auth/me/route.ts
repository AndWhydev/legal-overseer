import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/auth-context'

/**
 * GET /api/auth/me — lightweight identity check for CLI whoami
 */
export async function GET(request: NextRequest) {
  let ctx: Awaited<ReturnType<typeof getAuthContext>>
  try {
    ctx = await getAuthContext(request)
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.json({
    user: {
      id: ctx.userId,
      email: ctx.email,
      display_name: ctx.displayName,
    },
    org_id: ctx.orgId,
  })
}
