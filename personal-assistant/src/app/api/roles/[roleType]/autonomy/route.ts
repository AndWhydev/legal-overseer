import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import type { RoleType, AutonomyLevel } from '@/lib/bitbit-core'
import { logger } from '@/lib/core/logger'

const VALID_ROLE_TYPES: RoleType[] = ['finance', 'comms', 'sales']
const VALID_AUTONOMY_LEVELS: AutonomyLevel[] = ['observer', 'copilot', 'autopilot']

/**
 * GET /api/roles/[roleType]/autonomy
 * Returns the current autonomy level for the specified role.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ roleType: string }> },
) {
  try {
    const { roleType } = await params

    if (!VALID_ROLE_TYPES.includes(roleType as RoleType)) {
      return NextResponse.json(
        { error: `Invalid role type: ${roleType}. Valid: ${VALID_ROLE_TYPES.join(', ')}` },
        { status: 400 },
      )
    }

    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let orgId: string
    try {
      orgId = await getActiveOrgId(supabase, user.id)
    } catch (tenancyError) {
      const msg = tenancyError instanceof Error ? tenancyError.message : 'Unknown tenancy error'
      logger.warn(`[api/roles/autonomy] Tenancy resolution failed for user ${user.id}: ${msg}`)
      return NextResponse.json({ error: 'No active organization' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('role_configs')
      .select('id, role_type, autonomy_level, enabled')
      .eq('org_id', orgId)
      .eq('role_type', roleType)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { error: `Role ${roleType} not found for this organization` },
        { status: 404 },
      )
    }

    return NextResponse.json({
      role_type: data.role_type,
      autonomy_level: data.autonomy_level,
      enabled: data.enabled,
      role_config_id: data.id,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch autonomy level'
    logger.error(`[api/roles/autonomy] GET: ${message}`)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PATCH /api/roles/[roleType]/autonomy
 * Update the autonomy level for the specified role.
 * Takes effect immediately -- the next tick uses the new level.
 *
 * Body: { autonomy_level: 'observer' | 'copilot' | 'autopilot' }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ roleType: string }> },
) {
  try {
    const { roleType } = await params

    if (!VALID_ROLE_TYPES.includes(roleType as RoleType)) {
      return NextResponse.json(
        { error: `Invalid role type: ${roleType}. Valid: ${VALID_ROLE_TYPES.join(', ')}` },
        { status: 400 },
      )
    }

    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let orgId: string
    try {
      orgId = await getActiveOrgId(supabase, user.id)
    } catch (tenancyError) {
      const msg = tenancyError instanceof Error ? tenancyError.message : 'Unknown tenancy error'
      logger.warn(`[api/roles/autonomy] Tenancy resolution failed for user ${user.id}: ${msg}`)
      return NextResponse.json({ error: 'No active organization' }, { status: 403 })
    }

    // Parse body
    let body: { autonomy_level?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const newLevel = body.autonomy_level
    if (!newLevel || !VALID_AUTONOMY_LEVELS.includes(newLevel as AutonomyLevel)) {
      return NextResponse.json(
        { error: `Invalid autonomy_level. Valid: ${VALID_AUTONOMY_LEVELS.join(', ')}` },
        { status: 400 },
      )
    }

    // Update
    const { data, error } = await supabase
      .from('role_configs')
      .update({ autonomy_level: newLevel })
      .eq('org_id', orgId)
      .eq('role_type', roleType)
      .select('id, role_type, autonomy_level, enabled, updated_at')
      .single()

    if (error || !data) {
      logger.error(`[api/roles/autonomy] Failed to update ${roleType}: ${error?.message}`)
      return NextResponse.json(
        { error: `Role ${roleType} not found for this organization` },
        { status: 404 },
      )
    }

    logger.info(`[api/roles/autonomy] ${roleType} autonomy level changed to ${newLevel} for org ${orgId.slice(0, 8)}`)

    return NextResponse.json({
      success: true,
      role_type: data.role_type,
      autonomy_level: data.autonomy_level,
      enabled: data.enabled,
      role_config_id: data.id,
      updated_at: data.updated_at,
      message: `Autonomy level for ${roleType} updated to ${newLevel}. Takes effect on next tick.`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update autonomy level'
    logger.error(`[api/roles/autonomy] PATCH: ${message}`)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
