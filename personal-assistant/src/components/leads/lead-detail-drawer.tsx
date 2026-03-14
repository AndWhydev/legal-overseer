'use client'

import { useEffect, useCallback } from 'react'
import { SFXmark, SFArrowUpRightSquare, SFArrowRight, SFEnvelope, SFCalendar, SFXmarkCircle } from 'sf-symbols-lib'
import type { EnhancedLeadData, LeadStatus } from '@/lib/leads/types'
import { getDealRotLevel, getSpeedToLeadLevel, formatCurrency, formatSpeedToLead, relativeTime } from '@/lib/leads/utils'
import { StatusPill, type StatusVariant } from '@/components/ui/status-pill'
import { ScoreBreakdownPanel } from './score-breakdown-panel'
import { OutreachIntelPanel } from './outreach-intel-panel'
import { WebsiteSignalsPanel } from './website-signals-panel'
import { NextActionPanel } from './next-action-panel'

interface LeadDetailDrawerProps {
  lead: EnhancedLeadData | null
  open: boolean
  onClose: () => void
  onUpdate: (leadId: string, patch: Record<string, unknown>) => void
  onAdvanceStage?: (leadId: string, event: React.MouseEvent) => void
}

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

export function LeadDetailDrawer({ lead, open, onClose, onUpdate, onAdvanceStage }: LeadDetailDrawerProps) {
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
  const rotLevel = getDealRotLevel(lead.last_activity_at)
  const speedLevel = getSpeedToLeadLevel(lead.created_at, lead.first_ack_at)
  const hasPccData = lead.fit_score != null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--bg-overlay)',
          zIndex: 50,
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        maxWidth: 480,
        zIndex: 51,
        background: 'var(--bg-primary)',
        borderLeft: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'slideInRight 0.3s cubic-bezier(0.2, 0.9, 0.3, 1)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {displayName}
            </h2>
            <button
              onClick={onClose}
              style={{
                padding: 6,
                borderRadius: 8,
                border: 'none',
                background: 'var(--hover-bg)',
                color: 'var(--text-dim)',
                cursor: 'pointer',
              }}
            >
              <SFXmark style={{ width: 16, height: 16 }} />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Status selector */}
            <select
              value={lead.status}
              onChange={(e) => onUpdate(lead.id, { status: e.target.value })}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: 8,
                border: '1px solid var(--border-active)',
                background: 'var(--bb-surface)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>

            <StatusPill
              variant={SCORE_VARIANT[lead.score] ?? 'neutral'}
              label={lead.score}
              dot
            />

            <span style={{ fontSize: 10, textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
              {lead.source_channel}
            </span>

            {lead.prospect_website && (
              <a
                href={lead.prospect_website.startsWith('http') ? lead.prospect_website : `https://${lead.prospect_website}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--bb-cyan)', fontSize: 11, textDecoration: 'none' }}
              >
                <SFArrowUpRightSquare style={{ width: 12, height: 12 }} />
                {lead.prospect_domain ?? 'Website'}
              </a>
            )}
          </div>

          {/* Quick stats */}
          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-dim)' }}>
            <span>Value: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(lead.estimated_value)}</strong></span>
            <span>Speed: <strong style={{ color: speedLevel === 'fast' ? 'var(--bb-green)' : speedLevel === 'ok' ? 'var(--bb-amber)' : 'var(--bb-red)' }}>
              {formatSpeedToLead(lead.created_at, lead.first_ack_at)}
            </strong></span>
            <span>Activity: <strong style={{ color: rotLevel === 'fresh' ? 'var(--text-secondary)' : 'var(--bb-amber)' }}>
              {lead.last_activity_at ? relativeTime(lead.last_activity_at) : '—'}
            </strong></span>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}>
          {/* Quick Action Bar */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {lead.status !== 'converted' && lead.status !== 'lost' && (
              <button
                onClick={(e) => onAdvanceStage?.(lead.id, e)}
                style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#86efac', padding: '10px 16px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.3)')}
                onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
              >
                <SFArrowRight size={14} /> Advance Stage
              </button>
            )}
            <button
              style={{ background: 'rgba(56, 189, 248, 0.1)', color: '#7dd3fc', padding: '10px 16px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.3)')}
              onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
            >
              <SFEnvelope size={14} /> Email
            </button>
            <button
              style={{ background: 'rgba(168, 85, 247, 0.1)', color: '#c4b5fd', padding: '10px 16px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.3)')}
              onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
            >
              <SFCalendar size={14} /> Schedule
            </button>
            {lead.status !== 'converted' && lead.status !== 'lost' && (
              <button
                onClick={() => onUpdate(lead.id, { status: 'lost' })}
                style={{ background: 'rgba(239, 68, 68, 0.08)', color: '#fca5a5', padding: '10px 16px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.3)')}
                onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
              >
                <SFXmarkCircle size={14} /> Mark Lost
              </button>
            )}
          </div>

          {/* Status Progress Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            {PROGRESS_STAGES.map((stage, i) => {
              const idx = PROGRESS_STAGES.findIndex(s => s.status === lead.status)
              const isLost = lead.status === 'lost'
              return (
                <div key={stage.status} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    height: 3, width: '100%', borderRadius: 99,
                    background: isLost ? '#71717a' : (i <= idx ? '#22C55E' : 'var(--glass-hover-bg)'),
                    transition: 'background 200ms cubic-bezier(0.2, 0.9, 0.3, 1)',
                  }} />
                  <span style={{ fontSize: 10, fontWeight: 500, color: i <= idx ? 'var(--text-primary)' : 'var(--text-dim)' }}>
                    {stage.label}
                  </span>
                </div>
              )
            })}
          </div>

          {/* PCC Score Breakdown */}
          {hasPccData && (
            <ScoreBreakdownPanel
              fitScore={lead.fit_score!}
              opportunityScore={lead.opportunity_score!}
              fitBreakdown={lead.fit_breakdown}
              opportunityBreakdown={lead.opportunity_breakdown}
            />
          )}

          {/* PCC Outreach Intelligence */}
          {hasPccData && (
            <OutreachIntelPanel
              opportunityNotes={lead.opportunity_notes}
              outreachAngle={lead.outreach_angle}
              priorityServices={lead.priority_services}
            />
          )}

          {/* PCC Website Signals */}
          {lead.website_signals && (
            <WebsiteSignalsPanel signals={lead.website_signals} />
          )}

          {/* Separator */}
          <div style={{ height: 1, background: 'var(--hover-bg)' }} />

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
              <h4 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)', margin: '0 0 8px' }}>
                Contact
              </h4>
              {lead.prospect_phone && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Phone: <span style={{ color: 'var(--text-primary)' }}>{lead.prospect_phone}</span>
                </div>
              )}
              {lead.prospect_emails?.map((email) => (
                <div key={email} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2 }}>
                  Email: <span style={{ color: 'var(--text-primary)' }}>{email}</span>
                </div>
              ))}
              {lead.prospect_address && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Address: <span style={{ color: 'var(--text-primary)' }}>{lead.prospect_address}</span>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          {lead.notes && (
            <div>
              <h4 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)', margin: '0 0 8px' }}>
                Notes
              </h4>
              <div style={{
                padding: '12px 16px',
                borderRadius: 10,
                background: 'var(--hover-bg)',
                fontSize: 12,
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
              }}>
                {lead.notes}
              </div>
            </div>
          )}

          {/* Service Interest */}
          {lead.service_interest && lead.service_interest.length > 0 && (
            <div>
              <h4 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)', margin: '0 0 8px' }}>
                Services
              </h4>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {lead.service_interest.map((s) => (
                  <span key={s} style={{
                    fontSize: 11,
                    padding: '4px 12px',
                    borderRadius: 20,
                    background: 'var(--hover-bg)',
                    color: 'var(--text-secondary)',
                  }}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Activity Timeline (simplified) */}
          <div>
            <h4 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)', margin: '0 0 8px' }}>
              Timeline
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 12, borderLeft: '2px solid var(--hover-bg)' }}>
              <TimelineEntry label="Created" date={lead.created_at} />
              {lead.first_ack_at && <TimelineEntry label="First acknowledged" date={lead.first_ack_at} />}
              {lead.last_activity_at && lead.last_activity_at !== lead.created_at && (
                <TimelineEntry label="Last activity" date={lead.last_activity_at} />
              )}
            </div>
          </div>

          {/* Lead ID */}
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', paddingTop: 8 }}>
            ID: {lead.id}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @media (max-width: 640px) {
          [style*="maxWidth: 480"] { max-width: 100% !important; }
        }
      `}</style>
    </>
  )
}

function TimelineEntry({ label, date }: { label: string; date: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--glass-interactive-border)', flexShrink: 0, marginTop: 4 }} />
      <div>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 6 }}>{relativeTime(date)}</span>
      </div>
    </div>
  )
}
