'use client'

import { memo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { IconX } from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import type { Task } from '@/lib/types'
import { MarkdownRenderer } from './markdown-renderer'

interface KanbanCardProps {
  task: Task
  onEdit?: (task: Task) => void
  onArchive?: (task: Task) => void
}

const priorityVariant: Record<string, 'destructive' | 'secondary' | 'outline'> = {
  critical: 'destructive',
  high: 'secondary',
  medium: 'outline',
  low: 'outline',
}

const sourceColors: Record<string, string> = {
  email: '#3B82F6',
  slack: '#E9A820',
  sms: '#22C55E',
  whatsapp: '#22C55E',
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

function getDeadlineInfo(deadline: string): { variant: 'destructive' | 'secondary' | 'outline'; label: string } | null {
  const now = Date.now()
  const due = new Date(deadline).getTime()
  const diffDays = (due - now) / 86_400_000

  const d = new Date(deadline)
  const label = d.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })

  if (diffDays < 0) return { variant: 'destructive', label }
  if (diffDays <= 2) return { variant: 'secondary', label }
  return { variant: 'outline', label }
}

export const KanbanCard = memo(function KanbanCard({ task, onEdit, onArchive }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const dndStyle = {
    transform: CSS.Translate.toString(transform),
    transition,
  }

  const meta = (task.metadata || {}) as Record<string, unknown>
  const tags = (meta.tags as string[]) || []
  const agentStatus = meta.agentStatus as 'working' | 'done' | 'error' | undefined
  const source = meta.source as string | undefined
  const deadline = meta.deadline as string | undefined
  const isOptimistic = task.id.startsWith('temp-')
  const isAgentCreated = source === 'bitbit'
  const isAgentWorking = task.assigned_to && agentStatus === 'working'

  const deadlineInfo = deadline ? getDeadlineInfo(deadline) : null

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`card-lift group relative cursor-grab rounded-lg border bg-card p-3 shadow-sm transition-shadow active:cursor-grabbing ${
        isDragging ? 'opacity-30' : isOptimistic ? 'opacity-70' : 'opacity-100'
      } ${isAgentWorking ? 'animate-pulse border-l-2 border-l-muted-foreground' : 'border-border'}`}
      onClick={() => onEdit?.(task)}
      style={{
        ...dndStyle,
        transition: dndStyle.transition || undefined,
        userSelect: 'none',
        WebkitUserSelect: 'none' as const,
        willChange: transform ? 'transform' : undefined,
        contain: 'layout style',
      } as React.CSSProperties}
    >
      {/* Archive button (show on hover) */}
      {onArchive && (
        <div className="kanban-card-actions absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => { e.stopPropagation(); onArchive(task) }}
            className="text-muted-foreground hover:text-foreground"
          >
            <IconX data-icon className="size-3" />
          </Button>
        </div>
      )}

      {/* Title row with source dot */}
      <h4 className="line-clamp-2 pr-5 text-sm font-medium leading-snug text-foreground">
        {/* Source channel dot */}
        {source && (
          isAgentCreated ? (
            <span
              className="mr-1 inline-block size-1.5 rounded-full align-middle"
              style={{ background: 'linear-gradient(135deg, #4DAF6B, #9DC74D, #D4C24E, #E0A860, #D8908B)' }}
            />
          ) : sourceColors[source] ? (
            <span
              className="mr-1 inline-block size-1.5 rounded-full align-middle"
              style={{ backgroundColor: sourceColors[source] }}
            />
          ) : null
        )}
        {task.title}
      </h4>

      {task.description && (
        <div className="mt-1 line-clamp-2">
          <MarkdownRenderer
            content={task.description}
            compact
            style={{ fontSize: '0.875rem', lineHeight: '1.375', color: 'hsl(var(--muted-foreground))' }}
          />
        </div>
      )}

      {/* Metadata row: priority + tags + deadline + time */}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <Badge variant={priorityVariant[task.priority] || 'outline'}>
          {task.priority}
        </Badge>

        {tags.map((tag) => (
          <Badge key={tag} variant="outline">
            {tag}
          </Badge>
        ))}

        {deadlineInfo && (
          <Badge variant={deadlineInfo.variant}>
            {deadlineInfo.label}
          </Badge>
        )}

        <span className="ml-auto font-mono text-xs text-muted-foreground/50">
          {timeAgo(task.updated_at)}
        </span>
      </div>

      {/* Agent activity bar */}
      {task.assigned_to && (
        <>
          <Separator className="mt-2" />
          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            {agentStatus === 'working' && (
              <span className="size-1 shrink-0 animate-pulse rounded-full bg-muted-foreground" />
            )}
            {agentStatus === 'done' && (
              <span className="text-emerald-500">&#10003;</span>
            )}
            {agentStatus === 'error' && (
              <span className="text-destructive">&#9888;</span>
            )}
            <span className="font-mono font-medium">
              {task.assigned_to}
            </span>
            <span className="text-muted-foreground">
              {agentStatus === 'working' && '\u00b7\u2009working...'}
              {agentStatus === 'done' && '\u00b7\u2009done'}
              {agentStatus === 'error' && '\u00b7\u2009error'}
              {!agentStatus && '\u00b7\u2009assigned'}
            </span>
            {isAgentCreated && (
              <Badge variant="secondary" className="ml-auto text-[10px]">
                AI
              </Badge>
            )}
          </div>
        </>
      )}
    </div>
  )
})
