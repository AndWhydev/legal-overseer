'use client'

import { memo } from 'react'
import { IconX } from '@tabler/icons-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Task } from '@/lib/types'

interface KanbanCardProps {
  task: Task
  onEdit?: (task: Task) => void
  onArchive?: (task: Task) => void
}

const PRIORITY_BADGE_VARIANT: Record<string, 'destructive' | 'secondary' | 'outline'> = {
  critical: 'destructive',
  high: 'secondary',
  medium: 'outline',
  low: 'outline',
}

const SOURCE_LABELS: Record<string, string> = {
  bitbit: 'BitBit',
  email: 'Email',
  slack: 'Slack',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function getDeadlineInfo(deadline: string) {
  const due = new Date(deadline).getTime()
  if (Number.isNaN(due)) {
    return {
      label: deadline,
      variant: 'outline' as const,
      className: '',
    }
  }

  const diffDays = (due - Date.now()) / 86_400_000
  const label = new Date(deadline).toLocaleDateString('en-AU', {
    month: 'short',
    day: 'numeric',
  })

  if (diffDays < 0) {
    return {
      label: `Overdue ${label}`,
      variant: 'destructive' as const,
      className: '',
    }
  }

  if (diffDays <= 2) {
    return {
      label: `Due ${label}`,
      variant: 'outline' as const,
      className:
        'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    }
  }

  return {
    label: `Due ${label}`,
    variant: 'outline' as const,
    className: '',
  }
}

function getAgentStatusLabel(status: string | undefined) {
  if (status === 'working') return 'Working'
  if (status === 'done') return 'Complete'
  if (status === 'error') return 'Needs attention'
  return 'Assigned'
}

export const KanbanCard = memo(function KanbanCard({ task, onEdit, onArchive }: KanbanCardProps) {
  const meta = (task.metadata || {}) as Record<string, unknown>
  const tags = ((meta.tags as string[]) || []).filter(Boolean)
  const agentStatus = meta.agentStatus as 'working' | 'done' | 'error' | undefined
  const source = meta.source as string | undefined
  const deadline = meta.deadline as string | undefined
  const isOptimistic = task.id.startsWith('temp-')
  const isAgentCreated = source === 'bitbit'
  const isAgentWorking = Boolean(task.assigned_to && agentStatus === 'working')
  const isOverlay = task.id === '_overlay_'
  const sourceLabel = source ? (SOURCE_LABELS[source] ?? source) : null
  const deadlineInfo = deadline ? getDeadlineInfo(deadline) : null
  const visibleTags = tags.slice(0, 2)
  const extraTagCount = tags.length - visibleTags.length

  function handleOpen() {
    if (!isOverlay) {
      onEdit?.(task)
    }
  }

  return (
    <article
      role={isOverlay ? undefined : 'button'}
      tabIndex={isOverlay ? -1 : 0}
      aria-label={isOverlay ? undefined : `Open task ${task.title}`}
      className={cn(
        'group relative rounded-2xl border border-border/70 bg-card/95 p-4 text-left shadow-[0_14px_32px_-24px_rgba(0,0,0,0.7)] transition duration-200',
        'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        !isOverlay && 'cursor-pointer hover:-translate-y-0.5 hover:border-border hover:shadow-[0_18px_36px_-24px_rgba(0,0,0,0.75)]',
        isOptimistic && 'opacity-70',
        isAgentWorking && 'border-emerald-500/25 bg-emerald-500/5',
      )}
      onClick={handleOpen}
      onKeyDown={(event) => {
        if (isOverlay) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handleOpen()
        }
      }}
      style={{ contain: 'layout style' }}
    >
      {onArchive && !isOverlay && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={(event) => {
            event.stopPropagation()
            onArchive(task)
          }}
          className="absolute right-3 top-3 text-muted-foreground/70 hover:text-foreground"
          aria-label={`Archive ${task.title}`}
        >
          <IconX data-icon className="size-3.5" />
        </Button>
      )}

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 pr-8">
          {sourceLabel && (
            <Badge
              variant={isAgentCreated ? 'secondary' : 'outline'}
              className={cn(
                'max-w-full truncate',
                isAgentCreated && 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
              )}
            >
              {sourceLabel}
            </Badge>
          )}

          {isAgentWorking && (
            <Badge className="bg-emerald-500/90 text-white">
              Live
            </Badge>
          )}

          {isOptimistic && (
            <Badge variant="outline" className="border-dashed">
              Saving
            </Badge>
          )}
        </div>

        <div className="space-y-1.5">
          <h4 className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">
            {task.title}
          </h4>

          {task.description && (
            <p className="line-clamp-3 text-sm leading-5 text-muted-foreground">
              {task.description}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={PRIORITY_BADGE_VARIANT[task.priority] ?? 'outline'}>
            {task.priority}
          </Badge>

          {visibleTags.map((tag) => (
            <Badge key={tag} variant="outline" className="max-w-[10rem] truncate">
              {tag}
            </Badge>
          ))}

          {extraTagCount > 0 && (
            <Badge variant="outline">
              +{extraTagCount}
            </Badge>
          )}

          {deadlineInfo && (
            <Badge variant={deadlineInfo.variant} className={deadlineInfo.className}>
              {deadlineInfo.label}
            </Badge>
          )}
        </div>

        {task.assigned_to && (
          <div className="rounded-xl border border-border/60 bg-muted/35 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={cn(
                  'size-2 rounded-full',
                  agentStatus === 'error'
                    ? 'bg-destructive'
                    : agentStatus === 'done'
                      ? 'bg-emerald-500'
                      : 'animate-pulse bg-emerald-500',
                )}
              />
              <span className="font-medium text-foreground">{task.assigned_to}</span>
              <span className="text-muted-foreground">{getAgentStatusLabel(agentStatus)}</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="truncate">
            {isAgentCreated ? 'Created by BitBit' : sourceLabel ? `From ${sourceLabel}` : 'Created manually'}
          </span>
          <span className="shrink-0">
            {timeAgo(task.updated_at)}
          </span>
        </div>
      </div>
    </article>
  )
})
