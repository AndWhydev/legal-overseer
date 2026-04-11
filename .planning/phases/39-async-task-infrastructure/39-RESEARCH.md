# Phase 39: Async Task Infrastructure - Research

**Researched:** 2026-04-08
**Status:** Complete

## Research Question

What do we need to know to plan a durable execution engine with real-time visibility, cancellation, heartbeats, and self-healing for BitBit's async tasks?

## 1. Execution Engine Evaluation

### Option A: Supabase-Native FSM (RECOMMENDED)

**Approach:** Postgres table with status enum, pg_cron for heartbeat monitoring, Supabase Realtime for live updates.

**Advantages:**
- Zero new infrastructure -- uses existing Supabase project (johvduasrhmufrfdxjus)
- Approval queue already implements an 8-state FSM pattern with execution tracking fields (execution_started_at, completed_at, result, error, retry_count)
- Supabase Realtime already wired in `src/lib/realtime/` with RealtimeManager singleton and useRealtimeSubscription hook
- Atomic state transitions via Postgres `UPDATE ... WHERE status = $old RETURNING *` (optimistic concurrency)
- RLS already the standard pattern for org isolation
- DLQ table already exists (`dead_letter_queue`) with `writeToDeadLetterQueue()` in `src/lib/agent/dlq.ts`
- Cost: $0 additional (within existing Supabase plan)

**Disadvantages:**
- Heartbeat monitoring needs pg_cron or application-level cron (Vercel cron already has 9 jobs running)
- No built-in retry/backoff -- must implement in application code
- No built-in workflow orchestration -- each step is manual state management

**Verdict:** Best fit. The existing approval queue pattern is directly analogous, the realtime infrastructure is already wired, and the DLQ already exists. Custom code for retry/heartbeat is straightforward.

### Option B: Trigger.dev Cloud

**Approach:** Managed durable execution platform with built-in retry, scheduling, and observability.

**Advantages:**
- Built-in retry policies, backoff, and dead letter handling
- Dashboard for task monitoring out of the box
- Durable execution survives worker restarts by design

**Disadvantages:**
- New service dependency ($0-20/mo for Hobby, $50+/mo for Team)
- STATE.md notes this needs confirmation -- availability and pricing uncertain
- Adds external API latency to every task dispatch
- Real-time progress would still need Supabase Realtime for chat integration
- Doesn't eliminate custom code -- still need integration layer, chat progress updates, NL cancellation
- Diverges from existing patterns (approval queue, DLQ, realtime subscriptions)

**Verdict:** Overkill. Most of the value (retry, monitoring) can be built with <200 lines of code on top of Supabase. The chat-first progress model means Trigger.dev's dashboard is wasted.

### Option C: Vercel Workflow DevKit

**Approach:** Durable workflows using Vercel's WDK with step-based execution.

**Advantages:**
- Native Vercel integration (already deployed there)
- Step-based execution with automatic retries

**Disadvantages:**
- Vercel Functions have 60s timeout (even with Fluid Compute) -- not suitable for long-running browser/workspace tasks
- WDK is relatively new -- API surface may change
- Same chat integration gap as Trigger.dev

**Verdict:** Not suitable for tasks that may run minutes (CUA browser sessions, workspace compute).

### Decision: Supabase-Native FSM

Extends the existing approval queue pattern. No new services. Cost: $0 additional.

## 2. FSM Design

### 7-State Lifecycle

```
pending -> claimed -> working -> completed
                  |         |-> paused -> working (resume)
                  |         |-> failed (retryable) -> pending (retry)
                  |         |-> failed (terminal) -> dead_letter
                  |         |-> cancelled
                  |-> failed (claim failed)
```

**States:**
- `pending` -- Task created, waiting for a worker to claim it
- `claimed` -- Worker has claimed the task (short-lived, transitions to working)
- `working` -- Actively executing, heartbeat expected
- `paused` -- User-initiated pause or system pause (partial work preserved)
- `completed` -- All steps finished successfully
- `failed` -- Execution failed (may be retryable or terminal)
- `cancelled` -- User cancelled; partial work preserved per D-09

**Atomic transitions:** `UPDATE execution_tasks SET status = $new, updated_at = now() WHERE id = $id AND status = $old RETURNING *` -- returns null if state already changed (optimistic concurrency control).

## 3. Table Schema

### execution_tasks

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | gen_random_uuid() |
| org_id | uuid FK | org isolation, RLS |
| thread_id | uuid FK nullable | Chat thread where task was initiated (for progress messages) |
| task_type | text | 'agent_tool', 'cua_browser', 'workspace_compute', 'standard' |
| task_name | text | Human-readable name for chat display |
| task_payload | jsonb | Input data for the task |
| status | text | FSM state enum |
| priority | int | 0=urgent, 1=normal, 2=low |
| current_step | int | Which step is executing (1-based) |
| total_steps | int nullable | Total expected steps (null if unknown) |
| progress_pct | int | 0-100 percentage |
| progress_message | text | Current status message for chat display |
| result | jsonb nullable | Final output on completion |
| error_message | text nullable | Last error |
| error_stack | text nullable | Stack trace |
| retry_count | int default 0 | Times retried |
| max_retries | int default 3 | Per-task retry limit |
| retry_policy | jsonb | { strategy: 'exponential', base_delay_ms: 1000, max_delay_ms: 30000 } |
| worker_id | text nullable | Which worker claimed this task |
| heartbeat_at | timestamptz nullable | Last heartbeat timestamp |
| claimed_at | timestamptz nullable | When worker claimed |
| started_at | timestamptz nullable | When execution started |
| completed_at | timestamptz nullable | When finished (completed/failed/cancelled) |
| cancelled_at | timestamptz nullable | When cancelled |
| cancelled_by | text nullable | 'user' or 'system' |
| partial_result | jsonb nullable | Work completed before cancellation |
| created_at | timestamptz default now() | |
| updated_at | timestamptz default now() | |

### execution_steps

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| task_id | uuid FK | References execution_tasks |
| step_number | int | 1-based ordinal |
| step_name | text | Human-readable step label |
| status | text | pending, working, completed, failed, skipped |
| input | jsonb nullable | Step input data |
| output | jsonb nullable | Step output data |
| error_message | text nullable | |
| started_at | timestamptz nullable | |
| completed_at | timestamptz nullable | |
| duration_ms | int nullable | |
| created_at | timestamptz default now() | |

## 4. Real-Time Progress (Chat-First)

Per CONTEXT.md D-06 and D-07: progress appears inline in chat only, using Supabase Realtime.

**Flow:**
1. Task created with `thread_id` linking to the chat thread
2. `execution_tasks` status/progress changes trigger Supabase Realtime postgres_changes
3. Client subscribes to `execution_tasks` filtered by `thread_id`
4. Chat UI renders progress as live-updating assistant message (not a separate panel)

**Progress message format:** "Working on invoice for Steve... Step 2/4: Calculating line items..."

**RealtimeTable extension:** Add `'execution_tasks'` to the `RealtimeTable` union type in `src/lib/realtime/supabase-realtime.ts`.

## 5. Cancellation (Natural Language)

Per CONTEXT.md D-08 and D-09: cancellation is NL-only, partial work preserved.

**Implementation:**
1. User says "stop that" / "cancel the invoice" in chat
2. TAOR loop (or a dedicated tool) identifies the active task for this thread
3. Task status transitions: `working -> cancelled` (or `paused -> cancelled`)
4. Worker receives cancellation signal (polling heartbeat endpoint, or AbortController)
5. Partial result preserved in `partial_result` column
6. BitBit reports what was completed: "Stopped. I'd already calculated the line items but hadn't sent the invoice."

**Task identification:** When user says "cancel", look for tasks in `working` or `paused` state for the current `thread_id`. If exactly one, cancel it. If multiple, ask which one.

**New tool:** `cancel_task` -- available to the TAOR loop. Takes `task_id` or infers from thread context.

## 6. Heartbeat & Orphan Detection

**Heartbeat interval:** Every 15 seconds (configurable per task type).
- Worker updates `heartbeat_at` column during execution
- Simple `UPDATE execution_tasks SET heartbeat_at = now() WHERE id = $id`

**Orphan detection:**
- Vercel cron job runs every 60 seconds
- Queries: `SELECT * FROM execution_tasks WHERE status IN ('claimed', 'working') AND heartbeat_at < now() - interval '90 seconds'`
- Orphaned tasks transition to `failed` with `error_message = 'Worker heartbeat lost'`
- If `retry_count < max_retries`, task transitions back to `pending` for retry
- If terminal failure, writes to existing DLQ via `writeToDeadLetterQueue()`

**Cron endpoint:** `GET /api/cron/task-heartbeat-monitor` (new, joins existing 9 cron jobs)

## 7. Retry Policies

Per-task-type defaults:

| Task Type | Max Retries | Strategy | Base Delay | Max Delay |
|-----------|-------------|----------|------------|-----------|
| agent_tool | 3 | exponential | 1s | 30s |
| cua_browser | 2 | exponential | 5s | 60s |
| workspace_compute | 2 | exponential | 3s | 30s |
| standard | 3 | exponential | 1s | 30s |

**Retry flow:**
1. Task fails -> check `retry_count < max_retries`
2. If retryable: set status=`pending`, increment `retry_count`, set `claimed_at/worker_id = null`
3. Delay before next claim based on policy (application-side, not DB)
4. If terminal: write to DLQ, set status=`failed`, notify user in chat

## 8. Integration Points

### TAOR Loop Integration
- New `spawn_async_task` tool registered in tool groups
- Takes: task_type, task_name, task_payload, steps (optional)
- Returns: task_id, initial status
- Progress updates flow through Supabase Realtime to the chat

### Existing DLQ
- `writeToDeadLetterQueue()` in `src/lib/agent/dlq.ts` already writes to `dead_letter_queue` table
- Extend to accept `execution_task_id` for linking

### Chat Progress Hook
- New React hook: `useTaskProgress(threadId)` subscribing to execution_tasks changes
- Renders progress as a live-updating message bubble in the chat

## 9. Validation Architecture

### Unit Tests
- FSM state transition logic (all valid/invalid transitions)
- Retry policy calculation (exponential backoff values)
- Task service CRUD operations (create, claim, update progress, complete, fail, cancel)

### Integration Tests
- Full task lifecycle: create -> claim -> progress updates -> complete
- Cancellation mid-execution: working -> cancelled with partial result
- Orphan detection: simulate lost heartbeat -> automatic recovery
- Retry cycle: fail -> pending -> claim -> succeed

### E2E Tests
- Chat sends message triggering async task -> progress appears in chat -> task completes
- User says "cancel that" -> task cancels -> partial result reported

---

## RESEARCH COMPLETE

**Engine:** Supabase-native FSM (extends existing approval queue pattern)
**Key insight:** The approval queue already has execution tracking (started_at, completed_at, result, error, retry_count). execution_tasks is a purpose-built evolution, not a parallel system.
**Cost:** $0 additional infrastructure
**Risk:** Low -- all patterns (RLS, Realtime, DLQ, cron) already proven in production
