'use client'

import { useState, useRef, useEffect } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { KanbanCard } from './kanban-card'
import type { Task, KanbanColumn as ColumnType } from '@/lib/types'

interface KanbanColumnProps {
  column: ColumnType
  tasks: Task[]
  totalTaskCount: number
  onQuickAdd?: (columnId: string, title: string, priority?: string) => void
  onEditTask?: (task: Task) => void
  onArchiveTask?: (task: Task) => void
}

const PRIORITY_CYCLE = ['medium', 'high', 'critical', 'low'] as const
const PRIORITY_DOT_COLOR: Record<string, string> = {
  critical: '#EF4444',
  high: '#F59E0B',
  medium: '#64748B',
  low: '#475569',
}

export function KanbanColumn({
  column,
  tasks,
  totalTaskCount,
  onQuickAdd,
  onEditTask,
  onArchiveTask,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })
  const [isAdding, setIsAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [quickPriority, setQuickPriority] = useState<string>('medium')
  const [ghostHover, setGhostHover] = useState(false)
  const [headerHover, setHeaderHover] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isAdding) setTimeout(() => inputRef.current?.focus(), 30)
  }, [isAdding])

  function handleCreate() {
    if (!newTitle.trim() || !onQuickAdd) return
    onQuickAdd(column.id, newTitle.trim(), quickPriority)
    setNewTitle('')
    setQuickPriority('medium')
  }

  const progressPct = totalTaskCount > 0 ? (tasks.length / totalTaskCount) * 100 : 0

  return (
    <div
      style={{ display: 'flex', flex: 1, minWidth: 240, maxWidth: 340, flexDirection: 'column', height: '100%' }}
      onMouseEnter={() => setHeaderHover(true)}
      onMouseLeave={() => setHeaderHover(false)}
    >
      {/* Column header */}
      <div style={{ padding: '0 6px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 6 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', margin: 0, letterSpacing: '0.01em' }}>
            {column.title}
          </h3>
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-dim)',
            background: 'var(--glass-interactive-bg)',
            borderRadius: 99,
            padding: '1px 7px',
          }}>
            {tasks.length}
          </span>
        </div>
        {/* Progress bar — visible on hover */}
        <div style={{
          height: 2,
          borderRadius: 1,
          background: 'var(--glass-interactive-bg)',
          overflow: 'hidden',
          opacity: headerHover ? 1 : 0,
          transition: 'opacity 0.2s ease',
        }}>
          <div style={{
            height: '100%',
            borderRadius: 1,
            width: `${progressPct}%`,
            background: `${column.color || '#64748B'}4D`,
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>

      {/* Droppable area */}
      <div
        ref={setNodeRef}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          borderRadius: 14,
          padding: 6,
          background: isOver ? 'transparent' : 'var(--glass-card-border)',
          outline: isOver ? '1.5px dashed rgba(148, 163, 184, 0.15)' : '1.5px dashed transparent',
          animation: isOver ? 'bb-drop-pulse 1.5s ease-in-out infinite' : undefined,
          transition: 'background 0.2s ease, outline-color 0.2s ease',
          minHeight: 0,
          overflowY: 'auto',
          scrollbarGutter: 'stable',
        }}
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <KanbanCard
              key={task.id}
              task={task}
              onEdit={onEditTask}
              onArchive={onArchiveTask}
            />
          ))}
        </SortableContext>

        {/* Inline quick-add */}
        {isAdding ? (
          <div style={{
            borderRadius: 14,
            padding: '10px 14px',
            background: 'var(--bg-card)',
            boxShadow: 'var(--card-inset)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* Priority dot indicator */}
              <span style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: PRIORITY_DOT_COLOR[quickPriority] || '#64748B',
                flexShrink: 0,
                transition: 'background 0.15s',
              }} />
              <input
                ref={inputRef}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleCreate()
                  }
                  if (e.key === 'Tab') {
                    e.preventDefault()
                    const idx = PRIORITY_CYCLE.indexOf(quickPriority as typeof PRIORITY_CYCLE[number])
                    setQuickPriority(PRIORITY_CYCLE[(idx + 1) % PRIORITY_CYCLE.length])
                  }
                  if (e.key === 'Escape') {
                    setIsAdding(false)
                    setNewTitle('')
                    setQuickPriority('medium')
                  }
                }}
                onBlur={() => {
                  if (!newTitle.trim()) {
                    setIsAdding(false)
                    setNewTitle('')
                    setQuickPriority('medium')
                  }
                }}
                placeholder="Task title..."
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  padding: 0,
                  fontFamily: 'inherit',
                }}
              />
            </div>
            <div style={{ marginTop: 5, fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.02em' }}>
              ↵ create · tab priority · esc close
            </div>
          </div>
        ) : onQuickAdd ? (
          <button
            onClick={() => setIsAdding(true)}
            onMouseEnter={() => setGhostHover(true)}
            onMouseLeave={() => setGhostHover(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              borderRadius: 14,
              padding: 12,
              border: `1.5px dashed ${ghostHover ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.12)'}`,
              background: ghostHover ? 'var(--glass-card-border)' : 'transparent',
              width: '100%',
              fontSize: 12,
              color: ghostHover ? 'var(--text-dim)' : 'var(--text-dim)',
              cursor: 'pointer',
              transition: 'color 0.15s, background 0.15s, border-color 0.15s',
              marginTop: 'auto',
            }}
          >
            <Plus style={{ width: 13, height: 13 }} />
            Add task
          </button>
        ) : null}
      </div>

      <style>{`
        @keyframes bb-drop-pulse {
          0%, 100% { outline-color: rgba(148, 163, 184, 0.08); }
          50% { outline-color: rgba(148, 163, 184, 0.2); }
        }
      `}</style>
    </div>
  )
}
