# Action Execution Architecture -- Total Recall

## Key Findings from Codebase Exploration

**Gap A -- Context Gap:** The system prompt built in `prompt-builder.ts` (lines 105-240) does NOT include pending approvals. The LLM has no visibility into what actions are waiting for approval. When a user says "yep, send it" in the next turn, the LLM has no idea what "it" refers to.

**Gap B -- Execution Gap:** `resolveApproval()` in `approval-queue.ts` (lines 133-204) updates the status to `approved` and records the outcome for confidence calibration, but never triggers any action execution. The `action_payload` sits there inert.

**Existing Precedent (Invoice Flow):** The invoice-flow module (`invoice-flow.ts`, lines 640-720) has a polling pattern where `runInvoiceFlowTick()` queries for `status = 'approved'` and `action_type = 'invoice_create'`, then processes them. `invoice-sender.ts` (lines 190-270) does the same for `invoice_send`. This is a cron-based polling pattern -- the scheduler calls these tick functions, they scan for approved items, and execute them. However, this pattern is specialized per action type and does not generalize.

**Existing Transports:**
- **Email (Resend):** `email-transport.ts` -- full `Resend` SDK integration with `getResend()` factory. Functions like `sendApprovalEmail`, `sendLeadAckEmailToRecipient`, etc. The `send-invoice.ts` also uses Resend with a `sendInvoiceEmail()` that returns `{ success, messageId, error }`.
- **SMS (Telnyx):** `channels/sms.ts` -- complete `sendSMS()` function with retry logic (`sendWithRetry`), phone normalization (`normalizePhoneNumber`), and formatting (`formatForSMS`). Returns `{ success, messageId, error }`.
- **WhatsApp:** `channels/whatsapp.ts` -- `sendMessage()` via Meta Cloud API. Returns message ID or null.

**Send Limits:** `send-limits.ts` provides `checkSendLimit()` and `incrementSendCount()` per channel per org per day.

**State Machine:** The current `approval_queue` status column allows `pending`, `approved`, `rejected`, `expired`, `auto_expired`. The CHECK constraint in migration 020 will need to be extended to include `executing`, `completed`, and `failed`.

**Action Reflector:** `action-reflector.ts` already handles write-back to the context graph (timeline events, cross-reference invalidation) for `send_email`, `send_sms`, `send_whatsapp`, and `create_task`. The executor should call this after successful execution.

**Notification Dispatcher:** `notifications/dispatcher.ts` provides a unified `dispatchNotification()` that handles dashboard/email/WhatsApp channels with preference routing. This should be used for execution confirmations and failure alerts.

---

## 1. System Architecture

Two primary entry points trigger execution:
- **LLM approve_action tool** -- the user says "send it" in chat, LLM calls the tool, which resolves the approval and immediately triggers the executor.
- **Dashboard PATCH /api/agent/approvals** -- user clicks Approve in the dashboard, the route handler resolves the approval and triggers the executor.
- **WhatsApp approval flow** -- user replies Y to an approval notification, the conversation-manager resolves the approval and triggers the executor.

The executor is a single `executeApprovedAction()` function in a new file `personal-assistant/src/lib/agent/action-executor.ts`. It is called synchronously (with fire-and-forget for non-blocking paths) after `resolveApproval()` returns with status `approved`.

## 2. approve_action Tool

A new LLM tool added to the `comms` tool group. The tool definition needs:
- `name: 'approve_action'`
- Input schema: `{ approval_id?: string, action_description?: string }`
- The LLM selects the right approval based on context (pending actions surfaced in the system prompt)

The handler:
1. If `approval_id` provided, use directly.
2. If `action_description` provided, query `approval_queue` for pending approvals in the org, fuzzy match on `action_summary`.
3. Call `resolveApproval(supabase, approvalId, 'approved', userId, 'chat')` -- note: `resolved_via` needs a new value `'chat'` added to the CHECK constraint.
4. Call `executeApprovedAction(supabase, approvalRecord)`.
5. Return the execution result to the LLM so it can confirm to the user.

**Critical prerequisite:** The system prompt must include pending approvals. The `buildSystemPrompt()` function in `prompt-builder.ts` needs a new section (after "Recent Activity") that lists pending approvals with their IDs, action summaries, and action types. This is the fix for Gap A.

## 3. Action Executor

The central dispatcher. File: `personal-assistant/src/lib/agent/action-executor.ts`

```
executeApprovedAction(supabase, approval) ->
  1. Update status: approved -> executing
  2. Look up handler from TRANSPORT_MAP[approval.action_type]
  3. Call handler with approval.action_payload
  4. On success: update status -> completed, store execution_result
  5. On failure: retry or update status -> failed, store error
  6. Fire context reflector (action-reflector.ts)
  7. Dispatch notification (success/failure)
```

## 4. Transport Dispatch Map

```typescript
const TRANSPORT_MAP: Record<string, TransportHandler> = {
  send_email: emailTransport,     // Uses Resend via email-transport.ts
  send_sms: smsTransport,         // Uses Telnyx via channels/sms.ts
  send_whatsapp: whatsappTransport, // Uses Meta Cloud API via channels/whatsapp.ts
  create_task: taskTransport,     // Uses shared-tools.ts createTask
  invoice_create: invoiceTransport, // Reuses invoice-flow.ts
  invoice_send: invoiceSendTransport, // Reuses invoice-sender.ts
  schedule_reminder: reminderTransport, // Uses channel-tools
}
```

Each transport handler signature: `(supabase: SupabaseClient, orgId: string, payload: Record<string, unknown>) => Promise<ExecutionResult>`

The `ExecutionResult` interface:
```typescript
interface ExecutionResult {
  success: boolean
  transportMessageId?: string  // e.g., Resend message_id, Telnyx message_id
  error?: string
  metadata?: Record<string, unknown>  // delivery status, timestamps
}
```

## 5. State Machine Extensions

The `approval_queue.status` CHECK constraint needs extending:
```sql
ALTER TABLE approval_queue DROP CONSTRAINT approval_queue_status_check;
ALTER TABLE approval_queue ADD CONSTRAINT approval_queue_status_check
  CHECK (status IN ('pending', 'approved', 'executing', 'completed', 'failed', 'rejected', 'expired', 'auto_expired'));
```

New columns on `approval_queue`:
- `execution_started_at timestamptz` -- when executor picked it up
- `execution_completed_at timestamptz` -- when execution finished
- `execution_result jsonb` -- transport response (message_id, delivery details)
- `execution_error text` -- error message on failure
- `retry_count integer DEFAULT 0` -- number of execution retries

The `resolved_via` CHECK also needs `'chat'` added.

## 6. Pending Actions in System Prompt

The `buildSystemPrompt()` function needs to query `getPendingApprovals(supabase, orgId, { limit: 5 })` and append a section:

```
### Pending Actions Awaiting Your Approval
- [ID: abc123] Send email to dave@example.com: "Re: Invoice #1042" (queued 2h ago)
- [ID: def456] Send SMS to +61412345678: "Meeting confirmed for Thursday" (queued 30m ago)

Use the approve_action tool to approve any of these when the user confirms.
```

This solves Gap A entirely. The LLM sees pending actions with their IDs and can match "send it" to the right approval.

## 7. Error Handling and Retry

- **Transient failures** (network errors, rate limits): retry with exponential backoff, max 3 attempts. The existing `sendWithRetry` pattern in `channels/sms.ts` (lines 201-240) is the model.
- **Permanent failures** (invalid recipient, auth failure): mark as `failed` immediately with error details.
- **Retry tracking**: `retry_count` column on `approval_queue`. Each attempt increments. After 3, status becomes `failed`.
- **User notification on failure**: `dispatchNotification()` with type `'agent_error'`, urgency `'high'`.

## 8. Re-queue for Expired Actions

When the user references a previously expired action:
1. LLM calls `approve_action` with `action_description`.
2. Handler queries not just `pending` but also `expired`/`auto_expired` approvals (within last 7 days).
3. If match found on an expired record: create a NEW approval with the same `action_payload`, fresh `expires_at` (24h).
4. Return to LLM: "I found your draft email to Dave from yesterday. I've re-queued it with a fresh 24h window. Want me to send it now?"
5. If user confirms, LLM calls `approve_action` again on the new approval.

This means the `approve_action` handler needs a `requeue_expired: boolean` option in its logic.

## 9. Integration Points

**Files to modify:**
1. `approval-queue.ts` -- Add `executeApprovedAction` call after `resolveApproval()`. Or better: keep `resolveApproval` pure and have each call site trigger execution.
2. `tools.ts` -- Register `approve_action` tool definition and handler.
3. `superpower-tools.ts` -- Add approve_action to the `superpowerToolDefinitions` array and handler to `superpowerToolHandlers`.
4. `prompt-builder.ts` -- Add pending approvals section to system prompt.
5. `app/api/agent/approvals/route.ts` -- After `resolveApproval()` succeeds with `approved`, call `executeApprovedAction()`.
6. `whatsapp/conversation-manager.ts` -- After `resolveApprovalWithRetry()`, call `executeApprovedAction()`.
7. `whatsapp/approval-handler.ts` -- After status update to `approved`, call `executeApprovedAction()`.
8. Migration file -- Add new columns, update CHECK constraints.

**New files to create:**
1. `personal-assistant/src/lib/agent/action-executor.ts` -- Core executor with transport dispatch map.
2. `personal-assistant/supabase/migrations/063_action_execution.sql` -- Schema changes.

## 10. Sequence Diagrams

### Flow A: LLM Chat Approval

```
User: "yep send it"
  -> POST /api/agent/chat
    -> engine.ts: runAgentChat()
      -> prompt-builder.ts includes "### Pending Actions" with IDs
      -> LLM sees pending actions, picks the right one
      -> LLM calls approve_action({ approval_id: "abc123" })
      -> tools.ts dispatches to approve_action handler
        -> resolveApproval(supabase, "abc123", "approved", userId, "chat")
        -> executeApprovedAction(supabase, approvalRecord)
          -> TRANSPORT_MAP["send_email"](supabase, orgId, payload)
            -> Resend API -> messageId
          -> UPDATE approval_queue SET status='completed', execution_result={messageId}
          -> reflectAction(supabase, orgId, "send_email", payload, result)
          -> return { success: true, messageId }
      -> LLM receives tool result: "Email sent to dave@example.com"
      -> LLM responds: "Done! I've sent that email to Dave."
```

### Flow B: Dashboard Approval

```
User clicks Approve in dashboard
  -> PATCH /api/agent/approvals { approvalId, decision: "approved" }
    -> resolveApproval(supabase, approvalId, "approved", userId, "dashboard")
    -> executeApprovedAction(supabase, approvalRecord)
      -> (same executor flow as above)
    -> return { approval, executionResult }
```

### Flow C: Expired Re-queue

```
User: "send that email to Dave from yesterday"
  -> LLM calls approve_action({ action_description: "email to Dave" })
    -> Handler queries pending approvals -> no match
    -> Handler queries expired approvals (last 7 days) -> match found
    -> Creates new approval with same payload, fresh 24h window
    -> Returns: { requeued: true, newApprovalId: "xyz789", summary: "..." }
  -> LLM: "I found your draft email to Dave. Re-queued it. Send now?"
  -> User: "yes"
  -> LLM calls approve_action({ approval_id: "xyz789" })
    -> (standard execution flow)
```

### Critical Files for Implementation
- `personal-assistant/src/lib/agent/approval-queue.ts` - Core approval system to extend with execution trigger and new resolved_via value
- `personal-assistant/src/lib/agent/tools.ts` - Tool registry where approve_action must be registered, and tool groups updated
- `personal-assistant/src/lib/agent/prompt-builder.ts` - System prompt assembly that must surface pending approvals to the LLM (fixing Gap A)
- `personal-assistant/src/lib/channels/sms.ts` - Reference transport implementation with retry pattern to follow for the executor
- `personal-assistant/src/app/api/agent/approvals/route.ts` - Dashboard approval endpoint that must trigger execution after approval (fixing Gap B)
