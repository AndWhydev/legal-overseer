# Phase 39: Async Task Infrastructure - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Durable execution engine with real-time visibility -- long-running tasks survive worker restarts, report live progress via chat, support natural language cancellation, and self-heal from orphaned state. Task progress and control are entirely conversational -- no separate task dashboard or panel.

</domain>

<decisions>
## Implementation Decisions

### Execution Engine Choice
- **D-01:** Engine choice is Claude's discretion. Evaluate Supabase-native FSM (extends existing approval queue pattern), Trigger.dev Cloud, Vercel Workflow DevKit, or other options. Pick the best tool for the job -- quality over penny-pinching.
- **D-02:** No hard constraint against new services. If a managed service saves weeks of custom code and fits the architecture, it's worth the cost. Budget flexibility exists beyond the current ~$70/mo baseline.
- **D-03:** Open decisions from STATE.md still need resolution during research: pgmq availability on Supabase project, Trigger.dev Cloud vs self-hosted.

### Task Lifecycle & Recovery
- **D-04:** Retry semantics are Claude's discretion. Design per-task-type retry policies appropriate for the downstream consumers (CUA browser tasks, workspace compute tasks, standard agent tasks). Pick what fits each task type's failure modes.
- **D-05:** Dead letter queue strategy is Claude's discretion. Evaluate whether failed tasks stay in the main table or move to a separate DLQ based on expected volume and operational needs.

### Real-time Visibility
- **D-06:** Task progress appears inline in chat only. No dedicated task panel, sidebar, or separate task view. Progress messages live-update in the chat thread where the task was initiated. Example: "Working on invoice for Steve... Step 2/4: Calculating line items... Done."
- **D-07:** Supabase Realtime (already wired in src/lib/realtime/) is the transport for live progress updates to the chat interface.

### Cancellation & Control
- **D-08:** Cancellation is natural language only. User says "stop that" or "cancel the invoice" in chat. No cancel buttons, no task management UI. BitBit understands intent and cancels. Consistent with Phase 38's invisible intelligence pattern.
- **D-09:** Partially completed work is preserved on cancellation, not rolled back. BitBit reports what was completed and offers to finish remaining steps. Example: "Stopped. I'd already calculated the line items but hadn't sent the invoice. Want me to finish just the send?"

### Claude's Discretion
- Execution engine selection (Supabase-native vs Trigger.dev vs Vercel Workflow vs other)
- 7-state FSM design details and transition rules
- Heartbeat interval and orphan detection thresholds
- Per-task-type retry policies and backoff strategies
- DLQ approach (same table vs separate)
- Progress message format and update granularity in chat
- How NL cancellation maps to task identification (when multiple tasks running)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Task/Approval Patterns
- `personal-assistant/src/lib/agent/approval-queue.ts` -- 8-state FSM pattern (pending→approved→executing→completed/failed), ApprovalRecord type, CreateApprovalParams. Model for execution_tasks design.
- `personal-assistant/src/lib/agent/approval-notifier.ts` -- Notification dispatch on approval state changes

### Realtime Infrastructure
- `personal-assistant/src/lib/realtime/supabase-realtime.ts` -- Existing Supabase Realtime subscription pattern
- `personal-assistant/src/lib/realtime/index.ts` -- Public exports

### Agent Engine Integration
- `personal-assistant/src/lib/agent/engine/taor-loop.ts` -- TAOR loop where async tasks will be dispatched from
- `personal-assistant/src/lib/agent/engine/tool-executor.ts` -- Tool execution where spawn_async_task integrates
- `personal-assistant/src/lib/agent/engine/types.ts` -- Engine types

### Requirements
- `.planning/REQUIREMENTS.md` -- ASYNC-01 through ASYNC-08

### Open Decisions (STATE.md)
- Confirm pgmq availability on Supabase project johvduasrhmufrfdxjus
- Confirm Trigger.dev Cloud vs self-hosted (if Trigger.dev is selected)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ApprovalQueue` FSM: 8-state lifecycle with status transitions, expiry, resolution tracking -- directly analogous to execution_tasks FSM
- `ApprovalRecord` type: Includes execution_started_at, execution_completed_at, execution_result, execution_error, retry_count -- already models task execution
- Supabase Realtime subscriptions: Already wired for live updates in `src/lib/realtime/`
- Fly.io Machines API: Already used for bridge provisioning -- pattern exists for spawning compute

### Established Patterns
- Approval queue uses Supabase table + RLS + status enum -- same pattern for execution_tasks
- Notification dispatch on state changes (approval-notifier.ts) -- reusable for task progress notifications
- Confidence router decides approval routing -- similar pattern for task priority/scheduling

### Integration Points
- TAOR loop tool dispatch: New `spawn_async_task` tool alongside existing tool executor
- Chat thread: Progress messages appear as assistant messages in the conversation thread
- Supabase Realtime: Subscribe to execution_tasks changes for live chat updates
- Existing approval queue: May extend or coexist -- async tasks could flow through approval when confidence requires it

</code_context>

<specifics>
## Specific Ideas

- Conversational-first philosophy carries forward from Phase 38: no separate UIs, everything through chat
- "Stop that" cancellation implies the agent needs context about which task is running -- may need task-to-thread association
- Partial work preservation means tasks need per-step state, not just overall status
- The approval queue already has execution tracking fields (started_at, completed_at, result, error, retry_count) -- execution_tasks may be an evolution of this pattern rather than a parallel system

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 39-async-task-infrastructure*
*Context gathered: 2026-04-08*
