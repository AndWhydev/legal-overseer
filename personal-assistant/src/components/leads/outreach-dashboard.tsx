'use client'

import React, { useState, useCallback, memo } from 'react'
import { Send, Plus, Mail, Eye, MousePointer, MessageSquare, AlertCircle, FileText, Rocket } from 'lucide-react'
import { useCampaigns, type EmailCampaign, type EmailTemplate } from '@/hooks/use-campaigns'
import type { EnhancedLeadData } from '@/lib/leads/types'
import { TemplateEditorPanel } from './template-editor-panel'
import { CampaignCreatePanel } from './campaign-create-panel'
import { StatusPill, type StatusVariant } from '@/components/ui/status-pill'

interface OutreachDashboardProps {
  leads: EnhancedLeadData[]
}

// ─── Hoisted Styles ─────────────────────────────────────────────────────────
const container: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const sectionHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}

const sectionTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--text-secondary, #94A3B8)',
  margin: 0,
}

const actionBtn: React.CSSProperties = {
  height: 36,
  padding: '0 16px',
  borderRadius: 8,
  border: 'none',
  background: '#FF5A1F',
  color: '#000',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  transition: 'all 200ms',
}

const secondaryBtn: React.CSSProperties = {
  ...actionBtn,
  background: 'rgba(255, 255, 255, 0.06)',
  color: 'var(--text-secondary, #94A3B8)',
}

const glassCard: React.CSSProperties = {
  padding: '16px 20px',
  borderRadius: 16,
  background: 'rgba(15, 20, 30, 0.6)',
  backdropFilter: 'blur(20px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
  border: '1px solid rgba(255, 255, 255, 0.03)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
}

const statGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(5, 1fr)',
  gap: 8,
}

const statCell: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: 'rgba(255, 255, 255, 0.04)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
}

const statLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--text-dim, #475569)',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
}

const statValue: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 500,
  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
  color: 'var(--text-primary, #F1F5F9)',
}

const campaignRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '12px 16px',
  borderRadius: 12,
  background: 'rgba(255, 255, 255, 0.02)',
  transition: 'background 200ms',
  cursor: 'pointer',
}

const campaignName: React.CSSProperties = {
  flex: 1,
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text-primary, #F1F5F9)',
}

const campaignMeta: React.CSSProperties = {
  fontSize: 13,
  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
  color: 'var(--text-dim, #475569)',
}

const templateRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 16px',
  borderRadius: 8,
  background: 'rgba(255, 255, 255, 0.02)',
}

const templateName: React.CSSProperties = {
  flex: 1,
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text-primary, #F1F5F9)',
}

const templateCategory: React.CSSProperties = {
  fontSize: 12,
  padding: '2px 8px',
  borderRadius: 8,
  background: 'rgba(6, 182, 212, 0.1)',
  color: '#06b6d4',
}

const emptyBox: React.CSSProperties = {
  padding: '32px 16px',
  textAlign: 'center',
  borderRadius: 12,
  border: '1px dashed rgba(255, 255, 255, 0.06)',
}

const emptyTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text-primary, #F1F5F9)',
  marginBottom: 4,
}

const emptyDesc: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--text-dim, #475569)',
  marginBottom: 16,
}

const sendBtn: React.CSSProperties = {
  height: 28,
  padding: '0 12px',
  borderRadius: 6,
  border: 'none',
  background: 'rgba(34, 197, 94, 0.12)',
  color: '#22c55e',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  transition: 'filter 200ms',
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
            height: 80,
            borderRadius: 16,
            background: 'rgba(15, 20, 30, 0.6)',
            animation: 'pulse 1.5s ease-in-out infinite',
            animationDelay: `${i * 100}ms`,
          }} />
        ))}
      </div>
    )
  }

  return (
    <div style={container}>
      {/* Stats Overview */}
      <div style={statGrid}>
        <div style={statCell}>
          <span style={statLabel}><Mail size={12} /> Sent</span>
          <span style={statValue}>{totalSent}</span>
        </div>
        <div style={statCell}>
          <span style={statLabel}><Eye size={12} /> Opened</span>
          <span style={{ ...statValue, color: totalOpened > 0 ? '#22c55e' : undefined }}>
            {totalOpened}
          </span>
        </div>
        <div style={statCell}>
          <span style={statLabel}><MousePointer size={12} /> Clicked</span>
          <span style={{ ...statValue, color: totalClicked > 0 ? '#3b82f6' : undefined }}>
            {totalClicked}
          </span>
        </div>
        <div style={statCell}>
          <span style={statLabel}><MessageSquare size={12} /> Replied</span>
          <span style={{ ...statValue, color: totalReplied > 0 ? '#a855f7' : undefined }}>
            {totalReplied}
          </span>
        </div>
        <div style={statCell}>
          <span style={statLabel}><AlertCircle size={12} /> Bounced</span>
          <span style={{ ...statValue, color: totalBounced > 0 ? '#ef4444' : undefined }}>
            {totalBounced}
          </span>
        </div>
      </div>

      {/* Campaigns Section */}
      <div>
        <div style={sectionHeader}>
          <h3 style={sectionTitle}>Campaigns</h3>
          <button
            onClick={() => setCampaignCreateOpen(true)}
            style={actionBtn}
            onMouseEnter={e => { e.currentTarget.style.background = '#FF7A45' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#FF5A1F' }}
          >
            <Plus size={14} /> New Campaign
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {campaigns.length === 0 ? (
            <div style={emptyBox}>
              <Rocket size={24} style={{ color: 'var(--text-dim, #475569)', marginBottom: 8 }} />
              <div style={emptyTitle}>No campaigns yet</div>
              <div style={emptyDesc}>
                Create a template, select some leads, and launch your first outreach campaign.
              </div>
              <button
                onClick={() => {
                  if (templates.length === 0) {
                    setTemplateEditorOpen(true)
                  } else {
                    setCampaignCreateOpen(true)
                  }
                }}
                style={actionBtn}
                onMouseEnter={e => { e.currentTarget.style.background = '#FF7A45' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#FF5A1F' }}
              >
                <Plus size={14} /> {templates.length === 0 ? 'Create Template' : 'Create Campaign'}
              </button>
            </div>
          ) : (
            campaigns.map(campaign => (
              <div
                key={campaign.id}
                style={campaignRow}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)' }}
              >
                <span style={campaignName}>{campaign.name}</span>
                <StatusPill
                  variant={CAMPAIGN_STATUS_VARIANT[campaign.status] ?? 'neutral'}
                  label={campaign.status}
                />
                <span style={campaignMeta}>{campaign.sent_count} sent</span>
                <span style={campaignMeta}>{formatDate(campaign.created_at)}</span>
                {(campaign.status === 'draft' || campaign.status === 'active') && (
                  <button
                    onClick={(e) => handleSendCampaign(campaign.id, e)}
                    disabled={sendingCampaignId === campaign.id}
                    style={{
                      ...sendBtn,
                      opacity: sendingCampaignId === campaign.id ? 0.5 : 1,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.3)' }}
                    onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)' }}
                  >
                    <Send size={11} />
                    {sendingCampaignId === campaign.id ? 'Sending...' : 'Send'}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Templates Section */}
      <div>
        <div style={sectionHeader}>
          <h3 style={sectionTitle}>Templates</h3>
          <button
            onClick={() => setTemplateEditorOpen(true)}
            style={secondaryBtn}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)' }}
          >
            <Plus size={14} /> New Template
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
          {templates.length === 0 ? (
            <div style={emptyBox}>
              <FileText size={24} style={{ color: 'var(--text-dim, #475569)', marginBottom: 8 }} />
              <div style={emptyTitle}>No templates</div>
              <div style={emptyDesc}>
                Create an email template to use in your campaigns.
              </div>
            </div>
          ) : (
            templates.map(template => (
              <div key={template.id} style={templateRow}>
                <FileText size={16} style={{ color: 'var(--text-dim, #475569)', flexShrink: 0 }} />
                <span style={templateName}>{template.name}</span>
                {template.category && (
                  <span style={templateCategory}>{template.category}</span>
                )}
                <span style={{ fontSize: 12, color: 'var(--text-dim, #475569)' }}>
                  {template.variables?.length ?? 0} vars
                </span>
              </div>
            ))
          )}
        </div>
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

      <style>{`
        @media (max-width: 768px) {
          [style*="grid-template-columns: repeat(5"] { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  )
}

export const OutreachDashboard = memo(OutreachDashboardInner)
