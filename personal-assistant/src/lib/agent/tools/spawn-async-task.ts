import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createTask } from '@/lib/agent/tasks/task-service'
import type { TaskType } from '@/lib/agent/tasks/types'
import type { ToolResult } from '../tools'
import { logger } from '@/lib/core/logger'

export const spawnAsyncTaskDefinition: Anthropic.Tool = {
  name: 'spawn_async_task',
  description:
    'Dispatch a long-running task to the durable execution engine. The task runs asynchronously with live progress updates in chat. Use for operations that may take more than a few seconds (browser automation, workspace compute, multi-step workflows).',
  input_schema: {
    type: 'object' as const,
    properties: {
      task_type: {
        type: 'string',
        enum: ['agent_tool', 'cua_browser', 'workspace_compute', 'standard'],
        description: 'Type of task. Determines retry policy and execution environment.',
      },
      task_name: {
        type: 'string',
        description:
          'Human-readable name shown in chat progress messages (e.g., "Generate invoice for Steve").',
      },
      task_payload: {
        type: 'object',
        description: 'Input data for the task executor.',
      },
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            step_name: { type: 'string' },
            input: { type: 'object' },
          },
          required: ['step_name'] as string[],
        },
        description:
          'Optional pre-defined steps for progress tracking. If omitted, the executor manages its own progress.',
      },
      priority: {
        type: 'integer',
        enum: [0, 1, 2],
        description: '0=urgent, 1=normal (default), 2=low',
      },
    },
    required: ['task_type', 'task_name'] as string[],
  },
}

interface SpawnAsyncTaskInput {
  task_type: TaskType
  task_name: string
  task_payload?: Record<string, unknown>
  steps?: Array<{ step_name: string; input?: Record<string, unknown> }>
  priority?: number
}

export async function handleSpawnAsyncTask(
  input: Record<string, unknown>,
  orgId: string,
  supabase: SupabaseClient,
  execOptions?: { threadId?: string },
): Promise<ToolResult> {
  const typedInput = input as SpawnAsyncTaskInput

  try {
    const task = await createTask(supabase, {
      org_id: orgId,
      thread_id: execOptions?.threadId ?? null,
      task_type: typedInput.task_type,
      task_name: typedInput.task_name,
      task_payload: typedInput.task_payload ?? {},
      priority: typedInput.priority ?? 1,
      total_steps: typedInput.steps?.length,
      steps: typedInput.steps,
    })

    logger.info('[spawn_async_task] Task created', {
      taskId: task.id,
      taskType: typedInput.task_type,
      taskName: typedInput.task_name,
      stepCount: typedInput.steps?.length ?? 0,
    })

    return {
      success: true,
      data: {
        taskId: task.id,
        status: task.status,
        taskName: task.task_name,
        message: `Task "${task.task_name}" queued. Progress will appear in chat.`,
      },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error('[spawn_async_task] Failed to create task', { error: msg })
    return { success: false, error: msg }
  }
}
