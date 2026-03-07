'use client'

import { useRef } from 'react'
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

  // Track pointer movement to distinguish click from drag
  const pointerStart = useRef<{ x: number; y: number } | null>(null)

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="card-lift"
      onPointerDown={(e) => { pointerStart.current = { x: e.clientX, y: e.clientY } }}
      onPointerUp={(e) => {
        if (!pointerStart.current || !onEdit) return
        const dx = Math.abs(e.clientX - pointerStart.current.x)
        const dy = Math.abs(e.clientY - pointerStart.current.y)
        // Only open edit if pointer barely moved (not a drag)
        if (dx < 4 && dy < 4) onEdit(task)
        pointerStart.current = null
      }}
      style={{
        borderRadius: 14,
        padding: '14px 16px',
        background: 'rgba(15, 20, 30, 0.3)',
        backdropFilter: 'blur(12px) saturate(1.1)',
        WebkitBackdropFilter: 'blur(12px) saturate(1.1)',
        boxShadow: isDragging
          ? '0 16px 48px rgba(0, 0, 0, 0.4)'
          : '0 1px 2px rgba(0, 0, 0, 0.1)',
        cursor: isDragging ? 'grabbing' : 'pointer',
        position: 'relative',
        opacity: isDragging ? 0.5 : 1,
        ...dndStyle,
        transition: [dndStyle.transition, 'box-shadow 0.2s ease, opacity 0.2s ease'].filter(Boolean).join(', '),
      }}
    >
      {/* Archive button (top-right, show on hover) */}
      {onArchive && (
        <div
          className="kanban-card-actions"
          style={{
            position: 'absolute',
            right: 10,
            top: 10,
            opacity: 0,
            transition: 'opacity 0.15s',
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); onArchive(task) }}
            style={{
              borderRadius: 8,
              padding: 4,
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
            <X style={{ width: 12, height: 12 }} />
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
        paddingRight: 40,
      }}>
        {task.title}
      </h4>

      {task.description && (
        <p style={{
          margin: '4px 0 0',
          fontSize: 12,
          color: '#64748B',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          lineHeight: 1.35,
        }}>
          {task.description}
        </p>
      )}

      {/* Tags and priority row */}
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {/* Priority pill — matches chat suggestion chip material */}
        <span style={{
          fontSize: 10,
          fontWeight: 500,
          padding: '3px 10px',
          borderRadius: 20,
          background: 'rgba(10, 14, 23, 0.42)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
          color: '#94A3B8',
          lineHeight: '16px',
        }}>
          {task.priority}
        </span>

        {/* Tag pills — same glass chip material */}
        {tags.map((tag) => (
          <span
            key={tag}
            style={{
              fontSize: 10,
              fontWeight: 500,
              padding: '3px 10px',
              borderRadius: 20,
              background: 'rgba(10, 14, 23, 0.42)',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
              color: '#94A3B8',
              lineHeight: '16px',
            }}
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Bottom row: timeAgo + agent */}
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 9, color: 'rgba(148, 163, 184, 0.6)' }}>
          {timeAgo(task.updated_at)}
        </span>
        {task.assigned_to && (
          <AgentBadge agent={task.assigned_to} status={agentStatus} />
        )}
      </div>

      {/* Hover action visibility via inline style tag */}
      <style>{`
        .card-lift:hover .kanban-card-actions { opacity: 1 !important; }
        .card-lift:hover { transform: translateY(-2px); }
      `}</style>
    </div>
  )
}
