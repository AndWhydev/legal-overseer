'use client'

import type { Task } from '@/lib/types'

interface KanbanActivityStripProps {
  tasks: Task[]
}

export function KanbanActivityStrip({ tasks }: KanbanActivityStripProps) {
  const activeTasks = tasks.filter((t) => {
    const status = (t.metadata as Record<string, unknown>)?.agentStatus
    return t.assigned_to && status === 'working'
  })

  if (activeTasks.length === 0) return null

  return (
    <div className="mb-1 flex shrink-0 items-center gap-4 overflow-x-auto border-t py-1.5">
      {activeTasks.map((task) => (
        <div
          key={task.id}
          className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-muted-foreground"
        >
          <span className="size-[5px] shrink-0 animate-pulse rounded-full bg-primary" />
          <span className="font-mono font-medium">
            BitBit
          </span>
          <span className="text-muted-foreground">
            working on &ldquo;{task.title.length > 40 ? task.title.slice(0, 40) + '...' : task.title}&rdquo;
          </span>
        </div>
      ))}
    </div>
  )
}
