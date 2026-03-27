'use client'

import { IconLoader2 } from '@tabler/icons-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export interface ApprovalItem {
  id: string
  action_summary: string
  action_type: string
  confidence_score: number
  routing_decision: 'ask' | 'escalate'
  priority: 'urgent' | 'normal' | 'low'
  created_at: string
  context_snapshot: Record<string, unknown>
  agent_name?: string | null
}

interface ApprovalCardProps {
  approval: ApprovalItem
  isResolving?: boolean
  onApprove: (approvalId: string) => void
  onReject: (approvalId: string) => void
}

const relTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

function formatRelativeTime(timestamp: string): string {
  const createdAt = new Date(timestamp).getTime()
  const deltaSec = Math.round((createdAt - Date.now()) / 1000)
  const absSec = Math.abs(deltaSec)

  if (absSec < 60) return relTime.format(deltaSec, 'second')

  const deltaMin = Math.round(deltaSec / 60)
  if (Math.abs(deltaMin) < 60) return relTime.format(deltaMin, 'minute')

  const deltaHour = Math.round(deltaMin / 60)
  if (Math.abs(deltaHour) < 24) return relTime.format(deltaHour, 'hour')

  const deltaDay = Math.round(deltaHour / 24)
  return relTime.format(deltaDay, 'day')
}

function getConfidenceVariant(confidence: number): 'destructive' | 'outline' | 'default' {
  if (confidence < 0.55) return 'destructive'
  if (confidence <= 0.85) return 'outline'
  return 'default'
}

function getPriorityVariant(priority: ApprovalItem['priority']): 'destructive' | 'outline' | 'secondary' {
  if (priority === 'urgent') return 'destructive'
  if (priority === 'normal') return 'outline'
  return 'secondary'
}

function toPrettyLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function extractContext(approval: ApprovalItem): Array<{ label: string; value: string }> {
  const snapshot = approval.context_snapshot ?? {}

  const candidates: Array<[string, unknown]> = [
    ['Contact', snapshot.contact_name ?? snapshot.contactName],
    ['Project', snapshot.project_name ?? snapshot.projectName ?? snapshot.project],
    ['Amount', snapshot.amount_formatted ?? snapshot.amount],
    ['Invoice', snapshot.invoice_number ?? snapshot.invoiceNumber],
  ]

  return candidates
    .filter(([, value]) => value !== undefined && value !== null && `${value}`.trim().length > 0)
    .map(([label, value]) => ({ label, value: String(value) }))
}

export function ApprovalCard({ approval, isResolving = false, onApprove, onReject }: ApprovalCardProps) {
  const contextRows = extractContext(approval)
  const confidencePct = Math.round(approval.confidence_score * 100)

  return (
    <Card className="transition-colors hover:bg-muted/30">
      <CardContent className="flex flex-col gap-3 p-5">
        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{approval.agent_name ?? 'Agent'}</Badge>
          <Badge variant={getConfidenceVariant(approval.confidence_score)}>
            {confidencePct}% confidence
          </Badge>
          <Badge variant={getPriorityVariant(approval.priority)}>
            {toPrettyLabel(approval.priority)}
          </Badge>
          <Badge variant="secondary">{toPrettyLabel(approval.routing_decision)}</Badge>
        </div>

        {/* Title */}
        <div>
          <p className="text-base font-medium leading-snug text-foreground">
            {approval.action_summary}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {toPrettyLabel(approval.action_type)} · {formatRelativeTime(approval.created_at)}
          </p>
        </div>

        {/* Context */}
        {contextRows.length > 0 && (
          <div className="border-t border-border pt-3">
            <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Context
            </span>
            <dl className="grid gap-2">
              {contextRows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-2">
                  <dt className="text-sm text-muted-foreground">{row.label}</dt>
                  <dd className="text-right text-sm font-medium text-foreground">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button
            className="flex-1"
            disabled={isResolving}
            onClick={() => onApprove(approval.id)}
          >
            {isResolving && <IconLoader2 className="size-4 animate-spin" />}
            Approve
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            disabled={isResolving}
            onClick={() => onReject(approval.id)}
          >
            {isResolving && <IconLoader2 className="size-4 animate-spin" />}
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
