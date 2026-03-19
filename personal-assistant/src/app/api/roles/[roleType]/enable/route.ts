import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import { initializeRole } from '@/lib/roles/role-init'
import type { RoleType } from '@/lib/bitbit-core'
import { logger } from '@/lib/core/logger'

const VALID_ROLE_TYPES: RoleType[] = ['finance', 'comms', 'sales']

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ roleType: string }> },
) {
  try {
    const { roleType } = await params

    // Validate role type
    if (!VALID_ROLE_TYPES.includes(roleType as RoleType)) {
      return NextResponse.json(
        { error: `Invalid role type: ${roleType}. Valid types: ${VALID_ROLE_TYPES.join(', ')}` },
        { status: 400 },
      )
    }

    // Auth
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
      logger.warn(`[api/roles/enable] Tenancy resolution failed for user ${user.id}: ${msg}`)
      return NextResponse.json({ error: 'No active organization' }, { status: 403 })
    }

    const result = await initializeRole(supabase, orgId, roleType as RoleType)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      roleConfigId: result.roleConfigId,
      alreadyExists: result.alreadyExists ?? false,
      message: result.alreadyExists
        ? `Role ${roleType} re-enabled for org`
        : `Role ${roleType} initialized and enabled`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`[api/roles/enable] Failed to enable role: ${message}`)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
