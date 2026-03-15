import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/core/logger'

export async function POST() {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get user's org_id
  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'No profile found' }, { status: 400 })

  const orgId = profile.org_id as string

  try {
    // Find pending deletion request within grace period
    const { data: deletion } = await supabase
      .from('soft_delete_requests')
      .select('id, grace_period_until')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .single()

    if (!deletion) {
      logger.warn('No pending deletion found to cancel', { org_id: orgId, user_id: user.id })
      return NextResponse.json({ error: 'No pending deletion found' }, { status: 404 })
    }

    // Check if still within grace period
    const now = new Date()
    const gracePeriodEnd = new Date(deletion.grace_period_until as string)

    if (now > gracePeriodEnd) {
      logger.warn('Deletion grace period expired', {
        org_id: orgId,
        user_id: user.id,
        grace_period_until: deletion.grace_period_until,
      })
      return NextResponse.json(
        { error: 'Grace period expired. Account deletion cannot be cancelled.' },
        { status: 410 }
      )
    }

    // Cancel deletion
    const { error: cancelError } = await supabase
      .from('soft_delete_requests')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', deletion.id)

    if (cancelError) {
      logger.error('Failed to cancel deletion', {
        org_id: orgId,
        user_id: user.id,
        error: cancelError.message,
      })
      return NextResponse.json({ error: 'Failed to cancel deletion' }, { status: 500 })
    }

    // Re-enable account
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ deleted_at: null })
      .eq('id', user.id)
      .eq('org_id', orgId)

    if (profileError) {
      logger.error('Failed to re-enable account', {
        org_id: orgId,
        user_id: user.id,
        error: profileError.message,
      })
      return NextResponse.json({ error: 'Failed to re-enable account' }, { status: 500 })
    }

    logger.info('Account deletion cancelled', {
      org_id: orgId,
      user_id: user.id,
    })

    return NextResponse.json(
      {
        status: 'deletion_cancelled',
        message: 'Account deletion cancelled. Your account is now re-enabled.',
      },
      { status: 200 }
    )
  } catch (err) {
    logger.error('Cancel deletion error', {
      org_id: orgId,
      user_id: user.id,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
