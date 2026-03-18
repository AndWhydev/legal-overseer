import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import { disableRole } from '@/lib/roles/role-init'
import type { RoleType } from '@/lib/bitbit-core'
import { logger } from '@/lib/core/logger'

const VALID_ROLE_TYPES: RoleType[] = ['finance', 'comms', 'sales']

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ roleType: string }> },
) {
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
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = await getActiveOrgId(supabase, user.id)
  if (!orgId) {
    return NextResponse.json({ error: 'No active organization' }, { status: 403 })
  }

  try {
    const result = await disableRole(supabase, orgId, roleType as RoleType)

    if (!result.success) {
      const status = result.notFound ? 404 : 500
      return NextResponse.json({ error: result.error }, { status })
    }

    return NextResponse.json({
      success: true,
      message: `Role ${roleType} disabled for org`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`[api/roles/disable] Failed to disable ${roleType}: ${message}`)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
