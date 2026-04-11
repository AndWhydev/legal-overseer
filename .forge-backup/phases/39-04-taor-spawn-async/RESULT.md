---
phase: 39
plan: 4
title: "TAOR loop integration + spawn_async_task tool"
status: complete
completed_at: 2026-04-10
---

# Result: 39-04 TAOR Loop Integration + spawn_async_task Tool

## Summary

All three tasks in this phase were completed (partially by a prior session that crashed). This result documents what was verified and the final state.

## Files Implemented

### 1. `personal-assistant/src/lib/agent/tasks/task-runner.ts` (NEW)

Full lifecycle executor for durable tasks:
- `TaskExecutor` interface for downstream phase handlers (CUA, workspace)
- `TaskExecutionContext` with AbortSignal, updateProgress, startStep/completeStep/failStep
- `executorRegistry` Map with `registerTaskExecutor` / `getTaskExecutor`
- `runTask`: claim → start → execute → complete/fail with heartbeat at 15_000ms interval
- Calls `clearInterval(heartbeatInterval)` in both success and error paths
- Calls `failTask` on error, logs retry or permanent-failure outcome

### 2. `personal-assistant/src/lib/agent/tools/spawn-async-task.ts` (NEW)

Anthropic tool definition + handler for spawning tasks from the TAOR loop:
- `spawnAsyncTaskDefinition`: Anthropic.Tool with `task_type`, `task_name`, optional `task_payload`, `steps`, `priority`
- `handleSpawnAsyncTask`: calls `createTask`, threads `execOptions?.threadId` for chat progress linking
- Returns `{ taskId, status, taskName, message }` on success

### 3. `personal-assistant/src/lib/agent/tasks/index.ts` (UPDATED)

Barrel export added for task-runner:
```typescript
export {
  type TaskExecutor,
  type TaskExecutionContext,
  registerTaskExecutor,
  getTaskExecutor,
  runTask,
} from './task-runner'
```

### 4. `personal-assistant/src/lib/agent/tools.ts` (INTEGRATION)

`spawn_async_task` and `cancel_task` are registered in the main tools.ts file (the project uses `tools.ts` not `tools/index.ts`):
- Import at line 18: `import { spawnAsyncTaskDefinition, handleSpawnAsyncTask } from './tools/spawn-async-task'`
- Import at line 17: `import { cancelTaskToolDefinition, handleCancelTask } from './tools/cancel-task'`
- Listed in `agentic` tool group: `['execute_code', 'spawn_agent', 'spawn_async_task', 'cancel_task']`
- Handler dispatch registered in the tool router

## Acceptance Criteria

- [x] `task-runner.ts` exists with `TaskExecutor`, `TaskExecutionContext`, `registerTaskExecutor`, `runTask`
- [x] Heartbeat at 15000ms (`15_000`)
- [x] `AbortController` for cancellation signal
- [x] claim → start → execute → complete/fail lifecycle
- [x] `clearInterval` in both success and error paths
- [x] `spawn-async-task.ts` exists with `spawnAsyncTaskDefinition` and `handleSpawnAsyncTask`
- [x] Tool name is `'spawn_async_task'`
- [x] Input schema requires `task_type` and `task_name`
- [x] Calls `createTask` with `thread_id: execOptions?.threadId`
- [x] `tasks/index.ts` exports `TaskExecutor`, `registerTaskExecutor`, `runTask` from `./task-runner`
- [x] `tools.ts` imports and dispatches both `spawn_async_task` and `cancel_task`

## Quality Gates

- TypeScript: `npx tsc --noEmit` → exit 0 (no errors)
- No debug code or TODO comments in any new file
- Matches codebase patterns (logger, SupabaseClient, Anthropic.Tool, ToolResult)

## Notes

- The plan referenced `tools/index.ts` but this codebase uses `tools.ts` at the agent level. Integration was correctly performed in `tools.ts`, which is the actual dispatch entry point.
- `cancel-task.ts` was already implemented (phase 39-03) and was present when this phase was verified.
