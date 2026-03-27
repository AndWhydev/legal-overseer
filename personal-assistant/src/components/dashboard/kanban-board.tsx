'use client'

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  closestCorners,
  type CollisionDetection,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { KanbanColumn } from './kanban-column'
import { KanbanCard } from './kanban-card'
import { KanbanToolbar, type FilterState } from './kanban-toolbar'
import { KanbanActivityStrip } from './kanban-activity-strip'
import { CompletionAnimation } from './completion-animation'
import { TaskDialog } from './task-dialog'
import { Button } from '@/components/ui/button'
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
  const [activeTask, setActiveTask] = useState<Task | null>(null)
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
  const activeWidthRef = useRef(0)
  const expandedColWidthRef = useRef(0)
  const lastOverColumnRef = useRef<string | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointerHits = pointerWithin(args)
    if (pointerHits.length > 0) return pointerHits
    return closestCorners(args)
  }, [])

  const getColumnTasks = useCallback(
    (columnId: string) => {
      const source = isFiltered ? filteredTasks : tasks
      return source
        .filter((t) => t.column_id === columnId)
        .sort((a, b) => a.position - b.position)
    },
    [tasks, filteredTasks, isFiltered]
  )

  function handleDragStart(event: DragStartEvent) {
    draggingRef.current = true
    const el = (event.activatorEvent as PointerEvent).target as HTMLElement | null
    const card = el?.closest?.('.card-lift') as HTMLElement | null
    const w = card?.offsetWidth ?? 0
    activeWidthRef.current = w
    lastOverColumnRef.current = null
    const populatedCol = document.querySelector('[data-col-id].kanban-col-populated') as HTMLElement | null
    expandedColWidthRef.current = populatedCol
      ? populatedCol.clientWidth - 12
      : w
    const task = tasks.find((t) => t.id === event.active.id)
    if (task) setActiveTask(task)
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    const overTask = tasks.find((t) => t.id === overId)
    const targetColumnId = overTask ? overTask.column_id : overId

    const isValidColumn = columns.some((c) => c.id === targetColumnId)
    if (!isValidColumn || !targetColumnId) return

    if (lastOverColumnRef.current === targetColumnId) return
    lastOverColumnRef.current = targetColumnId

    setTasks((prev) => {
      const current = prev.find((t) => t.id === activeId)
      if (!current || current.column_id === targetColumnId) return prev
      return prev.map((t) =>
        t.id === activeId ? { ...t, column_id: targetColumnId } : t
      )
    })

    const targetWidth = expandedColWidthRef.current
    if (targetWidth > 0 && overlayRef.current) {
      overlayRef.current.style.width = `${targetWidth}px`
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    draggingRef.current = false
    lastOverColumnRef.current = null
    const draggedTask = activeTask
    setActiveTask(null)
    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    const activeTaskItem = tasks.find((t) => t.id === activeId)
    if (!activeTaskItem) return

    const overTaskItem = tasks.find((t) => t.id === overId)

    let updatedTasks = tasks

    if (overTaskItem && activeTaskItem.column_id === overTaskItem.column_id && activeId !== overId) {
      const columnTasks = tasks
        .filter((t) => t.column_id === activeTaskItem.column_id)
        .sort((a, b) => a.position - b.position)

      const oldIndex = columnTasks.findIndex((t) => t.id === activeId)
      const newIndex = columnTasks.findIndex((t) => t.id === overId)
      const reordered = arrayMove(columnTasks, oldIndex, newIndex).map(
        (t, i) => ({ ...t, position: i })
      )

      const otherTasks = tasks.filter(
        (t) => t.column_id !== activeTaskItem.column_id
      )
      updatedTasks = [...otherTasks, ...reordered]
      setTasks(updatedTasks)
    }

    const changedTasks = updatedTasks.filter((t) => {
      const original = initialTasks.find((o) => o.id === t.id)
      return !original || original.column_id !== t.column_id || original.position !== t.position
    })

    if (changedTasks.length > 0) {
      const updates = changedTasks.map((t) => ({
        id: t.id,
        column_id: t.column_id!,
        position: t.position,
      }))
      fetch('/api/tasks/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
    }
  }

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

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex min-h-0 flex-1 items-stretch gap-2 overflow-x-auto pb-2">
          {columns
            .sort((a, b) => a.position - b.position)
            .map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                tasks={getColumnTasks(column.id)}
                totalTaskCount={isFiltered ? filteredTasks.length : tasks.length}
                onQuickAdd={handleQuickAddTask}
                onEditTask={handleEditTask}
                onArchiveTask={handleArchiveTask}
              />
            ))}
        </div>

        <DragOverlay dropAnimation={{ duration: 150, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
          {activeTask ? (
            <div
              ref={overlayRef}
              className="transition-[width] duration-150"
              style={{ width: activeWidthRef.current || undefined }}
            >
              <KanbanCard task={{ ...activeTask, id: `_overlay_` }} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

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

      <style>{`
        .card-lift:hover .kanban-card-actions { opacity: 1 !important; }
        @keyframes bb-agent-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
      `}</style>

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
