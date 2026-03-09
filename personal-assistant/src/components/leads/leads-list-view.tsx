'use client'

import { useState, useEffect, useCallback } from 'react'
import { ArrowRight, Mail, ChevronDown } from 'lucide-react'
import type { EnhancedLeadData, LeadStatus } from '@/lib/leads/types'
import { getDealRotLevel, formatCurrency, relativeTime } from '@/lib/leads/utils'
import { StatusPill, type StatusVariant } from '@/components/ui/status-pill'
import { ScoreBreakdownPanel } from './score-breakdown-panel'
import { OutreachIntelPanel } from './outreach-intel-panel'
import { WebsiteSignalsPanel } from './website-signals-panel'
import { NextActionPanel } from './next-action-panel'

const SPRING = 'cubic-bezier(0.2, 0.9, 0.3, 1)'

const SCORE_VARIANT: Record<string, StatusVariant> = { hot: 'error', warm: 'warning', cold: 'info' }
const STATUS_VARIANT: Record<string, StatusVariant> = { new: 'info', qualified: 'warning', booked: 'purple', converted: 'success', lost: 'neutral' }

const PROGRESS_STAGES: Array<{ status: LeadStatus; label: string }> = [
  { status: 'new', label: 'New' },
  { status: 'qualified', label: 'Qualified' },
  { status: 'booked', label: 'Booked' },
  { status: 'converted', label: 'Won' },
]

const sectionLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: 'var(--text-dim)', margin: '0 0 8px',
}

interface LeadsListViewProps {
  leads: EnhancedLeadData[]
  onSelectLead: (lead: EnhancedLeadData) => void
  onAdvanceStage: (leadId: string, event: React.MouseEvent) => void
}

function getActivityDot(lastActivityAt: string | null): { color: string; pulse: boolean } {
  if (!lastActivityAt) return { color: 'var(--bb-red)', pulse: true }
  const hours = (Date.now() - new Date(lastActivityAt).getTime()) / 3_600_000
  if (hours < 24) return { color: 'var(--bb-green)', pulse: false }
  if (hours < 168) return { color: 'var(--bb-amber)', pulse: false }
  if (hours < 336) return { color: 'var(--bb-red)', pulse: false }
  return { color: 'var(--bb-red)', pulse: true }
}

const glassRow: React.CSSProperties = {
  borderRadius: 14,
  background: 'var(--glass-card-bg-light)',
  backdropFilter: 'var(--glass-card-blur)',
  WebkitBackdropFilter: 'var(--glass-card-blur)',
  boxShadow: 'var(--glass-card-inset)',
  border: '1px solid var(--glass-card-border)',
  overflow: 'hidden',
  transition: `all 180ms ${SPRING}`,
}

const quickBtnStyle: React.CSSProperties = {
  padding: '4px 8px', borderRadius: 6, border: 'none',
  background: 'rgba(255, 255, 255, 0.06)', color: 'var(--text-dim)',
  cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3,
}

function LeadDetailPanel({ lead, onAdvanceStage }: { lead: EnhancedLeadData; onAdvanceStage: (id: string, e: React.MouseEvent) => void }) {
  const hasPcc = lead.fit_score != null
  const stageIdx = PROGRESS_STAGES.findIndex(s => s.status === lead.status)
  const isLost = lead.status === 'lost'

  return (
    <div style={{
      borderTop: '1px solid var(--glass-divider)', background: 'rgba(255, 255, 255, 0.02)',
      padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16,
      animation: `bb-detail-enter 180ms ${SPRING} both`,
    }}>
      {/* Progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        {PROGRESS_STAGES.map((stage, i) => (
          <div key={stage.status} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{
              height: 3, width: '100%', borderRadius: 99,
              background: isLost ? '#71717a' : (i <= stageIdx ? '#22C55E' : 'var(--glass-hover-bg)'),
              transition: `background 200ms ${SPRING}`,
            }} />
            <span style={{ fontSize: 10, fontWeight: 500, color: i <= stageIdx ? 'var(--text-primary)' : 'var(--text-dim)' }}>{stage.label}</span>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        {lead.status !== 'converted' && lead.status !== 'lost' && (
          <button
            onClick={(e) => onAdvanceStage(lead.id, e)}
            style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: 'rgba(34, 197, 94, 0.1)', color: '#86efac', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.3)' }}
            onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)' }}
          >
            <ArrowRight size={14} /> Advance Stage
          </button>
        )}
      </div>

      {/* PCC panels */}
      {hasPcc && <ScoreBreakdownPanel fitScore={lead.fit_score!} opportunityScore={lead.opportunity_score!} fitBreakdown={lead.fit_breakdown} opportunityBreakdown={lead.opportunity_breakdown} />}
      {hasPcc && <OutreachIntelPanel opportunityNotes={lead.opportunity_notes} outreachAngle={lead.outreach_angle} priorityServices={lead.priority_services} />}
      {lead.website_signals && <WebsiteSignalsPanel signals={lead.website_signals} />}

      {/* Next action */}
      {(lead.next_action || lead.next_action_at) && (
        <NextActionPanel nextAction={lead.next_action} nextActionAt={lead.next_action_at} onSave={() => {}} />
      )}

      {/* Contact */}
      {(lead.prospect_phone || (lead.prospect_emails && lead.prospect_emails.length > 0)) && (
        <div>
          <h4 style={sectionLabel}>Contact</h4>
          {lead.prospect_phone && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Phone: <span style={{ color: 'var(--text-primary)' }}>{lead.prospect_phone}</span></div>}
          {lead.prospect_emails?.map(em => <div key={em} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Email: <span style={{ color: 'var(--text-primary)' }}>{em}</span></div>)}
        </div>
      )}

      {/* Notes */}
      {lead.notes && (
        <div>
          <h4 style={sectionLabel}>Notes</h4>
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--hover-bg)', fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{lead.notes}</div>
        </div>
      )}
    </div>
  )
}

export function LeadsListView({ leads, onSelectLead, onAdvanceStage }: LeadsListViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const toggle = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setExpandedId(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {leads.map((lead, index) => {
        const expanded = expandedId === lead.id
        const activity = getActivityDot(lead.last_activity_at)
        const rotLevel = getDealRotLevel(lead.last_activity_at)
        const displayName = lead.prospect_name ?? lead.source_detail ?? `Lead ${lead.id.slice(0, 8)}`

        return (
          <div
            key={lead.id}
            className="bb-lead-row"
            style={{
              ...glassRow,
              opacity: rotLevel === 'critical' ? 0.6 : rotLevel === 'stale' ? 0.7 : 1,
              animation: `bb-row-enter 200ms ${SPRING} both`,
              animationDelay: `${index * 30}ms`,
            }}
          >
            {/* Collapsed header */}
            <div
              onClick={() => toggle(lead.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--glass-hover-bg)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              {/* Activity dot */}
              <span style={{
                width: 7, height: 7, borderRadius: '50%', backgroundColor: activity.color, flexShrink: 0,
                animation: activity.pulse ? 'bb-pulse-dot 1.5s ease-in-out infinite' : 'none',
              }} />

              {/* Name */}
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayName}
              </span>

              <StatusPill variant={SCORE_VARIANT[lead.score] ?? 'neutral'} label={lead.score} dot />

              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-secondary)', minWidth: 60, textAlign: 'right' }}>
                {formatCurrency(lead.estimated_value)}
              </span>

              <StatusPill variant={STATUS_VARIANT[lead.status] ?? 'neutral'} label={lead.status} />

              <span style={{ fontSize: 11, color: 'var(--text-dim)', minWidth: 50, textAlign: 'right' }}>
                {lead.last_activity_at ? relativeTime(lead.last_activity_at) : '—'}
              </span>

              <ChevronDown style={{
                width: 14, height: 14, color: 'var(--text-dim)', flexShrink: 0,
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: `transform 200ms ${SPRING}`,
              }} />

              {/* Hover quick actions */}
              <div className="bb-lead-quick-actions" style={{ opacity: 0, transition: 'opacity 150ms', display: 'flex', gap: 4 }}>
                {lead.status !== 'converted' && lead.status !== 'lost' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onAdvanceStage(lead.id, e) }}
                    style={quickBtnStyle}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)' }}
                  >
                    <ArrowRight size={12} />
                  </button>
                )}
                <button onClick={(e) => e.stopPropagation()} style={quickBtnStyle}>
                  <Mail size={12} />
                </button>
              </div>
            </div>

            {/* Expandable detail */}
            <div style={{
              display: 'grid',
              gridTemplateRows: expanded ? '1fr' : '0fr',
              transition: `grid-template-rows 180ms ${SPRING}`,
            }}>
              <div style={{ overflow: 'hidden' }}>
                {expanded && <LeadDetailPanel lead={lead} onAdvanceStage={onAdvanceStage} />}
              </div>
            </div>
          </div>
        )
      })}

      <style>{`
        .bb-lead-row:hover .bb-lead-quick-actions { opacity: 1 !important; }
        @keyframes bb-row-enter { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bb-detail-enter { from { opacity: 0; } to { opacity: 1; } }
        @keyframes bb-pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  )
}
