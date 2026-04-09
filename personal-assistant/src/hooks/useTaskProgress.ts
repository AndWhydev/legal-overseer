'use client'

import { useState, useCallback } from 'react'
import { useRealtimeSubscription } from '@/lib/realtime'
import type { RealtimePayload } from '@/lib/realtime'
import type { ExecutionTask } from '@/lib/agent/tasks/types'
import { formatProgressMessage } from '@/lib/agent/tasks/chat-progress'

export interface TaskProgressState {
  taskId: string
  status: string
  progressPct: number
  message: string
  isTerminal: boolean
}

const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'failed'])

function isTerminalTask(task: ExecutionTask): boolean {
  if (task.status === 'failed') {
    return task.retry_count >= task.max_retries
  }
  return TERMINAL_STATUSES.has(task.status)
}

/**
 * Subscribe to execution_tasks changes for a given thread via Supabase Realtime.
 * Returns live progress state for all active tasks in the thread.
 * Terminal tasks are automatically removed after 10 seconds.
 */
export function useTaskProgress(threadId: string | null): TaskProgressState[] {
  const [tasks, setTasks] = useState<Map<string, TaskProgressState>>(new Map())

  const handleChange = useCallback((payload: RealtimePayload<ExecutionTask>) => {
    const task = payload.new
    if (!task?.id) return

    const terminal = isTerminalTask(task)

    setTasks((prev) => {
      const next = new Map(prev)
      next.set(task.id, {
        taskId: task.id,
        status: task.status,
        progressPct: task.progress_pct,
        message: formatProgressMessage(task),
        isTerminal: terminal,
      })
      return next
    })

    if (terminal) {
      setTimeout(() => {
        setTasks((current) => {
          const cleaned = new Map(current)
          cleaned.delete(task.id)
          return cleaned
        })
      }, 10_000)
    }
  }, [])

  useRealtimeSubscription<ExecutionTask>(
    'execution_tasks',
    {
      event: '*',
      filter: threadId ? `thread_id=eq.${threadId}` : undefined,
    },
    handleChange,
  )

  return Array.from(tasks.values())
}
