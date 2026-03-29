'use client'

import { useState, useCallback, useRef, useMemo } from 'react'
import type { UniqueIdentifier } from '@dnd-kit/core'
import {
  Kanban,
  KanbanBoard as KanbanBoardPrimitive,
  KanbanColumn,
  KanbanItem,
  KanbanOverlay,
} from '@/components/ui/kanban'
import { KanbanCard } from './kanban-card'
import { KanbanToolbar, type FilterState } from './kanban-toolbar'
import { KanbanActivityStrip } from './kanban-activity-strip'
import { CompletionAnimation } from './completion-animation'
import { TaskDialog } from './task-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { IconPlus } from '@tabler/icons-react'
import type { Task, KanbanColumn as ColumnType } from '@/lib/types'
import { useRealtime } from '@/hooks/use-realtime'

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

export function KanbanBoard({ initialColumns, initialTasks, doneColumnId }: KanbanBoardProps) {
  const deduplicatedColumns = useMemo(() => {
    const seen = new Set<string>()
    return initialColumns.filter(col => {
      const key = (col.title ?? col.id).toLowerCase().trim()
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

  const [filters, setFilters] = useState<FilterState>({ priority: null, source: 'all' })
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const [completionAnim, setCompletionAnim] = useState<{
    trigger: boolean
    x: number
    y: number
    variant: 'checkmark' | 'confetti' | 'ripple'
  }>({ trigger: false, x: 0, y: 0, variant: 'checkmark' })

  const [undoToast, setUndoToast] = useState<UndoToastState>({
    visible: false,
    message: '',
    task: null,
    timeoutId: null,
  })

  const draggingRef = useRef(false)

  const resolvedDoneId = doneColumnId ?? columns.find(
    (c) => c.title?.toLowerCase() === 'done'
  )?.id

  const filteredTasks = useMemo(() => {
    let result = tasks
    if (filters.priority) {
      result = result.filter((t) => t.priority === filters.priority)
    }
    if (filters.source === 'bitbit') {
      result = result.filter((t) => {
        const meta = t.metadata as Record<string, unknown>
        return meta?.source === 'bitbit' || t.assigned_to
      })
    } else if (filters.source === 'you') {
      result = result.filter((t) => {
        const meta = t.metadata as Record<string, unknown>
        return meta?.source !== 'bitbit' && !t.assigned_to
      })
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((t) =>
        (t.title ?? '').toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
      )
    }
    return result
  }, [tasks, filters, searchQuery])

  const isFiltered = filters.priority !== null || filters.source !== 'all' || searchQuery.trim() !== ''

  const overdueCount = useMemo(() => {
    const now = Date.now()
    return tasks.filter((t) => {
      const meta = t.metadata as Record<string, unknown>
      const dl = meta?.deadline as string | undefined
      return dl && new Date(dl).getTime() < now
    }).length
  }, [tasks])

  const priorityCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const t of tasks) {
      if (t.priority) counts[t.priority] = (counts[t.priority] || 0) + 1
    }
    return counts
  }, [tasks])

  // Build the kanban value: Record<UniqueIdentifier, Task[]>
  const kanbanValue = useMemo(() => {
    const source = isFiltered ? filteredTasks : tasks
    const record: Record<UniqueIdentifier, Task[]> = {}
    for (const col of columns) {
      record[col.id] = source
        .filter((t) => t.column_id === col.id)
        .sort((a, b) => a.position - b.position)
    }
    return record
  }, [columns, tasks, filteredTasks, isFiltered])

  useRealtime({
    table: 'tasks',
    onChange: (payload) => {
      if (draggingRef.current) return
      if (payload.eventType === 'INSERT') {
        const newTask = payload.new as Task
        setTasks((prev) => {
          if (prev.some((t) => t.id === newTask.id)) return prev
          const tempIdx = prev.findIndex(t =>
            t.id.startsWith('temp-') && t.title === newTask.title && t.column_id === newTask.column_id
          )
          if (tempIdx >= 0) {
            const next = [...prev]
            next[tempIdx] = newTask
            return next
          }
          return [...prev, newTask]
        })
      } else if (payload.eventType === 'UPDATE') {
        const updated = payload.new as Task
        if (updated.status === 'archived') {
          setTasks((prev) => prev.filter((t) => t.id !== updated.id))
        } else {
          setTasks((prev) =>
            prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t))
          )
        }
      } else if (payload.eventType === 'DELETE') {
        const old = payload.old as { id: string }
        setTasks((prev) => prev.filter((t) => t.id !== old.id))
      }
    },
  })

  const handleKanbanValueChange = useCallback((newValue: Record<UniqueIdentifier, Task[]>) => {
    // Flatten back to task array with updated column_id and position
    const updatedTasks: Task[] = []
    const changedTasks: Array<{ id: string; column_id: string; position: number }> = []

    for (const [colId, colTasks] of Object.entries(newValue)) {
      colTasks.forEach((task, idx) => {
        const updated = { ...task, column_id: colId, position: idx }
        updatedTasks.push(updated)

        // Track changes for API
        const original = tasks.find((t) => t.id === task.id)
        if (!original || original.column_id !== colId || original.position !== idx) {
          changedTasks.push({ id: task.id, column_id: colId, position: idx })
        }
      })
    }

    // Also keep tasks not in any visible column
    const columnIds = new Set(Object.keys(newValue))
    const orphanedTasks = tasks.filter((t) => !columnIds.has(t.column_id ?? ''))
    setTasks([...updatedTasks, ...orphanedTasks])

    // Persist changes
    if (changedTasks.length > 0) {
      fetch('/api/tasks/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: changedTasks }),
      })
    }
  }, [tasks])

  const getColumnTasks = useCallback(
    (columnId: string) => {
      const source = isFiltered ? filteredTasks : tasks
      return source
        .filter((t) => t.column_id === columnId)
        .sort((a, b) => a.position - b.position)
    },
    [tasks, filteredTasks, isFiltered]
  )

  const handleQuickAddTask = useCallback(function handleQuickAddTask(columnId: string, title: string, priority?: string) {
    const tempId = `temp-${Date.now()}`
    const position = getColumnTasks(columnId).length
    const now = new Date().toISOString()
    const pri = priority || 'medium'

    setTasks((prev) => [...prev, {
      id: tempId, title, description: null, column_id: columnId,
      priority: pri, position, status: 'pending',
      assigned_to: null, metadata: {}, org_id: '',
      created_at: now, updated_at: now,
    } as Task])

    fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, column_id: columnId, priority: pri, position }),
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(({ task }) => setTasks(prev => prev.map(t => t.id === tempId ? task : t)))
      .catch(() => setTasks(prev => prev.filter(t => t.id !== tempId)))
  }, [getColumnTasks])

  const handleEditTask = useCallback(function handleEditTask(task: Task) {
    setEditingTask(task)
    setDefaultColumnId(undefined)
    setDialogOpen(true)
  }, [])

  const handleArchiveTask = useCallback(function handleArchiveTask(task: Task) {
    if (undoToast.timeoutId) clearTimeout(undoToast.timeoutId)

    setTasks((prev) => prev.filter((t) => t.id !== task.id))

    const timeoutId = setTimeout(() => {
      setUndoToast({ visible: false, message: '', task: null, timeoutId: null })
    }, 5000)

    setUndoToast({
      visible: true,
      message: `Task archived`,
      task,
      timeoutId,
    })

    fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleUndoArchive() {
    const { task } = undoToast
    if (!task) return

    if (undoToast.timeoutId) clearTimeout(undoToast.timeoutId)

    setTasks((prev) => {
      if (prev.some((t) => t.id === task.id)) return prev
      return [...prev, task]
    })

    setUndoToast({ visible: false, message: '', task: null, timeoutId: null })

    fetch(`/api/tasks/${task.id}`, {
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
      const updated = {
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

      setTasks((prev) =>
        prev.map((t) =>
          t.id === editingTask.id
            ? { ...t, ...updated, updated_at: new Date().toISOString() }
            : t
        )
      )

      fetch(`/api/tasks/${editingTask.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      })
    } else {
      const res = await fetch('/api/tasks', {
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

      if (res.ok) {
        const { task } = await res.json()
        setTasks((prev) => [...prev, task])
      }
    }
  }

  function handleCreateClick() {
    setEditingTask(null)
    setDefaultColumnId(columns[0]?.id)
    setDialogOpen(true)
  }

  function handleDeleteTask(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
    fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
  }

  const totalTaskCount = isFiltered ? filteredTasks.length : tasks.length

  return (
    <div className="flex h-full flex-col">
      <KanbanToolbar
        totalCount={tasks.length}
        overdueCount={overdueCount}
        priorityCounts={priorityCounts}
        filters={filters}
        onFiltersChange={setFilters}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onCreateClick={handleCreateClick}
        onOverdueClick={() => setFilters({ priority: null, source: 'all' })}
        searchInputRef={searchInputRef}
      />

      <KanbanActivityStrip tasks={tasks} />

      <Kanban<Task>
        value={kanbanValue}
        onValueChange={handleKanbanValueChange}
        getItemValue={(task) => task.id}
        flatCursor
      >
        <KanbanBoardPrimitive className="flex min-h-0 flex-1 items-stretch gap-2 overflow-x-auto pb-2">
          {columns
            .sort((a, b) => a.position - b.position)
            .map((column) => {
              const colTasks = kanbanValue[column.id] ?? []
              const isEmpty = colTasks.length === 0
              const progressPct = totalTaskCount > 0 ? (colTasks.length / totalTaskCount) * 100 : 0

              return (
                <KanbanColumn
                  key={column.id}
                  value={column.id}
                  className="flex h-full flex-col transition-all duration-150"
                  style={{
                    flex: isEmpty ? '0 0 auto' : 1,
                    minWidth: isEmpty ? 120 : 200,
                  }}
                >
                  {/* Column header */}
                  <div className="px-1.5 pb-1">
                    <div className="flex items-center gap-2 pb-2">
                      <h3 className="text-sm font-medium text-muted-foreground">
                        {column.title}
                      </h3>
                      <Badge variant="secondary" className="font-mono text-xs">
                        {colTasks.length}
                      </Badge>
                    </div>
                    <Progress value={progressPct} className="h-0.5 opacity-0 transition-opacity group-hover/card:opacity-100" />
                  </div>

                  {/* Droppable area */}
                  <div
                    className={`flex flex-1 flex-col gap-2 overflow-y-auto rounded-xl border p-2 transition-colors duration-100 scrollbar-none ${
                      isEmpty ? 'border-transparent bg-muted/30' : 'border-transparent bg-muted/30'
                    }`}
                  >
                    {colTasks.map((task) => (
                      <KanbanItem key={task.id} value={task.id} asHandle>
                        <KanbanCard
                          task={task}
                          onEdit={handleEditTask}
                          onArchive={handleArchiveTask}
                        />
                      </KanbanItem>
                    ))}

                    {/* Quick add button */}
                    <QuickAddInline
                      columnId={column.id}
                      isEmpty={isEmpty}
                      onQuickAdd={handleQuickAddTask}
                    />
                  </div>
                </KanbanColumn>
              )
            })}
        </KanbanBoardPrimitive>

        <KanbanOverlay>
          {({ value, variant }) => {
            if (variant === 'column') return null
            const task = tasks.find((t) => t.id === value)
            if (!task) return null
            return <KanbanCard task={{ ...task, id: `_overlay_` }} />
          }}
        </KanbanOverlay>
      </Kanban>

      <CompletionAnimation
        trigger={completionAnim.trigger}
        x={completionAnim.x}
        y={completionAnim.y}
        variant={completionAnim.variant}
        onComplete={() => setCompletionAnim((prev) => ({ ...prev, trigger: false }))}
      />

      {/* Undo Archive Toast */}
      {undoToast.visible && (
        <div className="fixed bottom-6 left-1/2 z-50 flex min-w-[280px] -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-popover p-3 shadow-lg animate-in slide-in-from-bottom-2">
          <span className="flex-1 text-sm font-medium text-popover-foreground">
            {undoToast.message}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleUndoArchive}
          >
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

// ---------------------------------------------------------------------------
// Inline quick-add component (extracted from KanbanColumn)
// ---------------------------------------------------------------------------

function QuickAddInline({
  columnId,
  isEmpty,
  onQuickAdd,
}: {
  columnId: string
  isEmpty: boolean
  onQuickAdd: (columnId: string, title: string, priority?: string) => void
}) {
  const [isAdding, setIsAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [quickPriority, setQuickPriority] = useState<string>('medium')
  const inputRef = useRef<HTMLInputElement>(null)

  function handleCreate() {
    if (!newTitle.trim()) return
    onQuickAdd(columnId, newTitle.trim(), quickPriority)
    setNewTitle('')
    setQuickPriority('medium')
  }

  if (isAdding) {
    return (
      <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <span
            className="size-1.5 shrink-0 rounded-full transition-colors"
            style={{
              backgroundColor:
                quickPriority === 'critical' ? 'hsl(var(--destructive))' :
                quickPriority === 'high' ? 'hsl(43 96% 56%)' :
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
            autoFocus
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Enter create / Tab priority / Esc close
        </p>
      </div>
    )
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setIsAdding(true)}
      className={`w-full gap-1 border border-dashed border-border/50 text-muted-foreground hover:border-border hover:text-foreground ${isEmpty ? '' : 'mt-auto'}`}
    >
      <IconPlus data-icon className="size-3.5" />
      {!isEmpty && 'Add task'}
    </Button>
  )
}
