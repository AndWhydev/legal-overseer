import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenancyContext, switchActiveOrg } from '@/lib/tenancy'
import { logger } from '@/lib/core/logger';

type SwitchOrgBody = {
  org_id?: unknown
}

function isAccessDeniedError(message: string): boolean {
  return message.includes('does not have access to target organization')
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'No profile found' }, { status: 400 })
    }

    let body: SwitchOrgBody
    try {
      body = (await request.json()) as SwitchOrgBody
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (typeof body.org_id !== 'string' || body.org_id.trim().length === 0) {
      return NextResponse.json({ error: 'org_id is required' }, { status: 400 })
    }

    const orgId = body.org_id.trim()

    await switchActiveOrg(supabase, user.id, orgId)

    return NextResponse.json({ success: true, active_org_id: orgId })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('POST org switch error:', error)

    if (isAccessDeniedError(message)) {
      return NextResponse.json({ error: message }, { status: 403 })
    }

    if (message.includes('Profile not found while switching active organization')) {
      return NextResponse.json({ error: message }, { status: 400 })
    }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'No profile found' }, { status: 400 })
    }

    const tenancyContext = await getTenancyContext(supabase, user.id)

    return NextResponse.json(tenancyContext)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('GET org switch error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
