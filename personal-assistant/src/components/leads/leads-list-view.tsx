'use client'

import React, { memo } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import type { EnhancedLeadData } from '@/lib/leads/types'
import { relativeTime } from '@/lib/leads/utils'
import { cn } from '@/lib/utils'


function getDomain(url?: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`)
    return u.hostname
  } catch {
    return null
  }
}

const SCORE_VARIANT = {
  hot: 'destructive',
  warm: 'default',
  cold: 'secondary',
} as const

interface LeadsListViewProps {
  leads: EnhancedLeadData[]
  onSelectLead: (lead: EnhancedLeadData) => void
  onAdvanceStage: (leadId: string, event: React.MouseEvent) => void
  selectedLeadId?: string | null
  onDeselectLead?: () => void
}

function LeadsListViewInner({ leads, onSelectLead, selectedLeadId, onDeselectLead }: LeadsListViewProps) {
  return (
      <Table className="border-separate border-spacing-y-1" aria-label="Leads list">
        <TableHeader>
          <TableRow className="border-0 hover:bg-transparent">
            <TableHead>Name</TableHead>
            <TableHead className="text-right">Score</TableHead>
            <TableHead className="text-right">Activity</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => {
            const displayName = lead.prospect_name ?? lead.source_detail ?? `Lead ${lead.id.slice(0, 8)}`
            const isSelected = selectedLeadId === lead.id

            return (
              <TableRow
                key={lead.id}
                className={cn(
                  "cursor-pointer border-0 transition-colors hover:bg-secondary",
                  isSelected && "bg-secondary"
                )}
                onClick={() => {
                  if (isSelected) {
                    onDeselectLead?.()
                  } else {
                    onSelectLead(lead)
                  }
                }}
              >
                <TableCell className="rounded-l-[var(--radius-md)] font-medium">
                  <div className="flex items-center gap-2">
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
                    <span className="truncate">{displayName}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant={SCORE_VARIANT[lead.score] ?? 'secondary'} className="text-[12px]">
                    {lead.score}
                  </Badge>
                </TableCell>
                <TableCell className="rounded-r-[var(--radius-md)] text-right text-[12px] text-muted-foreground">
                  {lead.last_activity_at ? relativeTime(lead.last_activity_at) : '--'}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
  )
}

export const LeadsListView = memo(LeadsListViewInner)
