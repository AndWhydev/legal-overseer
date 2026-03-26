'use client'

import React, { useEffect, useCallback, memo } from 'react'
import { X, ExternalLink, ArrowRight, Mail, Calendar, XCircle } from 'lucide-react'
import type { EnhancedLeadData, LeadStatus } from '@/lib/leads/types'
import { formatCurrency, formatSpeedToLead, relativeTime } from '@/lib/leads/utils'
import { StatusPill, type StatusVariant } from '@/components/ui/status-pill'
import { GlassDropdown } from '@/components/ui/glass-dropdown'
import { ScoreBreakdownPanel } from './score-breakdown-panel'
import { OutreachIntelPanel } from './outreach-intel-panel'
import { WebsiteSignalsPanel } from './website-signals-panel'
import { NextActionPanel } from './next-action-panel'

// ─── Helpers ────────────────────────────────────────────────────────────────

interface LeadDetailDrawerProps {
  lead: EnhancedLeadData | null
  open: boolean
  onClose: () => void
  onUpdate: (leadId: string, patch: Record<string, unknown>) => void
  onAdvanceStage?: (leadId: string, event: React.MouseEvent) => void
}

// ─── Constants ──────────────────────────────────────────────────────────────
const SCORE_VARIANT: Record<string, StatusVariant> = {
  hot: 'error',
  warm: 'warning',
  cold: 'info',
}

const STATUS_OPTIONS: LeadStatus[] = ['new', 'qualified', 'booked', 'converted', 'lost']

const PROGRESS_STAGES: Array<{ status: LeadStatus; label: string }> = [
  { status: 'new', label: 'New' },
  { status: 'qualified', label: 'Qualified' },
  { status: 'booked', label: 'Booked' },
  { status: 'converted', label: 'Won' },
]

// ─── Hoisted Styles ─────────────────────────────────────────────────────────
const backdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.6)',
  zIndex: 50,
  backdropFilter: 'blur(2px)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
}

const modal: React.CSSProperties = {
  position: 'relative',
  maxWidth: 640,
  width: '90%',
  maxHeight: '85vh',
  zIndex: 51,
  background: 'var(--bg-card-solid, rgba(15, 20, 30, 0.6))',
  backdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
  WebkitBackdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
  boxShadow: 'var(--card-inset, inset 0 1px 0 rgba(255, 255, 255, 0.05)), var(--card-shadow, 0 24px 48px rgba(0, 0, 0, 0.4))',
  borderRadius: 24,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  animation: 'modalIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
}

const headerSection: React.CSSProperties = {
  padding: '20px 24px',
  borderBottom: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const headerTop: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}

const drawerTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 500,
  color: 'var(--text-primary, #F1F5F9)',
  margin: 0,
  letterSpacing: '-0.01em',
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
  transition: 'background 200ms',
}

const metaRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
}

const STATUS_DROPDOWN_OPTIONS = STATUS_OPTIONS.map((s) => ({
  value: s,
  label: s.charAt(0).toUpperCase() + s.slice(1),
}))

const quickStats: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  fontSize: 14,
  color: 'var(--text-dim, #475569)',
}

const scrollBody: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: 24,
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
}

const actionsRow: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
}

const advanceBtn: React.CSSProperties = {
  background: 'var(--btn-primary-bg, #F1F5F9)',
  color: 'var(--btn-primary-fg, #0a0f1a)',
  height: 40,
  padding: '0 20px',
  borderRadius: 8,
  border: 'none',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  transition: 'all 200ms',
}

const actionBtnSecondary = (bg: string, fg: string): React.CSSProperties => ({
  background: bg,
  color: fg,
  height: 40,
  padding: '0 20px',
  borderRadius: 8,
  border: 'none',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  transition: 'filter 200ms',
})

const sectionLabel: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--text-dim, #475569)',
  margin: '0 0 8px',
}

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: 'var(--border-subtle, rgba(255, 255, 255, 0.04))',
}

const noteBlock: React.CSSProperties = {
  padding: '12px 16px',
  borderRadius: 12,
  background: 'var(--hover-bg, rgba(255, 255, 255, 0.04))',
  fontSize: 14,
  color: 'var(--text-secondary, #94A3B8)',
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
}

const servicePill: React.CSSProperties = {
  fontSize: 14,
  padding: '4px 12px',
  borderRadius: 9999,
  background: 'var(--hover-bg, rgba(255, 255, 255, 0.04))',
  color: 'var(--text-secondary, #94A3B8)',
}

const leadIdStyle: React.CSSProperties = {
  fontSize: 14,
  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
  color: 'var(--text-dim, #475569)',
  paddingTop: 8,
}

// ─── Timeline Entry ─────────────────────────────────────────────────────────
const TimelineEntry = memo(function TimelineEntry({ label, date }: { label: string; date: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <div style={{
        width: 8,
        height: 8,
        borderRadius: 9999,
        background: 'rgba(255, 255, 255, 0.1)',
        flexShrink: 0,
        marginTop: 4,
      }} />
      <div>
        <span style={{ fontSize: 14, color: 'var(--text-secondary, #94A3B8)' }}>{label}</span>
        <span style={{ fontSize: 14, color: 'var(--text-dim, #475569)', marginLeft: 8 }}>{relativeTime(date)}</span>
      </div>
    </div>
  )
})

// ─── Drawer Component ───────────────────────────────────────────────────────
function LeadDetailDrawerInner({ lead, open, onClose, onUpdate, onAdvanceStage }: LeadDetailDrawerProps) {
  const handleEsc = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleEsc)
      return () => document.removeEventListener('keydown', handleEsc)
    }
  }, [open, handleEsc])

  if (!open || !lead) return null

  const displayName = lead.prospect_name ?? lead.source_detail ?? `Lead ${lead.id.slice(0, 8)}`
  const hasDiscoveryData = lead.fit_score != null
  const stageIdx = PROGRESS_STAGES.findIndex(s => s.status === lead.status)
  const isLost = lead.status === 'lost'

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={backdrop} aria-hidden="true">
        {/* Modal */}
        <div onClick={(e) => e.stopPropagation()} style={modal} role="dialog" aria-label={`Lead details: ${displayName}`} aria-modal="true">
        {/* Header */}
        <div style={headerSection}>
          <div style={headerTop}>
            <h2 style={drawerTitle}>{displayName}</h2>
            <button
              onClick={onClose}
              style={closeBtn}
              aria-label="Close drawer"
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-bg-strong, rgba(255, 255, 255, 0.08))' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--hover-bg, rgba(255, 255, 255, 0.04))' }}
            >
              <X size={16} />
            </button>
          </div>

          <div style={metaRow}>
            <GlassDropdown
              value={lead.status}
              options={STATUS_DROPDOWN_OPTIONS}
              onChange={(val) => onUpdate(lead.id, { status: val })}
            />

            <StatusPill
              variant={SCORE_VARIANT[lead.score] ?? 'neutral'}
              label={lead.score}
              dot={false}
              minimal
            />

            {lead.prospect_website && (
              <a
                href={lead.prospect_website.startsWith('http') ? lead.prospect_website : `https://${lead.prospect_website}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-primary, #F1F5F9)', fontSize: 14, textDecoration: 'none' }}
              >
                <ExternalLink size={16} />
                {lead.prospect_domain ?? 'Website'}
              </a>
            )}
          </div>

          {/* Quick stats */}
          <div style={quickStats}>
            <span>Value: <strong style={{ color: 'var(--text-primary, #F1F5F9)', fontWeight: 500 }}>{formatCurrency(lead.estimated_value)}</strong></span>
            <span>Speed: <strong style={{
              fontWeight: 500,
              color: 'var(--text-primary, #F1F5F9)',
            }}>
              {formatSpeedToLead(lead.created_at, lead.first_ack_at)}
            </strong></span>
            <span>Activity: <strong style={{
              fontWeight: 500,
              color: 'var(--text-primary, #F1F5F9)',
            }}>
              {lead.last_activity_at ? relativeTime(lead.last_activity_at) : '--'}
            </strong></span>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={scrollBody}>
          {/* Quick Action Bar */}
          <div style={actionsRow}>
            {lead.status !== 'converted' && lead.status !== 'lost' && (
              <button
                onClick={(e) => onAdvanceStage?.(lead.id, e)}
                style={advanceBtn}
                aria-label="Advance lead to next stage"
                onMouseEnter={e => { e.currentTarget.style.background = '#E2E8F0'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.transform = 'translateY(0)' }}
              >
                <ArrowRight size={16} /> Advance Stage
              </button>
            )}
            <button
              style={actionBtnSecondary('var(--hover-bg-strong, rgba(255, 255, 255, 0.06))', 'var(--text-secondary, #94A3B8)')}
              aria-label="Send email"
              onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.3)' }}
              onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)' }}
            >
              <Mail size={16} /> Email
            </button>
            <button
              style={actionBtnSecondary('var(--hover-bg-strong, rgba(255, 255, 255, 0.06))', 'var(--text-secondary, #94A3B8)')}
              aria-label="Schedule meeting"
              onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.3)' }}
              onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)' }}
            >
              <Calendar size={16} /> Schedule
            </button>
            {lead.status !== 'converted' && lead.status !== 'lost' && (
              <button
                onClick={() => onUpdate(lead.id, { status: 'lost' })}
                style={actionBtnSecondary('var(--hover-bg-strong, rgba(255, 255, 255, 0.06))', 'var(--text-secondary, #94A3B8)')}
                aria-label="Mark lead as lost"
                onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.3)' }}
                onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)' }}
              >
                <XCircle size={16} /> Mark Lost
              </button>
            )}
          </div>

          {/* Status Progress Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} role="progressbar" aria-label="Pipeline progress">
            {PROGRESS_STAGES.map((stage, i) => (
              <div key={stage.status} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{
                  height: 3,
                  width: '100%',
                  borderRadius: 9999,
                  background: isLost ? '#71717a' : (i <= stageIdx ? '#22c55e' : 'var(--hover-bg-strong, rgba(255, 255, 255, 0.06))'),
                  transition: 'background 200ms cubic-bezier(0.2, 0.9, 0.3, 1)',
                }} />
                <span style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: i <= stageIdx ? 'var(--text-primary, #F1F5F9)' : 'var(--text-dim, #475569)',
                }}>
                  {stage.label}
                </span>
              </div>
            ))}
          </div>

          {/* Score Breakdown */}
          {hasDiscoveryData && (
            <ScoreBreakdownPanel
              fitScore={lead.fit_score!}
              opportunityScore={lead.opportunity_score!}
              fitBreakdown={lead.fit_breakdown}
              opportunityBreakdown={lead.opportunity_breakdown}
            />
          )}

          {/* Outreach Intelligence */}
          {hasDiscoveryData && (
            <OutreachIntelPanel
              opportunityNotes={lead.opportunity_notes}
              outreachAngle={lead.outreach_angle}
              priorityServices={lead.priority_services}
            />
          )}

          {/* Website Signals */}
          {lead.website_signals && (
            <WebsiteSignalsPanel signals={lead.website_signals} />
          )}

          <div style={dividerStyle} aria-hidden="true" />

          {/* Next Action */}
          <NextActionPanel
            nextAction={lead.next_action}
            nextActionAt={lead.next_action_at}
            onSave={(action, date) => {
              onUpdate(lead.id, {
                next_action: action,
                next_action_at: date ? new Date(date).toISOString() : null,
              })
            }}
          />

          {/* Contact Info */}
          {(lead.prospect_phone || (lead.prospect_emails && lead.prospect_emails.length > 0)) && (
            <div>
              <h4 style={sectionLabel}>Contact</h4>
              {lead.prospect_phone && (
                <div style={{ fontSize: 14, color: 'var(--text-secondary, #94A3B8)', marginBottom: 4 }}>
                  Phone: <span style={{ color: 'var(--text-primary, #F1F5F9)' }}>{lead.prospect_phone}</span>
                </div>
              )}
              {lead.prospect_emails?.map((email) => (
                <div key={email} style={{ fontSize: 14, color: 'var(--text-secondary, #94A3B8)', marginBottom: 4 }}>
                  Email: <span style={{ color: 'var(--text-primary, #F1F5F9)' }}>{email}</span>
                </div>
              ))}
              {lead.prospect_address && (
                <div style={{ fontSize: 14, color: 'var(--text-secondary, #94A3B8)' }}>
                  Address: <span style={{ color: 'var(--text-primary, #F1F5F9)' }}>{lead.prospect_address}</span>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          {lead.notes && (
            <div>
              <h4 style={sectionLabel}>Notes</h4>
              <div style={noteBlock}>{lead.notes}</div>
            </div>
          )}

          {/* Service Interest */}
          {lead.service_interest && lead.service_interest.length > 0 && (
            <div>
              <h4 style={sectionLabel}>Services</h4>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {lead.service_interest.map((s) => (
                  <span key={s} style={servicePill}>{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Activity Timeline */}
          <div>
            <h4 style={sectionLabel}>Timeline</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 12, borderLeft: '2px solid var(--border-subtle, rgba(255, 255, 255, 0.04))' }}>
              <TimelineEntry label="Created" date={lead.created_at} />
              {lead.first_ack_at && <TimelineEntry label="First acknowledged" date={lead.first_ack_at} />}
              {lead.last_activity_at && lead.last_activity_at !== lead.created_at && (
                <TimelineEntry label="Last activity" date={lead.last_activity_at} />
              )}
            </div>
          </div>

          {/* Lead ID */}
          <div style={leadIdStyle}>
            ID: {lead.id}
          </div>
        </div>
        </div>
      </div>

      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @media (max-width: 640px) {
          div[role="dialog"] { width: 95% !important; max-height: 90vh !important; }
        }
      `}</style>
    </>
  )
}

export const LeadDetailDrawer = memo(LeadDetailDrawerInner)
