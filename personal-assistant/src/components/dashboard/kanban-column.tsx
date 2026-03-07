'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { KanbanCard } from './kanban-card'
import type { Task, KanbanColumn as ColumnType } from '@/lib/types'

interface KanbanColumnProps {
  column: ColumnType
  tasks: Task[]
  totalOrgTasks?: number
  onAddTask?: (columnId: string) => void
  onEditTask?: (task: Task) => void
  onArchiveTask?: (task: Task) => void
}

export function KanbanColumn({
  column,
  tasks,
  totalOrgTasks,
  onAddTask,
  onEditTask,
  onArchiveTask,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  return (
    <div style={{ display: 'flex', width: 280, flexShrink: 0, flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 6px 10px' }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8', margin: 0, letterSpacing: '0.01em' }}>
          {column.title}
        </h3>
        <span style={{ fontSize: 12, fontWeight: 500, color: '#475569' }}>
          {tasks.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          borderRadius: 14,
          padding: 6,
          background: isOver ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.01)',
          transition: 'background 0.2s ease',
          minHeight: 0,
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

        {onAddTask && (
          <button
            onClick={() => onAddTask(column.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              borderRadius: 10,
              padding: '8px 10px',
              border: 'none',
              background: 'transparent',
              fontSize: 12,
              color: '#475569',
              cursor: 'pointer',
              transition: 'color 0.15s, background 0.15s',
              marginTop: 'auto',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
              e.currentTarget.style.color = '#94A3B8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#475569';
            }}
          >
            <Plus style={{ width: 14, height: 14 }} />
            Add task
          </button>
        )}
      </div>
    </div>
  )
}
