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
    <div className="mb-1 flex shrink-0 items-center gap-4 overflow-x-auto border-t border-white/10 py-1.5">
      {activeTasks.map((task) => (
        <div
          key={task.id}
          className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-muted-foreground"
        >
          <span className="size-[5px] shrink-0 rounded-full bg-primary" style={{ animation: 'bb-pulse 2s ease-in-out infinite' }} />
          <span className="font-mono font-medium">
            BitBit
          </span>
          <span className="text-muted-foreground">
            working on &ldquo;{task.title.length > 40 ? task.title.slice(0, 40) + '...' : task.title}&rdquo;
          </span>
        </div>
      ))}

      <style>{`
        @keyframes bb-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
      `}</style>
    </div>
  )
}
