'use client'

import React, { useState, useCallback, memo } from 'react'
import { IconArrowRight, IconMail, IconChevronDown } from '@tabler/icons-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { EnhancedLeadData, LeadStatus } from '@/lib/leads/types'
import { formatCurrency, relativeTime } from '@/lib/leads/utils'
import { ScoreBreakdownPanel } from './score-breakdown-panel'
import { OutreachIntelPanel } from './outreach-intel-panel'
import { WebsiteSignalsPanel } from './website-signals-panel'
import { NextActionPanel } from './next-action-panel'

const SCORE_VARIANT = {
  hot: 'destructive',
  warm: 'default',
  cold: 'secondary',
} as const

const PROGRESS_STAGES: Array<{ status: LeadStatus; label: string }> = [
  { status: 'new', label: 'New' },
  { status: 'qualified', label: 'Qualified' },
  { status: 'booked', label: 'Booked' },
  { status: 'converted', label: 'Won' },
]

interface LeadsListViewProps {
  leads: EnhancedLeadData[]
  onSelectLead: (lead: EnhancedLeadData) => void
  onAdvanceStage: (leadId: string, event: React.MouseEvent) => void
}

const LeadDetailPanel = memo(function LeadDetailPanel({ lead, onAdvanceStage }: { lead: EnhancedLeadData; onAdvanceStage: (id: string, e: React.MouseEvent) => void }) {
  const hasDiscovery = lead.fit_score != null
  const stageIdx = PROGRESS_STAGES.findIndex(s => s.status === lead.status)
  const isLost = lead.status === 'lost'

  return (
    <div className="space-y-4 border-t bg-muted/30 p-5">
      {/* Progress bar */}
      <div className="flex items-center gap-1" role="progressbar" aria-label="Lead stage progress">
        {PROGRESS_STAGES.map((stage, i) => (
          <div key={stage.status} className="flex flex-1 flex-col items-center gap-1">
            <Progress
              value={isLost ? 100 : (i <= stageIdx ? 100 : 0)}
              className={cn('h-0.5', isLost && '[&>[data-slot=progress-indicator]]:bg-muted-foreground')}
            />
            <span className={cn(
              'text-xs font-medium',
              i <= stageIdx ? 'text-foreground' : 'text-muted-foreground'
            )}>
              {stage.label}
            </span>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      {lead.status !== 'converted' && lead.status !== 'lost' && (
        <div className="flex gap-2">
          <Button onClick={(e) => onAdvanceStage(lead.id, e)}>
            <IconArrowRight data-icon /> Advance Stage
          </Button>
        </div>
      )}

      {/* Score & Outreach panels */}
      {hasDiscovery && <ScoreBreakdownPanel fitScore={lead.fit_score!} opportunityScore={lead.opportunity_score!} fitBreakdown={lead.fit_breakdown} opportunityBreakdown={lead.opportunity_breakdown} />}
      {hasDiscovery && <OutreachIntelPanel opportunityNotes={lead.opportunity_notes} outreachAngle={lead.outreach_angle} priorityServices={lead.priority_services} />}
      {lead.website_signals && <WebsiteSignalsPanel signals={lead.website_signals} />}

      {/* Next action */}
      {(lead.next_action || lead.next_action_at) && (
        <NextActionPanel nextAction={lead.next_action} nextActionAt={lead.next_action_at} onSave={() => {}} />
      )}

      {/* Contact */}
      {(lead.prospect_phone || (lead.prospect_emails && lead.prospect_emails.length > 0)) && (
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Contact</h4>
          {lead.prospect_phone && (
            <div className="text-sm text-muted-foreground">
              Phone: <span className="text-foreground">{lead.prospect_phone}</span>
            </div>
          )}
          {lead.prospect_emails?.map(em => (
            <div key={em} className="text-sm text-muted-foreground">
              Email: <span className="text-foreground">{em}</span>
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      {lead.notes && (
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Notes</h4>
          <div className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground leading-relaxed">
            {lead.notes}
          </div>
        </div>
      )}
    </div>
  )
})

function LeadsListViewInner({ leads, onSelectLead: _onSelectLead, onAdvanceStage }: LeadsListViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const toggle = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id)
  }, [])

  return (
    <Table aria-label="Leads list">
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead className="text-right">Score</TableHead>
          <TableHead className="text-right">Value</TableHead>
          <TableHead className="text-right">Status</TableHead>
          <TableHead className="text-right">Activity</TableHead>
          <TableHead className="w-8" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.map((lead) => {
          const displayName = lead.prospect_name ?? lead.source_detail ?? `Lead ${lead.id.slice(0, 8)}`
          const expanded = expandedId === lead.id

          return (
            <React.Fragment key={lead.id}>
              <TableRow
                className="cursor-pointer"
                onClick={() => toggle(lead.id)}
                data-state={expanded ? 'selected' : undefined}
              >
                <TableCell className="font-medium">{displayName}</TableCell>
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
                <TableCell>
                  <IconChevronDown
                    data-icon
                    className={cn(
                      'text-muted-foreground transition-transform',
                      expanded && 'rotate-180'
                    )}
                  />
                </TableCell>
              </TableRow>
              {expanded && (
                <tr>
                  <td colSpan={6} className="p-0">
                    <LeadDetailPanel lead={lead} onAdvanceStage={onAdvanceStage} />
                  </td>
                </tr>
              )}
            </React.Fragment>
          )
        })}
      </TableBody>
    </Table>
  )
}

export const LeadsListView = memo(LeadsListViewInner)
