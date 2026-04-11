---
phase: 39
plan: 4
title: "TAOR loop integration + spawn_async_task tool"
wave: 2
depends_on: [39-01, 39-02]
files_modified:
  - personal-assistant/src/lib/agent/tools/spawn-async-task.ts
  - personal-assistant/src/lib/agent/tools/index.ts
  - personal-assistant/src/lib/agent/tasks/task-runner.ts
requirements_addressed: [ASYNC-01, ASYNC-04]
autonomous: true
---

# Plan 39-04: TAOR Loop Integration + spawn_async_task Tool

<objective>
Create the spawn_async_task tool that the TAOR loop uses to dispatch long-running tasks to the durable execution engine, and the task runner that executes claimed tasks with heartbeat, step tracking, and error handling.
</objective>

## Tasks

### Task 1: Task Runner

<read_first>
- personal-assistant/src/lib/agent/tasks/task-service.ts (claimTask, startTask, updateProgress, completeTask, failTask, sendHeartbeat)
- personal-assistant/src/lib/agent/tasks/step-tracker.ts (startStep, completeStep, failStep)
- personal-assistant/src/lib/agent/tasks/retry-engine.ts (shouldRetry, getRetryDelay, enqueueRetry, sendToDeadLetter)
- personal-assistant/src/lib/agent/engine/tool-executor.ts (executeAgentTool pattern)
</read_first>

<action>
Create `personal-assistant/src/lib/agent/tasks/task-runner.ts`:

This module executes a claimed task through its steps with heartbeat and error handling.

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExecutionTask } from './types'
import { claimTask, startTask, completeTask, failTask, sendHeartbeat, updateProgress } from './task-service'
import { startStep, completeStep, failStep, getStepsForTask } from './step-tracker'
import { shouldRetry, enqueueRetry, sendToDeadLetter } from './retry-engine'
import { logger } from '@/lib/core/logger'

export interface TaskExecutor {
  /** Execute the task payload. Called once per task (or per retry). */
  execute: (
    task: ExecutionTask,
    context: TaskExecutionContext,
  ) => Promise<Record<string, unknown>>
}

export interface TaskExecutionContext {
  supabase: SupabaseClient
  signal: AbortSignal
  updateProgress: (updates: { current_step?: number; progress_pct?: number; progress_message?: string }) => Promise<void>
  startStep: (stepNumber: number) => Promise<void>
  completeStep: (stepNumber: number, output: Record<string, unknown>) => Promise<void>
  failStep: (stepNumber: number, errorMessage: string) => Promise<void>
}

/** Registry of task type -> executor. Populated by downstream phases (CUA, workspace, etc.) */
const executorRegistry = new Map<string, TaskExecutor>()

export function registerTaskExecutor(taskType: string, executor: TaskExecutor): void {
  executorRegistry.set(taskType, executor)
}

export function getTaskExecutor(taskType: string): TaskExecutor | undefined {
  return executorRegistry.get(taskType)
}

/**
 * Run a task through its full lifecycle: claim -> start -> execute -> complete/fail.
 * Manages heartbeat interval and AbortController for cancellation.
 */
export async function runTask(
  supabase: SupabaseClient,
  taskId: string,
  workerId: string,
): Promise<{ success: boolean; error?: string }> {
  // 1. Claim
  const claimed = await claimTask(supabase, taskId, workerId)
  if (!claimed) {
    return { success: false, error: 'Failed to claim task — already claimed or invalid state' }
  }

  // 2. Start
  const started = await startTask(supabase, taskId)
  if (!started) {
    return { success: false, error: 'Failed to start task — state conflict' }
  }

  // 3. Find executor
  const executor = getTaskExecutor(started.task_type)
  if (!executor) {
    await failTask(supabase, taskId, {
      message: `No executor registered for task type: ${started.task_type}`,
    })
    return { success: false, error: `No executor for type: ${started.task_type}` }
  }

  // 4. Set up heartbeat interval (every 15 seconds)
  const abortController = new AbortController()
  const heartbeatInterval = setInterval(async () => {
    try {
      await sendHeartbeat(supabase, taskId)
    } catch (err) {
      logger.warn('[task-runner] Heartbeat failed', { taskId, error: err })
    }
  }, 15_000)

  // 5. Build execution context
  const context: TaskExecutionContext = {
    supabase,
    signal: abortController.signal,
    updateProgress: (updates) => updateProgress(supabase, taskId, updates),
    startStep: (stepNumber) => startStep(supabase, taskId, stepNumber).then(() => {}),
    completeStep: (stepNumber, output) => completeStep(supabase, taskId, stepNumber, output).then(() => {}),
    failStep: (stepNumber, errorMessage) => failStep(supabase, taskId, stepNumber, errorMessage).then(() => {}),
  }

  try {
    // 6. Execute
    const result = await executor.execute(started, context)

    // 7. Complete
    clearInterval(heartbeatInterval)
    await completeTask(supabase, taskId, result)
    return { success: true }
  } catch (err) {
    clearInterval(heartbeatInterval)
    const errorMessage = err instanceof Error ? err.message : String(err)
    const errorStack = err instanceof Error ? err.stack : undefined

    // 8. Fail + retry or DLQ
    const { task, retrying } = await failTask(supabase, taskId, {
      message: errorMessage,
      stack: errorStack,
    })

    if (retrying) {
      logger.info('[task-runner] Task will retry', {
        taskId,
        retryCount: task.retry_count,
        maxRetries: task.max_retries,
      })
    }

    return { success: false, error: errorMessage }
  }
}
```
</action>

<acceptance_criteria>
- File `personal-assistant/src/lib/agent/tasks/task-runner.ts` exists
- File contains `export interface TaskExecutor`
- File contains `export interface TaskExecutionContext`
- File contains `export function registerTaskExecutor`
- File contains `export async function runTask`
- File sets up heartbeat interval at 15000ms
- File creates AbortController for cancellation signal
- File calls `claimTask` then `startTask` then executor then `completeTask`
- File calls `failTask` on error with retry handling
- File calls `clearInterval(heartbeatInterval)` in both success and error paths
</acceptance_criteria>

### Task 2: spawn_async_task Tool

<read_first>
- personal-assistant/src/lib/agent/tools/index.ts (tool registration pattern — definition object + handler function + dispatch map)
- personal-assistant/src/lib/agent/tasks/task-service.ts (createTask)
- personal-assistant/src/lib/agent/tasks/types.ts (CreateTaskParams, TaskType)
</read_first>

<action>
Create `personal-assistant/src/lib/agent/tools/spawn-async-task.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import { createTask } from '@/lib/agent/tasks'
import type { TaskType } from '@/lib/agent/tasks'
import { logger } from '@/lib/core/logger'

export const spawnAsyncTaskDefinition = {
  name: 'spawn_async_task',
  description: 'Dispatch a long-running task to the durable execution engine. The task runs asynchronously with live progress updates in chat. Use for operations that may take more than a few seconds (browser automation, workspace compute, multi-step workflows).',
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
        description: 'Human-readable name shown in chat progress messages (e.g., "Generate invoice for Steve").',
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
          required: ['step_name'],
        },
        description: 'Optional pre-defined steps for progress tracking. If omitted, the executor manages its own progress.',
      },
      priority: {
        type: 'integer',
        enum: [0, 1, 2],
        description: '0=urgent, 1=normal (default), 2=low',
      },
    },
    required: ['task_type', 'task_name'],
  },
}

export async function handleSpawnAsyncTask(
  input: {
    task_type: TaskType
    task_name: string
    task_payload?: Record<string, unknown>
    steps?: Array<{ step_name: string; input?: Record<string, unknown> }>
    priority?: number
  },
  orgId: string,
  supabase: SupabaseClient,
  execOptions?: { threadId?: string },
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const task = await createTask(supabase, {
      org_id: orgId,
      thread_id: execOptions?.threadId ?? null,
      task_type: input.task_type,
      task_name: input.task_name,
      task_payload: input.task_payload ?? {},
      priority: input.priority ?? 1,
      total_steps: input.steps?.length,
      steps: input.steps,
    })

    logger.info('[spawn_async_task] Task created', {
      taskId: task.id,
      taskType: input.task_type,
      taskName: input.task_name,
      stepCount: input.steps?.length ?? 0,
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
```

Register in `personal-assistant/src/lib/agent/tools/index.ts`:
- Add `spawnAsyncTaskDefinition` to the tool definitions array (in the `core` tool group)
- Add `'spawn_async_task': handleSpawnAsyncTask` to the handler dispatch map
- Import both from `./spawn-async-task`
</action>

<acceptance_criteria>
- File `personal-assistant/src/lib/agent/tools/spawn-async-task.ts` exists
- File contains `export const spawnAsyncTaskDefinition`
- File contains `export async function handleSpawnAsyncTask`
- Tool name is `'spawn_async_task'`
- Tool input_schema requires `task_type` and `task_name`
- Tool calls `createTask` from `@/lib/agent/tasks`
- Tool passes `execOptions?.threadId` as `thread_id` for chat progress linking
- `personal-assistant/src/lib/agent/tools/index.ts` imports and registers both `spawn_async_task` and `cancel_task`
</acceptance_criteria>

### Task 3: Update Barrel Exports

<read_first>
- personal-assistant/src/lib/agent/tasks/index.ts (existing exports)
</read_first>

<action>
Add to `personal-assistant/src/lib/agent/tasks/index.ts`:

```typescript
export {
  type TaskExecutor,
  type TaskExecutionContext,
  registerTaskExecutor,
  getTaskExecutor,
  runTask,
} from './task-runner'
```
</action>

<acceptance_criteria>
- File `personal-assistant/src/lib/agent/tasks/index.ts` contains `export { type TaskExecutor` from `./task-runner`
- File contains `export { registerTaskExecutor` from `./task-runner`
</acceptance_criteria>

## Verification

```bash
# spawn_async_task tool registered
grep "spawn_async_task" personal-assistant/src/lib/agent/tools/index.ts

# cancel_task tool registered
grep "cancel_task" personal-assistant/src/lib/agent/tools/index.ts

# Task runner has heartbeat interval
grep "15_000\|15000" personal-assistant/src/lib/agent/tasks/task-runner.ts

# Task runner has abort controller
grep "AbortController" personal-assistant/src/lib/agent/tasks/task-runner.ts
```

## must_haves
- [ ] spawn_async_task tool creates tasks with thread_id for chat progress
- [ ] Task runner manages full lifecycle: claim -> start -> execute -> complete/fail
- [ ] Heartbeat runs every 15 seconds during task execution
- [ ] AbortController signal available to executors for cancellation
- [ ] Executor registry pattern allows downstream phases (CUA, workspace) to register handlers
