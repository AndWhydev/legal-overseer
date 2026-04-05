'use client'

import type { Task } from '@/lib/types'

import { Badge } from '@/components/ui/badge'

interface KanbanActivityStripProps {
  tasks: Task[]
}

function truncateTitle(title: string) {
  return title.length > 44 ? `${title.slice(0, 44)}...` : title
}

export function KanbanActivityStrip({ tasks }: KanbanActivityStripProps) {
  const activeTasks = tasks.filter((task) => {
    const status = (task.metadata as Record<string, unknown>)?.agentStatus
    return task.assigned_to && status === 'working'
  })

  if (activeTasks.length === 0) return null

  return (
    <section
      aria-label="BitBit activity"
      className="mx-4 mt-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 sm:mx-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-base font-medium uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">
            BitBit in motion
          </p>
          <p className="text-base text-muted-foreground">
            Active agent sessions stay visible without crowding the board itself.
          </p>
        </div>
        <Badge variant="outline" className="w-fit border-emerald-500/30 bg-background tabular-nums">
          {activeTasks.length}
        </Badge>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {activeTasks.map((task) => (
          <div
            key={task.id}
            className="flex min-w-[16rem] shrink-0 items-center gap-3 rounded-full border border-border bg-background px-3 py-2 shadow-sm"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/12">
              <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
            </span>

            <div className="min-w-0">
              <p className="truncate text-base font-medium text-foreground">
                {truncateTitle(task.title)}
              </p>
              <p className="truncate text-base text-muted-foreground">
                {task.assigned_to} is working on this now
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
