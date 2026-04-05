'use client'

import React, { memo } from 'react'
import { IconChevronRight } from '@tabler/icons-react'
import type { EnhancedLeadData } from '@/lib/leads/types'
import { relativeTime, formatCurrency } from '@/lib/leads/utils'

function getDomain(url?: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`)
    return u.hostname
  } catch {
    return null
  }
}

interface LeadCardProps {
  lead: EnhancedLeadData
  onClick?: (lead: EnhancedLeadData) => void
  onAdvanceStage?: (leadId: string, event: React.MouseEvent) => void
}

function LeadCardInner({ lead, onClick, onAdvanceStage }: LeadCardProps) {
  const displayName = lead.prospect_name ?? lead.source_detail ?? `Lead ${lead.id.slice(0, 8)}`
  const canAdvance = lead.status !== 'converted' && lead.status !== 'lost'

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick?.(lead) }}
      role="button"
      tabIndex={0}
      aria-label={`${displayName}, ${lead.score} lead, ${lead.status} stage`}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(lead) } }}
      className="group relative flex items-center gap-3 rounded-lg bg-card px-3 py-2 cursor-grab select-none transition-all hover:bg-secondary active:cursor-grabbing"
    >
      {/* Company icon */}
      {(() => {
        const domain = getDomain(lead.prospect_website) ?? lead.prospect_domain
        if (domain) {
          return (
            <img
              src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
              alt=""
              className="h-5 w-5 shrink-0 rounded"
              loading="lazy"
            />
          )
        }
        return (
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-secondary text-[10px] font-medium text-muted-foreground">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )
      })()}

      {/* Main content — compact 2-line */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium text-foreground">{displayName}</span>
          {lead.estimated_value != null && lead.estimated_value > 0 && (
            <span className="shrink-0 font-mono text-sm text-muted-foreground">
              {formatCurrency(lead.estimated_value)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {lead.outreach_angle && (
            <span className="truncate">{lead.outreach_angle}</span>
          )}
          {!lead.outreach_angle && lead.source_channel && (
            <span className="truncate capitalize">{lead.source_channel}</span>
          )}
          <span className="shrink-0">{relativeTime(lead.updated_at)}</span>
        </div>
      </div>

      {/* Advance button — visible on hover */}
      {canAdvance && onAdvanceStage && (
        <button
          onClick={(e) => { e.stopPropagation(); onAdvanceStage(lead.id, e) }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
          aria-label="Advance to next stage"
        >
          <IconChevronRight size={16} />
        </button>
      )}
    </div>
  )
}

export const LeadCard = memo(LeadCardInner)
