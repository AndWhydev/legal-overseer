'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowRight, Mail, Calendar } from 'lucide-react'
import type { EnhancedLeadData } from '@/lib/leads/types'
import { getDealRotLevel, getSpeedToLeadLevel, formatCurrency, relativeTime } from '@/lib/leads/utils'
import { StatusPill, type StatusVariant } from '@/components/ui/status-pill'

interface LeadCardProps {
  lead: EnhancedLeadData
  onClick?: (lead: EnhancedLeadData) => void
  onAdvanceStage?: (leadId: string, event: React.MouseEvent) => void
}

const SCORE_VARIANT: Record<string, StatusVariant> = {
  hot: 'error',
  warm: 'warning',
  cold: 'info',
}

const ROT_BORDER: Record<string, string> = {
  fresh: 'var(--glass-divider)',
  aging: 'rgba(245, 158, 11, 0.15)',
  stale: 'rgba(245, 158, 11, 0.4)',
  critical: 'rgba(239, 68, 68, 0.5)',
}

const ROT_OPACITY: Record<string, number> = {
  fresh: 1,
  aging: 0.85,
  stale: 0.7,
  critical: 0.6,
}

const SPEED_COLOR: Record<string, string> = {
  fast: 'var(--bb-green)',
  ok: 'var(--bb-amber)',
  slow: 'var(--bb-red)',
}

const SCORE_TINT: Record<string, string> = {
  hot: 'linear-gradient(135deg, rgba(239, 68, 68, 0.06) 0%, transparent 60%)',
  warm: 'linear-gradient(135deg, rgba(245, 158, 11, 0.06) 0%, transparent 60%)',
  cold: 'linear-gradient(135deg, rgba(59, 130, 246, 0.04) 0%, transparent 60%)',
}

function getActivityDotColor(lastActivityAt: string | null): { color: string; pulse: boolean } {
  if (!lastActivityAt) return { color: 'var(--bb-red)', pulse: true }
  const hours = (Date.now() - new Date(lastActivityAt).getTime()) / 3_600_000
  if (hours < 24) return { color: 'var(--bb-green)', pulse: false }
  if (hours < 168) return { color: 'var(--bb-amber)', pulse: false }  // 7 days
  if (hours < 336) return { color: 'var(--bb-red)', pulse: false }    // 14 days
  return { color: 'var(--bb-red)', pulse: true }
}

function getFitGlow(score: number): string {
  if (score >= 75) return '0 0 10px rgba(59, 130, 246, 0.35)'
  if (score >= 50) return '0 0 8px rgba(59, 130, 246, 0.2)'
  return '0 0 6px rgba(59, 130, 246, 0.1)'
}

const ACTION_BTN: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 6,
  border: 'none',
  background: 'rgba(255, 255, 255, 0.06)',
  color: 'var(--text-dim)',
  cursor: 'pointer',
  fontSize: 10,
  display: 'flex',
  alignItems: 'center',
  gap: 3,
}

export function LeadCard({ lead, onClick, onAdvanceStage }: LeadCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lead.id })

  const dndStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const rotLevel = getDealRotLevel(lead.last_activity_at)
  const speedLevel = getSpeedToLeadLevel(lead.created_at, lead.first_ack_at)
  const activityDot = getActivityDotColor(lead.last_activity_at)
  const displayName = lead.prospect_name ?? lead.source_detail ?? `Lead ${lead.id.slice(0, 8)}`

  return (
    <>
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        onClick={(e) => {
          e.stopPropagation()
          onClick?.(lead)
        }}
        className="bb-leads-card"
        data-score={lead.score}
        data-rot={rotLevel}
        style={{
          borderRadius: 16,
          padding: '14px 16px',
          background: SCORE_TINT[lead.score] ?? 'var(--bb-surface)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          border: `1px solid ${ROT_BORDER[rotLevel]}`,
          opacity: isDragging ? 0.5 : ROT_OPACITY[rotLevel],
          cursor: 'grab',
          position: 'relative',
          ...dndStyle,
          transition: [
            dndStyle.transition,
            'opacity 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
            'border-color 0.3s ease',
            'box-shadow 0.2s ease',
          ].filter(Boolean).join(', '),
          boxShadow: isDragging ? 'var(--card-shadow-hover)' : 'var(--card-shadow)',
        }}
      >
        {/* Header: activity dot + source channel + score pill */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Activity urgency dot */}
            <span style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              backgroundColor: activityDot.color,
              display: 'inline-block',
              flexShrink: 0,
              animation: activityDot.pulse ? 'bb-pulse-dot 1.5s ease-in-out infinite' : undefined,
            }} />
            {/* Source channel */}
            <span style={{
              fontSize: 10,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-mono)',
            }}>
              {lead.source_channel}
            </span>
            {/* Speed-to-lead dot */}
            {lead.status !== 'converted' && lead.status !== 'lost' && (
              <span style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: SPEED_COLOR[speedLevel],
                display: 'inline-block',
                flexShrink: 0,
              }} />
            )}
          </div>
          <StatusPill
            variant={SCORE_VARIANT[lead.score] ?? 'neutral'}
            label={lead.score.charAt(0).toUpperCase() + lead.score.slice(1)}
            dot
          />
        </div>

        {/* Title */}
        <h4 style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-primary)',
          lineHeight: 1.4,
          margin: 0,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {displayName}
        </h4>

        {/* Outreach angle (PCC leads) */}
        {lead.outreach_angle && (
          <p style={{
            margin: '4px 0 0',
            fontSize: 11,
            fontStyle: 'italic',
            color: 'var(--text-dim)',
            lineHeight: 1.4,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            &ldquo;{lead.outreach_angle}&rdquo;
          </p>
        )}

        {/* Details row: value + timeline */}
        <div style={{ marginTop: 6, display: 'flex', gap: 12, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
            {formatCurrency(lead.estimated_value)}
          </span>
          {lead.timeline_days != null && (
            <span>{lead.timeline_days}d</span>
          )}
        </div>

        {/* Service tags */}
        {lead.service_interest && lead.service_interest.length > 0 && (
          <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {lead.service_interest.slice(0, 3).map((s) => (
              <span key={s} style={{
                fontSize: 10,
                padding: '2px 8px',
                borderRadius: 12,
                background: 'var(--hover-bg)',
                color: 'var(--text-dim)',
              }}>
                {s}
              </span>
            ))}
          </div>
        )}

        {/* Fit score badge (PCC-enriched leads, absolute top-right) */}
        {lead.fit_score != null && (
          <div style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'rgba(59, 130, 246, 0.15)',
            boxShadow: getFitGlow(lead.fit_score),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 9,
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            color: 'var(--bb-cyan)',
          }}>
            {lead.fit_score}
          </div>
        )}

        {/* Bottom: relative time */}
        <div style={{ marginTop: 8, fontSize: 9, color: 'rgba(148, 163, 184, 0.6)' }}>
          {relativeTime(lead.updated_at)}
        </div>

        {/* Hover quick actions */}
        <div
          className="bb-lead-actions"
          style={{ opacity: 0, transition: 'opacity 150ms ease', display: 'flex', gap: 6, marginTop: 10 }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); onAdvanceStage?.(lead.id, e) }}
            style={ACTION_BTN}
          >
            <ArrowRight size={11} /> Next
          </button>
          <button
            onClick={(e) => e.stopPropagation()}
            style={ACTION_BTN}
          >
            <Mail size={11} /> Email
          </button>
          <button
            onClick={(e) => e.stopPropagation()}
            style={ACTION_BTN}
          >
            <Calendar size={11} /> Book
          </button>
        </div>
      </div>

      <style>{`
        .bb-leads-card:hover .bb-lead-actions { opacity: 1 !important; }
        @keyframes bb-pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </>
  )
}
