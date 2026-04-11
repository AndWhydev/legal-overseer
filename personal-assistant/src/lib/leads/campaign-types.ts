/**
 * Email campaign and template types
 */

export interface EmailTemplate {
  id: string
  org_id: string
  name: string
  subject: string
  body: string
  variables?: string[]
  category?: string
  created_at: string
  updated_at: string
}

export interface EmailCampaign {
  id: string
  org_id: string
  name: string
  template_id: string
  status: 'draft' | 'scheduled' | 'active' | 'paused' | 'completed'
  start_date?: string
  end_date?: string
  daily_limit: number
  sent_count: number
  opened_count: number
  clicked_count: number
  replied_count: number
  bounced_count: number
  metadata?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface CampaignLead {
  id: string
  campaign_id: string
  lead_id: string
  recipient_email: string
  status: 'pending' | 'sent' | 'opened' | 'clicked' | 'replied' | 'bounced'
  sent_at?: string
  opened_at?: string
  clicked_at?: string
  replied_at?: string
  bounce_reason?: string
  metadata?: Record<string, unknown>
}

export interface CampaignMetrics {
  totalEmails: number
  sentCount: number
  openRate: number
  clickRate: number
  replyRate: number
  bounceRate: number
}

export function calculateMetrics(campaign: EmailCampaign): CampaignMetrics {
  const total = campaign.sent_count || 0

  return {
    totalEmails: total,
    sentCount: total,
    openRate: total > 0 ? (campaign.opened_count || 0) / total : 0,
    clickRate: total > 0 ? (campaign.clicked_count || 0) / total : 0,
    replyRate: total > 0 ? (campaign.replied_count || 0) / total : 0,
    bounceRate: total > 0 ? (campaign.bounced_count || 0) / total : 0,
  }
}
