'use client'

import { useState, useRef, useEffect, memo, useId } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { IconPlus } from '@tabler/icons-react'
import { KanbanCard } from './kanban-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
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

export const KanbanColumn = memo(function KanbanColumn({
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
  const [headerHover, setHeaderHover] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollId = useId().replace(/:/g, '')

  useEffect(() => {
    if (isAdding) setTimeout(() => inputRef.current?.focus(), 30)
  }, [isAdding])

  function handleCreate() {
    if (!newTitle.trim() || !onQuickAdd) return
    onQuickAdd(column.id, newTitle.trim(), quickPriority)
    setNewTitle('')
    setQuickPriority('medium')
  }

  const isEmpty = tasks.length === 0
  const progressPct = totalTaskCount > 0 ? (tasks.length / totalTaskCount) * 100 : 0

  return (
    <div
      className="flex h-full flex-col transition-all duration-150"
      data-empty={isEmpty && !isOver ? '' : undefined}
      onMouseEnter={() => setHeaderHover(true)}
      onMouseLeave={() => setHeaderHover(false)}
      /* dynamic flex sizing via inline — layout-only, no design tokens */
      style={{
        flex: isEmpty && !isOver ? '0 0 auto' : 1,
        minWidth: isEmpty && !isOver ? 120 : 200,
      }}
    >
      {/* Column header */}
      <div className="px-1.5 pb-1">
        <div className="flex items-center gap-2 pb-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            {column.title}
          </h3>
          <Badge variant="secondary" className="font-mono text-sm">
            {tasks.length}
          </Badge>
        </div>
        <div className={`transition-opacity duration-200 ${headerHover ? 'opacity-100' : 'opacity-0'}`}>
          <Progress value={progressPct} className="h-0.5" />
        </div>
      </div>

      {/* Droppable area */}
      <div
        ref={setNodeRef}
        data-col-id={column.id}
        className={`kanban-scroll-${scrollId} flex flex-1 flex-col gap-2 overflow-y-auto rounded-xl border p-2 transition-colors duration-100 ${
          isOver
            ? 'border-dashed border-primary/30 bg-accent/50'
            : 'border-transparent bg-muted'
        }${!isEmpty ? ' kanban-col-populated' : ''}`}
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
          <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
            <div className="flex items-center gap-2">
              {/* Priority dot indicator */}
              <span
                className="size-1.5 shrink-0 rounded-full transition-colors"
                style={{
                  backgroundColor:
                    quickPriority === 'critical' ? '#EF4444' :
                    quickPriority === 'high' ? '#F59E0B' :
                    'currentColor',
                }}
              />
              <Input
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
                className="h-auto border-0 bg-transparent p-0 text-sm font-medium shadow-none focus-visible:ring-0"
              />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter create / Tab priority / Esc close
            </p>
          </div>
        ) : onQuickAdd ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsAdding(true)}
            className={`w-full gap-1 border border-dashed border-border text-muted-foreground hover:border-border hover:text-foreground ${isEmpty ? '' : 'mt-auto'}`}
          >
            <IconPlus data-icon className="size-3.5" />
            {!isEmpty && 'Add task'}
          </Button>
        ) : null}
      </div>

      {/* Hide scrollbar while keeping scroll functional */}
      <style>{`
        .kanban-scroll-${scrollId}::-webkit-scrollbar { display: none; }
        .kanban-scroll-${scrollId} { scrollbar-width: none; -ms-overflow-style: none; }
      `}</style>
    </div>
  )
})
