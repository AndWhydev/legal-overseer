'use client'

import React, { useState, useMemo, memo } from 'react'
import { X, Send, Users, Mail, Check } from 'lucide-react'
import { GlassDropdown } from '@/components/ui/glass-dropdown'
import type { EnhancedLeadData } from '@/lib/leads/types'
import type { EmailTemplate } from '@/hooks/use-campaigns'

interface CampaignCreatePanelProps {
  open: boolean
  onClose: () => void
  onCreate: (data: {
    name: string
    templateId: string
    leadIds: string[]
    dailyLimit: number
  }) => void
  templates: EmailTemplate[]
  leads: EnhancedLeadData[]
}

// ─── Hoisted Styles ─────────────────────────────────────────────────────────
const backdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.6)',
  zIndex: 52,
  backdropFilter: 'blur(2px)',
}

const panel: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  width: '100%',
  maxWidth: 600,
  zIndex: 53,
  background: 'var(--bg-primary, #0a0f1a)',
  borderLeft: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  animation: 'slideInRight 0.25s ease-out',
}

const headerStyle: React.CSSProperties = {
  padding: '20px 24px',
  borderBottom: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}

const panelTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 500,
  color: 'var(--text-primary, #F1F5F9)',
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
  background: 'var(--hover-bg, rgba(255, 255, 255, 0.04))',
  color: 'var(--text-dim, #475569)',
  cursor: 'pointer',
}

const bodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '20px 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const fieldLabel: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text-dim, #475569)',
  display: 'block',
  marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 40,
  padding: '0 12px',
  borderRadius: 8,
  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.05))',
  background: 'var(--bg-input, rgba(13, 17, 23, 0.6))',
  color: 'var(--text-primary, #F1F5F9)',
  fontSize: 14,
  outline: 'none',
  fontFamily: 'inherit',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
  appearance: 'none' as const,
}

const leadRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 12px',
  borderRadius: 8,
  cursor: 'pointer',
  transition: 'background 200ms',
}

const checkbox: React.CSSProperties = {
  width: 20,
  height: 20,
  borderRadius: 4,
  border: '2px solid rgba(255, 255, 255, 0.15)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  transition: 'all 200ms',
}

const selectedCheckbox: React.CSSProperties = {
  ...checkbox,
  background: 'var(--btn-primary-bg, #F1F5F9)',
  borderColor: 'var(--btn-primary-bg, #F1F5F9)',
}

const leadName: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text-primary, #F1F5F9)',
  flex: 1,
}

const leadEmail: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--text-dim, #475569)',
  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
}

const summaryBar: React.CSSProperties = {
  padding: '16px 24px',
  borderTop: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  background: 'var(--glass-bg-heavy, rgba(15, 20, 30, 0.8))',
}

const summaryText: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 14,
  color: 'var(--text-secondary, #94A3B8)',
}

const createBtn: React.CSSProperties = {
  height: 40,
  padding: '0 24px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--btn-primary-bg, #F1F5F9)',
  color: 'var(--btn-primary-fg, #0a0f1a)',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  transition: 'all 200ms',
}

const noTemplateBox: React.CSSProperties = {
  padding: '24px 16px',
  borderRadius: 12,
  border: '1px dashed var(--glass-border, rgba(255, 255, 255, 0.03))',
  textAlign: 'center',
  color: 'var(--text-dim, #475569)',
  fontSize: 14,
}

// ─── Component ──────────────────────────────────────────────────────────────
function CampaignCreatePanelInner({
  open,
  onClose,
  onCreate,
  templates,
  leads,
}: CampaignCreatePanelProps) {
  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set())
  const [dailyLimit, setDailyLimit] = useState(50)

  // Only show leads with emails
  const emailableLeads = useMemo(
    () => leads.filter(l => l.prospect_emails && l.prospect_emails.length > 0 && l.status !== 'converted' && l.status !== 'lost'),
    [leads],
  )

  const toggleLead = (leadId: string) => {
    setSelectedLeadIds(prev => {
      const next = new Set(prev)
      if (next.has(leadId)) next.delete(leadId)
      else next.add(leadId)
      return next
    })
  }

  const selectAll = () => {
    if (selectedLeadIds.size === emailableLeads.length) {
      setSelectedLeadIds(new Set())
    } else {
      setSelectedLeadIds(new Set(emailableLeads.map(l => l.id)))
    }
  }

  const handleCreate = () => {
    if (!name.trim() || !templateId || selectedLeadIds.size === 0) return
    onCreate({
      name: name.trim(),
      templateId,
      leadIds: Array.from(selectedLeadIds),
      dailyLimit,
    })
    // Reset form
    setName('')
    setTemplateId('')
    setSelectedLeadIds(new Set())
    setDailyLimit(50)
    onClose()
  }

  if (!open) return null

  const canCreate = name.trim() && templateId && selectedLeadIds.size > 0

  return (
    <>
      <div onClick={onClose} style={backdrop} aria-hidden="true" />

      <aside style={panel} role="dialog" aria-label="Create Campaign" aria-modal="true">
        <div style={headerStyle}>
          <h2 style={panelTitle}>Create Campaign</h2>
          <button onClick={onClose} style={closeBtn} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div style={bodyStyle}>
          <div>
            <label style={fieldLabel}>Campaign Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Car Yards Sydney - SEO Audit"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={fieldLabel}>Email Template</label>
            {templates.length > 0 ? (
              <GlassDropdown
                options={[{ value: '', label: 'Select a template' }, ...templates.map(t => ({ value: t.id, label: `${t.name} (${t.category})` }))]}
                value={templateId}
                onChange={v => setTemplateId(v)}
              />
            ) : (
              <div style={noTemplateBox}>
                No templates yet. Create one first.
              </div>
            )}
          </div>

          <div>
            <label style={fieldLabel}>Daily Send Limit</label>
            <input
              type="number"
              value={dailyLimit}
              onChange={e => setDailyLimit(Math.max(1, Math.min(1000, Number(e.target.value))))}
              min={1}
              max={1000}
              style={{ ...inputStyle, width: 100 }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ ...fieldLabel, marginBottom: 0 }}>
                Select Leads ({emailableLeads.length} with email)
              </label>
              <button
                onClick={selectAll}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#06b6d4',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {selectedLeadIds.size === emailableLeads.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div style={{
              maxHeight: 300,
              overflowY: 'auto',
              borderRadius: 12,
              border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.04))',
              background: 'var(--bg-card, rgba(15, 20, 30, 0.4))',
            }}>
              {emailableLeads.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim, #475569)', fontSize: 14 }}>
                  No leads with email addresses found. Import prospects first.
                </div>
              ) : (
                emailableLeads.map(lead => {
                  const selected = selectedLeadIds.has(lead.id)
                  const displayName = lead.prospect_name ?? lead.source_detail ?? lead.id.slice(0, 8)
                  return (
                    <div
                      key={lead.id}
                      onClick={() => toggleLead(lead.id)}
                      style={{
                        ...leadRow,
                        background: selected ? 'var(--hover-bg-strong, rgba(255, 255, 255, 0.08))' : 'transparent',
                      }}
                      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)' }}
                      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
                    >
                      <div style={selected ? selectedCheckbox : checkbox}>
                        {selected && <Check size={12} style={{ color: '#000' }} />}
                      </div>
                      <span style={leadName}>{displayName}</span>
                      <span style={leadEmail}>{lead.prospect_emails?.[0]}</span>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        <div style={summaryBar}>
          <div style={summaryText}>
            <Users size={16} />
            {selectedLeadIds.size} recipients selected
            {templateId && (
              <>
                <Mail size={16} style={{ marginLeft: 8 }} />
                {templates.find(t => t.id === templateId)?.name ?? 'Template'}
              </>
            )}
          </div>
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            style={{
              ...createBtn,
              opacity: canCreate ? 1 : 0.4,
              cursor: canCreate ? 'pointer' : 'not-allowed',
            }}
            onMouseEnter={e => { if (canCreate) e.currentTarget.style.background = '#E2E8F0' }}
            onMouseLeave={e => { if (canCreate) e.currentTarget.style.background = '#F1F5F9' }}
          >
            <Send size={16} /> Create Campaign
          </button>
        </div>
      </aside>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  )
}

export const CampaignCreatePanel = memo(CampaignCreatePanelInner)
