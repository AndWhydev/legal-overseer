'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { ProgressRing } from '@/components/ui/progress-ring'
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

  // Column progress: what % of all tasks are in this column
  const columnPct = totalOrgTasks && totalOrgTasks > 0
    ? Math.round((tasks.length / totalOrgTasks) * 100)
    : 0

  return (
    <div className="flex w-[300px] shrink-0 flex-col">
      <div className="flex items-center gap-2 px-2 pb-3">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: column.color }}
        />
        <h3 className="text-sm font-semibold text-foreground">{column.title}</h3>
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-secondary px-1.5 text-[10px] font-medium text-muted-foreground">
          {tasks.length}
        </span>
        <div className="ml-auto">
          <ProgressRing
            value={columnPct}
            size={28}
            strokeWidth={2.5}
            showValue={false}
          />
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={`flex flex-1 flex-col gap-2 rounded-lg p-1.5 transition-colors ${
          isOver ? 'bg-primary/10 ring-1 ring-primary/30' : 'bg-secondary/40'
        }`}
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
            className="flex items-center gap-1.5 rounded-lg p-2 text-xs text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Add task
          </button>
        )}
      </div>
    </div>
  )
}
