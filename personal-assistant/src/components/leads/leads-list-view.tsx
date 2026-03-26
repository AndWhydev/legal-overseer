'use client'

import React, { useState, useCallback, memo } from 'react'
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

// ─── Hoisted Styles ─────────────────────────────────────────────────────────
const sectionLabel: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--text-dim, #475569)',
  margin: '0 0 8px',
}

const glassRow: React.CSSProperties = {
  borderRadius: 12,
  background: 'rgba(15, 20, 30, 0.6)',
  backdropFilter: 'blur(20px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
  border: '1px solid rgba(255, 255, 255, 0.03)',
  overflow: 'hidden',
  transition: `all 180ms ${SPRING}`,
}

const rowHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '12px 16px',
  cursor: 'pointer',
  transition: `background 200ms ${SPRING}`,
}

const nameStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text-primary, #F1F5F9)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const valueCell: React.CSSProperties = {
  fontSize: 14,
  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
  fontWeight: 500,
  color: 'var(--text-secondary, #94A3B8)',
  minWidth: 60,
  textAlign: 'right',
}

const timeCell: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-dim, #475569)',
  minWidth: 50,
  textAlign: 'right',
}

const quickBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  padding: 0,
  borderRadius: 8,
  border: 'none',
  background: 'rgba(255, 255, 255, 0.06)',
  color: 'var(--text-dim, #475569)',
  cursor: 'pointer',
  fontSize: 14,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background 200ms',
}

const detailPanel: React.CSSProperties = {
  borderTop: '1px solid rgba(255, 255, 255, 0.03)',
  background: 'rgba(255, 255, 255, 0.02)',
  padding: '20px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  animation: `bb-detail-enter 180ms ${SPRING} both`,
}

const advanceBtn: React.CSSProperties = {
  height: 40,
  padding: '0 20px',
  borderRadius: 8,
  border: 'none',
  background: 'rgba(34, 197, 94, 0.1)',
  color: '#86efac',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  transition: 'filter 200ms',
}

const listContainer: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function getActivityDot(lastActivityAt: string | null): { color: string; pulse: boolean; label: string } {
  if (!lastActivityAt) return { color: '#ef4444', pulse: true, label: 'No activity' }
  const hours = (Date.now() - new Date(lastActivityAt).getTime()) / 3_600_000
  if (hours < 24) return { color: '#22c55e', pulse: false, label: 'Active today' }
  if (hours < 168) return { color: '#eab308', pulse: false, label: 'Active this week' }
  if (hours < 336) return { color: '#ef4444', pulse: false, label: 'Inactive 2 weeks' }
  return { color: '#ef4444', pulse: true, label: 'Critically inactive' }
}

// ─── Detail Panel ───────────────────────────────────────────────────────────
interface LeadsListViewProps {
  leads: EnhancedLeadData[]
  onSelectLead: (lead: EnhancedLeadData) => void
  onAdvanceStage: (leadId: string, event: React.MouseEvent) => void
}

const LeadDetailPanel = memo(function LeadDetailPanel({ lead, onAdvanceStage }: { lead: EnhancedLeadData; onAdvanceStage: (id: string, e: React.MouseEvent) => void }) {
  const hasPcc = lead.fit_score != null
  const stageIdx = PROGRESS_STAGES.findIndex(s => s.status === lead.status)
  const isLost = lead.status === 'lost'

  return (
    <div style={detailPanel}>
      {/* Progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} role="progressbar" aria-label="Lead stage progress">
        {PROGRESS_STAGES.map((stage, i) => (
          <div key={stage.status} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{
              height: 3,
              width: '100%',
              borderRadius: 9999,
              background: isLost ? '#71717a' : (i <= stageIdx ? '#22c55e' : 'rgba(255, 255, 255, 0.06)'),
              transition: `background 200ms ${SPRING}`,
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

      {/* Action buttons */}
      {lead.status !== 'converted' && lead.status !== 'lost' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={(e) => onAdvanceStage(lead.id, e)}
            style={advanceBtn}
            aria-label="Advance lead to next stage"
            onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.3)' }}
            onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)' }}
          >
            <ArrowRight size={16} /> Advance Stage
          </button>
        </div>
      )}

      {/* Score & Outreach panels */}
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
          {lead.prospect_phone && (
            <div style={{ fontSize: 14, color: 'var(--text-secondary, #94A3B8)' }}>
              Phone: <span style={{ color: 'var(--text-primary, #F1F5F9)' }}>{lead.prospect_phone}</span>
            </div>
          )}
          {lead.prospect_emails?.map(em => (
            <div key={em} style={{ fontSize: 14, color: 'var(--text-secondary, #94A3B8)' }}>
              Email: <span style={{ color: 'var(--text-primary, #F1F5F9)' }}>{em}</span>
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      {lead.notes && (
        <div>
          <h4 style={sectionLabel}>Notes</h4>
          <div style={{
            padding: '12px 16px',
            borderRadius: 12,
            background: 'rgba(255, 255, 255, 0.04)',
            fontSize: 14,
            color: 'var(--text-secondary, #94A3B8)',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.5,
          }}>
            {lead.notes}
          </div>
        </div>
      )}
    </div>
  )
})

// ─── List Row ───────────────────────────────────────────────────────────────
const LeadRow = memo(function LeadRow({
  lead,
  index,
  expanded,
  onToggle,
  onAdvanceStage,
}: {
  lead: EnhancedLeadData
  index: number
  expanded: boolean
  onToggle: (id: string) => void
  onAdvanceStage: (leadId: string, event: React.MouseEvent) => void
}) {
  const activity = getActivityDot(lead.last_activity_at)
  const rotLevel = getDealRotLevel(lead.last_activity_at)
  const displayName = lead.prospect_name ?? lead.source_detail ?? `Lead ${lead.id.slice(0, 8)}`

  return (
    <div
      className="bb-lead-row"
      role="row"
      aria-expanded={expanded}
      style={{
        ...glassRow,
        opacity: rotLevel === 'critical' ? 0.6 : rotLevel === 'stale' ? 0.7 : 1,
        animation: `bb-row-enter 200ms ${SPRING} both`,
        animationDelay: `${index * 30}ms`,
      }}
    >
      {/* Collapsed header */}
      <div
        onClick={() => onToggle(lead.id)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(lead.id) } }}
        tabIndex={0}
        role="button"
        aria-label={`${displayName}, ${lead.score} lead, ${formatCurrency(lead.estimated_value)}`}
        style={rowHeader}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(20, 28, 40, 0.7)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      >
        {/* Activity dot */}
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 9999,
            backgroundColor: activity.color,
            flexShrink: 0,
            animation: activity.pulse ? 'bb-pulse-dot 1.5s ease-in-out infinite' : 'none',
          }}
          role="img"
          aria-label={activity.label}
        />

        {/* Name */}
        <span style={nameStyle}>{displayName}</span>

        <StatusPill variant={SCORE_VARIANT[lead.score] ?? 'neutral'} label={lead.score} dot />

        <span style={valueCell}>
          {formatCurrency(lead.estimated_value)}
        </span>

        <StatusPill variant={STATUS_VARIANT[lead.status] ?? 'neutral'} label={lead.status} />

        <span style={timeCell}>
          {lead.last_activity_at ? relativeTime(lead.last_activity_at) : '--'}
        </span>

        <ChevronDown
          size={16}
          style={{
            color: 'var(--text-dim, #475569)',
            flexShrink: 0,
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: `transform 200ms ${SPRING}`,
          }}
          aria-hidden="true"
        />

        {/* Hover quick actions */}
        <div className="bb-lead-quick-actions" style={{ opacity: 0, transition: 'opacity 150ms', display: 'flex', gap: 4 }}>
          {lead.status !== 'converted' && lead.status !== 'lost' && (
            <button
              onClick={(e) => { e.stopPropagation(); onAdvanceStage(lead.id, e) }}
              style={quickBtnStyle}
              aria-label="Advance to next stage"
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)' }}
            >
              <ArrowRight size={16} />
            </button>
          )}
          <button
            onClick={(e) => e.stopPropagation()}
            style={quickBtnStyle}
            aria-label="Send email"
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)' }}
          >
            <Mail size={16} />
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
})

// ─── List View ──────────────────────────────────────────────────────────────
function LeadsListViewInner({ leads, onSelectLead: _onSelectLead, onAdvanceStage }: LeadsListViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const toggle = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id)
  }, [])

  return (
    <>
      <div style={listContainer} role="table" aria-label="Leads list">
        {leads.map((lead, index) => (
          <LeadRow
            key={lead.id}
            lead={lead}
            index={index}
            expanded={expandedId === lead.id}
            onToggle={toggle}
            onAdvanceStage={onAdvanceStage}
          />
        ))}
      </div>

      <style>{`
        .bb-lead-row:hover .bb-lead-quick-actions { opacity: 1 !important; }
        .bb-lead-row:focus-within .bb-lead-quick-actions { opacity: 1 !important; }
        @keyframes bb-row-enter { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bb-detail-enter { from { opacity: 0; } to { opacity: 1; } }
        @keyframes bb-pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </>
  )
}

export const LeadsListView = memo(LeadsListViewInner)
