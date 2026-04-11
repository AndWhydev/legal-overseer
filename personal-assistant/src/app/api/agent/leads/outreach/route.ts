import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrgPlan } from '@/lib/billing/plan-gates'
import { canSendEmail, getRemainingEmails, type PlanTier } from '@/lib/leads/plan-limits'
import {
  sendCampaignEmail,
  renderTemplate,
  buildLeadVariables,
} from '@/lib/leads/campaign-sender'

interface SendCampaignRequest {
  campaignId: string
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
 * POST /api/agent/leads/outreach
 * Send emails for a campaign (processes all pending campaign_leads)
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error

  let body: SendCampaignRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { campaignId } = body
  if (!campaignId) {
    return NextResponse.json({ error: 'campaignId is required' }, { status: 400 })
  }

  try {
    // Fetch campaign with template
    const { data: campaign, error: campaignError } = await auth.supabase
      .from('email_campaigns')
      .select('id, name, status, template_id, daily_limit, sent_count, bounced_count, metadata')
      .eq('id', campaignId)
      .eq('org_id', auth.orgId)
      .single()

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (campaign.status !== 'active' && campaign.status !== 'draft') {
      return NextResponse.json(
        { error: `Campaign is ${campaign.status}, cannot send` },
        { status: 400 },
      )
    }

    // Plan limit check: count emails sent this month
    const orgPlan = await getOrgPlan(auth.supabase, auth.orgId) as PlanTier
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const { count: sentThisMonth } = await auth.supabase
      .from('campaign_leads')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'sent')
      .gte('sent_at', startOfMonth.toISOString())
      .in('campaign_id', (
        await auth.supabase
          .from('email_campaigns')
          .select('id')
          .eq('org_id', auth.orgId)
      ).data?.map(c => c.id) ?? [])

    if (!canSendEmail(orgPlan, sentThisMonth ?? 0)) {
      return NextResponse.json(
        { error: `Monthly email limit reached for ${orgPlan} plan. Upgrade to send more emails.` },
        { status: 403 },
      )
    }

    const remaining = getRemainingEmails(orgPlan, sentThisMonth ?? 0)

    // Fetch template
    const { data: template, error: templateError } = await auth.supabase
      .from('email_templates')
      .select('id, subject, body')
      .eq('id', campaign.template_id)
      .single()

    if (templateError || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // Fetch pending campaign leads with their lead data
    const { data: campaignLeads, error: clError } = await auth.supabase
      .from('campaign_leads')
      .select(`
        id, lead_id, recipient_email, status,
        leads!inner(
          prospect_name, prospect_domain, prospect_website,
          prospect_phone, prospect_emails, prospect_address,
          outreach_angle, priority_services, opportunity_notes
        )
      `)
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')
      .limit(Math.min(campaign.daily_limit, remaining))

    if (clError) {
      return NextResponse.json({ error: clError.message }, { status: 500 })
    }

    if (!campaignLeads || campaignLeads.length === 0) {
      return NextResponse.json({
        sent: 0,
        failed: 0,
        message: 'No pending recipients in this campaign',
      })
    }

    // Send emails
    let sentCount = 0
    let failedCount = 0
    let bouncedCount = 0
    const results: Array<{ leadId: string; success: boolean; error?: string }> = []

    for (const cl of campaignLeads) {
      const lead = (cl as Record<string, unknown>).leads as Record<string, unknown>
      const variables = buildLeadVariables(lead as Parameters<typeof buildLeadVariables>[0])

      const renderedSubject = renderTemplate(template.subject, variables)
      const renderedBody = renderTemplate(template.body, variables)

      const sendResult = await sendCampaignEmail({
        to: cl.recipient_email,
        subject: renderedSubject,
        htmlBody: renderedBody,
        tags: [
          { name: 'campaign_id', value: campaignId },
          { name: 'campaign_lead_id', value: cl.id },
        ],
      })

      const now = new Date().toISOString()

      if (sendResult.success) {
        sentCount++
        await auth.supabase
          .from('campaign_leads')
          .update({
            status: 'sent',
            sent_at: now,
            metadata: { resend_message_id: sendResult.messageId },
            updated_at: now,
          })
          .eq('id', cl.id)

        results.push({ leadId: cl.lead_id, success: true })
      } else {
        failedCount++
        const isBounce = sendResult.error?.includes('bounce') || sendResult.error?.includes('invalid')
        if (isBounce) bouncedCount++
        await auth.supabase
          .from('campaign_leads')
          .update({
            status: isBounce ? 'bounced' : 'pending',
            bounce_reason: isBounce ? sendResult.error : null,
            metadata: { last_error: sendResult.error },
            updated_at: now,
          })
          .eq('id', cl.id)

        results.push({ leadId: cl.lead_id, success: false, error: sendResult.error })
      }
    }

    // Update campaign counters (accumulate, don't overwrite)
    const now = new Date().toISOString()
    await auth.supabase
      .from('email_campaigns')
      .update({
        sent_count: (campaign.sent_count ?? 0) + sentCount,
        bounced_count: (campaign.bounced_count ?? 0) + bouncedCount,
        status: 'active',
        updated_at: now,
      })
      .eq('id', campaignId)

    return NextResponse.json({
      sent: sentCount,
      failed: failedCount,
      total: campaignLeads.length,
      results,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Outreach send failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * GET /api/agent/leads/outreach?campaign_id=xxx
 * Get outreach stats for a campaign
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error

  const campaignId = request.nextUrl.searchParams.get('campaign_id')
  if (!campaignId) {
    return NextResponse.json({ error: 'campaign_id is required' }, { status: 400 })
  }

  // Verify campaign belongs to org
  const { data: campaign, error: campaignError } = await auth.supabase
    .from('email_campaigns')
    .select('id, name, status, sent_count, opened_count, clicked_count, replied_count, bounced_count')
    .eq('id', campaignId)
    .eq('org_id', auth.orgId)
    .single()

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  // Get per-lead status breakdown
  const { data: leads, error: leadsError } = await auth.supabase
    .from('campaign_leads')
    .select('id, lead_id, recipient_email, status, sent_at, opened_at, clicked_at, replied_at, bounce_reason')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })

  if (leadsError) {
    return NextResponse.json({ error: leadsError.message }, { status: 500 })
  }

  return NextResponse.json({
    campaign,
    leads: leads ?? [],
    stats: {
      total: leads?.length ?? 0,
      pending: leads?.filter(l => l.status === 'pending').length ?? 0,
      sent: leads?.filter(l => l.status === 'sent').length ?? 0,
      opened: leads?.filter(l => l.status === 'opened').length ?? 0,
      clicked: leads?.filter(l => l.status === 'clicked').length ?? 0,
      replied: leads?.filter(l => l.status === 'replied').length ?? 0,
      bounced: leads?.filter(l => l.status === 'bounced').length ?? 0,
    },
  })
}
