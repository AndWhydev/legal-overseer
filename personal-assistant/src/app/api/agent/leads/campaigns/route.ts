import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface CreateCampaignRequest {
  name: string
  templateId: string
  leadIds?: string[]
  dailyLimit?: number
  metadata?: Record<string, unknown>
}

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
 * GET /api/agent/leads/campaigns
 * List all campaigns for the organization
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error

  const params = request.nextUrl.searchParams
  const status = params.get('status')
  const templateId = params.get('template_id')

  let query = auth.supabase
    .from('email_campaigns')
    .select(
      `id, name, status, template_id, start_date, end_date, daily_limit,
       sent_count, opened_count, clicked_count, replied_count, bounced_count,
       created_at, updated_at, metadata`,
    )
    .eq('org_id', auth.orgId)

  if (status) {
    query = query.eq('status', status)
  }

  if (templateId) {
    query = query.eq('template_id', templateId)
  }

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ campaigns: data })
}

/**
 * POST /api/agent/leads/campaigns
 * Create a new campaign
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error

  let body: CreateCampaignRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, templateId, leadIds = [], dailyLimit = 50, metadata = {} } = body

  if (!name || !templateId) {
    return NextResponse.json({ error: 'name and templateId are required' }, { status: 400 })
  }

  try {
    // Verify template exists and belongs to org
    const { data: template, error: templateError } = await auth.supabase
      .from('email_templates')
      .select('id')
      .eq('id', templateId)
      .eq('org_id', auth.orgId)
      .single()

    if (templateError || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // Create campaign
    const { data: campaign, error: campaignError } = await auth.supabase
      .from('email_campaigns')
      .insert({
        org_id: auth.orgId,
        name,
        template_id: templateId,
        daily_limit: Math.min(Math.max(dailyLimit, 1), 1000),
        metadata,
      })
      .select()
      .single()

    if (campaignError) {
      return NextResponse.json({ error: campaignError.message }, { status: 500 })
    }

    // Add leads to campaign if provided
    if (leadIds.length > 0) {
      const { data: leads } = await auth.supabase
        .from('leads')
        .select('id, prospect_emails')
        .eq('org_id', auth.orgId)
        .in('id', leadIds)

      if (leads && leads.length > 0) {
        const campaignLeads = leads
          .filter((lead) => lead.prospect_emails && lead.prospect_emails.length > 0)
          .map((lead) => ({
            campaign_id: campaign.id,
            lead_id: lead.id,
            recipient_email: lead.prospect_emails[0],
            status: 'pending',
          }))

        if (campaignLeads.length > 0) {
          await auth.supabase.from('campaign_leads').insert(campaignLeads)
        }
      }
    }

    return NextResponse.json({ campaign }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Campaign creation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PATCH /api/agent/leads/campaigns/:id
 * Update a campaign
 */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error

  const url = new URL(request.url)
  const campaignId = url.pathname.split('/').pop()

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
