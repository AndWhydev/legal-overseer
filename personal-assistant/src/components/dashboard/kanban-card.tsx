'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Pencil, X, Calendar, AlertTriangle, ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { AgentBadge } from './agent-badge'
import { cn } from '@/lib/utils'
import type { Task } from '@/lib/types'

interface KanbanCardProps {
  task: Task
  onEdit?: (task: Task) => void
  onArchive?: (task: Task) => void
}

function getTagColor(tag: string) {
  if (tag === 'urgent') return 'bg-[#E5484D]/15 text-[#E5484D] border-[#E5484D]/30'
  if (tag.startsWith('$')) return 'bg-[#4ADE80]/15 text-[#4ADE80] border-[#4ADE80]/30'
  if (tag === 'credentials') return 'bg-[#A78BFA]/15 text-[#A78BFA] border-[#A78BFA]/30'
  if (tag === 'awaiting') return 'bg-[#8A8A8E]/15 text-[#8A8A8E] border-[#8A8A8E]/30'
  return 'bg-[#D4A574]/15 text-[#D4A574] border-[#D4A574]/30'
}

function getPriorityBorderColor(priority: string) {
  switch (priority) {
    case 'critical': return '#E5484D'
    case 'high': return '#FBBF24'
    case 'medium': return '#D4A574'
    case 'low': return '#4ADE80'
    default: return '#232326'
  }
}

function getPriorityHoverGlow(priority: string) {
  switch (priority) {
    case 'critical': return 'hover:shadow-[0_0_12px_rgba(229,72,77,0.15)]'
    case 'high': return 'hover:shadow-[0_0_12px_rgba(251,191,36,0.15)]'
    case 'medium': return 'hover:shadow-[0_0_12px_rgba(212,165,116,0.1)]'
    case 'low': return 'hover:shadow-[0_0_12px_rgba(74,222,128,0.1)]'
    default: return ''
  }
}

function PriorityIcon({ priority }: { priority: string }) {
  switch (priority) {
    case 'critical':
      return <AlertTriangle className="h-3 w-3 text-[#E5484D]" />
    case 'high':
      return <ArrowUp className="h-3 w-3 text-[#FBBF24]" />
    case 'medium':
      return <Minus className="h-3 w-3 text-[#D4A574]" />
    case 'low':
      return <ArrowDown className="h-3 w-3 text-[#4ADE80]" />
    default:
      return null
  }
}

const CHANNEL_ICONS: Record<string, string> = {
  imessage: '\uD83D\uDCF1',
  gmail: '\uD83D\uDCE7',
  outlook: '\uD83D\uDCE7',
  calendar: '\uD83D\uDCC5',
  reminders: '\uD83D\uDD14',
}

function ChannelBadge({ channel }: { channel: string }) {
  const icon = CHANNEL_ICONS[channel] ?? '\uD83D\uDCCB'
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded bg-secondary/60 px-1 py-0.5 text-[9px] text-muted-foreground"
      title={channel}
    >
      <span className="text-[10px] leading-none">{icon}</span>
      {channel}
    </span>
  )
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

export function KanbanCard({ task, onEdit, onArchive }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const tags = (task.metadata?.tags as string[]) || []
  const deadline = task.metadata?.deadline as string | undefined
  const agentStatus = task.metadata?.agentStatus as 'working' | 'done' | 'error' | undefined
  const sourceChannel = task.metadata?.source_channel as string | undefined
  const sender = task.metadata?.sender as string | undefined

  const borderColor = getPriorityBorderColor(task.priority)

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        borderLeftColor: borderColor,
      }}
      {...attributes}
      {...listeners}
      className={cn(
        'group relative rounded-lg border border-border border-l-[3px] bg-card p-3 cursor-grab active:cursor-grabbing card-lift',
        'transition-all duration-150 hover:border-[#484f58]',
        getPriorityHoverGlow(task.priority),
        isDragging && 'opacity-50 shadow-lg shadow-black/20'
      )}
    >
      {/* Action buttons (top-right, show on hover) */}
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        {onEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(task) }}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-secondary"
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
        {onArchive && (
          <button
            onClick={(e) => { e.stopPropagation(); onArchive(task) }}
            className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-secondary"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Channel badge + Title */}
      <div className="flex items-start gap-1.5 pr-12">
        <h4 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
          {task.title}
        </h4>
      </div>

      {task.description && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
          {task.description}
        </p>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className={`text-[10px] px-1.5 py-0 font-medium ${getTagColor(tag)}`}
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Bottom row: priority, deadline, channel, sender, agent */}
      <div className="mt-2 flex items-center gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-0 flex-wrap">
          {/* Priority badge */}
          <span className="inline-flex items-center gap-1 rounded-md bg-secondary/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            <PriorityIcon priority={task.priority} />
            {task.priority}
          </span>

          {/* Deadline badge */}
          {deadline && (
            <span className={cn(
              'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium',
              tags.includes('urgent')
                ? 'bg-[#E5484D]/10 text-[#E5484D]'
                : 'bg-[#FBBF24]/10 text-[#FBBF24]'
            )}>
              <Calendar className="h-2.5 w-2.5" />
              {deadline}
            </span>
          )}

          {/* Channel source badge */}
          {sourceChannel && <ChannelBadge channel={sourceChannel} />}

          {/* Sender + time ago */}
          {sender && (
            <span className="text-[10px] text-muted-foreground truncate max-w-[100px]" title={sender}>
              {sender}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Time ago */}
          <span className="text-[9px] text-muted-foreground/60">
            {timeAgo(task.updated_at)}
          </span>

          {task.assigned_to && (
            <AgentBadge agent={task.assigned_to} status={agentStatus} />
          )}
        </div>
      </div>
    </div>
  )
}
