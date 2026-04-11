import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cancelTask } from '@/lib/agent/tasks/task-service'
import type { ToolResult } from '../tools'

export const cancelTaskToolDefinition: Anthropic.Tool = {
  name: 'cancel_task',
  description:
    'Cancel an in-progress or queued execution task. Use when the user asks to stop, cancel, or abort a running task. Requires the task ID. Sets the task status to cancelled and records who cancelled it.',
  input_schema: {
    type: 'object' as const,
    properties: {
      task_id: {
        type: 'string',
        description: 'The UUID of the execution task to cancel.',
      },
      reason: {
        type: 'string',
        description: 'Optional short reason for the cancellation (for logging only).',
      },
    },
    required: ['task_id'] as string[],
  },
}

interface CancelTaskInput {
  task_id: string
  reason?: string
}

export async function handleCancelTask(
  input: CancelTaskInput,
  _orgId: string,
  supabase: SupabaseClient,
): Promise<ToolResult> {
  try {
    const task = await cancelTask(supabase, input.task_id, 'user')

    if (!task) {
      return {
        success: false,
        error: `Task ${input.task_id} not found or could not be cancelled.`,
      }
    }

    return {
      success: true,
      data: {
        task_id: task.id,
        task_name: task.task_name,
        status: task.status,
        cancelled_at: task.cancelled_at,
        message: `Task "${task.task_name}" has been cancelled.`,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    if (message.startsWith('TASK_NOT_CANCELLABLE')) {
      return {
        success: false,
        error: `Cannot cancel this task — it is already in a terminal state (${message.split(': ')[1] ?? 'unknown'}).`,
      }
    }

    if (message === 'TASK_NOT_FOUND') {
      return {
        success: false,
        error: `Task ${input.task_id} not found.`,
      }
    }

    return { success: false, error: message }
  }
}
