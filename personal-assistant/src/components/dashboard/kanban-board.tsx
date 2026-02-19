'use client'

import { useState, useCallback, useRef } from 'react'
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
import { Plus } from 'lucide-react'
import { KanbanColumn } from './kanban-column'
import { KanbanCard } from './kanban-card'
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

  useRealtime({
    table: 'tasks',
    onChange: (payload) => {
      if (draggingRef.current) return
      if (payload.eventType === 'INSERT') {
        const newTask = payload.new as Task
        setTasks((prev) =>
          prev.some((t) => t.id === newTask.id) ? prev : [...prev, newTask]
        )
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
    (columnId: string) =>
      tasks
        .filter((t) => t.column_id === columnId)
        .sort((a, b) => a.position - b.position),
    [tasks]
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

  function handleAddTask(columnId: string) {
    setEditingTask(null)
    setDefaultColumnId(columnId)
    setDialogOpen(true)
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

  function handleDeleteTask(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
    fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns
            .sort((a, b) => a.position - b.position)
            .map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                tasks={getColumnTasks(column.id)}
                totalOrgTasks={tasks.length}
                onAddTask={handleAddTask}
                onEditTask={handleEditTask}
                onArchiveTask={handleArchiveTask}
              />
            ))}

          <button className="flex h-10 w-[300px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-[#484f58] hover:text-foreground">
            <Plus className="h-4 w-4" />
            Add Column
          </button>
        </div>

        <DragOverlay>
          {activeTask ? (
            <div className="w-[276px] rotate-2">
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
    </>
  )
}
