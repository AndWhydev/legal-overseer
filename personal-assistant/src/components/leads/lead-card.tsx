'use client'

import React, { memo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { EnhancedLeadData } from '@/lib/leads/types'
import { relativeTime } from '@/lib/leads/utils'
import { StatusPill, type StatusVariant } from '@/components/ui/status-pill'

interface LeadCardProps {
  lead: EnhancedLeadData
  onClick?: (lead: EnhancedLeadData) => void
  onAdvanceStage?: (leadId: string, event: React.MouseEvent) => void
}

// ─── Constants ──────────────────────────────────────────────────────────────
const SCORE_VARIANT: Record<string, StatusVariant> = {
  hot: 'error',
  warm: 'warning',
  cold: 'info',
}

// ─── Hoisted Styles ─────────────────────────────────────────────────────────
const cardBase: React.CSSProperties = {
  borderRadius: 16,
  padding: 16,
  background: 'var(--bg-card, rgba(15, 20, 30, 0.6))',
  backdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
  WebkitBackdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
  border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
  boxShadow: 'var(--card-shadow, 0 2px 8px rgba(0,0,0,0.3)), var(--card-inset, inset 0 1px 0 rgba(255,255,255,0.06))',
  cursor: 'grab',
  transition: 'box-shadow 200ms cubic-bezier(0.16, 1, 0.3, 1), transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
  willChange: 'transform',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const companyName: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 500,
  color: 'var(--text-primary, #F1F5F9)',
  lineHeight: 1.4,
  margin: 0,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
}

const taglineStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontStyle: 'italic',
  color: 'var(--text-dim, #475569)',
  lineHeight: 1.4,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
}

const bottomRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginTop: 4,
}

const timeAgo: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-dim, #475569)',
}

// ─── Component ──────────────────────────────────────────────────────────────
function LeadCardInner({ lead, onClick }: LeadCardProps) {
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
      role="button"
      tabIndex={0}
      aria-label={`${displayName}, ${lead.score} lead, ${lead.status} stage`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.(lead)
        }
      }}
      style={{
        ...cardBase,
        opacity: isDragging ? 0.5 : 1,
        ...dndStyle,
        transition: [
          dndStyle.transition,
          'opacity 200ms ease',
          'box-shadow 200ms cubic-bezier(0.16, 1, 0.3, 1)',
          'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        ].filter(Boolean).join(', '),
        boxShadow: isDragging
          ? '0 16px 32px rgba(0, 0, 0, 0.4)'
          : cardBase.boxShadow,
      }}
    >
      {/* Row 1: Company name */}
      <h4 style={companyName}>
        {displayName}
      </h4>

      {/* Row 2: Outreach angle / tagline */}
      {lead.outreach_angle && (
        <p style={taglineStyle}>
          &ldquo;{lead.outreach_angle}&rdquo;
        </p>
      )}

      {/* Row 3: Score badge (left) + time ago (right) */}
      <div style={bottomRow}>
        <StatusPill
          variant={SCORE_VARIANT[lead.score] ?? 'neutral'}
          label={lead.score.charAt(0).toUpperCase() + lead.score.slice(1)}
          dot={false}
          minimal
        />
        <span style={timeAgo}>
          {relativeTime(lead.updated_at)}
        </span>
      </div>
    </div>
  )
}

export const LeadCard = memo(LeadCardInner)
