'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { subscribeToTaskProgress, unsubscribeFromTask } from '@/lib/agent/tasks/chat-progress'
import type { ExecutionTask, TaskStatus } from '@/lib/agent/tasks/types'

const TERMINAL_STATUSES: TaskStatus[] = ['completed', 'failed', 'cancelled']

export interface UseTaskProgressResult {
  task: ExecutionTask | null
  progress: number
  isRunning: boolean
  error: string | null
}

/**
 * Subscribe to live progress updates for an execution task via Supabase Realtime.
 * Cleans up the subscription on unmount or when taskId changes.
 */
export function useTaskProgress(taskId: string | null): UseTaskProgressResult {
  const [task, setTask] = useState<ExecutionTask | null>(null)
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    if (!taskId) return

    const supabase = createClient()
    if (!supabase) return

    const channel = subscribeToTaskProgress(supabase, taskId, (updated) => {
      setTask(updated)
      if (updated.status === 'failed') {
        setError(updated.error_message ?? 'Task failed')
      }
    })

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        unsubscribeFromTask(supabase, channelRef.current)
        channelRef.current = null
      }
    }
  }, [taskId])

  const isRunning = task !== null && !TERMINAL_STATUSES.includes(task.status)

  return {
    task,
    progress: task?.progress_pct ?? 0,
    isRunning,
    error,
  }
}
