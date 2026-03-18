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
  // Deduplicate columns by title (case-insensitive) to prevent duplicates from being rendered
  // Database may contain duplicate columns with different IDs but same title
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

  // Filter + search state
  const [filters, setFilters] = useState<FilterState>({ priority: null, source: 'all' })
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  // Completion animation state
  const [completionAnim, setCompletionAnim] = useState<{
    trigger: boolean
    x: number
    y: number
    variant: 'checkmark' | 'confetti' | 'ripple'
  }>({ trigger: false, x: 0, y: 0, variant: 'checkmark' })

  // Undo toast state
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

  // Resolve the "done" column — explicit prop, or guess by title
  const resolvedDoneId = doneColumnId ?? columns.find(
    (c) => c.title?.toLowerCase() === 'done'
  )?.id

  // Filtered tasks (display-only — DnD always uses full `tasks`)
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
          // Replace temp task if matching title+column
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

  // Pointer-first collision: use cursor position, fall back to closest corners when between gaps
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
    // Measure the source card's width
    const el = (event.activatorEvent as PointerEvent).target as HTMLElement | null
    const card = el?.closest?.('.card-lift') as HTMLElement | null
    const w = card?.offsetWidth ?? 0
    activeWidthRef.current = w
    lastOverColumnRef.current = null
    // Compute the expanded (flex:1) card width for all columns.
    // When a column expands from collapsed, it becomes flex:1 like the others.
    // Find any populated column's card width — that's the expanded target.
    const populatedCol = document.querySelector('[data-col-id].kanban-col-populated') as HTMLElement | null
    expandedColWidthRef.current = populatedCol
      ? populatedCol.clientWidth - 12  // minus 6px padding each side
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

    // Skip if we already moved to this column — prevents re-render loops
    if (lastOverColumnRef.current === targetColumnId) return
    lastOverColumnRef.current = targetColumnId

    setTasks((prev) => {
      const current = prev.find((t) => t.id === activeId)
      if (!current || current.column_id === targetColumnId) return prev
      return prev.map((t) =>
        t.id === activeId ? { ...t, column_id: targetColumnId } : t
      )
    })

    // Resize overlay via direct DOM mutation — zero re-renders
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

    // Same column reorder
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

    // Completion animation removed — keep drag experience clean and fast

    // Persist changes
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
    // Clear any existing timeout
    if (undoToast.timeoutId) clearTimeout(undoToast.timeoutId)

    // Remove from UI immediately
    setTasks((prev) => prev.filter((t) => t.id !== task.id))

    // Show undo toast with 5-second auto-dismiss
    const timeoutId = setTimeout(() => {
      setUndoToast({ visible: false, message: '', task: null, timeoutId: null })
    }, 5000)

    setUndoToast({
      visible: true,
      message: `Task archived`,
      task,
      timeoutId,
    })

    // Persist archive to backend
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

    // Clear timeout
    if (undoToast.timeoutId) clearTimeout(undoToast.timeoutId)

    // Restore task to board
    setTasks((prev) => {
      if (prev.some((t) => t.id === task.id)) return prev
      return [...prev, task]
    })

    // Hide toast
    setUndoToast({ visible: false, message: '', task: null, timeoutId: null })

    // Restore in backend
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, flex: 1, minHeight: 0, alignItems: 'stretch' }}>
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
              style={{
                width: activeWidthRef.current || undefined,
                transition: 'width 0.15s cubic-bezier(0.25, 0.1, 0.25, 1)',
              }}
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
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            borderRadius: 12,
            background: 'var(--glass-bg-heavy)',
            backdropFilter: 'var(--glass-blur)',
            WebkitBackdropFilter: 'var(--glass-blur)',
            boxShadow: 'var(--card-shadow-hover), var(--card-inset)',
            zIndex: 1000,
            animation: 'slide-up 0.3s ease-out',
            minWidth: 280,
            justifyContent: 'space-between',
          }}
        >
          <span style={{
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--text-secondary)',
            flex: 1,
          }}>
            {undoToast.message}
          </span>
          <button
            onClick={handleUndoArchive}
            style={{
              background: 'var(--hover-bg-strong)',
              border: 'none',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--text-primary)',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'background 0.15s ease',
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border-active)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--hover-bg-strong)' }}
          >
            Undo
          </button>
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
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
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
