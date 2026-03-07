'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { EnhancedLeadData } from '@/lib/leads/types'
import { getDealRotLevel, getSpeedToLeadLevel, formatCurrency, relativeTime } from '@/lib/leads/utils'
import { StatusPill, type StatusVariant } from '@/components/ui/status-pill'

interface LeadCardProps {
  lead: EnhancedLeadData
  onClick?: (lead: EnhancedLeadData) => void
}

const SCORE_VARIANT: Record<string, StatusVariant> = {
  hot: 'error',
  warm: 'warning',
  cold: 'info',
}

const ROT_BORDER: Record<string, string> = {
  fresh: 'rgba(255, 255, 255, 0.04)',
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
  fast: 'var(--bb-green, #22C55E)',
  ok: 'var(--bb-amber, #F59E0B)',
  slow: 'var(--bb-red, #EF4444)',
}

const SCORE_TINT: Record<string, string> = {
  hot: 'linear-gradient(135deg, rgba(239, 68, 68, 0.06) 0%, transparent 60%)',
  warm: 'linear-gradient(135deg, rgba(245, 158, 11, 0.06) 0%, transparent 60%)',
  cold: 'linear-gradient(135deg, rgba(59, 130, 246, 0.04) 0%, transparent 60%)',
}

export function LeadCard({ lead, onClick }: LeadCardProps) {
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
  const displayName = lead.prospect_name ?? lead.source_detail ?? `Lead ${lead.id.slice(0, 8)}`

  return (
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
        background: SCORE_TINT[lead.score] ?? 'rgba(10, 14, 23, 0.5)',
        backdropFilter: 'blur(26px)',
        WebkitBackdropFilter: 'blur(26px)',
        border: `1px solid ${ROT_BORDER[rotLevel]}`,
        opacity: isDragging ? 0.5 : ROT_OPACITY[rotLevel],
        cursor: 'grab',
        position: 'relative',
        ...dndStyle,
        transition: [dndStyle.transition, 'opacity 0.2s, border-color 0.3s, box-shadow 0.2s'].filter(Boolean).join(', '),
        boxShadow: isDragging ? '0 16px 48px rgba(0, 0, 0, 0.4)' : '0 1px 3px rgba(0, 0, 0, 0.1)',
      }}
    >
      {/* Header: source + score + speed dot */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 10,
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: '#64748B',
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
        color: '#F1F5F9',
        lineHeight: 1.4,
        margin: 0,
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>
        {displayName}
      </h4>

      {/* Details row */}
      <div style={{ marginTop: 6, display: 'flex', gap: 12, fontSize: 11, fontFamily: 'var(--font-mono)', color: '#64748B' }}>
        <span style={{ fontWeight: 600, color: '#94A3B8' }}>
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
              background: 'rgba(255, 255, 255, 0.03)',
              color: '#64748B',
            }}>
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Fit score badge (PCC-enriched leads only) */}
      {lead.fit_score != null && (
        <div style={{
          position: 'absolute',
          top: 12,
          right: 12,
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: 'rgba(59, 130, 246, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 9,
          fontWeight: 700,
          fontFamily: 'var(--font-mono)',
          color: 'var(--bb-cyan, #06B6D4)',
        }}>
          {lead.fit_score}
        </div>
      )}

      {/* Bottom: relative time */}
      <div style={{ marginTop: 8, fontSize: 9, color: 'rgba(148, 163, 184, 0.6)' }}>
        {relativeTime(lead.updated_at)}
      </div>
    </div>
  )
}
