'use client'

import React, { memo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { EnhancedLeadData } from '@/lib/leads/types'
import { relativeTime } from '@/lib/leads/utils'

interface LeadCardProps {
  lead: EnhancedLeadData
  onClick?: (lead: EnhancedLeadData) => void
  onAdvanceStage?: (leadId: string, event: React.MouseEvent) => void
}

const SCORE_VARIANT = {
  hot: 'destructive',
  warm: 'default',
  cold: 'secondary',
} as const

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
    <Card
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.(lead)
      }}
      role="button"
      tabIndex={0}
      aria-label={`${displayName}, ${lead.score} lead, ${lead.status} stage`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.(lead)
        }
      }}
      className={cn(
        'cursor-grab gap-2 py-3 transition-shadow hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing',
        isDragging && 'opacity-50'
      )}
      style={dndStyle}
    >
      <CardContent className="space-y-2">
        {/* Company name */}
        <h4 className="line-clamp-2 text-sm font-medium text-foreground">
          {displayName}
        </h4>

        {/* Outreach angle */}
        {lead.outreach_angle && (
          <p className="line-clamp-2 text-xs italic text-muted-foreground">
            &ldquo;{lead.outreach_angle}&rdquo;
          </p>
        )}

        {/* Score badge + time */}
        <div className="flex items-center justify-between pt-1">
          <Badge variant={SCORE_VARIANT[lead.score] ?? 'secondary'}>
            {lead.score.charAt(0).toUpperCase() + lead.score.slice(1)}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {relativeTime(lead.updated_at)}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

export const LeadCard = memo(LeadCardInner)
