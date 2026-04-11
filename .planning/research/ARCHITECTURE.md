# Architecture Patterns: Autonomous Execution Integration

**Domain:** Autonomous execution for existing agentic AI operations platform
**Researched:** 2026-03-31
**Confidence:** HIGH (based on verified existing codebase + official Anthropic docs + infrastructure research)

## Recommended Architecture

### High-Level System View

```
                          +------------------+
                          |    Dashboard     |
                          |  (Next.js/Vercel)|
                          |   60s timeout    |
                          +-------+----------+
                                  |
                     SSE (chat) / Supabase Realtime (tasks)
                                  |
                  +---------------+----------------+
                  |               |                |
           +------+------+  +----+-----+   +------+------+
           |  TAOR Loop  |  |  Task    |   |  Role Tick  |
           | (chat/sync) |  | Manager  |   |  Scheduler  |
           +------+------+  |  (new)   |   +------+------+
                  |          +----+-----+          |
                  |               |                |
              API tools      +----+-----+      Workflow
                  |          | Supabase |      Executor
                  |          |  pgmq    |    (existing)
                  |          | Queue    |
                  |          +----+-----+
                  |               |
                  |    +----------+-----------+
                  |    |                      |
                  |    v                      v
           +------+------+          +---------+---------+
           |  Tool       |          |  Browser Worker   |
           |  Priority   |          |  (Fly.io 2GB+)    |
           |  Chain      |          |  Playwright +     |
           |  (new)      |          |  Anthropic CUA    |
           +------+------+          +---------+---------+
                  |                            |
        +---------+---------+         Screenshot/result
        |         |         |         back via Supabase
      API    Browserbase   Human
     first    fallback    handoff
```

### Component Boundaries

| Component | Responsibility | Location | Communicates With |
|-----------|---------------|----------|-------------------|
| **Task Manager** (NEW) | Creates, tracks, and routes async tasks through lifecycle | Vercel API routes | pgmq queue, TAOR loop, dashboard via Realtime |
| **Browser Worker** (NEW) | Runs Playwright + CUA sessions, captures screenshots | Fly.io dedicated machine (2GB+) | Task Manager via Supabase, Anthropic API |
| **Tool Priority Chain** (NEW) | Routes tool calls through API -> browser -> human fallback | TAOR loop extension | Existing tool executor, Browser Worker, approval queue |
| **Workflow Learner** (NEW) | Records successful execution patterns for replay | Supabase tables + role evaluator | Task Manager, workflow executor |
| TAOR Loop (EXISTING) | Synchronous chat agent loop | Vercel serverless | Tools, Anthropic API |
| Role Tick Scheduler (EXISTING) | Cron-driven domain role execution | Vercel cron -> role-runtime | Workflow executor, action dispatcher |
| Cloudflare Edge Cron (EXISTING) | Polls agent_task_queue, dispatches to Fly.io | Cloudflare Workers | Fly.io worker, Supabase |
| Fly.io Worker (EXISTING) | Executes dispatched agent tasks | Fly.io Sydney (2x shared-cpu-1x 1GB) | Supabase, Vercel callbacks |
| Approval Queue (EXISTING) | Routes low-confidence actions for human review | Supabase table + dashboard | Action executor, autonomy gate |
| Supabase Realtime (EXISTING) | Push DB changes to dashboard | Supabase | Dashboard components |

## New Components Detail

### 1. Task Manager (`lib/tasks/task-manager.ts`)

Central orchestrator for async task lifecycle. This is the **most critical new component** -- it bridges synchronous chat, async workers, and the dashboard.

**State Machine:**
```
created -> queued -> dispatched -> executing -> [verifying] -> completed
                                             -> failed -> [retry] -> queued
                                             -> needs_human -> approval_queue
```

**Integration with existing systems:**
- Reuses `approval_queue` for the `needs_human` state (existing table, existing dashboard widget)
- Reuses `role_activity` for logging (existing table, existing feed)
- Uses Supabase Realtime for progress updates (existing subscription manager in `supabase-realtime.ts`)
- Uses `agent_task_queue` table (already exists, already polled by Cloudflare cron)

**Key design: TAOR loop spawns async tasks, does not block on them.**
When the TAOR loop encounters a tool call that requires long-running execution (browser automation, multi-step workflow), it:
1. Inserts a task row via Task Manager
2. Returns an immediate `tool_result` saying "Task queued, ID: xxx"
3. The TAOR loop continues or completes
4. The task executes asynchronously on Fly.io
5. Progress is pushed to dashboard via Supabase Realtime
6. Completion triggers a notification

This pattern already exists in the codebase for the approval queue (`queued: true, approvalId: result.approvalId` in tool-executor.ts line 254-255).

### 2. Browser Worker (`deployments/fly-browser/`)

A **separate Fly.io app** from the existing `bitbit-workers`. The existing workers have 1GB RAM -- browser automation requires minimum 2GB with Chromium.

**Architecture decision: Dedicated Fly.io machine, NOT Browserbase.**

Rationale:
- Budget constraint is ~$70/mo total infra. Browserbase starts at $20-50/mo with per-hour usage on top
- Fly.io machine with 2GB RAM in Sydney costs ~$12-15/mo (performance-1x, 2GB)
- Self-hosted Playwright gives full control over browser lifecycle and data residency
- CUA sessions generate screenshots constantly -- keeping them local avoids egress costs
- Can scale to 0 when idle with Fly.io auto-stop (already used on existing worker)

**Why not the existing Fly.io worker?**
- Current `bitbit-workers` machines are 1GB shared-cpu-1x -- too small for Chromium
- Browser sessions are memory-intensive and would starve other agent tasks
- Separate scaling profile: browser sessions are long-lived (30s-5min), agent tasks are quick (1-10s)
- Fault isolation: browser crashes should not take down agent task processing

**Worker structure:**
```typescript
// deployments/fly-browser/src/browser-worker.ts
// Routes:
//   POST /api/browser/session  -- Start CUA session
//   POST /api/browser/action   -- Execute single CUA action
//   GET  /api/browser/health   -- Health check
//   DELETE /api/browser/session/:id -- Cleanup session
```

**CUA Integration Pattern:**
The browser worker implements Anthropic's Computer Use tool specification:
1. Launches Playwright Chromium (headless, with Xvfb for screenshot fidelity)
2. Exposes `screenshot`, `left_click`, `type`, `key`, `scroll` action handlers
3. The CUA agentic loop runs ON the worker (not on Vercel) to avoid 60s timeout
4. Worker calls `client.beta.messages.create()` with `computer_20251124` tool type and beta header `computer-use-2025-11-24`
5. Each iteration: screenshot -> Claude decides action -> worker executes -> screenshot -> repeat
6. Results (final screenshot + summary) written to Supabase task row

**Critical: The CUA loop runs server-side on Fly.io, NOT in the TAOR loop.**
The TAOR loop only requests "browse to X and do Y" -- the Browser Worker handles the entire CUA agentic loop independently.

### 3. Tool Priority Chain (`lib/agent/tools/priority-chain.ts`)

A **resolution strategy** that sits inside the existing tool execution layer, not a separate service.

```
+---------------------------------------------------+
| Tool Priority Chain (inside tool-executor.ts)      |
|                                                    |
|  1. Check: Does an API tool exist for this?        |
|     YES -> execute_tool() as normal                |
|     NO  -> step 2                                  |
|                                                    |
|  2. Check: Can browser automation handle this?     |
|     YES -> queue browser task via Task Manager     |
|     NO  -> step 3                                  |
|                                                    |
|  3. Route to human via approval queue              |
|     (existing createApproval() path)               |
+---------------------------------------------------+
```

**Implementation: A new tool called `execute_task` that wraps the priority chain.**
Rather than modifying every existing tool, add a single meta-tool that the TAOR loop calls when it determines the current tools cannot accomplish the task. The model already decides which tools to call -- this adds "execute_task" as the escape hatch.

The tool definition:
```typescript
{
  name: 'execute_task',
  description: 'Execute a real-world task using the best available method. '
    + 'First attempts API tools, then browser automation, then queues for human help. '
    + 'Use when the task requires interaction with external websites or services '
    + 'that have no direct API tool.',
  input_schema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'What needs to be done' },
      target_url: { type: 'string', description: 'URL to interact with (optional)' },
      verification: { type: 'string', description: 'How to verify success' },
      priority: { type: 'string', enum: ['immediate', 'background'] },
    },
    required: ['task'],
  },
}
```

**Integration with existing confidence routing:**
The priority chain respects the existing autonomy gate. If the org is in `copilot` mode, browser tasks are queued for approval before execution. In `autopilot` mode, they execute if confidence > act threshold.

### 4. Workflow Learner (`lib/workflows/workflow-learner.ts`)

Builds on the **existing workflow executor** (`lib/roles/workflow-executor.ts`).

**Concept:** After a successful browser task or multi-step execution, the learner records the execution pattern as a reusable workflow definition. Next time a similar request comes in, the Task Manager checks learned patterns first.

**Data model (new table):**
```sql
CREATE TABLE learned_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  trigger_pattern TEXT NOT NULL,
  trigger_embedding VECTOR(1024),
  workflow_type TEXT NOT NULL,
  steps JSONB NOT NULL,
  success_count INT DEFAULT 1,
  fail_count INT DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Integration with existing systems:**
- Reuses `WorkflowDefinition` and `WorkflowStepDef` types from workflow-executor.ts
- Matching uses the existing Pinecone/Voyage embedding pipeline (ADR-002)
- Learned workflows are executed by the existing `startWorkflow()` function

## Data Flow: Task Lifecycle

### Flow 1: Chat-initiated browser task

```
1. User: "Log into Asana and check what tasks are overdue for the White House RE project"

2. TAOR Loop (Vercel, 60s):
   - Context assembly, model routing
   - Claude decides: no API tool for Asana, needs browser
   - Claude calls execute_task(task: "...", target_url: "https://app.asana.com", ...)

3. Tool Priority Chain:
   - No API tool for Asana access -> route to browser
   - Confidence check via autonomy gate
   - If autopilot + high confidence: create task immediately
   - If copilot: queue for approval first

4. Task Manager:
   - INSERT INTO agent_task_queue (agent_type: 'browser-cua', payload: {...})
   - Returns tool_result: "Task queued (ID: abc123). I'll notify you when complete."

5. TAOR Loop returns response to user via SSE

6. Cloudflare Edge Cron (within 5 minutes, or trigger endpoint):
   - Polls agent_task_queue, finds pending browser task
   - Dispatches to Fly.io browser worker

7. Browser Worker (Fly.io, 2GB machine):
   - Launches Playwright Chromium
   - Runs CUA agentic loop:
     a. Navigate to https://app.asana.com
     b. Screenshot -> Claude analyzes -> clicks/types
     c. Repeat until task complete or max iterations
   - Updates task row: status=verifying, screenshots stored in Supabase Storage

8. Verification:
   - Final screenshot analyzed by Claude
   - Extracted data written to task result
   - Status -> completed

9. Dashboard notification:
   - Supabase Realtime pushes task completion to dashboard
   - User sees: "Asana check complete: 3 overdue tasks found for White House RE"
   - Screenshot evidence available in task detail view
```

### Flow 2: Role-tick-initiated background task

```
1. Finance Role Tick (cron, every 30 min):
   - evaluate() finds: "Invoice #INV-2024-042 overdue, client has payment portal"
   - Generates action: { type: 'browser-task', summary: 'Check payment status on client portal' }

2. Action Dispatcher:
   - Routes through autonomy gate (autopilot + high confidence = execute)
   - Creates task via Task Manager instead of approval queue

3. Task Manager -> Cloudflare -> Browser Worker (same flow as above)

4. Result:
   - Payment status extracted
   - Finance role's next tick incorporates the finding
   - If payment found: mark invoice as paid
   - If not: escalate to human
```

### Flow 3: Tool priority chain fallback

```
1. User: "Send a follow-up email to Sezer about the unpaid invoice"

2. TAOR Loop:
   - Claude calls send_email tool (API tool exists)
   - Tool executes via Resend API -> success
   - NO browser fallback needed

3. User: "Also post an update about it on our Monday.com board"

4. TAOR Loop:
   - No API tool for Monday.com
   - Claude calls execute_task(task: "Post update on Monday.com board", ...)

5. Tool Priority Chain:
   - Check learned_workflows: any pattern for "Monday.com board update"?
   - If found: execute learned workflow (deterministic, fast)
   - If not: route to browser CUA (new pattern, will learn on success)
```

## Progress Communication: Dashboard Integration

### Real-time updates use TWO existing channels:

**1. Supabase Realtime (for task status changes):**
Already wired in `supabase-realtime.ts` with `RealtimeManager` singleton. Currently subscribes to `approval_queue`, `channel_messages`, `agent_runs`, `notifications`, `leads`, `invoices`.

Add subscription to `agent_task_queue`:
```typescript
// In RealtimeTable type (supabase-realtime.ts line 18):
export type RealtimeTable =
  | 'approval_queue'
  | 'channel_messages'
  | 'agent_runs'
  | 'agent_task_queue'  // NEW
  | 'notifications'
  | 'leads'
  | 'invoices';
```

Dashboard widget subscribes to task updates:
```typescript
useRealtimeSubscription('agent_task_queue', {
  event: 'UPDATE',
  filter: `org_id=eq.${orgId}`,
}, (payload) => {
  // Update task status in UI
  // Show progress bar, screenshots, etc.
})
```

**2. SSE endpoint (for live streaming during chat):**
Already exists at `/api/events` (events/route.ts). Currently streams `agent_runs` and `approval_queue` changes. Add `agent_task_queue` channel for task progress during active sessions.

**NOT a new WebSocket connection.** Supabase Realtime already uses WebSocket under the hood. We piggyback on the existing connection.

### Progress granularity:

| Task Phase | Update Method | Update Content |
|------------|--------------|----------------|
| Created | Supabase Realtime INSERT | Task ID, description, priority |
| Dispatched | Supabase Realtime UPDATE | Worker assigned, ETA |
| Executing | Supabase Realtime UPDATE (periodic) | Current step, screenshot thumbnail |
| CUA iteration | Supabase UPDATE (every 3-5 iterations) | Latest screenshot, action summary |
| Verifying | Supabase Realtime UPDATE | Verification screenshot |
| Completed | Supabase Realtime UPDATE + Push notification | Result summary, evidence |
| Failed | Supabase Realtime UPDATE + Push notification | Error message, last screenshot |

## TAOR Engine Integration Points

### Modifications to existing TAOR loop (MINIMAL):

The TAOR loop (`taor-loop.ts`) requires **zero structural changes**. The integration happens entirely through the tool system:

1. **New tool registration:** Add `execute_task` to the `agentic` tool group in `tools.ts` TOOL_GROUPS
2. **New tool handler:** Register handler in executeAgentTool dispatch
3. **New AgentEvent type:** Add `task_queued` event type for async task acknowledgment

```typescript
// In types.ts, add to AgentEvent union:
| { type: 'task_queued'; data: { taskId: string; description: string; method: 'browser' | 'workflow' | 'human' } }
```

The existing patterns already handle this:
- `tool_result.queued === true` (tool-executor.ts line 254) -- already supported
- `approvalId` in tool results -- already surfaced in UI
- `tool_progress` heartbeat events -- already yielded during long tool execution

### No changes needed to:
- `pre-flight.ts` -- async tasks do not affect pre-flight checks
- Model routing -- async tasks use their own model selection on the worker
- Context assembly -- async tasks run with their own context
- Plan stages -- async tasks appear as plan stages via existing reactive stage mechanism

## Patterns to Follow

### Pattern 1: Fire-and-Forget with Status Callback
**What:** Long-running operations insert a DB row and return immediately. The worker updates the row as it progresses. Dashboard subscribes to changes.
**When:** Any operation exceeding 30 seconds (browser automation, multi-step workflows)
**Already used:** `reflectAction()` in tool-executor.ts (fire-and-forget context write-back), workflow-executor.ts (fire-and-forget push notifications)

### Pattern 2: Idempotent Task Execution
**What:** Tasks include a deduplication key. If a task with the same key exists in `pending`/`executing` state, the new request returns the existing task ID.
**When:** Always for browser tasks (retries, duplicate user requests)
**Already used:** Advisory locks in role-runtime.ts (prevents concurrent role ticks)

### Pattern 3: Screenshot as Evidence
**What:** Every CUA action sequence produces a final screenshot stored in Supabase Storage. The screenshot URL is attached to the task result and surfaced in the dashboard.
**When:** All browser automation tasks
**Already used:** File attachment system (Supabase Storage with signed URLs, already built in v1.4)

### Pattern 4: Graceful Degradation Chain
**What:** If browser automation fails (Chromium crash, site blocks automation, timeout), the task automatically escalates to human handoff via the existing approval queue.
**When:** Any browser task failure after 2 retries
**Already used:** Approval queue + autonomy gate for confidence-based routing

## Anti-Patterns to Avoid

### Anti-Pattern 1: Running CUA Loop Inside TAOR
**What:** Making the TAOR loop wait for browser automation to complete
**Why bad:** Vercel serverless has 60s max execution time. CUA sessions take 30s-5min. Even on Fly.io workers, blocking the TAOR loop starves the chat stream.
**Instead:** TAOR spawns async task, returns immediately. Worker runs CUA loop independently.

### Anti-Pattern 2: Browserbase for Low-Volume Usage
**What:** Using a managed browser service when volume is < 100 sessions/month
**Why bad:** Minimum $20-50/mo plus per-session costs. At BitBit's current scale (single customer), a dedicated Fly.io machine is cheaper and provides more control.
**Instead:** Self-host Playwright on Fly.io. Evaluate Browserbase when session volume exceeds 500/month or multi-region is needed.

### Anti-Pattern 3: Streaming CUA Screenshots via SSE
**What:** Pushing every CUA screenshot through the SSE stream to the dashboard in real-time
**Why bad:** Screenshots are 200-500KB base64. At 10+ screenshots per session, this would flood the SSE stream and consume bandwidth. SSE is designed for small text events.
**Instead:** Store screenshots in Supabase Storage. Push only the URL via Realtime UPDATE. Dashboard lazy-loads screenshots on demand.

### Anti-Pattern 4: Shared Browser Instance
**What:** Keeping a single Chromium instance running and sharing it across tasks
**Why bad:** Browser state leaks between sessions (cookies, localStorage, auth tokens). One crashed tab takes down all sessions. Chromium memory grows over time.
**Instead:** Launch fresh Chromium per task. Use browser contexts (not full instances) only for parallel sub-tasks within the same task.

### Anti-Pattern 5: Polling for Task Status
**What:** Dashboard polling `/api/tasks/status` every N seconds
**Why bad:** Wastes requests, adds latency, does not scale. Supabase Realtime already provides push-based updates.
**Instead:** Subscribe to `agent_task_queue` changes via existing Supabase Realtime infrastructure.

## Infrastructure Sizing

### Browser Worker (NEW Fly.io app: `bitbit-browser`)

| Config | Value | Rationale |
|--------|-------|-----------|
| Machine | `performance-1x` | Dedicated CPU prevents noisy-neighbor Chromium stalls |
| Memory | 2048 MB | Chromium minimum. 1GB for Chromium + 512MB for Node + 512MB buffer |
| Region | `syd` | Match existing Fly.io workers for low-latency Supabase access |
| Count | 1 | Single machine, auto-stop when idle |
| Auto-stop | `suspend` | Zero cost when no browser tasks. Resume takes ~3s |
| Auto-start | `true` | Wakes on incoming request |
| Min machines | 0 | Can fully suspend -- browser tasks are not latency-sensitive |
| Estimated cost | ~$10-15/mo | Performance-1x 2GB in syd, mostly suspended |

```toml
# deployments/fly-browser/fly.toml
app = "bitbit-browser"
primary_region = "syd"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  DISPLAY = ":99"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "suspend"
  auto_start_machines = true
  min_machines_running = 0

  [http_service.concurrency]
    type = "requests"
    hard_limit = 5
    soft_limit = 3

[[vm]]
  size = "performance-1x"
  memory = "2048mb"
  count = 1
```

**Docker base image:** `mcr.microsoft.com/playwright:v1.50.0-noble`
- Pre-installed Chromium, Firefox, WebKit
- ~1.2GB image, but Fly.io caches layers
- Includes system fonts, video codecs for reliable rendering

### Existing Infrastructure Impact

| Component | Current | After v2.0 | Change |
|-----------|---------|------------|--------|
| Vercel | ~$20/mo | ~$20/mo | No change -- async tasks offloaded |
| Fly.io workers | ~$15/mo (2x 1GB) | ~$15/mo | No change -- keep for existing agent tasks |
| Fly.io browser | N/A | ~$12/mo | NEW -- mostly suspended |
| Cloudflare | ~$0/mo (free tier) | ~$0/mo | Add browser task dispatch route |
| Supabase | ~$25/mo | ~$25/mo | pgmq extension (free), new table |
| **Total** | **~$60/mo** | **~$72/mo** | **+$12/mo** |

### Supabase Queue Setup

Enable pgmq extension for durable task queuing (if available on current Postgres version):
```sql
CREATE EXTENSION IF NOT EXISTS pgmq;
SELECT pgmq.create('browser_tasks');
SELECT pgmq.create('workflow_tasks');
```

**Fallback if pgmq is not available:** The existing `agent_task_queue` table pattern (poll + status column + Cloudflare cron) works fine. The advisory lock pattern from `role-runtime.ts` prevents duplicate processing. pgmq is a SHOULD, not a MUST.

## Modified vs New Components Summary

### NEW Components (to build)
| Component | Files | Complexity |
|-----------|-------|------------|
| Task Manager | `lib/tasks/task-manager.ts`, `lib/tasks/types.ts` | Medium |
| Browser Worker | `deployments/fly-browser/` (new Fly.io app) | High |
| CUA Agent Loop | `deployments/fly-browser/src/cua-loop.ts` | High |
| execute_task tool | `lib/agent/tools/execute-task.ts` | Low |
| Workflow Learner | `lib/workflows/workflow-learner.ts` | Medium |
| Task Dashboard Widget | `components/widgets/task-progress-widget.tsx` | Medium |
| learned_workflows table | Supabase migration | Low |

### MODIFIED Components (existing, minimal changes)
| Component | Change | Risk |
|-----------|--------|------|
| `tools.ts` | Add `execute_task` to tool groups, register handler | Low |
| `types.ts` | Add `task_queued` event type | Low |
| `supabase-realtime.ts` | Add `agent_task_queue` to RealtimeTable | Low |
| `/api/events/route.ts` | Subscribe to `agent_task_queue` changes | Low |
| `deployments/cloudflare/src/index.ts` | Add browser task dispatch route | Low |
| `agent_task_queue` table | Add columns: `method`, `screenshots`, `verification_result` | Low |

### UNCHANGED Components (no modifications needed)
- `taor-loop.ts` -- works via tool system extension
- `tool-executor.ts` -- existing parallel dispatch + heartbeat
- `role-scheduler.ts` -- generates tasks via action dispatcher
- `role-runtime.ts` -- no changes
- `workflow-executor.ts` -- reused as-is for learned workflows
- `autonomy-gate.ts` -- reused for browser task confidence routing
- `approval-queue.ts` -- reused for human handoff
- `action-executor.ts` -- transport map extended, not modified

## Scalability Considerations

| Concern | At 1 user (now) | At 100 users | At 1,000 users |
|---------|-----------------|--------------|----------------|
| Browser sessions | 1 machine, suspend when idle | 2-3 machines, auto-scale | Browserbase or dedicated fleet |
| Task queue | Existing Cloudflare cron (5min poll) | Reduce to 1min poll + trigger endpoint | pgmq with pg_notify for instant dispatch |
| Progress updates | Supabase Realtime (included) | Supabase Realtime (included) | Consider dedicated event bus |
| Screenshot storage | Supabase Storage (1GB free) | Supabase Storage ($0.021/GB) | CDN + lifecycle policies |
| CUA API cost | ~$0.10-0.50/session | Budget per org | Usage metering + plan gating |

## Sources

- [Anthropic Computer Use Tool Documentation](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool) -- HIGH confidence (official docs, verified 2026-03-31)
- [Anthropic Computer Use Reference Implementation](https://github.com/anthropics/anthropic-quickstarts/tree/main/computer-use-demo) -- HIGH confidence
- [Playwright Docker Documentation](https://playwright.dev/docs/docker) -- HIGH confidence
- [Supabase pgmq Documentation](https://supabase.com/docs/guides/queues/pgmq) -- HIGH confidence
- [Supabase Queues Overview](https://supabase.com/docs/guides/queues) -- HIGH confidence
- [Fly.io Playwright Setup](https://stephenhaney.com/2024/playwright-on-fly-io-with-bun/) -- MEDIUM confidence (community guide)
- [Browserbase Pricing](https://www.browserbase.com/pricing) -- MEDIUM confidence (may have changed)
- [Agentic Browser Landscape 2026](https://nohacks.co/blog/agentic-browser-landscape-2026) -- MEDIUM confidence
