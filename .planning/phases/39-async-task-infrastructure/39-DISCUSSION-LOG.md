# Phase 39: Async Task Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-04-08
**Phase:** 39-async-task-infrastructure
**Areas discussed:** Execution engine choice, Task lifecycle & recovery, Real-time visibility, Cancellation & control

---

## Execution Engine Choice

### Q1: What's your instinct on the execution engine?

| Option | Description | Selected |
|--------|-------------|----------|
| Supabase-native FSM | Custom execution_tasks table with state machine, pg_cron, Realtime. Zero new infra. | |
| Trigger.dev Cloud | Managed durable execution. ~$25/mo. | |
| Vercel Workflow DevKit | Durable execution on Vercel Fluid Compute. | |
| You decide | Claude picks based on existing infra and cost. | ✓ |

**User's choice:** You decide
**Notes:** None

### Q2: Any hard constraints on engine choice?

| Option | Description | Selected |
|--------|-------------|----------|
| No new services | Stay within existing stack. Keep bill flat. | |
| Best tool for the job | If managed service saves weeks, worth the cost. | ✓ |
| You decide | Claude evaluates tradeoff. | |

**User's choice:** Best tool for the job
**Notes:** Quality over penny-pinching

---

## Task Lifecycle & Recovery

### Q3: How aggressive should self-healing be?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-retry once, then surface | Conservative -- avoids runaway retries. | |
| Configurable per-task | Each task type defines own retry policy. | |
| You decide | Claude picks based on task types. | ✓ |

**User's choice:** You decide
**Notes:** None

### Q4: Dead letter queue approach?

| Option | Description | Selected |
|--------|-------------|----------|
| Failed status in same table | Simple -- query by status for debugging. | |
| Separate DLQ table | Clean main table. Standard queue pattern. | |
| You decide | Claude picks based on volume and ops needs. | ✓ |

**User's choice:** You decide
**Notes:** None

---

## Real-time Visibility

### Q5: How should running tasks appear in the dashboard?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline in chat | Progress as live-updating messages in chat thread. No separate view. | ✓ |
| Dedicated task panel | Sidebar/panel with progress bars and cancel buttons. | |
| Both -- chat + panel | Chat shows narrative, panel shows operational view. | |
| You decide | Claude picks for single-user business owner. | |

**User's choice:** Inline in chat
**Notes:** Consistent with Phase 38's conversational intelligence philosophy

---

## Cancellation & Control

### Q6: How should the user cancel a running task?

| Option | Description | Selected |
|--------|-------------|----------|
| Natural language in chat | "Stop that" or "cancel the invoice." No buttons. | ✓ |
| Cancel button on progress message | Small cancel/stop button on each in-progress message. | |
| Both -- NL + button | Button for discoverability, NL for power users. | |
| You decide | Claude picks for chat-first interface. | |

**User's choice:** Natural language in chat
**Notes:** No buttons, no task management UI

### Q7: What happens to partially completed work?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep and report | Preserve completed steps, report to user, let them decide. | ✓ |
| Rollback everything | Undo all side effects where possible. | |
| You decide | Claude picks per task type. | |

**User's choice:** Keep and report
**Notes:** "Stopped. I'd already calculated the line items but hadn't sent the invoice. Want me to finish just the send?"

---

## Claude's Discretion

- Execution engine selection
- 7-state FSM design details
- Heartbeat/orphan detection thresholds
- Per-task-type retry policies
- DLQ approach
- Progress message format
- NL cancellation → task identification mapping

## Deferred Ideas

None -- discussion stayed within phase scope
