'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { IconCalendar, IconPencil, IconTrash } from '@tabler/icons-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { Task, KanbanColumn } from '@/lib/types'

import { MarkdownRenderer } from './markdown-renderer'

interface TaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task?: Task | null
  columns: KanbanColumn[]
  defaultColumnId?: string
  onSave: (data: {
    title: string
    description: string
    column_id: string
    priority: string
    tags: string[]
    deadline: string
  }) => void
  onDelete?: (taskId: string) => void
}

interface TaskDraftState {
  editMode: boolean
  title: string
  description: string
  columnId: string
  priority: string
  tags: string
  deadline: string
}

const PRIORITY_OPTIONS = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

function parseTags(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function formatDeadlineLabel(deadline: string) {
  const parsed = new Date(deadline)
  if (Number.isNaN(parsed.getTime())) {
    return deadline
  }

  return parsed.toLocaleDateString('en-AU', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getPriorityBadgeClass(priority: string) {
  if (priority === 'critical') {
    return 'bg-destructive text-white'
  }
  if (priority === 'high') {
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
  }
  if (priority === 'medium') {
    return 'bg-secondary text-secondary-foreground'
  }
  return 'bg-muted text-muted-foreground'
}

function createDraftState(task: Task | null | undefined, defaultColumnId: string | undefined, columns: KanbanColumn[]): TaskDraftState {
  if (task) {
    const metadata = (task.metadata ?? {}) as Record<string, unknown>
    return {
      editMode: false,
      title: task.title,
      description: task.description || '',
      columnId: task.column_id || defaultColumnId || columns[0]?.id || '',
      priority: task.priority || 'medium',
      tags: ((metadata.tags as string[]) || []).join(', '),
      deadline: typeof metadata.deadline === 'string' ? metadata.deadline : '',
    }
  }

  return {
    editMode: true,
    title: '',
    description: '',
    columnId: defaultColumnId || columns[0]?.id || '',
    priority: 'medium',
    tags: '',
    deadline: '',
  }
}

export function TaskDialog(props: TaskDialogProps) {
  const { open, onOpenChange, task, defaultColumnId, columns } = props

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <TaskDialogPanel
          key={`${task?.id ?? 'new'}:${defaultColumnId ?? 'default'}:${columns.map((column) => column.id).join(',')}`}
          {...props}
        />
      )}
    </Dialog>
  )
}

function TaskDialogPanel({
  task,
  columns,
  defaultColumnId,
  onOpenChange,
  onSave,
  onDelete,
}: Omit<TaskDialogProps, 'open'>) {
  const initialState = useMemo(
    () => createDraftState(task, defaultColumnId, columns),
    [task, defaultColumnId, columns]
  )

  const [editMode, setEditMode] = useState(initialState.editMode)
  const [title, setTitle] = useState(initialState.title)
  const [description, setDescription] = useState(initialState.description)
  const [columnId, setColumnId] = useState(initialState.columnId)
  const [priority, setPriority] = useState(initialState.priority)
  const [tags, setTags] = useState(initialState.tags)
  const [deadline, setDeadline] = useState(initialState.deadline)

  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editMode) return

    const timeoutId = window.setTimeout(() => titleRef.current?.focus(), 30)
    return () => window.clearTimeout(timeoutId)
  }, [editMode])

  const tagList = useMemo(() => parseTags(tags), [tags])
  const selectedColumn = columns.find((column) => column.id === columnId)
  const selectedPriority = PRIORITY_OPTIONS.find((option) => option.value === priority)
  const metadata = ((task?.metadata as Record<string, unknown>) ?? {})
  const sourceChannel = typeof metadata.source_channel === 'string' ? metadata.source_channel : undefined
  const isAiCreated = metadata.source === 'bitbit'
  const agentStatus = typeof metadata.agentStatus === 'string' ? metadata.agentStatus : undefined

  function handleSubmit(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault()

    if (!title.trim() || !columnId) return

    onSave({
      title: title.trim(),
      description: description.trim(),
      column_id: columnId,
      priority,
      tags: tagList,
      deadline: deadline.trim(),
    })

    onOpenChange(false)
  }

  function handleDelete() {
    if (!task || !onDelete) return
    onDelete(task.id)
    onOpenChange(false)
  }

  return (
    <DialogContent
      showCloseButton
      className="max-h-[min(86vh,48rem)] max-w-2xl gap-0 overflow-hidden rounded-[28px] border border-border bg-background p-0 shadow-lg"
    >
      {editMode ? (
        <form onSubmit={handleSubmit} className="flex max-h-[inherit] flex-col">
          <div className="overflow-y-auto px-6 py-6 sm:px-7">
            <DialogHeader className="gap-2">
              <DialogTitle className="text-xl tracking-tight">
                {task ? 'Update task' : 'Create a task'}
              </DialogTitle>
              <DialogDescription>
                Keep the details lightweight but structured enough that the board stays readable and actionable.
              </DialogDescription>
            </DialogHeader>

            <FieldGroup className="mt-6 gap-5">
              <Field>
                <FieldLabel htmlFor="task-title">Title</FieldLabel>
                <Input
                  id="task-title"
                  ref={titleRef}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="What needs to happen?"
                  className="h-10 rounded-xl"
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="task-description">Notes</FieldLabel>
                <Textarea
                  id="task-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Add context, links, or a lightweight checklist. Markdown is supported."
                  className="min-h-32 rounded-2xl"
                />
                <FieldDescription>
                  Notes support Markdown, so short bullets and inline code both render cleanly in read mode.
                </FieldDescription>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="task-column">Column</FieldLabel>
                  <Select value={columnId} onValueChange={setColumnId}>
                    <SelectTrigger id="task-column" className="h-10 w-full rounded-xl">
                      <SelectValue placeholder="Choose a column" />
                    </SelectTrigger>
                    <SelectContent>
                      {columns.map((column) => (
                        <SelectItem key={column.id} value={column.id}>
                          {column.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field>
                  <FieldLabel htmlFor="task-priority">Priority</FieldLabel>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger id="task-priority" className="h-10 w-full rounded-xl">
                      <SelectValue placeholder="Choose a priority" />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="task-tags">Tags</FieldLabel>
                  <Input
                    id="task-tags"
                    value={tags}
                    onChange={(event) => setTags(event.target.value)}
                    placeholder="ops, follow-up, finance"
                    className="h-10 rounded-xl"
                  />
                  <FieldDescription>Use commas to separate tags.</FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="task-deadline">Deadline</FieldLabel>
                  <Input
                    id="task-deadline"
                    value={deadline}
                    onChange={(event) => setDeadline(event.target.value)}
                    placeholder="2026-04-05"
                    className="h-10 rounded-xl"
                  />
                  <FieldDescription>ISO dates work best for the board and overdue states.</FieldDescription>
                </Field>
              </div>

              {tagList.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {tagList.map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </FieldGroup>
          </div>

          <div className="flex flex-col gap-3 border-t border-border bg-muted px-6 py-4 sm:flex-row sm:items-center">
            {task && onDelete && (
              <Button type="button" variant="destructive" onClick={handleDelete} className="gap-2 sm:mr-auto">
                <IconTrash data-icon className="size-4" />
                Delete task
              </Button>
            )}

            <div className="flex gap-2 sm:ml-auto">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (task) {
                    setEditMode(false)
                  } else {
                    onOpenChange(false)
                  }
                }}
              >
                Cancel
              </Button>
              <Button type="submit">
                {task ? 'Update task' : 'Create task'}
              </Button>
            </div>
          </div>
        </form>
      ) : (
        <div className="flex max-h-[inherit] flex-col">
          <div className="overflow-y-auto px-6 py-6 sm:px-7">
            <DialogHeader className="gap-3">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {selectedPriority && (
                      <Badge className={cn('w-fit', getPriorityBadgeClass(selectedPriority.value))}>
                        {selectedPriority.label}
                      </Badge>
                    )}
                    {selectedColumn && (
                      <Badge variant="outline">
                        {selectedColumn.title}
                      </Badge>
                    )}
                    {isAiCreated && (
                      <Badge variant="secondary">
                        BitBit generated
                      </Badge>
                    )}
                    {sourceChannel && (
                      <Badge variant="outline">
                        {sourceChannel}
                      </Badge>
                    )}
                  </div>

                  <DialogTitle className="text-xl leading-tight tracking-tight sm:text-2xl">
                    {task?.title}
                  </DialogTitle>

                  <DialogDescription className="text-sm leading-6">
                    {deadline ? `Due ${formatDeadlineLabel(deadline)}` : 'No deadline set yet.'}
                  </DialogDescription>
                </div>

                <Button type="button" variant="outline" size="sm" onClick={() => setEditMode(true)} className="gap-2">
                  <IconPencil data-icon className="size-4" />
                  Edit
                </Button>
              </div>
            </DialogHeader>

            {task?.description ? (
              <div className="mt-6 rounded-3xl border border-border bg-muted p-4 sm:p-5">
                <MarkdownRenderer content={task.description} />
              </div>
            ) : (
              <div className="mt-6 rounded-3xl border border-dashed border-border bg-muted p-4 text-sm text-muted-foreground sm:p-5">
                No notes yet. Use edit mode to add more context or a lightweight checklist.
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-2">
              {tagList.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}

              {task?.assigned_to && (
                <Badge variant="outline">
                  Assigned to {task.assigned_to}
                </Badge>
              )}

              {agentStatus && (
                <Badge
                  variant="outline"
                  className={cn(
                    agentStatus === 'working' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                    agentStatus === 'error' && 'border-destructive/30 bg-destructive/10 text-destructive',
                  )}
                >
                  Agent {agentStatus}
                </Badge>
              )}

              {deadline && (
                <Badge variant="outline" className="gap-1.5">
                  <IconCalendar data-icon className="size-3.5" />
                  {formatDeadlineLabel(deadline)}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-border bg-muted px-6 py-4 sm:flex-row sm:items-center">
            {task && onDelete && (
              <Button type="button" variant="destructive" onClick={handleDelete} className="gap-2 sm:mr-auto">
                <IconTrash data-icon className="size-4" />
                Delete task
              </Button>
            )}

            <div className="flex gap-2 sm:ml-auto">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button type="button" onClick={() => setEditMode(true)}>
                Edit task
              </Button>
            </div>
          </div>
        </div>
      )}
    </DialogContent>
  )
}
