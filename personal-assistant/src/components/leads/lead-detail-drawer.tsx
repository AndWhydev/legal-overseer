'use client'

import React, { memo } from 'react'
import {
  IconExternalLink,
  IconArrowRight,
  IconMail,
  IconCalendar,
  IconCircleX,
  IconLayoutSidebarRight,
  IconPhone,
  IconMapPin,
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
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import type { EnhancedLeadData, LeadStatus } from '@/lib/leads/types'
import { formatCurrency, formatSpeedToLead, relativeTime } from '@/lib/leads/utils'
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

function getDomain(url?: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`)
    return u.hostname
  } catch {
    return null
  }
}

function LeadDetailDrawerInner({ lead, onClose, onUpdate, onAdvanceStage }: LeadDetailDrawerProps) {
  if (!lead) return null

  const displayName = lead.prospect_name ?? lead.source_detail ?? `Lead ${lead.id.slice(0, 8)}`
  const hasDiscoveryData = lead.fit_score != null
  const domain = getDomain(lead.prospect_website) ?? lead.prospect_domain
  const hasContact = lead.prospect_phone || (lead.prospect_emails && lead.prospect_emails.length > 0) || lead.prospect_address

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        {domain ? (
          <img
            src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
            alt=""
            className="h-6 w-6 shrink-0 rounded"
          />
        ) : (
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-secondary text-[10px] font-medium text-muted-foreground">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}

        {lead.prospect_website ? (
          <a
            href={lead.prospect_website.startsWith('http') ? lead.prospect_website : `https://${lead.prospect_website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-base font-medium text-foreground hover:underline"
          >
            <span className="truncate">{displayName}</span>
            <IconExternalLink size={14} className="shrink-0" />
          </a>
        ) : (
          <h2 className="min-w-0 flex-1 truncate text-base font-medium text-foreground">{displayName}</h2>
        )}

        <Badge variant={SCORE_VARIANT[lead.score] ?? 'secondary'} className="shrink-0 text-[12px]">
          {lead.score}
        </Badge>

        <button onClick={onClose} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-muted-foreground hover:bg-secondary hover:text-foreground">
          <IconLayoutSidebarRight size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4">

        {/* At a glance */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-[12px] text-muted-foreground">Value</div>
            <div className="text-base font-medium text-foreground">{formatCurrency(lead.estimated_value)}</div>
          </div>
          <div>
            <div className="text-[12px] text-muted-foreground">Speed</div>
            <div className="text-base font-medium text-foreground">{formatSpeedToLead(lead.created_at, lead.first_ack_at)}</div>
          </div>
          <div>
            <div className="text-[12px] text-muted-foreground">Activity</div>
            <div className="text-base font-medium text-foreground">{lead.last_activity_at ? relativeTime(lead.last_activity_at) : '--'}</div>
          </div>
        </div>

        {/* Outreach angle — key actionable insight */}
        {lead.outreach_angle && (
          <div className="rounded-[var(--radius-md)] bg-secondary p-3">
            <div className="text-[12px] text-muted-foreground">Suggested approach</div>
            <div className="text-base text-foreground">{lead.outreach_angle}</div>
          </div>
        )}

        {/* Status */}
        <Select
          value={lead.status}
          onValueChange={(val) => onUpdate(lead.id, { status: val })}
        >
          <SelectTrigger size="sm" className="h-8 w-auto">
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

        {/* Actions */}
        <div className="flex flex-wrap gap-1.5">
          {lead.status !== 'converted' && lead.status !== 'lost' && (
            <Button size="sm" onClick={(e) => onAdvanceStage?.(lead.id, e)}>
              <IconArrowRight data-icon /> Advance
            </Button>
          )}
          <Button size="sm" variant="outline">
            <IconMail data-icon /> Email
          </Button>
          <Button size="sm" variant="outline">
            <IconCalendar data-icon /> Schedule
          </Button>
          {lead.status !== 'converted' && lead.status !== 'lost' && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => onUpdate(lead.id, { status: 'lost' })}
            >
              <IconCircleX data-icon /> Lost
            </Button>
          )}
        </div>

        <Separator />

        {/* Intelligence — scores + signals combined */}
        {hasDiscoveryData && (
          <>
            <div className="space-y-3">
              <h4 className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Intelligence</h4>

              {/* Score gauges */}
              <div className="flex gap-4">
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12px] text-muted-foreground">Fit</span>
                    <span className="text-base font-medium text-foreground">{lead.fit_score}</span>
                  </div>
                  <Progress value={Math.min(lead.fit_score!, 100)} className="h-1" />
                </div>
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12px] text-muted-foreground">Opportunity</span>
                    <span className="text-base font-medium text-foreground">{lead.opportunity_score}</span>
                  </div>
                  <Progress value={Math.min(lead.opportunity_score!, 100)} className="h-1" />
                </div>
              </div>

              {/* Factor breakdown — compact */}
              {lead.fit_breakdown?.components?.length ? (
                <div className="space-y-0.5">
                  <div className="text-[12px] text-muted-foreground">Fit factors</div>
                  {lead.fit_breakdown.components.map((c, i) => (
                    <div key={i} className="flex items-center justify-between py-0.5">
                      <span className="text-base text-muted-foreground">{c.factor}</span>
                      <Badge variant="secondary" className="text-[12px] tabular-nums">
                        {c.points > 0 ? '+' : ''}{c.points}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : null}

              {lead.opportunity_breakdown?.components?.length ? (
                <div className="space-y-0.5">
                  <div className="text-[12px] text-muted-foreground">Opportunity factors</div>
                  {lead.opportunity_breakdown.components.map((c, i) => (
                    <div key={i} className="flex items-center justify-between py-0.5">
                      <span className="text-base text-muted-foreground">{c.factor}</span>
                      <Badge variant="secondary" className="text-[12px] tabular-nums">
                        {c.points > 0 ? '+' : ''}{c.points}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Opportunity notes inline */}
              {lead.opportunity_notes && (
                <div className="space-y-1.5">
                  {lead.opportunity_notes.split(';').map((n) => n.trim()).filter(Boolean).map((n, i) => {
                    const colonIdx = n.indexOf(':')
                    const category = colonIdx > 0 && colonIdx < 20 ? n.substring(0, colonIdx).trim() : null
                    const note = category ? n.substring(colonIdx + 1).trim() : n
                    return (
                      <div key={i} className="flex items-start gap-2">
                        {category && <Badge variant="secondary" className="mt-0.5 shrink-0 text-[12px]">{category}</Badge>}
                        <span className="text-base text-muted-foreground">{note}</span>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Priority services */}
              {lead.priority_services && lead.priority_services.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {lead.priority_services.map((s) => (
                    <Badge key={s} variant="outline" className="text-[12px]">{s}</Badge>
                  ))}
                </div>
              )}
            </div>

            <Separator />
          </>
        )}

        {/* Website Signals */}
        {lead.website_signals && (
          <>
            <WebsiteSignalsPanel signals={lead.website_signals} />
            <Separator />
          </>
        )}

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

        <Separator />

        {/* Details — contact + notes + services + timeline merged */}
        <div className="space-y-3">
          <h4 className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Details</h4>

          {/* Contact */}
          {hasContact && (
            <div className="space-y-1">
              {lead.prospect_emails?.map((email) => (
                <div key={email} className="flex items-center gap-2 text-base">
                  <IconMail size={14} className="shrink-0 text-muted-foreground" />
                  <span className="text-foreground">{email}</span>
                </div>
              ))}
              {lead.prospect_phone && (
                <div className="flex items-center gap-2 text-base">
                  <IconPhone size={14} className="shrink-0 text-muted-foreground" />
                  <span className="text-foreground">{lead.prospect_phone}</span>
                </div>
              )}
              {lead.prospect_address && (
                <div className="flex items-center gap-2 text-base">
                  <IconMapPin size={14} className="shrink-0 text-muted-foreground" />
                  <span className="text-foreground">{lead.prospect_address}</span>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          {lead.notes && (
            <div className="whitespace-pre-wrap rounded-[var(--radius-md)] bg-secondary p-3 text-base text-muted-foreground leading-relaxed">
              {lead.notes}
            </div>
          )}

          {/* Services */}
          {lead.service_interest && lead.service_interest.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {lead.service_interest.map((s) => (
                <Badge key={s} variant="outline" className="text-[12px]">{s}</Badge>
              ))}
            </div>
          )}

          {/* Timeline */}
          <div className="space-y-1 border-l-2 border-border pl-3">
            <div className="flex items-baseline gap-2">
              <span className="text-base text-muted-foreground">Created</span>
              <span className="text-[12px] text-muted-foreground">{relativeTime(lead.created_at)}</span>
            </div>
            {lead.first_ack_at && (
              <div className="flex items-baseline gap-2">
                <span className="text-base text-muted-foreground">Acknowledged</span>
                <span className="text-[12px] text-muted-foreground">{relativeTime(lead.first_ack_at)}</span>
              </div>
            )}
            {lead.last_activity_at && lead.last_activity_at !== lead.created_at && (
              <div className="flex items-baseline gap-2">
                <span className="text-base text-muted-foreground">Last activity</span>
                <span className="text-[12px] text-muted-foreground">{relativeTime(lead.last_activity_at)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Lead ID */}
        <div className="text-[12px] text-muted-foreground">
          {lead.id}
        </div>
      </div>
    </div>
  )
}

export const LeadDetailDrawer = memo(LeadDetailDrawerInner)
