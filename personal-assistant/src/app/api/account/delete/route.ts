import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/core/logger'

const GRACE_PERIOD_DAYS = 30

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get user's org_id
  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, display_name')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'No profile found' }, { status: 400 })

  const orgId = profile.org_id as string

  // Require confirmation parameter
  const confirm = request.nextUrl.searchParams.get('confirm')
  if (confirm !== 'DELETE_MY_ACCOUNT') {
    logger.warn('Account deletion without confirmation', { org_id: orgId, user_id: user.id })
    return NextResponse.json(
      { error: 'Confirmation required. Use ?confirm=DELETE_MY_ACCOUNT' },
      { status: 400 }
    )
  }

  try {
    // Check for existing pending deletion
    const { data: existingDeletion } = await supabase
      .from('soft_delete_requests')
      .select('id, status')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .single()

    if (existingDeletion) {
      logger.warn('Account deletion already pending', { org_id: orgId, user_id: user.id })
      return NextResponse.json(
        { error: 'Account deletion already pending. Check email for cancellation instructions.' },
        { status: 409 }
      )
    }

    // Calculate grace period end date
    const gracePeriodUntil = new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString()

    // Create soft delete request
    const { error: deleteError } = await supabase
      .from('soft_delete_requests')
      .insert({
        org_id: orgId,
        user_id: user.id,
        status: 'pending',
        grace_period_until: gracePeriodUntil,
      })

    if (deleteError) {
      logger.error('Failed to create soft delete request', {
        org_id: orgId,
        user_id: user.id,
        error: deleteError.message,
      })
      return NextResponse.json({ error: 'Failed to initiate deletion' }, { status: 500 })
    }

    // Mark profile as deleted (soft delete)
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', user.id)
      .eq('org_id', orgId)

    if (profileError) {
      logger.error('Failed to disable account', {
        org_id: orgId,
        user_id: user.id,
        error: profileError.message,
      })
      return NextResponse.json({ error: 'Failed to disable account' }, { status: 500 })
    }

    // Queue background deletion job
    const { error: jobError } = await supabase
      .from('backfill_jobs')
      .insert({
        org_id: orgId,
        channel_type: 'gdpr_account_deletion',
        status: 'pending',
        total_messages: 0,
        embedded_messages: 0,
        failed_messages: 0,
        cursor: JSON.stringify({ user_id: user.id, org_id: orgId }),
      })

    if (jobError) {
      logger.warn('Failed to queue background deletion job', {
        org_id: orgId,
        user_id: user.id,
        error: jobError.message,
      })
      // Don't fail the request; deletion is already queued in soft_delete_requests
    }

    logger.info('Account deletion initiated', {
      org_id: orgId,
      user_id: user.id,
      grace_period_until: gracePeriodUntil,
    })

    // Send confirmation email (basic template)
    // In production, integrate with Resend or your email service
    const cancellationUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.bitbit.chat'}/api/account/cancel-deletion`
    const confirmationMessage = `
Your BitBit account deletion is pending. You have 30 days to cancel this request.

Account: ${profile.display_name || user.email}
Cancellation deadline: ${new Date(gracePeriodUntil).toLocaleDateString()}

To cancel deletion, visit: ${cancellationUrl}

If you do not cancel, all data will be permanently deleted on ${new Date(gracePeriodUntil).toLocaleDateString()}.
    `

    logger.info('Deletion confirmation prepared', {
      org_id: orgId,
      user_id: user.id,
      recipient: user.email,
    })

    return NextResponse.json(
      {
        status: 'deletion_pending',
        cancel_until: gracePeriodUntil,
        message: 'Account deletion initiated. Check your email for cancellation instructions.',
      },
      { status: 202 }
    )
  } catch (err) {
    logger.error('Account deletion error', {
      org_id: orgId,
      user_id: user.id,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
