'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Send, Loader2 } from 'lucide-react'
import { useEmailCampaigns } from '@/hooks/use-email-campaigns'
import type { EmailTemplate, EmailCampaign } from '@/lib/leads/campaign-types'

interface CampaignCreatorProps {
  open: boolean
  onClose: () => void
  selectedLeadIds?: string[]
  onCampaignCreated?: (campaign: EmailCampaign) => void
}

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  zIndex: 50,
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.6)',
  zIndex: 49,
}

const contentStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  width: '100%',
  maxWidth: 600,
  zIndex: 50,
  background: '#0a0f1a',
  borderLeft: '1px solid rgba(255, 255, 255, 0.06)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const headerStyle: React.CSSProperties = {
  padding: '20px 24px',
  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}

const titleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 500,
  color: '#F1F5F9',
  margin: 0,
}

const closeBtn: React.CSSProperties = {
  width: 40,
  height: 40,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
  border: 'none',
  background: 'rgba(255, 255, 255, 0.04)',
  color: '#475569',
  cursor: 'pointer',
}

const bodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '20px 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
}

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const labelStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: '#94a3b8',
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid rgba(255, 255, 255, 0.05)',
  background: 'rgba(13, 17, 23, 0.6)',
  color: '#F1F5F9',
  fontSize: 14,
  outline: 'none',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none',
}

const footerStyle: React.CSSProperties = {
  padding: '16px 24px',
  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
  display: 'flex',
  gap: 8,
  justifyContent: 'flex-end',
}

const sendBtn: React.CSSProperties = {
  padding: '8px 20px',
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

const infoBoxStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderRadius: 8,
  background: 'rgba(51, 146, 250, 0.1)',
  border: '1px solid rgba(51, 146, 250, 0.2)',
  fontSize: 13,
  color: '#3392fa',
  lineHeight: 1.5,
}

export function CampaignCreator({
  open,
  onClose,
  selectedLeadIds = [],
  onCampaignCreated,
}: CampaignCreatorProps) {
  const { templates, loadTemplates, createCampaign } = useEmailCampaigns()
  const [name, setName] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [dailyLimit, setDailyLimit] = useState('50')
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false)

  // Load templates on mount
  useEffect(() => {
    if (open) {
      setIsLoadingTemplates(true)
      loadTemplates()
        .then(() => setIsLoadingTemplates(false))
        .catch(() => setIsLoadingTemplates(false))
    }
  }, [open, loadTemplates])

  const handleCreate = useCallback(async () => {
    if (!name || !selectedTemplate) {
      alert('Campaign name and template are required')
      return
    }

    const limit = Math.min(Math.max(parseInt(dailyLimit) || 50, 1), 1000)

    setIsSaving(true)
    try {
      const campaign = await createCampaign(
        name,
        selectedTemplate,
        selectedLeadIds.length > 0 ? selectedLeadIds : undefined,
        limit,
      )
      onCampaignCreated?.(campaign)
      onClose()
      // Reset
      setName('')
      setSelectedTemplate('')
      setDailyLimit('50')
    } finally {
      setIsSaving(false)
    }
  }, [name, selectedTemplate, dailyLimit, selectedLeadIds, createCampaign, onCampaignCreated, onClose])

  if (!open) return null

  return (
    <>
      <div style={backdropStyle} onClick={onClose} />
      <div style={contentStyle}>
        <div style={headerStyle}>
          <h2 style={titleStyle}>Create Campaign</h2>
          <button style={closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div style={bodyStyle}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Campaign Name</label>
            <input
              type="text"
              style={inputStyle}
              placeholder="e.g., Q2 Outreach - Car Yards"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Email Template</label>
            {isLoadingTemplates ? (
              <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                Loading templates...
              </div>
            ) : (
              <select
                style={selectStyle}
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
              >
                <option value="">-- Select Template --</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.category || 'general'})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Daily Limit (emails/day)</label>
            <input
              type="number"
              style={inputStyle}
              min="1"
              max="1000"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value)}
            />
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              Helps avoid spam flags. Recommended: 50-100 per day.
            </span>
          </div>

          {selectedLeadIds.length > 0 && (
            <div style={infoBoxStyle}>
              {selectedLeadIds.length} leads selected. Once you create the campaign, you can add more leads
              or start sending.
            </div>
          )}
        </div>

        <div style={footerStyle}>
          <button
            style={{
              ...sendBtn,
              background: '#475569',
              color: '#fff',
            }}
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button style={sendBtn} onClick={handleCreate} disabled={isSaving || !name || !selectedTemplate}>
            <Send size={16} />
            {isSaving ? 'Creating...' : 'Create Campaign'}
          </button>
        </div>
      </div>
    </>
  )
}
