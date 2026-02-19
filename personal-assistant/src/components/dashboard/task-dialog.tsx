'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Task, KanbanColumn } from '@/lib/types'

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

export function TaskDialog({
  open,
  onOpenChange,
  task,
  columns,
  defaultColumnId,
  onSave,
  onDelete,
}: TaskDialogProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [columnId, setColumnId] = useState('')
  const [priority, setPriority] = useState('medium')
  const [tags, setTags] = useState('')
  const [deadline, setDeadline] = useState('')

  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setDescription(task.description || '')
      setColumnId(task.column_id || '')
      setPriority(task.priority)
      setTags(((task.metadata?.tags as string[]) || []).join(', '))
      setDeadline((task.metadata?.deadline as string) || '')
    } else {
      setTitle('')
      setDescription('')
      setColumnId(defaultColumnId || columns[0]?.id || '')
      setPriority('medium')
      setTags('')
      setDeadline('')
    }
  }, [task, defaultColumnId, columns])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    onSave({
      title: title.trim(),
      description: description.trim(),
      column_id: columnId,
      priority,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      deadline: deadline.trim(),
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{task ? 'Edit Task' : 'New Task'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Column</label>
              <Select value={columnId} onValueChange={setColumnId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select column" />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((col) => (
                    <SelectItem key={col.id} value={col.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: col.color }}
                        />
                        {col.title}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Priority</label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Tags</label>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="client, urgent, awaiting (comma separated)"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Deadline</label>
            <Input
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              placeholder="e.g. Feb 27"
            />
          </div>

          <DialogFooter className="flex gap-2">
            {task && onDelete && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  onDelete(task.id)
                  onOpenChange(false)
                }}
                className="mr-auto"
              >
                Delete
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{task ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
