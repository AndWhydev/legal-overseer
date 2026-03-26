'use client'

import React, { memo } from 'react'
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

// ─── Constants ──────────────────────────────────────────────────────────────
const SCORE_VARIANT: Record<string, StatusVariant> = {
  hot: 'error',
  warm: 'warning',
  cold: 'info',
}

const ROT_BORDER: Record<string, string> = {
  fresh: 'rgba(255, 255, 255, 0.03)',
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
  fast: '#22c55e',
  ok: '#eab308',
  slow: '#ef4444',
}

const SCORE_TINT: Record<string, string> = {
  hot: 'linear-gradient(135deg, rgba(239, 68, 68, 0.06) 0%, transparent 60%)',
  warm: 'linear-gradient(135deg, rgba(245, 158, 11, 0.06) 0%, transparent 60%)',
  cold: 'linear-gradient(135deg, rgba(59, 130, 246, 0.04) 0%, transparent 60%)',
}

// ─── Hoisted Styles ─────────────────────────────────────────────────────────
const headerRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 8,
}

const headerLeft: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}

const sourceLabel: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--text-dim, #475569)',
  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
}

const titleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text-primary, #F1F5F9)',
  lineHeight: 1.4,
  margin: 0,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
}

const angleStyle: React.CSSProperties = {
  margin: '4px 0 0',
  fontSize: 14,
  fontStyle: 'italic',
  color: 'var(--text-dim, #475569)',
  lineHeight: 1.4,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
}

const detailsRow: React.CSSProperties = {
  marginTop: 8,
  display: 'flex',
  gap: 12,
  fontSize: 14,
  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
  color: 'var(--text-dim, #475569)',
}

const valueText: React.CSSProperties = {
  fontWeight: 500,
  color: 'var(--text-secondary, #94A3B8)',
}

const tagsContainer: React.CSSProperties = {
  marginTop: 8,
  display: 'flex',
  gap: 4,
  flexWrap: 'wrap',
}

const tagStyle: React.CSSProperties = {
  fontSize: 14,
  padding: '2px 8px',
  borderRadius: 8,
  background: 'rgba(255, 255, 255, 0.04)',
  color: 'var(--text-dim, #475569)',
}

const fitBadge: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  width: 28,
  height: 28,
  borderRadius: 9999,
  background: 'rgba(59, 130, 246, 0.15)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 14,
  fontWeight: 500,
  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
  color: '#06b6d4',
}

const timestampStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 14,
  color: 'rgba(148, 163, 184, 0.6)',
}

const actionBtn: React.CSSProperties = {
  height: 28,
  padding: '0 8px',
  borderRadius: 8,
  border: 'none',
  background: 'rgba(255, 255, 255, 0.06)',
  color: 'var(--text-dim, #475569)',
  cursor: 'pointer',
  fontSize: 14,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  transition: 'background 200ms',
}

const actionsRow: React.CSSProperties = {
  opacity: 0,
  transition: 'opacity 150ms ease',
  display: 'flex',
  gap: 8,
  marginTop: 12,
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function getActivityDotColor(lastActivityAt: string | null): { color: string; pulse: boolean; label: string } {
  if (!lastActivityAt) return { color: '#ef4444', pulse: true, label: 'No activity' }
  const hours = (Date.now() - new Date(lastActivityAt).getTime()) / 3_600_000
  if (hours < 24) return { color: '#22c55e', pulse: false, label: 'Active today' }
  if (hours < 168) return { color: '#eab308', pulse: false, label: 'Active this week' }
  if (hours < 336) return { color: '#ef4444', pulse: false, label: 'Inactive 2 weeks' }
  return { color: '#ef4444', pulse: true, label: 'Critically inactive' }
}

function getFitGlow(score: number): string {
  if (score >= 75) return '0 0 10px rgba(59, 130, 246, 0.35)'
  if (score >= 50) return '0 0 8px rgba(59, 130, 246, 0.2)'
  return '0 0 6px rgba(59, 130, 246, 0.1)'
}

// ─── Component ──────────────────────────────────────────────────────────────
function LeadCardInner({ lead, onClick, onAdvanceStage }: LeadCardProps) {
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
          borderRadius: 16,
          padding: '12px 16px',
          background: SCORE_TINT[lead.score] ?? 'rgba(15, 20, 30, 0.6)',
          backdropFilter: 'blur(20px) saturate(1.2)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
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
          boxShadow: isDragging
            ? '0 16px 32px rgba(0, 0, 0, 0.4)'
            : 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        }}
      >
        {/* Header: activity dot + source channel + score pill */}
        <div style={headerRow}>
          <div style={headerLeft}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 9999,
                backgroundColor: activityDot.color,
                display: 'inline-block',
                flexShrink: 0,
                animation: activityDot.pulse ? 'bb-pulse-dot 1.5s ease-in-out infinite' : undefined,
              }}
              role="img"
              aria-label={activityDot.label}
            />
            <span style={sourceLabel}>
              {lead.source_channel}
            </span>
            {/* Speed-to-lead dot */}
            {lead.status !== 'converted' && lead.status !== 'lost' && (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 9999,
                  backgroundColor: SPEED_COLOR[speedLevel],
                  display: 'inline-block',
                  flexShrink: 0,
                }}
                role="img"
                aria-label={`Response speed: ${speedLevel}`}
              />
            )}
          </div>
          <StatusPill
            variant={SCORE_VARIANT[lead.score] ?? 'neutral'}
            label={lead.score.charAt(0).toUpperCase() + lead.score.slice(1)}
            dot
          />
        </div>

        {/* Title */}
        <h4 style={titleStyle}>
          {displayName}
        </h4>

        {/* Outreach angle (Lead Swarm enriched leads) */}
        {lead.outreach_angle && (
          <p style={angleStyle}>
            &ldquo;{lead.outreach_angle}&rdquo;
          </p>
        )}

        {/* Details row: value + timeline */}
        <div style={detailsRow}>
          <span style={valueText}>
            {formatCurrency(lead.estimated_value)}
          </span>
          {lead.timeline_days != null && (
            <span>{lead.timeline_days}d</span>
          )}
        </div>

        {/* Service tags */}
        {lead.service_interest && lead.service_interest.length > 0 && (
          <div style={tagsContainer}>
            {lead.service_interest.slice(0, 3).map((s) => (
              <span key={s} style={tagStyle}>
                {s}
              </span>
            ))}
          </div>
        )}

        {/* Fit score badge (Lead Swarm enriched leads) */}
        {lead.fit_score != null && (
          <div style={{ ...fitBadge, boxShadow: getFitGlow(lead.fit_score) }} aria-label={`Fit score: ${lead.fit_score}`}>
            {lead.fit_score}
          </div>
        )}

        {/* Bottom: relative time */}
        <div style={timestampStyle}>
          {relativeTime(lead.updated_at)}
        </div>

        {/* Hover quick actions */}
        <div className="bb-lead-actions" style={actionsRow}>
          <button
            onClick={(e) => { e.stopPropagation(); onAdvanceStage?.(lead.id, e) }}
            style={actionBtn}
            aria-label="Advance to next stage"
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)' }}
          >
            <ArrowRight size={16} /> Next
          </button>
          <button
            onClick={(e) => e.stopPropagation()}
            style={actionBtn}
            aria-label="Send email"
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)' }}
          >
            <Mail size={16} /> Email
          </button>
          <button
            onClick={(e) => e.stopPropagation()}
            style={actionBtn}
            aria-label="Book meeting"
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)' }}
          >
            <Calendar size={16} /> Book
          </button>
        </div>
      </div>

      <style>{`
        .bb-leads-card:hover .bb-lead-actions { opacity: 1 !important; }
        .bb-leads-card:focus-visible { outline: 2px solid rgba(255, 90, 31, 0.5); outline-offset: 2px; }
        @keyframes bb-pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </>
  )
}

export const LeadCard = memo(LeadCardInner)
