'use client'

import { useCallback, useState } from 'react'
import type { EmailCampaign, EmailTemplate } from '@/lib/leads/campaign-types'
import { useToast } from '@/components/ui/toast'

export function useEmailCampaigns() {
  const { toast } = useToast()
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([])
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Load campaigns
  const loadCampaigns = useCallback(async (status?: string) => {
    setIsLoading(true)
    try {
      const url = new URL('/api/agent/leads/campaigns', window.location.origin)
      if (status) {
        url.searchParams.set('status', status)
      }

      const response = await fetch(url.toString())
      if (!response.ok) throw new Error('Failed to load campaigns')

      const { campaigns: data } = (await response.json()) as { campaigns: EmailCampaign[] }
      setCampaigns(data || [])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load campaigns'
      toast('error', msg)
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  // Load templates
  const loadTemplates = useCallback(async (category?: string) => {
    setIsLoading(true)
    try {
      const url = new URL('/api/agent/leads/templates', window.location.origin)
      if (category) {
        url.searchParams.set('category', category)
      }

      const response = await fetch(url.toString())
      if (!response.ok) throw new Error('Failed to load templates')

      const { templates: data } = (await response.json()) as { templates: EmailTemplate[] }
      setTemplates(data || [])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load templates'
      toast('error', msg)
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  // Create campaign
  const createCampaign = useCallback(
    async (name: string, templateId: string, leadIds?: string[], dailyLimit?: number) => {
      try {
        const response = await fetch('/api/agent/leads/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            templateId,
            leadIds,
            dailyLimit,
          }),
        })

        if (!response.ok) {
          const { error } = (await response.json()) as { error?: string }
          throw new Error(error || 'Failed to create campaign')
        }

        const { campaign } = (await response.json()) as { campaign: EmailCampaign }
        setCampaigns((prev) => [campaign, ...prev])
        toast('success', `Campaign "${name}" created`)
        return campaign
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Campaign creation failed'
        toast('error', msg)
        throw err
      }
    },
    [toast],
  )

  // Create template
  const createTemplate = useCallback(
    async (
      name: string,
      subject: string,
      body: string,
      variables?: string[],
      category?: string,
    ) => {
      try {
        const response = await fetch('/api/agent/leads/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            subject,
            body,
            variables,
            category,
          }),
        })

        if (!response.ok) {
          const { error } = (await response.json()) as { error?: string }
          throw new Error(error || 'Failed to create template')
        }

        const { template } = (await response.json()) as { template: EmailTemplate }
        setTemplates((prev) => [template, ...prev])
        toast('success', `Template "${name}" created`)
        return template
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Template creation failed'
        toast('error', msg)
        throw err
      }
    },
    [toast],
  )

  // Update campaign
  const updateCampaign = useCallback(
    async (campaignId: string, updates: Partial<EmailCampaign>) => {
      try {
        const response = await fetch(`/api/agent/leads/campaigns/${campaignId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        })

        if (!response.ok) {
          const { error } = (await response.json()) as { error?: string }
          throw new Error(error || 'Failed to update campaign')
        }

        const { campaign } = (await response.json()) as { campaign: EmailCampaign }
        setCampaigns((prev) =>
          prev.map((c) => (c.id === campaignId ? campaign : c)),
        )
        toast('success', 'Campaign updated')
        return campaign
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Campaign update failed'
        toast('error', msg)
        throw err
      }
    },
    [toast],
  )

  // Send campaign emails
  const sendCampaign = useCallback(
    async (campaignId: string, dryRun = false) => {
      try {
        const response = await fetch('/api/agent/leads/outreach/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaignId, dryRun }),
        })

        if (!response.ok) {
          const { error } = (await response.json()) as { error?: string }
          throw new Error(error || 'Failed to send campaign')
        }

        const result = (await response.json()) as {
          sent: number
          failed: number
        }
        toast('success', `Sent ${result.sent} emails (${result.failed} failed)`)
        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Send failed'
        toast('error', msg)
        throw err
      }
    },
    [toast],
  )

  return {
    campaigns,
    templates,
    isLoading,
    loadCampaigns,
    loadTemplates,
    createCampaign,
    createTemplate,
    updateCampaign,
    sendCampaign,
  }
}
