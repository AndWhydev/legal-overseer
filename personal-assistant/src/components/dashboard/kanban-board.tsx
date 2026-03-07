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
  closestCorners,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { KanbanColumn } from './kanban-column'
import { KanbanCard } from './kanban-card'
import { KanbanToolbar, type FilterState } from './kanban-toolbar'
import { KanbanAgentStrip } from './kanban-agent-strip'
import { CompletionAnimation } from './completion-animation'
import { TaskDialog } from './task-dialog'
import type { Task, KanbanColumn as ColumnType } from '@/lib/types'
import { useRealtime } from '@/hooks/use-realtime'

interface KanbanBoardProps {
  initialColumns: ColumnType[]
  initialTasks: Task[]
  doneColumnId?: string
}

export function KanbanBoard({ initialColumns, initialTasks, doneColumnId }: KanbanBoardProps) {
  const [columns] = useState(initialColumns)
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

  const draggingRef = useRef(false)

  // Resolve the "done" column — explicit prop, or guess by title
  const resolvedDoneId = doneColumnId ?? columns.find(
    (c) => c.title.toLowerCase() === 'done'
  )?.id

  // Cmd+K shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Filtered tasks (display-only — DnD always uses full `tasks`)
  const filteredTasks = useMemo(() => {
    let result = tasks
    if (filters.priority) {
      result = result.filter((t) => t.priority === filters.priority)
    }
    if (filters.source === 'agent') {
      result = result.filter((t) => {
        const meta = t.metadata as Record<string, unknown>
        return meta?.source === 'bitbit' || t.assigned_to
      })
    } else if (filters.source === 'manual') {
      result = result.filter((t) => {
        const meta = t.metadata as Record<string, unknown>
        return meta?.source !== 'bitbit' && !t.assigned_to
      })
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
      )
    }
    return result
  }, [tasks, filters, searchQuery])

  const isFiltered = filters.priority !== null || filters.source !== 'all' || searchQuery.trim() !== ''

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
    const task = tasks.find((t) => t.id === event.active.id)
    if (task) setActiveTask(task)
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    const activeTaskItem = tasks.find((t) => t.id === activeId)
    if (!activeTaskItem) return

    const overTask = tasks.find((t) => t.id === overId)
    const targetColumnId = overTask ? overTask.column_id : overId

    const isValidColumn = columns.some((c) => c.id === targetColumnId)
    if (!isValidColumn) return

    if (activeTaskItem.column_id !== targetColumnId) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === activeId ? { ...t, column_id: targetColumnId } : t
        )
      )
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    draggingRef.current = false
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

    // Fire completion animation if task was dragged to Done column
    if (
      resolvedDoneId &&
      draggedTask &&
      activeTaskItem.column_id === resolvedDoneId &&
      draggedTask.column_id !== resolvedDoneId
    ) {
      // Place animation near mouse/pointer
      const rect = (event.activatorEvent as PointerEvent)
      const x = rect?.clientX ?? window.innerWidth / 2
      const y = rect?.clientY ?? window.innerHeight / 2
      setCompletionAnim({ trigger: true, x, y, variant: 'confetti' })
    }

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

  function handleQuickAddTask(columnId: string, title: string, priority?: string) {
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
  }

  function handleEditTask(task: Task) {
    setEditingTask(task)
    setDefaultColumnId(undefined)
    setDialogOpen(true)
  }

  function handleArchiveTask(task: Task) {
    setTasks((prev) => prev.filter((t) => t.id !== task.id))
    fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
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
        filters={filters}
        onFiltersChange={setFilters}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onCreateClick={handleCreateClick}
        searchInputRef={searchInputRef}
      />

      <KanbanAgentStrip tasks={tasks} />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, flex: 1, minHeight: 0, alignItems: 'stretch' }}>
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

        <DragOverlay>
          {activeTask ? (
            <div style={{
              width: 268,
              transform: 'rotate(2deg)',
              filter: 'drop-shadow(0 16px 32px rgba(0,0,0,0.4))',
            }}>
              <KanbanCard task={activeTask} />
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
