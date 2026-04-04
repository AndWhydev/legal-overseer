'use client'

import React, { useState, useCallback, memo } from 'react'
import {
  IconSend,
  IconPlus,
  IconMail,
  IconEye,
  IconPointer,
  IconMessage,
  IconAlertCircle,
  IconFileText,
} from '@tabler/icons-react'
import { useCampaigns } from '@/hooks/use-campaigns'
import type { EnhancedLeadData } from '@/lib/leads/types'
import { TemplateEditorPanel } from './template-editor-panel'
import { CampaignCreatePanel } from './campaign-create-panel'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from '@/components/ui/empty'

interface OutreachDashboardProps {
  leads: EnhancedLeadData[]
}

const CAMPAIGN_STATUS_VARIANT = {
  draft: 'secondary',
  scheduled: 'outline',
  active: 'default',
  paused: 'destructive',
  completed: 'secondary',
} as const

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
}

interface StatCellProps {
  icon: React.ReactNode
  label: string
  value: number
}

function StatCell({ icon, label, value }: StatCellProps) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1 px-3 py-4">
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">{icon} {label}</span>
      <span className="text-base font-medium font-mono text-foreground">{value}</span>
    </div>
  )
}

function OutreachDashboardInner({ leads }: OutreachDashboardProps) {
  const {
    campaigns,
    templates,
    isLoading,
    createTemplate,
    createCampaign,
    sendCampaign,
  } = useCampaigns()

  const [templateEditorOpen, setTemplateEditorOpen] = useState(false)
  const [campaignCreateOpen, setCampaignCreateOpen] = useState(false)
  const [sendingCampaignId, setSendingCampaignId] = useState<string | null>(null)

  const totalSent = campaigns.reduce((sum, c) => sum + (c.sent_count ?? 0), 0)
  const totalOpened = campaigns.reduce((sum, c) => sum + (c.opened_count ?? 0), 0)
  const totalClicked = campaigns.reduce((sum, c) => sum + (c.clicked_count ?? 0), 0)
  const totalReplied = campaigns.reduce((sum, c) => sum + (c.replied_count ?? 0), 0)
  const totalBounced = campaigns.reduce((sum, c) => sum + (c.bounced_count ?? 0), 0)

  const handleCreateTemplate = useCallback(async (data: {
    name: string
    subject: string
    body: string
    variables: string[]
    category: string
  }) => {
    await createTemplate(data)
    setTemplateEditorOpen(false)
  }, [createTemplate])

  const handleCreateCampaign = useCallback(async (data: {
    name: string
    templateId: string
    leadIds: string[]
    dailyLimit: number
  }) => {
    await createCampaign(data)
    setCampaignCreateOpen(false)
  }, [createCampaign])

  const handleSendCampaign = useCallback(async (campaignId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSendingCampaignId(campaignId)
    await sendCampaign(campaignId)
    setSendingCampaignId(null)
  }, [sendCampaign])

  if (isLoading) {
    return (
      <div className="space-y-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-18 rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Stat Bar */}
      <Card className="flex-row flex-wrap gap-0 py-0">
        <StatCell icon={<IconMail data-icon />} label="Sent" value={totalSent} />
        <Separator orientation="vertical" className="self-stretch" />
        <StatCell icon={<IconEye data-icon />} label="Opened" value={totalOpened} />
        <Separator orientation="vertical" className="self-stretch" />
        <StatCell icon={<IconPointer data-icon />} label="Clicked" value={totalClicked} />
        <Separator orientation="vertical" className="self-stretch" />
        <StatCell icon={<IconMessage data-icon />} label="Replied" value={totalReplied} />
        <Separator orientation="vertical" className="self-stretch" />
        <StatCell icon={<IconAlertCircle data-icon />} label="Bounced" value={totalBounced} />
      </Card>

      {/* Campaigns Section */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Campaigns</h3>
          <Button onClick={() => setCampaignCreateOpen(true)}>
            <IconPlus data-icon /> New Campaign
          </Button>
        </div>

        {campaigns.length === 0 ? (
          <Card>
            <CardContent>
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <IconMail data-icon />
                  </EmptyMedia>
                  <EmptyTitle>No campaigns yet</EmptyTitle>
                  <EmptyDescription>
                    Create a template, select some leads, and launch your first outreach campaign.
                  </EmptyDescription>
                </EmptyHeader>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (templates.length === 0) {
                      setTemplateEditorOpen(true)
                    } else {
                      setCampaignCreateOpen(true)
                    }
                  }}
                >
                  {templates.length === 0 ? 'Create Template' : 'Create Campaign'}
                </Button>
              </Empty>
            </CardContent>
          </Card>
        ) : (
          <Card className="gap-0 py-0">
            <CardContent className="divide-y p-0">
              {campaigns.map(campaign => (
                <div
                  key={campaign.id}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted"
                >
                  <span className="flex-1 text-sm font-medium text-foreground">{campaign.name}</span>
                  <Badge variant={(CAMPAIGN_STATUS_VARIANT as Record<string, 'default' | 'secondary' | 'destructive' | 'outline'>)[campaign.status] ?? 'secondary'}>
                    {campaign.status}
                  </Badge>
                  <span className="text-sm font-mono text-muted-foreground">{campaign.sent_count} sent</span>
                  <span className="text-sm text-muted-foreground">{formatDate(campaign.created_at)}</span>
                  {(campaign.status === 'draft' || campaign.status === 'active') && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={(e) => handleSendCampaign(campaign.id, e)}
                      disabled={sendingCampaignId === campaign.id}
                    >
                      <IconSend data-icon />
                      {sendingCampaignId === campaign.id ? 'Sending...' : 'Send'}
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Templates Section */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Templates</h3>
          <Button variant="outline" onClick={() => setTemplateEditorOpen(true)}>
            <IconPlus data-icon /> New Template
          </Button>
        </div>

        {templates.length === 0 ? (
          <Card>
            <CardContent>
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <IconFileText data-icon />
                  </EmptyMedia>
                  <EmptyTitle>No templates</EmptyTitle>
                  <EmptyDescription>
                    Create an email template to use in your campaigns.
                  </EmptyDescription>
                </EmptyHeader>
                <Button variant="outline" onClick={() => setTemplateEditorOpen(true)}>
                  Create Template
                </Button>
              </Empty>
            </CardContent>
          </Card>
        ) : (
          <Card className="gap-0 py-0">
            <CardContent className="divide-y p-0">
              {templates.map(template => (
                <div
                  key={template.id}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted"
                >
                  <IconFileText data-icon className="shrink-0 text-muted-foreground" />
                  <span className="flex-1 text-sm font-medium text-foreground">{template.name}</span>
                  {template.category && (
                    <Badge variant="secondary">{template.category}</Badge>
                  )}
                  <span className="text-sm text-muted-foreground">
                    {template.variables?.length ?? 0} vars
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Panels */}
      <TemplateEditorPanel
        open={templateEditorOpen}
        onClose={() => setTemplateEditorOpen(false)}
        onSave={handleCreateTemplate}
      />

      <CampaignCreatePanel
        open={campaignCreateOpen}
        onClose={() => setCampaignCreateOpen(false)}
        onCreate={handleCreateCampaign}
        templates={templates}
        leads={leads}
      />
    </div>
  )
}

export const OutreachDashboard = memo(OutreachDashboardInner)
