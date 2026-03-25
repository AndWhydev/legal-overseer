'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Play, Pause, BarChart3, Mail, Send, Loader2 } from 'lucide-react'
import { useEmailCampaigns } from '@/hooks/use-email-campaigns'
import { calculateMetrics } from '@/lib/leads/campaign-types'
import type { EmailCampaign } from '@/lib/leads/campaign-types'

interface CampaignsDashboardProps {
  onCreateNew?: () => void
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  height: '100%',
}

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  paddingBottom: 12,
  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
}

const newCampaignBtn: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  border: 'none',
  background: '#FF5A1F',
  color: '#000',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

const campaignsGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
  gap: 16,
  flex: 1,
  overflowY: 'auto',
}

const campaignCard: React.CSSProperties = {
  borderRadius: 12,
  border: '1px solid rgba(255, 255, 255, 0.06)',
  background: 'rgba(15, 20, 30, 0.5)',
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
}

const campaignTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: '#F1F5F9',
  margin: 0,
}

const statusBadge: (status: string) => React.CSSProperties = (status) => ({
  padding: '2px 8px',
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 500,
  background:
    status === 'active'
      ? 'rgba(34, 197, 94, 0.2)'
      : status === 'draft'
        ? 'rgba(148, 163, 184, 0.2)'
        : status === 'completed'
          ? 'rgba(59, 130, 246, 0.2)'
          : 'rgba(239, 68, 68, 0.2)',
  color:
    status === 'active'
      ? '#22c55e'
      : status === 'draft'
        ? '#94a3b8'
        : status === 'completed'
          ? '#3b82f6'
          : '#ef4444',
})

const metricsGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
}

const metricBox: React.CSSProperties = {
  padding: 8,
  borderRadius: 8,
  background: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid rgba(255, 255, 255, 0.04)',
}

const metricLabel: React.CSSProperties = {
  fontSize: 11,
  color: '#94a3b8',
  marginBottom: 4,
}

const metricValue: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: '#FF5A1F',
}

const actionButtons: React.CSSProperties = {
  display: 'flex',
  gap: 6,
}

const actionBtn: (variant?: 'primary' | 'secondary') => React.CSSProperties = (
  variant = 'secondary',
) => ({
  flex: 1,
  padding: '6px 8px',
  borderRadius: 6,
  border: 'none',
  background:
    variant === 'primary' ? '#FF5A1F' : 'rgba(255, 255, 255, 0.04)',
  color: variant === 'primary' ? '#000' : '#F1F5F9',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
})

const emptySt: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 16,
  padding: 48,
  color: '#475569',
}

const emptyIconStyle: React.CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: 12,
  background: 'rgba(255, 255, 255, 0.04)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#94a3b8',
}

export function CampaignsDashboard({ onCreateNew }: CampaignsDashboardProps) {
  const { campaigns, loadCampaigns, updateCampaign, sendCampaign } = useEmailCampaigns()
  const [isLoading, setIsLoading] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)

  useEffect(() => {
    setIsLoading(true)
    loadCampaigns().finally(() => setIsLoading(false))
  }, [loadCampaigns])

  const handleToggleStatus = useCallback(
    async (campaign: EmailCampaign) => {
      const newStatus = campaign.status === 'active' ? 'paused' : 'active'
      try {
        await updateCampaign(campaign.id, { status: newStatus })
      } catch {
        // Error handled by hook toast
      }
    },
    [updateCampaign],
  )

  const handleSend = useCallback(
    async (campaignId: string) => {
      setSendingId(campaignId)
      try {
        await sendCampaign(campaignId)
        // Refresh to get updated counts
        await loadCampaigns()
      } finally {
        setSendingId(null)
      }
    },
    [sendCampaign, loadCampaigns],
  )

  if (isLoading) {
    return (
      <div style={emptySt}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
        <p>Loading campaigns...</p>
      </div>
    )
  }

  if (campaigns.length === 0) {
    return (
      <div style={emptySt}>
        <div style={emptyIconStyle}>
          <Mail size={32} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 16, fontWeight: 500, color: '#F1F5F9', margin: 0 }}>
            No campaigns yet
          </p>
          <p style={{ fontSize: 14, margin: 0, marginTop: 4 }}>
            Create an email template and campaign to start outreach
          </p>
        </div>
        <button style={newCampaignBtn} onClick={onCreateNew}>
          <Plus size={16} />
          Create Campaign
        </button>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <div style={toolbarStyle}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#F1F5F9', flex: 1 }}>
          Email Campaigns
        </h3>
        <button style={newCampaignBtn} onClick={onCreateNew}>
          <Plus size={16} />
          New Campaign
        </button>
      </div>

      <div style={campaignsGrid}>
        {campaigns.map((campaign) => {
          const metrics = calculateMetrics(campaign)
          const isActive = campaign.status === 'active'

          return (
            <div key={campaign.id} style={campaignCard}>
              <div style={cardHeaderStyle}>
                <h4 style={campaignTitle}>{campaign.name}</h4>
                <div style={statusBadge(campaign.status)}>{campaign.status}</div>
              </div>

              <div style={metricsGrid}>
                <div style={metricBox}>
                  <div style={metricLabel}>Sent</div>
                  <div style={metricValue}>{metrics.sentCount}</div>
                </div>
                <div style={metricBox}>
                  <div style={metricLabel}>Open Rate</div>
                  <div style={metricValue}>
                    {(metrics.openRate * 100).toFixed(1)}%
                  </div>
                </div>
                <div style={metricBox}>
                  <div style={metricLabel}>Clicked</div>
                  <div style={metricValue}>{campaign.clicked_count || 0}</div>
                </div>
                <div style={metricBox}>
                  <div style={metricLabel}>Replied</div>
                  <div style={metricValue}>{campaign.replied_count || 0}</div>
                </div>
              </div>

              <div style={actionButtons}>
                <button
                  style={actionBtn(isActive ? 'secondary' : 'primary')}
                  onClick={() => handleToggleStatus(campaign)}
                >
                  {isActive ? (
                    <>
                      <Pause size={14} />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play size={14} />
                      Activate
                    </>
                  )}
                </button>
                <button
                  style={actionBtn('secondary')}
                  onClick={() => handleSend(campaign.id)}
                  disabled={sendingId === campaign.id}
                >
                  {sendingId === campaign.id ? (
                    <>
                      <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    </>
                  ) : (
                    <>
                      <Send size={14} />
                      Send
                    </>
                  )}
                </button>
                <button style={actionBtn('secondary')}>
                  <BarChart3 size={14} />
                  Details
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
