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
import { S, C } from '@/lib/styles/design-tokens'

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
  ...S.drawerBackdrop,
  zIndex: 50,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
}

const modal: React.CSSProperties = {
  ...S.cardHeavy,
  position: 'relative',
  maxWidth: 640,
  width: '90%',
  maxHeight: '85vh',
  zIndex: 51,
  padding: 0,
  borderRadius: 24,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  animation: 'modalIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
}

const headerSection: React.CSSProperties = {
  padding: '20px 24px',
  borderBottom: `1px solid ${C.borderSubtle}`,
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
  ...S.title,
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
  background: C.bgHover,
  color: C.textDim,
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
  color: C.textDim,
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
  ...S.button,
  ...S.buttonPrimary,
}

const actionBtnSecondary = (bg: string, fg: string): React.CSSProperties => ({
  ...S.button,
  background: bg,
  color: fg,
  transition: 'filter 200ms',
})

const sectionLabel: React.CSSProperties = {
  ...S.sectionLabel,
  margin: '0 0 8px',
}

const dividerStyle: React.CSSProperties = {
  ...S.divider,
  margin: 0,
}

const noteBlock: React.CSSProperties = {
  padding: '12px 16px',
  borderRadius: 12,
  background: C.bgHover,
  fontSize: 14,
  color: C.textSecondary,
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
}

const servicePill: React.CSSProperties = {
  fontSize: 14,
  padding: '4px 12px',
  borderRadius: 9999,
  background: C.bgHover,
  color: C.textSecondary,
}

const leadIdStyle: React.CSSProperties = {
  fontSize: 14,
  fontFamily: S.mono.fontFamily,
  color: C.textDim,
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
        background: C.borderHover,
        flexShrink: 0,
        marginTop: 4,
      }} />
      <div>
        <span style={{ fontSize: 14, color: C.textSecondary }}>{label}</span>
        <span style={{ fontSize: 14, color: C.textDim, marginLeft: 8 }}>{relativeTime(date)}</span>
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
              onMouseEnter={e => { e.currentTarget.style.background = C.bgHoverStrong }}
              onMouseLeave={e => { e.currentTarget.style.background = C.bgHover }}
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
                style={{ display: 'flex', alignItems: 'center', gap: 4, color: C.textPrimary, fontSize: 14, textDecoration: 'none' }}
              >
                <ExternalLink size={16} />
                {lead.prospect_domain ?? 'Website'}
              </a>
            )}
          </div>

          {/* Quick stats */}
          <div style={quickStats}>
            <span>Value: <strong style={{ color: C.textPrimary, fontWeight: 500 }}>{formatCurrency(lead.estimated_value)}</strong></span>
            <span>Speed: <strong style={{
              fontWeight: 500,
              color: C.textPrimary,
            }}>
              {formatSpeedToLead(lead.created_at, lead.first_ack_at)}
            </strong></span>
            <span>Activity: <strong style={{
              fontWeight: 500,
              color: C.textPrimary,
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
              style={actionBtnSecondary(C.bgHoverStrong, C.textSecondary)}
              aria-label="Send email"
              onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.3)' }}
              onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)' }}
            >
              <Mail size={16} /> Email
            </button>
            <button
              style={actionBtnSecondary(C.bgHoverStrong, C.textSecondary)}
              aria-label="Schedule meeting"
              onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.3)' }}
              onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)' }}
            >
              <Calendar size={16} /> Schedule
            </button>
            {lead.status !== 'converted' && lead.status !== 'lost' && (
              <button
                onClick={() => onUpdate(lead.id, { status: 'lost' })}
                style={actionBtnSecondary(C.bgHoverStrong, C.textSecondary)}
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
                  background: isLost ? '#71717a' : (i <= stageIdx ? C.statusSuccess : C.bgHoverStrong),
                  transition: 'background 200ms cubic-bezier(0.2, 0.9, 0.3, 1)',
                }} />
                <span style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: i <= stageIdx ? C.textPrimary : C.textDim,
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
                <div style={{ fontSize: 14, color: C.textSecondary, marginBottom: 4 }}>
                  Phone: <span style={{ color: C.textPrimary }}>{lead.prospect_phone}</span>
                </div>
              )}
              {lead.prospect_emails?.map((email) => (
                <div key={email} style={{ fontSize: 14, color: C.textSecondary, marginBottom: 4 }}>
                  Email: <span style={{ color: C.textPrimary }}>{email}</span>
                </div>
              ))}
              {lead.prospect_address && (
                <div style={{ fontSize: 14, color: C.textSecondary }}>
                  Address: <span style={{ color: C.textPrimary }}>{lead.prospect_address}</span>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 12, borderLeft: `2px solid ${C.borderSubtle}` }}>
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
