'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import type { UniqueIdentifier } from '@dnd-kit/core'
import { IconPlus } from '@tabler/icons-react'

import {
  Kanban,
  KanbanBoard as KanbanBoardPrimitive,
  KanbanColumn,
  KanbanItem,
  KanbanOverlay,
} from '@/components/ui/kanban'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import type { Task, KanbanColumn as ColumnType } from '@/lib/types'
import { useRealtime } from '@/hooks/use-realtime'

import { KanbanActivityStrip } from './kanban-activity-strip'
import { KanbanCard } from './kanban-card'
import { TaskDialog } from './task-dialog'
import { KanbanToolbar, type FilterState } from './kanban-toolbar'

interface KanbanBoardProps {
  initialColumns: ColumnType[]
  initialTasks: Task[]
  doneColumnId?: string
}

interface UndoToastState {
  visible: boolean
  message: string
  task: Task | null
  timeoutId: NodeJS.Timeout | null
}

const PRIORITY_CYCLE = ['medium', 'high', 'critical', 'low'] as const

function getDeadlineTimestamp(task: Task) {
  const deadline = (task.metadata as Record<string, unknown>)?.deadline
  if (typeof deadline !== 'string' || !deadline.trim()) return null

  const parsed = new Date(deadline).getTime()
  return Number.isNaN(parsed) ? null : parsed
}

function isTaskOverdue(task: Task, doneColumnId?: string) {
  const deadline = getDeadlineTimestamp(task)
  if (deadline === null) return false
  if (doneColumnId && task.column_id === doneColumnId) return false
  return deadline < Date.now()
}

function getColumnSummary(taskCount: number) {
  if (taskCount === 0) return 'Quiet for now'
  if (taskCount === 1) return '1 task'
  return `${taskCount} tasks`
}

export function KanbanBoard({ initialColumns, initialTasks, doneColumnId }: KanbanBoardProps) {
  const deduplicatedColumns = useMemo(() => {
    const seen = new Set<string>()
    return initialColumns.filter((column) => {
      const key = (column.title ?? column.id).toLowerCase().trim()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [initialColumns])

  const [columns] = useState(deduplicatedColumns)
  const [tasks, setTasks] = useState(initialTasks)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [defaultColumnId, setDefaultColumnId] = useState<string | undefined>()
  const [filters, setFilters] = useState<FilterState>({
    priority: null,
    source: 'all',
    overdueOnly: false,
  })
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const [undoToast, setUndoToast] = useState<UndoToastState>({
    visible: false,
    message: '',
    task: null,
    timeoutId: null,
  })
  const draggingRef = useRef(false)

  const resolvedDoneId = doneColumnId ?? columns.find((column) => column.title?.toLowerCase() === 'done')?.id

  const filteredTasks = useMemo(() => {
    let result = tasks

    if (filters.priority) {
      result = result.filter((task) => task.priority === filters.priority)
    }

    if (filters.source === 'bitbit') {
      result = result.filter((task) => {
        const metadata = task.metadata as Record<string, unknown>
        return metadata?.source === 'bitbit' || Boolean(task.assigned_to)
      })
    } else if (filters.source === 'you') {
      result = result.filter((task) => {
        const metadata = task.metadata as Record<string, unknown>
        return metadata?.source !== 'bitbit' && !task.assigned_to
      })
    }

    if (filters.overdueOnly) {
      result = result.filter((task) => isTaskOverdue(task, resolvedDoneId))
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter((task) =>
        (task.title ?? '').toLowerCase().includes(query) ||
        (task.description ?? '').toLowerCase().includes(query)
      )
    }

    return result
  }, [tasks, filters, searchQuery, resolvedDoneId])

  const hasActiveFilters =
    filters.priority !== null ||
    filters.source !== 'all' ||
    filters.overdueOnly ||
    searchQuery.trim().length > 0

  const overdueCount = useMemo(
    () => tasks.filter((task) => isTaskOverdue(task, resolvedDoneId)).length,
    [tasks, resolvedDoneId]
  )

  const priorityCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const task of tasks) {
      if (task.priority) counts[task.priority] = (counts[task.priority] || 0) + 1
    }
    return counts
  }, [tasks])

  const kanbanValue = useMemo(() => {
    const source = hasActiveFilters ? filteredTasks : tasks
    const record: Record<UniqueIdentifier, Task[]> = {}

    for (const column of columns) {
      record[column.id] = source
        .filter((task) => task.column_id === column.id)
        .sort((left, right) => left.position - right.position)
    }

    return record
  }, [columns, tasks, filteredTasks, hasActiveFilters])

  useRealtime({
    table: 'tasks',
    onChange: (payload) => {
      if (draggingRef.current) return

      if (payload.eventType === 'INSERT') {
        const newTask = payload.new as Task
        setTasks((previous) => {
          if (previous.some((task) => task.id === newTask.id)) return previous

          const optimisticIndex = previous.findIndex(
            (task) =>
              task.id.startsWith('temp-') &&
              task.title === newTask.title &&
              task.column_id === newTask.column_id
          )

          if (optimisticIndex >= 0) {
            const next = [...previous]
            next[optimisticIndex] = newTask
            return next
          }

          return [...previous, newTask]
        })
      } else if (payload.eventType === 'UPDATE') {
        const updatedTask = payload.new as Task
        if (updatedTask.status === 'archived') {
          setTasks((previous) => previous.filter((task) => task.id !== updatedTask.id))
        } else {
          setTasks((previous) =>
            previous.map((task) => (task.id === updatedTask.id ? { ...task, ...updatedTask } : task))
          )
        }
      } else if (payload.eventType === 'DELETE') {
        const deletedTask = payload.old as { id: string }
        setTasks((previous) => previous.filter((task) => task.id !== deletedTask.id))
      }
    },
  })

  const getColumnTasks = useCallback(
    (columnId: string) => {
      const source = hasActiveFilters ? filteredTasks : tasks
      return source
        .filter((task) => task.column_id === columnId)
        .sort((left, right) => left.position - right.position)
    },
    [tasks, filteredTasks, hasActiveFilters]
  )

  const handleKanbanValueChange = useCallback((newValue: Record<UniqueIdentifier, Task[]>) => {
    const updatedTasks: Task[] = []
    const changedTasks: Array<{ id: string; column_id: string; position: number }> = []

    for (const [columnId, columnTasks] of Object.entries(newValue)) {
      columnTasks.forEach((task, index) => {
        const updatedTask = {
          ...task,
          column_id: columnId,
          position: index,
        }

        updatedTasks.push(updatedTask)

        const originalTask = tasks.find((candidate) => candidate.id === task.id)
        if (
          !originalTask ||
          originalTask.column_id !== columnId ||
          originalTask.position !== index
        ) {
          changedTasks.push({ id: task.id, column_id: columnId, position: index })
        }
      })
    }

    const columnIds = new Set(Object.keys(newValue))
    const hiddenTasks = tasks.filter((task) => !columnIds.has(task.column_id ?? ''))
    setTasks([...updatedTasks, ...hiddenTasks])

    if (changedTasks.length > 0) {
      fetch('/api/tasks/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: changedTasks }),
      })
    }
  }, [tasks])

  const handleQuickAddTask = useCallback(
    (columnId: string, title: string, priority?: string) => {
      const tempId = `temp-${Date.now()}`
      const position = getColumnTasks(columnId).length
      const now = new Date().toISOString()
      const resolvedPriority = priority || 'medium'

      setTasks((previous) => [
        ...previous,
        {
          id: tempId,
          title,
          description: null,
          column_id: columnId,
          priority: resolvedPriority,
          position,
          status: 'pending',
          assigned_to: null,
          metadata: {},
          org_id: '',
          created_at: now,
          updated_at: now,
        } as Task,
      ])

      fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          column_id: columnId,
          priority: resolvedPriority,
          position,
        }),
      })
        .then((response) => (response.ok ? response.json() : Promise.reject()))
        .then(({ task }) => setTasks((previous) => previous.map((item) => (item.id === tempId ? task : item))))
        .catch(() => setTasks((previous) => previous.filter((item) => item.id !== tempId)))
    },
    [getColumnTasks]
  )

  const handleEditTask = useCallback((task: Task) => {
    setEditingTask(task)
    setDefaultColumnId(undefined)
    setDialogOpen(true)
  }, [])

  const handleArchiveTask = useCallback((task: Task) => {
    if (undoToast.timeoutId) clearTimeout(undoToast.timeoutId)

    setTasks((previous) => previous.filter((candidate) => candidate.id !== task.id))

    const timeoutId = setTimeout(() => {
      setUndoToast({ visible: false, message: '', task: null, timeoutId: null })
    }, 5000)

    setUndoToast({
      visible: true,
      message: 'Task archived',
      task,
      timeoutId,
    })

    fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    })
  }, [undoToast.timeoutId])

  function handleUndoArchive() {
    const archivedTask = undoToast.task
    if (!archivedTask) return

    if (undoToast.timeoutId) clearTimeout(undoToast.timeoutId)

    setTasks((previous) => {
      if (previous.some((task) => task.id === archivedTask.id)) return previous
      return [...previous, archivedTask]
    })

    setUndoToast({ visible: false, message: '', task: null, timeoutId: null })

    fetch(`/api/tasks/${archivedTask.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'pending' }),
    })
  }

  async function handleSaveTask(data: {
    title: string
    description: string
    column_id: string
    priority: string
    tags: string[]
    deadline: string
  }) {
    if (editingTask) {
      const updatedTask = {
        title: data.title,
        description: data.description || null,
        column_id: data.column_id,
        priority: data.priority,
        metadata: {
          ...((editingTask.metadata as Record<string, unknown>) || {}),
          tags: data.tags,
          deadline: data.deadline || undefined,
        },
      }

      setTasks((previous) =>
        previous.map((task) =>
          task.id === editingTask.id
            ? { ...task, ...updatedTask, updated_at: new Date().toISOString() }
            : task
        )
      )

      fetch(`/api/tasks/${editingTask.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedTask),
      })
      return
    }

    const response = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: data.title,
        description: data.description || null,
        column_id: data.column_id,
        priority: data.priority,
        position: getColumnTasks(data.column_id).length,
        metadata: {
          tags: data.tags,
          deadline: data.deadline || undefined,
        },
      }),
    })

    if (response.ok) {
      const { task } = await response.json()
      setTasks((previous) => [...previous, task])
    }
  }

  function handleCreateClick() {
    setEditingTask(null)
    setDefaultColumnId(columns[0]?.id)
    setDialogOpen(true)
  }

  function handleDeleteTask(taskId: string) {
    setTasks((previous) => previous.filter((task) => task.id !== taskId))
    fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
  }

  const visibleTaskCount = hasActiveFilters ? filteredTasks.length : tasks.length

  return (
    <div className="flex h-full min-h-0 flex-col">
      <KanbanToolbar
        visibleCount={visibleTaskCount}
        totalCount={tasks.length}
        overdueCount={overdueCount}
        priorityCounts={priorityCounts}
        filters={filters}
        onFiltersChange={setFilters}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onCreateClick={handleCreateClick}
        onOverdueClick={() => setFilters((current) => ({ ...current, overdueOnly: !current.overdueOnly }))}
        searchInputRef={searchInputRef}
      />

      <KanbanActivityStrip tasks={tasks} />

      <div className="min-h-0 flex-1 px-4 pb-4 pt-3 sm:px-5">
        <Kanban<Task>
          value={kanbanValue}
          onValueChange={handleKanbanValueChange}
          getItemValue={(task) => task.id}
          flatCursor
          onDragStart={() => {
            draggingRef.current = true
          }}
          onDragCancel={() => {
            draggingRef.current = false
          }}
          onDragEnd={() => {
            draggingRef.current = false
          }}
        >
          <KanbanBoardPrimitive className="flex h-full min-h-0 items-stretch gap-4 overflow-x-auto pb-2">
            {[...columns]
              .sort((left, right) => left.position - right.position)
              .map((column) => {
                const columnTasks = kanbanValue[column.id] ?? []
                const progressPct = visibleTaskCount > 0 ? (columnTasks.length / visibleTaskCount) * 100 : 0
                const columnHeadingId = `kanban-column-${column.id}`

                return (
                  <KanbanColumn key={column.id} value={column.id} className="flex h-full min-w-[18rem] max-w-[24rem] flex-1">
                    <section
                      aria-labelledby={columnHeadingId}
                      className="flex h-full min-h-0 w-full flex-col rounded-[24px] border border-border/70 bg-background shadow-[0_18px_46px_-34px_rgba(0,0,0,0.75)]"
                    >
                      <div className="border-b border-border/60 px-4 pb-4 pt-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <h3 id={columnHeadingId} className="text-sm font-medium text-foreground">
                              {column.title}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              {getColumnSummary(columnTasks.length)}
                            </p>
                          </div>

                          <Badge variant="outline" className="bg-background font-mono">
                            {columnTasks.length}
                          </Badge>
                        </div>

                        <Progress value={progressPct} className="mt-3 h-1.5 bg-muted/80" />
                      </div>

                      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3 pt-3">
                        {columnTasks.length === 0 && (
                          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/15 px-4 py-6 text-center text-sm text-muted-foreground">
                            Nothing here yet. Add a task or drop one into this column.
                          </div>
                        )}

                        {columnTasks.map((task) => (
                          <KanbanItem key={task.id} value={task.id} asHandle>
                            <KanbanCard task={task} onEdit={handleEditTask} onArchive={handleArchiveTask} />
                          </KanbanItem>
                        ))}

                        <QuickAddInline columnId={column.id} onQuickAdd={handleQuickAddTask} className={columnTasks.length === 0 ? 'mt-0' : 'mt-auto'} />
                      </div>
                    </section>
                  </KanbanColumn>
                )
              })}

            {hasActiveFilters && visibleTaskCount === 0 && (
              <div className="flex min-h-full min-w-[22rem] flex-1 items-center justify-center">
                <Empty className="max-w-md border border-dashed border-border/70 bg-muted/15">
                  <EmptyMedia variant="icon">
                    <IconPlus size={16} />
                  </EmptyMedia>
                  <EmptyTitle>No tasks match the current view</EmptyTitle>
                  <EmptyDescription>
                    Clear a filter, refine your search, or create a fresh task to get work moving again.
                  </EmptyDescription>
                  <Button type="button" variant="outline" onClick={handleCreateClick}>
                    Create task
                  </Button>
                </Empty>
              </div>
            )}
          </KanbanBoardPrimitive>

          <KanbanOverlay>
            {({ value, variant }) => {
              if (variant === 'column') return null
              const task = tasks.find((candidate) => candidate.id === value)
              if (!task) return null
              return <KanbanCard task={{ ...task, id: '_overlay_' }} />
            }}
          </KanbanOverlay>
        </Kanban>
      </div>

      {undoToast.visible && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-50 flex min-w-[18rem] -translate-x-1/2 items-center gap-3 rounded-2xl border border-border/70 bg-background p-3 shadow-[0_20px_40px_-26px_rgba(0,0,0,0.7)]"
        >
          <span className="flex-1 text-sm font-medium text-foreground">
            {undoToast.message}
          </span>
          <Button type="button" variant="secondary" size="sm" onClick={handleUndoArchive}>
            Undo
          </Button>
        </div>
      )}

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editingTask}
        columns={columns}
        defaultColumnId={defaultColumnId}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
      />
    </div>
  )
}

function QuickAddInline({
  columnId,
  className,
  onQuickAdd,
}: {
  columnId: string
  className?: string
  onQuickAdd: (columnId: string, title: string, priority?: string) => void
}) {
  const [isAdding, setIsAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [quickPriority, setQuickPriority] = useState<string>('medium')

  const priorityIndex = PRIORITY_CYCLE.indexOf(quickPriority as (typeof PRIORITY_CYCLE)[number])

  function resetForm() {
    setIsAdding(false)
    setNewTitle('')
    setQuickPriority('medium')
  }

  function handleCreate() {
    if (!newTitle.trim()) return
    onQuickAdd(columnId, newTitle.trim(), quickPriority)
    resetForm()
  }

  return isAdding ? (
    <div className={cn('rounded-2xl border border-dashed border-border/70 bg-muted/10 p-3', className)}>
      <div className="flex flex-col gap-3">
        <Input
          value={newTitle}
          onChange={(event) => setNewTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              handleCreate()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              resetForm()
            }
          }}
          placeholder="Add a task title"
          className="h-10 rounded-xl bg-background"
          autoFocus
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setQuickPriority(PRIORITY_CYCLE[(priorityIndex + 1) % PRIORITY_CYCLE.length])
            }
          >
            Priority: {quickPriority}
          </Button>

          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleCreate} disabled={!newTitle.trim()}>
              Add task
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Press Enter to create quickly, or use the priority toggle before saving.
        </p>
      </div>
    </div>
  ) : (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => setIsAdding(true)}
      className={cn(
        'w-full rounded-2xl border border-dashed border-border/70 py-5 text-muted-foreground hover:border-border hover:bg-muted/20 hover:text-foreground',
        className
      )}
    >
      <IconPlus data-icon className="size-4" />
      Add task
    </Button>
  )
}
