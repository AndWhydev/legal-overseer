'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { X } from 'lucide-react'
import { AgentBadge } from './agent-badge'
import type { Task } from '@/lib/types'

interface KanbanCardProps {
  task: Task
  onEdit?: (task: Task) => void
  onArchive?: (task: Task) => void
}

const priorityGlass: Record<string, { bg: string; shadow: string }> = {
  critical: { bg: 'rgba(15, 20, 30, 0.45)', shadow: '0 2px 8px rgba(0, 0, 0, 0.15)' },
  high:     { bg: 'rgba(15, 20, 30, 0.38)', shadow: '0 1px 4px rgba(0, 0, 0, 0.12)' },
  medium:   { bg: 'rgba(15, 20, 30, 0.3)',  shadow: '0 1px 2px rgba(0, 0, 0, 0.08)' },
  low:      { bg: 'rgba(15, 20, 30, 0.22)', shadow: '0 1px 1px rgba(0, 0, 0, 0.05)' },
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

  const dndStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const tags = (task.metadata?.tags as string[]) || []
  const agentStatus = task.metadata?.agentStatus as 'working' | 'done' | 'error' | undefined
  const glass = priorityGlass[task.priority] || priorityGlass.medium
  const isOptimistic = task.id.startsWith('temp-')

  const agentGlow = task.assigned_to && agentStatus === 'working'
    ? ', 0 0 8px rgba(148, 163, 184, 0.1)'
    : ''

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="card-lift"
      onClick={() => onEdit?.(task)}
      style={{
        borderRadius: 14,
        padding: '10px 12px',
        background: glass.bg,
        backdropFilter: 'blur(12px) saturate(1.1)',
        WebkitBackdropFilter: 'blur(12px) saturate(1.1)',
        boxShadow: isDragging
          ? '0 16px 48px rgba(0, 0, 0, 0.4)'
          : glass.shadow + agentGlow,
        cursor: isDragging ? 'grabbing' : 'grab',
        position: 'relative',
        opacity: isDragging ? 0.5 : isOptimistic ? 0.7 : 1,
        userSelect: 'none',
        WebkitUserSelect: 'none' as const,
        ...dndStyle,
        transition: [dndStyle.transition, 'box-shadow 0.2s ease, opacity 0.2s ease'].filter(Boolean).join(', '),
      } as React.CSSProperties}
    >
      {/* Archive (show on hover) */}
      {onArchive && (
        <div
          className="kanban-card-actions"
          style={{
            position: 'absolute',
            right: 8,
            top: 8,
            opacity: 0,
            transition: 'opacity 0.15s',
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); onArchive(task) }}
            style={{
              borderRadius: 8,
              padding: 3,
              border: 'none',
              background: 'rgba(255, 255, 255, 0.06)',
              color: '#475569',
              cursor: 'pointer',
              display: 'flex',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#94A3B8' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#475569' }}
          >
            <X style={{ width: 11, height: 11 }} />
          </button>
        </div>
      )}

      {/* Title */}
      <h4 style={{
        fontSize: 13,
        fontWeight: 600,
        color: '#F1F5F9',
        lineHeight: 1.4,
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        margin: 0,
        paddingRight: 20,
      }}>
        {task.title}
      </h4>

      {task.description && (
        <p style={{
          margin: '3px 0 0',
          fontSize: 11,
          color: '#64748B',
          display: '-webkit-box',
          WebkitLineClamp: 1,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          lineHeight: 1.35,
        }}>
          {task.description}
        </p>
      )}

      {/* Unified bottom row: pills + time · agent */}
      <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 10,
          fontWeight: 500,
          padding: '2px 8px',
          borderRadius: 20,
          background: 'rgba(10, 14, 23, 0.42)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
          color: '#94A3B8',
          lineHeight: '15px',
        }}>
          {task.priority}
        </span>
        {tags.map((tag) => (
          <span
            key={tag}
            style={{
              fontSize: 10,
              fontWeight: 500,
              padding: '2px 8px',
              borderRadius: 20,
              background: 'rgba(10, 14, 23, 0.42)',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
              color: '#94A3B8',
              lineHeight: '15px',
            }}
          >
            {tag}
          </span>
        ))}
        <span style={{ fontSize: 9, color: 'rgba(148, 163, 184, 0.5)', marginLeft: 2 }}>
          · {timeAgo(task.updated_at)}
        </span>
        {task.assigned_to && (
          <span style={{ marginLeft: 'auto' }}>
            <AgentBadge agent={task.assigned_to} status={agentStatus} />
          </span>
        )}
      </div>

      <style>{`
        .card-lift:hover .kanban-card-actions { opacity: 1 !important; }
      `}</style>
    </div>
  )
}
