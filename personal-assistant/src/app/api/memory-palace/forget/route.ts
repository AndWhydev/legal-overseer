import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/core/logger'
import type { ForgetResult } from '@/lib/memory-palace'

/**
 * POST /api/memory-palace/forget
 * GDPR entity forgetting — cascade-delete all memories linked to an entity.
 *
 * Body: { entity_id: string }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) return NextResponse.json({ error: 'No org found' }, { status: 400 })

    const body = await request.json()
    const { entity_id } = body as { entity_id?: string }

    if (!entity_id) {
      return NextResponse.json({ error: 'Missing entity_id in request body' }, { status: 400 })
    }

    // Call the forget_entity database function
    const { data, error } = await supabase.rpc('forget_entity', {
      p_org_id: profile.org_id,
      p_entity_id: entity_id,
    })

    if (error) {
      logger.error('[api/memory-palace/forget] RPC failed', { error: error.message })
      return NextResponse.json({ error: 'Forget operation failed' }, { status: 500 })
    }

    const result = data as ForgetResult

    logger.info('[api/memory-palace/forget] Entity forgotten', {
      entityId: entity_id,
      orgId: profile.org_id,
      memoriesDeleted: result.memories_deleted,
      decisionsDeleted: result.decisions_deleted,
    })

    return NextResponse.json({
      message: 'Entity forgotten successfully',
      result,
    })
  } catch (error) {
    logger.error('[api/memory-palace/forget] Error:', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Forget failed' }, { status: 500 })
  }
}
