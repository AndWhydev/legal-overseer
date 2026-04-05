'use client'

import React, { memo } from 'react'
import type { EnhancedLeadData } from '@/lib/leads/types'
import { relativeTime } from '@/lib/leads/utils'

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

function LeadCardInner({ lead, onClick }: LeadCardProps) {
  const displayName = lead.prospect_name ?? lead.source_detail ?? `Lead ${lead.id.slice(0, 8)}`

  const faviconElement = (() => {
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
  })()

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick?.(lead) }}
      role="button"
      tabIndex={0}
      aria-label={`${displayName}, ${lead.score} lead`}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(lead) } }}
      className="group flex cursor-grab select-none items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 transition-colors hover:bg-secondary active:cursor-grabbing"
    >
      {faviconElement}

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-1">
          <span className="truncate text-sm font-medium text-foreground">{displayName}</span>
          <span className="shrink-0 text-[12px] text-muted-foreground">{relativeTime(lead.updated_at)}</span>
        </div>
        {lead.outreach_angle && (
          <p className="truncate text-[12px] text-muted-foreground">{lead.outreach_angle}</p>
        )}
      </div>
    </div>
  )
}

export const LeadCard = memo(LeadCardInner)
