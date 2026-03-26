'use client'

import React, { useState, useCallback, memo } from 'react'
import { Send, Plus, Mail, Eye, MousePointer, MessageSquare, AlertCircle, FileText } from 'lucide-react'
import { useCampaigns } from '@/hooks/use-campaigns'
import type { EnhancedLeadData } from '@/lib/leads/types'
import { TemplateEditorPanel } from './template-editor-panel'
import { CampaignCreatePanel } from './campaign-create-panel'
import { StatusPill, type StatusVariant } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'
import { S, C, hoveredRow } from '@/lib/styles/design-tokens'

interface OutreachDashboardProps {
  leads: EnhancedLeadData[]
}

// ─── Hoisted Styles ─────────────────────────────────────────────────────────

const container: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
}

const sectionHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 12,
}

const sectionTitle: React.CSSProperties = {
  ...S.sectionLabel,
  margin: 0,
}

const primaryBtn: React.CSSProperties = {
  ...S.button,
  ...S.buttonPrimary,
}

const ghostBtn: React.CSSProperties = {
  ...S.button,
  ...S.buttonGhost,
}

const statBarCard: React.CSSProperties = {
  ...S.card,
  padding: 0,
  display: 'flex',
  flexWrap: 'wrap' as const,
}

const statItem: React.CSSProperties = {
  flex: '1 1 0',
  minWidth: 100,
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  gap: 4,
  padding: '16px 12px',
}

const statItemDivider: React.CSSProperties = {
  ...statItem,
  borderRight: `1px solid ${C.borderSubtle}`,
}

const statLabelStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 400,
  color: C.textDim,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
}

const statValueStyle: React.CSSProperties = {
  ...S.mono,
}

const campaignName: React.CSSProperties = {
  flex: 1,
  fontSize: 14,
  fontWeight: 500,
  color: C.textPrimary,
}

const campaignMeta: React.CSSProperties = {
  fontSize: 14,
  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
  color: C.textDim,
}

const templateName: React.CSSProperties = {
  flex: 1,
  fontSize: 14,
  fontWeight: 500,
  color: C.textPrimary,
}

const templateCategory: React.CSSProperties = {
  ...S.badge,
  padding: '4px 8px',
}

const sendBtnStyle: React.CSSProperties = {
  ...S.button,
  ...S.buttonSoft,
  height: 32,
  padding: '0 12px',
  fontSize: 14,
  gap: 4,
}

const skeletonBar: React.CSSProperties = {
  height: 72,
  borderRadius: 16,
  background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s ease infinite',
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const CAMPAIGN_STATUS_VARIANT: Record<string, StatusVariant> = {
  draft: 'neutral',
  scheduled: 'info',
  active: 'success',
  paused: 'warning',
  completed: 'purple',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
}

// ─── Stat Item Sub-component ────────────────────────────────────────────────

interface StatCellProps {
  icon: React.ReactNode
  label: string
  value: number
  isLast?: boolean
}

function StatCell({ icon, label, value, isLast }: StatCellProps) {
  return (
    <div style={isLast ? statItem : statItemDivider}>
      <span style={statLabelStyle}>{icon} {label}</span>
      <span style={statValueStyle}>{value}</span>
    </div>
  )
}

// ─── Component ──────────────────────────────────────────────────────────────

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
  const [hoveredCampaign, setHoveredCampaign] = useState<string | null>(null)
  const [hoveredTemplate, setHoveredTemplate] = useState<string | null>(null)

  // Aggregate stats across all campaigns
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
      <div style={container}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{
            ...skeletonBar,
            animationDelay: `${i * 100}ms`,
          }} />
        ))}
      </div>
    )
  }

  return (
    <div style={container}>
      {/* ── Stat Bar ── */}
      <div data-stat-bar="" style={statBarCard}>
        <StatCell icon={<Mail size={16} />} label="Sent" value={totalSent} />
        <StatCell icon={<Eye size={16} />} label="Opened" value={totalOpened} />
        <StatCell icon={<MousePointer size={16} />} label="Clicked" value={totalClicked} />
        <StatCell icon={<MessageSquare size={16} />} label="Replied" value={totalReplied} />
        <StatCell icon={<AlertCircle size={16} />} label="Bounced" value={totalBounced} isLast />
      </div>

      {/* ── Campaigns Section ── */}
      <div>
        <div style={sectionHeader}>
          <h3 style={sectionTitle}>Campaigns</h3>
          <button
            onClick={() => setCampaignCreateOpen(true)}
            style={primaryBtn}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--btn-primary-hover, #E2E8F0)'
              e.currentTarget.style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--btn-primary-bg, #F1F5F9)'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <Plus size={16} /> New Campaign
          </button>
        </div>

        {campaigns.length === 0 ? (
          <div style={S.card}>
            <EmptyState
              title="No campaigns yet"
              description="Create a template, select some leads, and launch your first outreach campaign."
              action={{
                label: templates.length === 0 ? 'Create Template' : 'Create Campaign',
                onClick: () => {
                  if (templates.length === 0) {
                    setTemplateEditorOpen(true)
                  } else {
                    setCampaignCreateOpen(true)
                  }
                },
              }}
            />
          </div>
        ) : (
          <div style={{ ...S.cardFlush }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 8 }}>
              {campaigns.map(campaign => (
                <div
                  key={campaign.id}
                  style={hoveredRow(campaign.id, hoveredCampaign)}
                  onMouseEnter={() => setHoveredCampaign(campaign.id)}
                  onMouseLeave={() => setHoveredCampaign(null)}
                >
                  <span style={campaignName}>{campaign.name}</span>
                  <StatusPill
                    variant={CAMPAIGN_STATUS_VARIANT[campaign.status] ?? 'neutral'}
                    label={campaign.status}
                  />
                  <span style={{ ...campaignMeta, marginLeft: 8 }}>{campaign.sent_count} sent</span>
                  <span style={{ ...campaignMeta, marginLeft: 8 }}>{formatDate(campaign.created_at)}</span>
                  {(campaign.status === 'draft' || campaign.status === 'active') && (
                    <button
                      onClick={(e) => handleSendCampaign(campaign.id, e)}
                      disabled={sendingCampaignId === campaign.id}
                      style={{
                        ...sendBtnStyle,
                        marginLeft: 8,
                        opacity: sendingCampaignId === campaign.id ? 0.5 : 1,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = C.bgHoverStrong }}
                      onMouseLeave={e => { e.currentTarget.style.background = C.bgHover }}
                    >
                      <Send size={12} />
                      {sendingCampaignId === campaign.id ? 'Sending...' : 'Send'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Templates Section ── */}
      <div>
        <div style={sectionHeader}>
          <h3 style={sectionTitle}>Templates</h3>
          <button
            onClick={() => setTemplateEditorOpen(true)}
            style={ghostBtn}
            onMouseEnter={e => {
              e.currentTarget.style.background = C.bgHover
              e.currentTarget.style.borderColor = C.borderHover
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.borderColor = C.borderVisible
            }}
          >
            <Plus size={16} /> New Template
          </button>
        </div>

        {templates.length === 0 ? (
          <div style={S.card}>
            <EmptyState
              title="No templates"
              description="Create an email template to use in your campaigns."
              action={{
                label: 'Create Template',
                onClick: () => setTemplateEditorOpen(true),
              }}
            />
          </div>
        ) : (
          <div style={{ ...S.cardFlush }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 8 }}>
              {templates.map(template => (
                <div
                  key={template.id}
                  style={hoveredRow(template.id, hoveredTemplate)}
                  onMouseEnter={() => setHoveredTemplate(template.id)}
                  onMouseLeave={() => setHoveredTemplate(null)}
                >
                  <FileText size={16} style={{ color: C.textDim, flexShrink: 0 }} />
                  <span style={templateName}>{template.name}</span>
                  {template.category && (
                    <span style={templateCategory}>{template.category}</span>
                  )}
                  <span style={{ fontSize: 14, color: C.textDim }}>
                    {template.variables?.length ?? 0} vars
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Panels ── */}
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

      <style>{`
        @keyframes shimmer {
          from { background-position: 200% 0; }
          to { background-position: -200% 0; }
        }
        @media (max-width: 640px) {
          [data-stat-bar] { flex-direction: column !important; }
          [data-stat-bar] > div { border-right: none !important; border-bottom: 1px solid ${C.borderSubtle} !important; }
          [data-stat-bar] > div:last-child { border-bottom: none !important; }
        }
      `}</style>
    </div>
  )
}

export const OutreachDashboard = memo(OutreachDashboardInner)
