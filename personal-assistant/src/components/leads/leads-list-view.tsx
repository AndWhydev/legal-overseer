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
import { formatCurrency, relativeTime } from '@/lib/leads/utils'


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
}

function LeadsListViewInner({ leads, onSelectLead }: LeadsListViewProps) {
  return (
    <Table aria-label="Leads list">
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead className="text-right">Score</TableHead>
          <TableHead className="text-right">Value</TableHead>
          <TableHead className="text-right">Status</TableHead>
          <TableHead className="text-right">Activity</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.map((lead) => {
          const displayName = lead.prospect_name ?? lead.source_detail ?? `Lead ${lead.id.slice(0, 8)}`

          return (
            <TableRow
              key={lead.id}
              className="cursor-pointer"
              onClick={() => onSelectLead(lead)}
            >
              <TableCell className="font-medium">
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
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-secondary text-sm text-muted-foreground">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                    )
                  })()}
                  <span>{displayName}</span>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Badge variant={SCORE_VARIANT[lead.score] ?? 'secondary'}>
                  {lead.score}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(lead.estimated_value)}</TableCell>
              <TableCell className="text-right capitalize">{lead.status}</TableCell>
              <TableCell className="text-right text-muted-foreground">
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
