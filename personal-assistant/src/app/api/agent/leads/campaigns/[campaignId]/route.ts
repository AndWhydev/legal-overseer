import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface UpdateCampaignRequest {
  name?: string
  status?: 'draft' | 'scheduled' | 'active' | 'paused' | 'completed'
  dailyLimit?: number
  metadata?: Record<string, unknown>
}

async function getAuthContext() {
  const supabase = await createClient()
  if (!supabase) {
    return { error: NextResponse.json({ error: 'Not configured' }, { status: 503 }) as Response }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) as Response }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single<{ org_id: string }>()

  if (!profile?.org_id) {
    return { error: NextResponse.json({ error: 'No profile found' }, { status: 400 }) as Response }
  }

  return { supabase, orgId: profile.org_id }
}

/**
 * PATCH /api/agent/leads/campaigns/:campaignId
 * Update a campaign
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ campaignId: string }> },
) {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error

  const { campaignId } = await context.params

  if (!campaignId) {
    return NextResponse.json({ error: 'Campaign ID is required' }, { status: 400 })
  }

  let body: UpdateCampaignRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    // Verify campaign belongs to org
    const { data: campaign, error: fetchError } = await auth.supabase
      .from('email_campaigns')
      .select('id')
      .eq('id', campaignId)
      .eq('org_id', auth.orgId)
      .single()

    if (fetchError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Update campaign
    const { data: updated, error: updateError } = await auth.supabase
      .from('email_campaigns')
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaignId)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ campaign: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Campaign update failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
