import { NextRequest, NextResponse } from 'next/server'
import { authenticateBearer } from '@/lib/supabase/bearer-auth'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service-client'
import { logger } from '@/lib/core/logger'

/**
 * POST /api/push/register
 *
 * Register or refresh a push notification token for the authenticated user.
 * Accepts Bearer token auth (mobile) or cookie auth (web).
 *
 * Body: { token: string, platform: 'ios' | 'android' }
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate: Bearer first, fallback to cookie
    let userId: string | null = null

    try {
      const bearerAuth = await authenticateBearer(request)
      if (bearerAuth) {
        userId = bearerAuth.user.id
      }
    } catch (err) {
      // If Bearer token was present but invalid, authenticateBearer throws Response
      if (err instanceof Response) {
        return err
      }
    }

    // Fallback to cookie auth
    if (!userId) {
      const supabase = await createClient()
      if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      const { data: { user }, error } = await supabase.auth.getUser()
      if (error || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
    }

    // Parse body
    const body = await request.json() as { token?: string; platform?: string }
    const { token, platform } = body

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid token' }, { status: 400 })
    }

    if (!platform || !['ios', 'android'].includes(platform)) {
      return NextResponse.json({ error: 'Platform must be ios or android' }, { status: 400 })
    }

    // Upsert token using service client (no RLS restrictions for service role)
    const serviceClient = getServiceClient()
    const { error: upsertError } = await serviceClient
      .from('push_tokens')
      .upsert(
        {
          user_id: userId,
          token,
          platform,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,token' },
      )

    if (upsertError) {
      logger.warn('[push/register] Failed to upsert push token', {
        userId,
        error: upsertError.message,
      })
      return NextResponse.json({ error: 'Failed to register token' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error('[push/register] Unexpected error', { err })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
