---
phase: 09-approval-flow
verified: 2026-02-21T17:41:11Z
status: gaps_found
score: 7/12 must-haves verified
gaps:
  - truth: "Agent actions route by confidence in production flow (act >0.85, ask 0.55-0.85, escalate <0.55)"
    status: failed
    reason: "Confidence routing exists in helper code/tests but is not wired into live agent tool execution path."
    artifacts:
      - path: "personal-assistant/src/lib/agent/approval-queue.ts"
        issue: "queueAgentAction implements routing but has no production caller."
      - path: "personal-assistant/src/lib/agent/tools.ts"
        issue: "executeAgentTool executes tools directly; no approval gate call before action execution."
    missing:
      - "Invoke queueAgentAction (or equivalent approval gate) from the runtime path before side-effecting actions run."
      - "Block/defer execution for ask/escalate decisions until approval status is approved."
  - truth: "When an action needs approval, Andy receives immediate WhatsApp approval requests"
    status: failed
    reason: "WhatsApp notifier exists but is not invoked when approvals are created."
    artifacts:
      - path: "personal-assistant/src/lib/agent/approval-notifier.ts"
        issue: "notifyApproval is exported but unused."
      - path: "personal-assistant/src/lib/agent/approval-queue.ts"
        issue: "createApproval/queueAgentAction do not trigger notifyApproval."
    missing:
      - "Call notifyApproval after creating ask/escalate approvals (urgent/normal immediate, low deferred)."
  - truth: "Low-priority approval requests batch into daily digest operationally"
    status: partial
    reason: "Digest API and batching logic exist, but no in-repo scheduler/trigger wiring proves regular digest delivery."
    artifacts:
      - path: "personal-assistant/src/app/api/agent/approvals/digest/route.ts"
        issue: "Route exists, but no evidence of cron registration in repo."
    missing:
      - "Wire daily cron job to POST /api/agent/approvals/digest with SCHEDULER_SECRET."
  - truth: "Approvals dashboard page artifact is substantive per plan must_haves"
    status: partial
    reason: "Plan requires min_lines: 20; file currently 10 lines."
    artifacts:
      - path: "personal-assistant/src/app/dashboard/approvals/page.tsx"
        issue: "Only 10 lines (below must_have threshold)."
    missing:
      - "Expand page implementation or align plan threshold to actual architecture (SPA tab-based rendering)."
---

# Phase 9: Approval Flow Verification Report

**Phase Goal:** Andy controls agent autonomy -- low-confidence actions require his approval via dashboard or WhatsApp before executing
**Verified:** 2026-02-21T17:41:11Z
**Status:** gaps_found
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Agent actions with confidence >0.85 execute automatically without queuing | ✗ FAILED | `queueAgentAction` implements this in `personal-assistant/src/lib/agent/approval-queue.ts:220`, but no production caller found; only tests reference it (`personal-assistant/src/lib/agent/approval-queue.test.ts:40`). |
| 2 | Agent actions with confidence 0.55-0.85 create pending approval records | ✗ FAILED | Implemented in helper (`personal-assistant/src/lib/agent/approval-queue.ts:229`) but not wired into runtime execution (`personal-assistant/src/lib/agent/tools.ts:263`). |
| 3 | Agent actions with confidence <0.55 create escalation approvals | ✗ FAILED | Escalation logic exists (`personal-assistant/src/lib/agent/confidence-router.ts:73`) and is consumed by `queueAgentAction`, but runtime does not call queue gate. |
| 4 | Low-priority approvals are marked for digest batching instead of immediate notification | ? PARTIAL | `digest_eligible` set on low priority (`personal-assistant/src/lib/agent/approval-queue.ts:76`) and digest sender exists (`personal-assistant/src/lib/agent/approval-notifier.ts:41`), but end-to-end trigger wiring is incomplete. |
| 5 | Dashboard shows pending agent actions with context, confidence score, and agent name | ✓ VERIFIED | Queue fetch + render in `personal-assistant/src/components/dashboard/approval-queue.tsx:35` and card rendering in `personal-assistant/src/components/dashboard/approval-card.tsx:84`. |
| 6 | Andy can approve actions from dashboard | ✓ VERIFIED | Approve button calls PATCH flow via `resolveApproval(..., 'approved')` in `personal-assistant/src/components/dashboard/approval-queue.tsx:162`. |
| 7 | Andy can reject actions from dashboard | ✓ VERIFIED | Reject button calls PATCH flow via `resolveApproval(..., 'rejected')` in `personal-assistant/src/components/dashboard/approval-queue.tsx:163`. |
| 8 | Approved/rejected actions disappear from pending queue | ✓ VERIFIED | Optimistic remove on action in `personal-assistant/src/components/dashboard/approval-queue.tsx:85` with rollback on failure. |
| 9 | Andy receives WhatsApp approval messages for actions needing approval | ✗ FAILED | Message sender exists (`personal-assistant/src/lib/agent/approval-notifier.ts:6`) but `notifyApproval` has no call sites in production code. |
| 10 | Andy can approve/reject via WhatsApp reply Y/N | ✓ VERIFIED | Webhook parses replies and resolves queue item in `personal-assistant/src/app/api/channels/whatsapp/webhook/route.ts:73` and `:98`. |
| 11 | Low-priority approvals batch into daily digest WhatsApp message | ? PARTIAL | Digest composition + send path exists in `personal-assistant/src/lib/channels/whatsapp.ts:91` and `personal-assistant/src/lib/agent/approval-notifier.ts:41`; scheduled invocation not evidenced in repo. |
| 12 | WhatsApp webhook verifies challenge and routes replies | ✓ VERIFIED | GET verification in `personal-assistant/src/app/api/channels/whatsapp/webhook/route.ts:35`, POST handler returns 200 ack at `:112`. |

**Score:** 7/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `personal-assistant/supabase/migrations/020_approval_queue.sql` | approval_queue schema with lifecycle/digest fields | ✓ VERIFIED | Table, indexes, and RLS policies present (`:4`, `:25`, `:35`). |
| `personal-assistant/src/lib/agent/approval-queue.ts` | queue CRUD + confidence routing entrypoint | ⚠️ ORPHANED | Substantive and imported by APIs, but `queueAgentAction` not used by runtime action executor. |
| `personal-assistant/src/app/api/agent/approvals/route.ts` | GET pending + PATCH resolve endpoints | ✓ VERIFIED | Auth + list/resolve flows implemented (`:36`, `:71`). |
| `personal-assistant/src/app/dashboard/approvals/page.tsx` | approvals dashboard page (min_lines 20) | ✗ STUB | Exists and renders queue, but only 10 lines (below plan threshold). |
| `personal-assistant/src/components/dashboard/approval-card.tsx` | card with context and approve/reject controls | ✓ VERIFIED | Full card UI + handlers + loading state implemented. |
| `personal-assistant/src/components/dashboard/approval-queue.tsx` | fetch/list/resolve queue component | ✓ VERIFIED | GET/PATCH wiring, filters, empty/error states, auto-refresh present. |
| `personal-assistant/src/lib/channels/whatsapp.ts` | WhatsApp client + parser | ✓ VERIFIED | sendMessage/sendApprovalRequest/sendDigest/parseApprovalReply implemented. |
| `personal-assistant/src/app/api/channels/whatsapp/webhook/route.ts` | webhook verification + inbound handler | ✓ VERIFIED | GET verify + POST parsing/resolution/ack implemented. |
| `personal-assistant/src/lib/agent/approval-notifier.ts` | notifyApproval + sendDailyDigest | ⚠️ ORPHANED | `sendDailyDigest` used by digest API; `notifyApproval` unused in runtime path. |
| `personal-assistant/src/app/api/agent/approvals/digest/route.ts` | cron-triggered digest endpoint | ⚠️ PARTIAL | Route and auth exist; no in-repo scheduler wiring evidence. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `approval-queue.ts` | `confidence-router.ts` | routeAgentAction import/use | ✓ WIRED | `import { routeAgentAction } ...` and call at `personal-assistant/src/lib/agent/approval-queue.ts:224`. |
| `api/agent/approvals/route.ts` | `approval-queue.ts` | getPendingApprovals/resolveApproval | ✓ WIRED | Calls at `personal-assistant/src/app/api/agent/approvals/route.ts:58` and `:92`. |
| `approval-queue.tsx` | `/api/agent/approvals` | GET + PATCH fetch | ✓ WIRED | Fetch calls at `personal-assistant/src/components/dashboard/approval-queue.tsx:35` and `:88`. |
| `dashboard/approvals/page.tsx` | `approval-queue.tsx` | ApprovalQueue render | ✓ WIRED | Render at `personal-assistant/src/app/dashboard/approvals/page.tsx:7`. |
| `approval-notifier.ts` | `channels/whatsapp.ts` | sendApprovalRequest/sendDigest | ✓ WIRED | Imports and calls present (`personal-assistant/src/lib/agent/approval-notifier.ts:4`, `:26`, `:57`). |
| `whatsapp/webhook/route.ts` | `approval-queue.ts` | resolveApproval on reply | ✓ WIRED | Call at `personal-assistant/src/app/api/channels/whatsapp/webhook/route.ts:98`. |
| `agent runtime` | `approval-queue.ts` | gate tool execution via queueAgentAction | ✗ NOT_WIRED | No call site in `personal-assistant/src/lib/agent/tools.ts` or `personal-assistant/src/lib/agent/engine.ts`. |
| `approval creation path` | `approval-notifier.ts` | trigger notifyApproval | ✗ NOT_WIRED | `notifyApproval` has no production call sites. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| APPR-01 | 09-01-PLAN.md | Confidence routing decides act/ask/escalate per agent action | ✗ BLOCKED | Routing exists in helper code but not wired into runtime action execution (`personal-assistant/src/lib/agent/tools.ts:263`). |
| APPR-02 | 09-02-PLAN.md | Dashboard queue shows pending actions with approve/reject | ✓ SATISFIED | Queue/card/page implementation and API fetch/patch wiring in dashboard components. |
| APPR-03 | 09-03-PLAN.md | WhatsApp notification sends approval requests to Andy | ✗ BLOCKED | Notification function exists but not invoked in approval creation flow (`personal-assistant/src/lib/agent/approval-notifier.ts:6`). |
| APPR-04 | 09-03-PLAN.md | Andy can approve/reject via WhatsApp reply | ? NEEDS HUMAN | Parser + webhook + resolve flow implemented; requires live WhatsApp webhook confirmation. |
| APPR-05 | 09-01-PLAN.md, 09-03-PLAN.md | Low-priority approvals batch into daily digest | ✗ BLOCKED | Digest logic exists, but operational scheduling + creation-path notifier wiring not evidenced end-to-end. |

Orphaned phase requirements from `REQUIREMENTS.md`: None (Phase 9 IDs APPR-01..APPR-05 are all present in plan frontmatter).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `personal-assistant/src/app/api/channels/whatsapp/webhook/route.ts` | 63 | `console.log` in request path | ℹ️ Info | Non-structured logging only; does not block goal achievement. |
| `personal-assistant/src/app/api/channels/whatsapp/webhook/route.ts` | 69 | `console.log` in request path | ℹ️ Info | Same as above. |
| `personal-assistant/src/app/api/channels/whatsapp/webhook/route.ts` | 75 | `console.log` in request path | ℹ️ Info | Same as above. |

### Human Verification Required

### 1. WhatsApp End-to-End Approval Reply

**Test:** Send a real approval request to Andy's WhatsApp, reply `Y` and `N`, then verify approval status updates in DB/dashboard.
**Expected:** Reply resolves the intended pending approval with `resolved_via='whatsapp'` and confirmation message is sent.
**Why human:** Requires external Meta webhook delivery, credentials, and real WhatsApp account.

### 2. Daily Digest Delivery Schedule

**Test:** Trigger or wait for daily cron, then confirm low-priority pending approvals are delivered as one digest message.
**Expected:** Single digest message lists pending low-priority items; no individual pings for those same items.
**Why human:** Scheduler/deployment wiring is external to source code and cannot be verified statically.

### Gaps Summary

Core dashboard and WhatsApp handler components exist, but the goal-critical control loop is incomplete: production agent execution is not gated by confidence routing, and WhatsApp immediate notifications are not triggered from approval creation. As a result, Andy does not reliably control agent autonomy before low-confidence execution. APPR-01, APPR-03, and APPR-05 remain blocked until runtime wiring is completed.

---

_Verified: 2026-02-21T17:41:11Z_
_Verifier: Claude (gsd-verifier)_
