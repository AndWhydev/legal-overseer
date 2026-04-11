'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '@/components/ui/toast'

export interface EmailTemplate {
  id: string
  name: string
  subject: string
  body?: string
  category: string | null
  variables: string[]
  created_at: string
  updated_at: string
}

export interface EmailCampaign {
  id: string
  name: string
  status: 'draft' | 'scheduled' | 'active' | 'paused' | 'completed'
  template_id: string
  start_date: string | null
  end_date: string | null
  daily_limit: number
  sent_count: number
  opened_count: number
  clicked_count: number
  replied_count: number
  bounced_count: number
  created_at: string
  updated_at: string
  metadata: Record<string, unknown>
}

export interface OutreachStats {
  total: number
  pending: number
  sent: number
  opened: number
  clicked: number
  replied: number
  bounced: number
}

export interface CampaignLead {
  id: string
  lead_id: string
  recipient_email: string
  status: string
  sent_at: string | null
  opened_at: string | null
  clicked_at: string | null
  replied_at: string | null
  bounce_reason: string | null
}

export function useCampaigns() {
  const { toast } = useToast()
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([])
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const abortRef = useRef<AbortController | null>(null)

  // Load campaigns
  const loadCampaigns = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const response = await fetch('/api/agent/leads/campaigns', { signal: controller.signal })
      if (!response.ok) throw new Error('Failed to load campaigns')
      const body = await response.json() as { campaigns: EmailCampaign[] }
      setCampaigns(body.campaigns ?? [])
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        toast('error', err.message)
      }
    }
  }, [toast])

  // Load templates
  const loadTemplates = useCallback(async () => {
    try {
      const response = await fetch('/api/agent/leads/templates')
      if (!response.ok) throw new Error('Failed to load templates')
      const body = await response.json() as { templates: EmailTemplate[] }
      setTemplates(body.templates ?? [])
    } catch (err) {
      if (err instanceof Error) toast('error', err.message)
    }
  }, [toast])

  // Initial load
  useEffect(() => {
    setIsLoading(true)
    Promise.all([loadCampaigns(), loadTemplates()])
      .finally(() => setIsLoading(false))

    return () => { abortRef.current?.abort() }
  }, [loadCampaigns, loadTemplates])

  // Create template
  const createTemplate = useCallback(async (data: {
    name: string
    subject: string
    body: string
    variables?: string[]
    category?: string
  }): Promise<EmailTemplate | null> => {
    try {
      const response = await fetch('/api/agent/leads/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'Failed to create template')
      }

      const body = await response.json() as { template: EmailTemplate }
      toast('success', `Template "${data.name}" created`)
      await loadTemplates()
      return body.template
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create template'
      toast('error', msg)
      return null
    }
  }, [toast, loadTemplates])

  // Create campaign
  const createCampaign = useCallback(async (data: {
    name: string
    templateId: string
    leadIds?: string[]
    dailyLimit?: number
  }): Promise<EmailCampaign | null> => {
    try {
      const response = await fetch('/api/agent/leads/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'Failed to create campaign')
      }

      const body = await response.json() as { campaign: EmailCampaign }
      toast('success', `Campaign "${data.name}" created`)
      await loadCampaigns()
      return body.campaign
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create campaign'
      toast('error', msg)
      return null
    }
  }, [toast, loadCampaigns])

  // Send campaign
  const sendCampaign = useCallback(async (campaignId: string): Promise<{
    sent: number
    failed: number
    total: number
  } | null> => {
    try {
      const response = await fetch('/api/agent/leads/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'Send failed')
      }

      const result = await response.json() as { sent: number; failed: number; total: number }
      toast('success', `Sent ${result.sent} emails (${result.failed} failed)`)
      await loadCampaigns()
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Send failed'
      toast('error', msg)
      return null
    }
  }, [toast, loadCampaigns])

  // Get outreach stats for a campaign
  const getOutreachStats = useCallback(async (campaignId: string): Promise<{
    campaign: EmailCampaign
    leads: CampaignLead[]
    stats: OutreachStats
  } | null> => {
    try {
      const response = await fetch(`/api/agent/leads/outreach?campaign_id=${campaignId}`)
      if (!response.ok) throw new Error('Failed to load stats')
      return await response.json()
    } catch (err) {
      if (err instanceof Error) toast('error', err.message)
      return null
    }
  }, [toast])

  return {
    campaigns,
    templates,
    isLoading,
    createTemplate,
    createCampaign,
    sendCampaign,
    getOutreachStats,
    refreshCampaigns: loadCampaigns,
    refreshTemplates: loadTemplates,
  }
}
