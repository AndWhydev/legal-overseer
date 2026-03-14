'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { SFXmark } from 'sf-symbols-lib'
import type { Task } from '@/lib/types'

interface KanbanCardProps {
  task: Task
  onEdit?: (task: Task) => void
  onArchive?: (task: Task) => void
}

const priorityGlass: Record<string, { bg: string; shadow: string }> = {
  critical: { bg: 'var(--glass-card-bg-light)', shadow: '0 2px 8px rgba(0, 0, 0, 0.15)' },
  high:     { bg: 'var(--glass-card-bg-light)', shadow: '0 1px 4px rgba(0, 0, 0, 0.12)' },
  medium:   { bg: 'var(--bg-card)',  shadow: '0 1px 2px rgba(0, 0, 0, 0.08)' },
  low:      { bg: 'var(--bg-card)', shadow: '0 1px 1px rgba(0, 0, 0, 0.05)' },
}

const priorityDot: Record<string, { color: string; label?: string }> = {
  critical: { color: '#EF4444', label: 'critical' },
  high:     { color: '#F59E0B', label: 'high' },
  medium:   { color: 'var(--text-dim)' },
  low:      { color: 'var(--text-dim)' },
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

function getDeadlineStyle(deadline: string): { bg: string; color: string; label: string } | null {
  const now = Date.now()
  const due = new Date(deadline).getTime()
  const diffDays = (due - now) / 86_400_000

  const d = new Date(deadline)
  const label = d.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })

  if (diffDays < 0) return { bg: 'rgba(239,68,68,0.1)', color: '#f87171', label }
  if (diffDays <= 2) return { bg: 'rgba(245,158,11,0.08)', color: '#fbbf24', label }
  return { bg: 'transparent', color: 'var(--text-dim)', label }
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

  const meta = (task.metadata || {}) as Record<string, unknown>
  const tags = (meta.tags as string[]) || []
  const agentStatus = meta.agentStatus as 'working' | 'done' | 'error' | undefined
  const source = meta.source as string | undefined
  const deadline = meta.deadline as string | undefined
  const glass = priorityGlass[task.priority] || priorityGlass.medium
  const pri = priorityDot[task.priority] || priorityDot.medium
  const isOptimistic = task.id.startsWith('temp-')
  const isAgentCreated = source === 'bitbit'
  const isAgentWorking = task.assigned_to && agentStatus === 'working'

  const deadlineInfo = deadline ? getDeadlineStyle(deadline) : null

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
        backdropFilter: 'var(--glass-card-blur)',
        WebkitBackdropFilter: 'var(--glass-card-blur)',
        boxShadow: isDragging
          ? '0 16px 48px rgba(0, 0, 0, 0.4)'
          : glass.shadow,
        cursor: isDragging ? 'grabbing' : 'grab',
        position: 'relative',
        opacity: isDragging ? 0.5 : isOptimistic ? 0.7 : 1,
        userSelect: 'none',
        WebkitUserSelect: 'none' as const,
        animation: isAgentWorking ? 'bb-card-breathe 3s ease-in-out infinite' : undefined,
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
              background: 'var(--glass-hover-bg)',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              display: 'flex',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-secondary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dim)' }}
          >
            <SFXmark style={{ width: 11, height: 11 }} />
          </button>
        </div>
      )}

      {/* Title row with source dot */}
      <h4 style={{
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--text-primary)',
        lineHeight: 1.4,
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        margin: 0,
        paddingRight: 20,
      }}>
        {/* Source channel dot */}
        {source && (
          isAgentCreated ? (
            <span style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #4DAF6B, #9DC74D, #D4C24E, #E0A860, #D8908B)',
              marginRight: 5,
              verticalAlign: 'middle',
              position: 'relative',
              top: -1,
            }} />
          ) : sourceColors[source] ? (
            <span style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: sourceColors[source],
              marginRight: 5,
              verticalAlign: 'middle',
              position: 'relative',
              top: -1,
            }} />
          ) : null
        )}
        {task.title}
      </h4>

      {task.description && (
        <p style={{
          margin: '3px 0 0',
          fontSize: 11,
          color: 'var(--text-dim)',
          display: '-webkit-box',
          WebkitLineClamp: 1,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          lineHeight: 1.35,
        }}>
          {task.description}
        </p>
      )}

      {/* Metadata row: priority dot + tags + deadline + time */}
      <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        {/* Priority dot + optional label */}
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 10,
          fontWeight: 500,
          padding: '2px 8px',
          borderRadius: 20,
          background: 'var(--glass-pill-bg)',
          boxShadow: 'var(--glass-pill-inset)',
          color: 'var(--text-secondary)',
          lineHeight: '15px',
        }}>
          <span style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: pri.color,
            flexShrink: 0,
          }} />
          {pri.label || task.priority}
        </span>

        {/* Tags — $client brighter */}
        {tags.map((tag) => (
          <span
            key={tag}
            style={{
              fontSize: 10,
              fontWeight: 500,
              padding: '2px 8px',
              borderRadius: 20,
              background: 'var(--glass-pill-bg)',
              boxShadow: 'var(--glass-pill-inset)',
              color: tag.startsWith('$') ? 'var(--text-secondary)' : 'var(--text-secondary)',
              lineHeight: '15px',
            }}
          >
            {tag}
          </span>
        ))}

        {/* Deadline pill */}
        {deadlineInfo && (
          <span style={{
            fontSize: 10,
            fontWeight: 500,
            padding: '2px 8px',
            borderRadius: 20,
            background: deadlineInfo.bg,
            color: deadlineInfo.color,
            lineHeight: '15px',
          }}>
            {deadlineInfo.label}
          </span>
        )}

        {/* Time ago */}
        <span style={{ fontSize: 9, color: 'rgba(148, 163, 184, 0.5)', marginLeft: 'auto' }}>
          {timeAgo(task.updated_at)}
        </span>
      </div>

      {/* Agent activity bar — conditional */}
      {task.assigned_to && (
        <div style={{
          marginTop: 6,
          paddingTop: 6,
          borderTop: '1px solid var(--glass-divider)',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 10,
          color: 'var(--text-dim)',
        }}>
          {agentStatus === 'working' && (
            <span style={{
              width: 4,
              height: 4,
              borderRadius: '50%',
              background: 'var(--text-dim)',
              animation: 'bb-agent-pulse 2s ease-in-out infinite',
              flexShrink: 0,
            }} />
          )}
          {agentStatus === 'done' && (
            <span style={{ color: '#22C55E', fontSize: 11, lineHeight: 1 }}>&#10003;</span>
          )}
          {agentStatus === 'error' && (
            <span style={{ color: '#EF4444', fontSize: 11, lineHeight: 1 }}>&#9888;</span>
          )}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
            {task.assigned_to}
          </span>
          <span style={{ color: 'var(--text-dim)' }}>
            {agentStatus === 'working' && '·\u2009working...'}
            {agentStatus === 'done' && '·\u2009done'}
            {agentStatus === 'error' && '·\u2009error'}
            {!agentStatus && '·\u2009assigned'}
          </span>
          {isAgentCreated && (
            <span style={{
              marginLeft: 'auto',
              fontSize: 8,
              fontWeight: 600,
              padding: '1px 4px',
              borderRadius: 4,
              background: 'var(--glass-interactive-bg)',
              color: 'var(--text-dim)',
              letterSpacing: '0.04em',
            }}>
              AI
            </span>
          )}
        </div>
      )}

      <style>{`
        .card-lift:hover .kanban-card-actions { opacity: 1 !important; }
        @keyframes bb-agent-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
        @keyframes bb-card-breathe {
          0%, 100% { box-shadow: var(--card-shadow, 0 1px 4px rgba(0,0,0,0.12)), 0 0 12px rgba(148, 163, 184, 0.03); }
          50% { box-shadow: var(--card-shadow, 0 1px 4px rgba(0,0,0,0.12)), 0 0 12px rgba(148, 163, 184, 0.08); }
        }
      `}</style>
    </div>
  )
}
