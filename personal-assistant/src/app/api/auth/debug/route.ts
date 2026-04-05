import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/auth-context'

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request)
    if (!ctx) return NextResponse.json({ status: 'no_context', headers: Object.fromEntries(request.headers) })
    return NextResponse.json({
      status: 'ok',
      userId: ctx.userId,
      email: ctx.email,
      orgId: ctx.orgId,
    })
  } catch (err) {
    return NextResponse.json({
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
    }, { status: 500 })
  }
}
