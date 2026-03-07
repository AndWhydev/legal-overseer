'use client'

import { useEffect, useCallback } from 'react'
import { X, ExternalLink } from 'lucide-react'
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
}

const SCORE_VARIANT: Record<string, StatusVariant> = {
  hot: 'error',
  warm: 'warning',
  cold: 'info',
}

const STATUS_OPTIONS: LeadStatus[] = ['new', 'qualified', 'booked', 'converted', 'lost']

export function LeadDetailDrawer({ lead, open, onClose, onUpdate }: LeadDetailDrawerProps) {
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
          background: 'rgba(0, 0, 0, 0.4)',
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
        background: 'var(--bg-primary, #0A0E17)',
        borderLeft: '1px solid rgba(255, 255, 255, 0.06)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'slideInRight 0.25s ease-out',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#F1F5F9', margin: 0 }}>
              {displayName}
            </h2>
            <button
              onClick={onClose}
              style={{
                padding: 6,
                borderRadius: 8,
                border: 'none',
                background: 'rgba(255, 255, 255, 0.04)',
                color: '#64748B',
                cursor: 'pointer',
              }}
            >
              <X style={{ width: 16, height: 16 }} />
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
                border: '1px solid rgba(255, 255, 255, 0.08)',
                background: 'rgba(10, 14, 23, 0.4)',
                color: '#F1F5F9',
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

            <span style={{ fontSize: 10, textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: '#475569' }}>
              {lead.source_channel}
            </span>

            {lead.prospect_website && (
              <a
                href={lead.prospect_website.startsWith('http') ? lead.prospect_website : `https://${lead.prospect_website}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--bb-cyan)', fontSize: 11, textDecoration: 'none' }}
              >
                <ExternalLink style={{ width: 12, height: 12 }} />
                {lead.prospect_domain ?? 'Website'}
              </a>
            )}
          </div>

          {/* Quick stats */}
          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#64748B' }}>
            <span>Value: <strong style={{ color: '#F1F5F9' }}>{formatCurrency(lead.estimated_value)}</strong></span>
            <span>Speed: <strong style={{ color: speedLevel === 'fast' ? 'var(--bb-green)' : speedLevel === 'ok' ? 'var(--bb-amber)' : 'var(--bb-red)' }}>
              {formatSpeedToLead(lead.created_at, lead.first_ack_at)}
            </strong></span>
            <span>Activity: <strong style={{ color: rotLevel === 'fresh' ? '#94A3B8' : 'var(--bb-amber)' }}>
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
          <div style={{ height: 1, background: 'rgba(255, 255, 255, 0.04)' }} />

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
              <h4 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748B', margin: '0 0 8px' }}>
                Contact
              </h4>
              {lead.prospect_phone && (
                <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 4 }}>
                  Phone: <span style={{ color: '#F1F5F9' }}>{lead.prospect_phone}</span>
                </div>
              )}
              {lead.prospect_emails?.map((email) => (
                <div key={email} style={{ fontSize: 12, color: '#94A3B8', marginBottom: 2 }}>
                  Email: <span style={{ color: '#F1F5F9' }}>{email}</span>
                </div>
              ))}
              {lead.prospect_address && (
                <div style={{ fontSize: 12, color: '#94A3B8' }}>
                  Address: <span style={{ color: '#F1F5F9' }}>{lead.prospect_address}</span>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          {lead.notes && (
            <div>
              <h4 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748B', margin: '0 0 8px' }}>
                Notes
              </h4>
              <div style={{
                padding: '12px 16px',
                borderRadius: 10,
                background: 'rgba(255, 255, 255, 0.02)',
                fontSize: 12,
                color: '#94A3B8',
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
              <h4 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748B', margin: '0 0 8px' }}>
                Services
              </h4>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {lead.service_interest.map((s) => (
                  <span key={s} style={{
                    fontSize: 11,
                    padding: '4px 12px',
                    borderRadius: 20,
                    background: 'rgba(255, 255, 255, 0.04)',
                    color: '#94A3B8',
                  }}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Activity Timeline (simplified) */}
          <div>
            <h4 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748B', margin: '0 0 8px' }}>
              Timeline
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 12, borderLeft: '2px solid rgba(255, 255, 255, 0.04)' }}>
              <TimelineEntry label="Created" date={lead.created_at} />
              {lead.first_ack_at && <TimelineEntry label="First acknowledged" date={lead.first_ack_at} />}
              {lead.last_activity_at && lead.last_activity_at !== lead.created_at && (
                <TimelineEntry label="Last activity" date={lead.last_activity_at} />
              )}
            </div>
          </div>

          {/* Lead ID */}
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#475569', paddingTop: 8 }}>
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
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255, 255, 255, 0.1)', flexShrink: 0, marginTop: 4 }} />
      <div>
        <span style={{ fontSize: 11, color: '#94A3B8' }}>{label}</span>
        <span style={{ fontSize: 10, color: '#475569', marginLeft: 6 }}>{relativeTime(date)}</span>
      </div>
    </div>
  )
}
