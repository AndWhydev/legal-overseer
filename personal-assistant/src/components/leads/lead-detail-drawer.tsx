'use client'

import React, { memo } from 'react'
import {
  IconExternalLink,
  IconArrowRight,
  IconMail,
  IconCalendar,
  IconCircleX,
  IconX,
} from '@tabler/icons-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { EnhancedLeadData, LeadStatus } from '@/lib/leads/types'
import { formatCurrency, formatSpeedToLead, relativeTime } from '@/lib/leads/utils'
import { ScoreBreakdownPanel } from './score-breakdown-panel'
import { OutreachIntelPanel } from './outreach-intel-panel'
import { WebsiteSignalsPanel } from './website-signals-panel'
import { NextActionPanel } from './next-action-panel'

interface LeadDetailDrawerProps {
  lead: EnhancedLeadData | null
  open: boolean
  onClose: () => void
  onUpdate: (leadId: string, patch: Record<string, unknown>) => void
  onAdvanceStage?: (leadId: string, event: React.MouseEvent) => void
}

const SCORE_VARIANT = {
  hot: 'destructive',
  warm: 'default',
  cold: 'secondary',
} as const

const STATUS_OPTIONS: LeadStatus[] = ['new', 'qualified', 'booked', 'converted', 'lost']

const PROGRESS_STAGES: Array<{ status: LeadStatus; label: string }> = [
  { status: 'new', label: 'New' },
  { status: 'qualified', label: 'Qualified' },
  { status: 'booked', label: 'Booked' },
  { status: 'converted', label: 'Won' },
]

const TimelineEntry = memo(function TimelineEntry({ label, date }: { label: string; date: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <div className="mt-1 size-2 shrink-0 rounded-full bg-border" />
      <div>
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="ml-2 text-sm text-muted-foreground">{relativeTime(date)}</span>
      </div>
    </div>
  )
})

function LeadDetailDrawerInner({ lead, onClose, onUpdate, onAdvanceStage }: LeadDetailDrawerProps) {
  if (!lead) return null

  const displayName = lead.prospect_name ?? lead.source_detail ?? `Lead ${lead.id.slice(0, 8)}`
  const hasDiscoveryData = lead.fit_score != null
  const stageIdx = PROGRESS_STAGES.findIndex(s => s.status === lead.status)
  const isLost = lead.status === 'lost'

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-base font-medium text-foreground">{displayName}</h2>
        <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground">
          <IconX size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Status & Meta */}
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={lead.status}
            onValueChange={(val) => onUpdate(lead.id, { status: val })}
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Badge variant={SCORE_VARIANT[lead.score] ?? 'secondary'}>
            {lead.score}
          </Badge>

          {lead.prospect_website && (
            <a
              href={lead.prospect_website.startsWith('http') ? lead.prospect_website : `https://${lead.prospect_website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-foreground hover:underline"
            >
              <IconExternalLink data-icon />
              {lead.prospect_domain ?? 'Website'}
            </a>
          )}
        </div>

        {/* Quick stats */}
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>Value: <strong className="font-medium text-foreground">{formatCurrency(lead.estimated_value)}</strong></span>
          <span>Speed: <strong className="font-medium text-foreground">{formatSpeedToLead(lead.created_at, lead.first_ack_at)}</strong></span>
          <span>Activity: <strong className="font-medium text-foreground">{lead.last_activity_at ? relativeTime(lead.last_activity_at) : '--'}</strong></span>
        </div>

        {/* Quick Action Bar */}
        <div className="flex flex-wrap gap-2">
          {lead.status !== 'converted' && lead.status !== 'lost' && (
            <Button onClick={(e) => onAdvanceStage?.(lead.id, e)}>
              <IconArrowRight data-icon /> Advance Stage
            </Button>
          )}
          <Button variant="outline">
            <IconMail data-icon /> Email
          </Button>
          <Button variant="outline">
            <IconCalendar data-icon /> Schedule
          </Button>
          {lead.status !== 'converted' && lead.status !== 'lost' && (
            <Button
              variant="destructive"
              onClick={() => onUpdate(lead.id, { status: 'lost' })}
            >
              <IconCircleX data-icon /> Mark Lost
            </Button>
          )}
        </div>

        {/* Status Progress Bar */}
        <div className="flex items-center gap-1" role="progressbar" aria-label="Pipeline progress">
          {PROGRESS_STAGES.map((stage, i) => (
            <div key={stage.status} className="flex flex-1 flex-col items-center gap-1">
              <Progress
                value={isLost ? 100 : (i <= stageIdx ? 100 : 0)}
                className={cn('h-0.5', isLost && '[&>[data-slot=progress-indicator]]:bg-muted-foreground')}
              />
              <span className={cn(
                'text-sm font-medium',
                i <= stageIdx ? 'text-foreground' : 'text-muted-foreground'
              )}>
                {stage.label}
              </span>
            </div>
          ))}
        </div>

        {/* Score Breakdown */}
        {hasDiscoveryData && (
          <ScoreBreakdownPanel
            fitScore={lead.fit_score!}
            opportunityScore={lead.opportunity_score!}
            fitBreakdown={lead.fit_breakdown}
            opportunityBreakdown={lead.opportunity_breakdown}
          />
        )}

        {/* Outreach Intelligence */}
        {hasDiscoveryData && (
          <OutreachIntelPanel
            opportunityNotes={lead.opportunity_notes}
            outreachAngle={lead.outreach_angle}
            priorityServices={lead.priority_services}
          />
        )}

        {/* Website Signals */}
        {lead.website_signals && (
          <WebsiteSignalsPanel signals={lead.website_signals} />
        )}

        <Separator />

        {/* Next Action */}
        <NextActionPanel
          nextAction={lead.next_action}
          nextActionAt={lead.next_action_at}
          onSave={(action, date) => {
            onUpdate(lead.id, {
              next_action: action,
              next_action_at: date ? new Date(date).toISOString() : null,
            })
          }}
        />

        {/* Contact Info */}
        {(lead.prospect_phone || (lead.prospect_emails && lead.prospect_emails.length > 0)) && (
          <div>
            <h4 className="mb-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">Contact</h4>
            {lead.prospect_phone && (
              <div className="text-sm text-muted-foreground">
                Phone: <span className="text-foreground">{lead.prospect_phone}</span>
              </div>
            )}
            {lead.prospect_emails?.map((email) => (
              <div key={email} className="text-sm text-muted-foreground">
                Email: <span className="text-foreground">{email}</span>
              </div>
            ))}
            {lead.prospect_address && (
              <div className="text-sm text-muted-foreground">
                Address: <span className="text-foreground">{lead.prospect_address}</span>
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        {lead.notes && (
          <div>
            <h4 className="mb-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">Notes</h4>
            <div className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm text-muted-foreground leading-relaxed">
              {lead.notes}
            </div>
          </div>
        )}

        {/* Service Interest */}
        {lead.service_interest && lead.service_interest.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">Services</h4>
            <div className="flex flex-wrap gap-1.5">
              {lead.service_interest.map((s) => (
                <Badge key={s} variant="outline">{s}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Activity Timeline */}
        <div>
          <h4 className="mb-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">Timeline</h4>
          <div className="space-y-2 border-l-2 border-border pl-3">
            <TimelineEntry label="Created" date={lead.created_at} />
            {lead.first_ack_at && <TimelineEntry label="First acknowledged" date={lead.first_ack_at} />}
            {lead.last_activity_at && lead.last_activity_at !== lead.created_at && (
              <TimelineEntry label="Last activity" date={lead.last_activity_at} />
            )}
          </div>
        </div>

        {/* Lead ID */}
        <div className="pt-2 text-sm text-muted-foreground">
          ID: {lead.id}
        </div>
      </div>
    </div>
  )
}

export const LeadDetailDrawer = memo(LeadDetailDrawerInner)
