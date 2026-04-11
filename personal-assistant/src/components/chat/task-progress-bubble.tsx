'use client'

import type { TaskProgressState } from '@/hooks/useTaskProgress'

interface TaskProgressBubbleProps {
  task: TaskProgressState
}

/**
 * Renders a live-updating task progress indicator inline in the chat.
 * Styled to match assistant message layout with a progress bar.
 * Per D-06: task progress appears inline in chat only -- no separate panel.
 */
export function TaskProgressBubble({ task }: TaskProgressBubbleProps) {
  const isActive = !task.isTerminal
  const statusColor = task.isTerminal
    ? task.status === 'completed'
      ? 'text-green-600 dark:text-green-400'
      : task.status === 'cancelled'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-red-600 dark:text-red-400'
    : 'text-blue-600 dark:text-blue-400'

  const terminalIcon =
    task.status === 'completed' ? '\u2713' :
    task.status === 'cancelled' ? '\u2014' :
    '!'

  return (
    <div className="flex gap-3 py-2">
      {/* Avatar area -- matches assistant message layout */}
      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
        {isActive ? (
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        ) : (
          <span className={`text-xs font-medium ${statusColor}`}>
            {terminalIcon}
          </span>
        )}
      </div>

      {/* Progress content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${statusColor}`}>
          {task.message}
        </p>

        {/* Progress bar -- only for active tasks with known progress */}
        {isActive && task.progressPct > 0 && (
          <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden max-w-xs">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${task.progressPct}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
