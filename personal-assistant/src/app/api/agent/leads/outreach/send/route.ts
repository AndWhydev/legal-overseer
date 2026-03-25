import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/agent/leads/outreach/send
 * Send emails via Resend for a campaign
 * This is typically called by a background job/cron
 */

interface SendRequest {
  campaignId: string
  dryRun?: boolean
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

  return { supabase, orgId: profile.orgId }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext()
  if ('error' in auth) return auth.error

  let body: SendRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { campaignId, dryRun = false } = body
  const RESEND_API_KEY = process.env.RESEND_API_KEY
  const RESEND_FROM = process.env.RESEND_FROM_EMAIL || 'campaigns@bitbit.so'

  if (!RESEND_API_KEY) {
    return NextResponse.json({ error: 'Resend not configured' }, { status: 503 })
  }

  if (!campaignId) {
    return NextResponse.json({ error: 'campaignId is required' }, { status: 400 })
  }

  try {
    // Get campaign and template
    const { data: campaign, error: campaignError } = await auth.supabase
      .from('email_campaigns')
      .select('id, name, status, template_id, daily_limit, sent_count, metadata')
      .eq('id', campaignId)
      .eq('org_id', auth.orgId)
      .single()

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (campaign.status !== 'active') {
      return NextResponse.json(
        { error: `Campaign is ${campaign.status}, must be active to send` },
        { status: 400 },
      )
    }

    // Get template
    const { data: template, error: templateError } = await auth.supabase
      .from('email_templates')
      .select('id, subject, body, variables')
      .eq('id', campaign.template_id)
      .single()

    if (templateError || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // Get pending campaign leads (limited by daily_limit)
    const { data: pendingLeads, error: leadsError } = await auth.supabase
      .from('campaign_leads')
      .select('id, lead_id, recipient_email, metadata')
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')
      .limit(campaign.daily_limit - (campaign.sent_count || 0))

    if (leadsError) {
      return NextResponse.json({ error: leadsError.message }, { status: 500 })
    }

    if (!pendingLeads || pendingLeads.length === 0) {
      return NextResponse.json({
        success: true,
        sent: 0,
        message: 'No pending leads to send',
      })
    }

    // For each lead, fetch full prospect data and send email
    const sentResults: Array<{ leadId: string; success: boolean; error?: string; messageId?: string }> = []

    for (const campaignLead of pendingLeads) {
      try {
        // Get lead details
        const { data: leadData } = await auth.supabase
          .from('leads')
          .select('prospect_name, prospect_phone, prospect_website, prospect_domain, metadata')
          .eq('id', campaignLead.lead_id)
          .single()

        // Build email with variable substitution
        let emailSubject = template.subject
        let emailBody = template.body

        if (template.variables && template.variables.length > 0 && leadData) {
          const vars = {
            name: leadData.prospect_name || 'there',
            company: leadData.prospect_name || '',
            phone: leadData.prospect_phone || '',
            website: leadData.prospect_website || '',
            domain: leadData.prospect_domain || '',
          }

          for (const [key, value] of Object.entries(vars)) {
            const placeholder = `{{${key}}}`
            emailSubject = emailSubject.replace(new RegExp(placeholder, 'g'), String(value))
            emailBody = emailBody.replace(new RegExp(placeholder, 'g'), String(value))
          }
        }

        // Skip if dry run
        if (dryRun) {
          sentResults.push({
            leadId: campaignLead.lead_id,
            success: true,
            messageId: 'dry-run',
          })
          continue
        }

        // Send via Resend
        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: RESEND_FROM,
            to: campaignLead.recipient_email,
            subject: emailSubject,
            html: emailBody,
            reply_to: (campaign.metadata as Record<string, unknown>)?.reply_to || RESEND_FROM,
            headers: {
              'X-Campaign-ID': campaignId,
              'X-Lead-ID': campaignLead.lead_id,
            },
          }),
        })

        const resendData = (await resendResponse.json()) as { id?: string; error?: string }

        if (!resendResponse.ok || !resendData.id) {
          sentResults.push({
            leadId: campaignLead.lead_id,
            success: false,
            error: resendData.error || 'Failed to send',
          })
          continue
        }

        // Update campaign_leads status
        await auth.supabase
          .from('campaign_leads')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            metadata: {
              ...campaignLead.metadata,
              resend_message_id: resendData.id,
            },
          })
          .eq('id', campaignLead.id)

        sentResults.push({
          leadId: campaignLead.lead_id,
          success: true,
          messageId: resendData.id,
        })
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown error'
        sentResults.push({
          leadId: campaignLead.lead_id,
          success: false,
          error,
        })
      }
    }

    // Update campaign stats
    const successCount = sentResults.filter((r) => r.success).length
    if (successCount > 0) {
      await auth.supabase
        .from('email_campaigns')
        .update({
          sent_count: (campaign.sent_count || 0) + successCount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaignId)
    }

    return NextResponse.json({
      success: true,
      sent: successCount,
      failed: sentResults.length - successCount,
      results: sentResults,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
