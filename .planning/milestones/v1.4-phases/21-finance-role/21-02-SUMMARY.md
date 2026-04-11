---
phase: "21"
plan: "02"
subsystem: finance-role
tags: [invoicing, collections, workflows, proactive, autonomy]
dependency_graph:
  requires: [21-01]
  provides: [proactive-invoicing, collection-workflows, finance-state-schema]
  affects: [finance-role, role-runtime]
tech_stack:
  added: []
  patterns: [workflow-definition, autonomy-gated-actions, multi-strategy-detection]
key_files:
  created:
    - personal-assistant/src/lib/roles/finance/proactive-invoicing.ts
    - personal-assistant/src/lib/roles/finance/collection-workflow.ts
  modified:
    - personal-assistant/src/lib/roles/finance/finance-role.ts
decisions:
  - Billable work detection uses 3 strategies with graceful table-missing fallback
  - Collection workflow 4 steps: gentle(d7)/firm(d14)/final(d30)/escalate(d45)
  - Escalation always goes to user regardless of autonomy level (human decision point)
  - Observer surfaces insights only; Co-pilot queues approval; Autopilot auto-approves
  - Billable item hash dedup stored in state (cap 200) to avoid re-surfacing
  - Auto-invoice detection gated by config.auto_invoice_enabled (opt-in)
metrics:
  duration: "13min"
  completed: "2026-03-18"
---

# Phase 21 Plan 02: Proactive Invoicing + Collections Summary

Finance role proactively detects unbilled work across projects/time/recurring services, and runs escalating 4-step collection workflows for overdue invoices routed through the autonomy gate.

## What Was Built

### proactive-invoicing.ts (new)
- `detectBillableWork(supabase, orgId, state)` returns `BillableItem[]`
- Three detection strategies:
  1. **Unbilled projects**: completed tasks with no recent invoice (30-day window)
  2. **Unbilled time**: time_entries with `invoiced=false` grouped by contact
  3. **Recurring services**: past billing date with active status
- Confidence scoring: recurring (0.9) > time with rates (0.85) > project with budget (0.75) > estimated (0.4-0.65)
- Hash-based dedup via `billableItemHash()` to avoid re-surfacing known items
- Graceful fallback when time_entries or recurring_services tables don't exist

### collection-workflow.ts (new)
- `createCollectionWorkflow(invoice)` returns registry-format `WorkflowDefinition`
- `getCollectionStepDefs()` returns executor-format `WorkflowStepDef[]` with execute functions
- `getCollectionStepDef(stepId)` for single-step override lookup
- 4-step escalating schedule:
  - Step 1: Gentle reminder (day 7) -- friendly tone, low-pressure
  - Step 2: Firm reminder (day 14) -- professional follow-up
  - Step 3: Final notice (day 30) -- urgent, mentions "further action"
  - Step 4: Escalation alert (day 45) -- logged to role_activity for user
- Each step checks invoice status before executing (skip if paid/cancelled)
- Autonomy gate routing: Observer=insight, Co-pilot=approval queue, Autopilot=auto-approved
- Time delays between steps set via `delaySeconds` on each WorkflowStepDef

### finance-role.ts (modified)
- `FinanceState` interface defines typed JSONB schema for role_states
- `evaluate()` now runs 3 phases:
  1. Wrapped invoice tick (existing)
  2. Billable work detection (if auto_invoice_enabled)
  3. Overdue invoice scan -> start collection workflows
- `getWorkflowStepDefs('collection_reminder')` wired for runtime resume
- `getWorkflowStepDef('collection_reminder', stepId)` wired for runtime start
- `hasChanges()` now also checks ready collection workflows
- `findNewlyOverdueInvoices()` helper finds overdue invoices >= 7 days
- `hasActiveCollectionWorkflow()` prevents duplicate workflows per invoice

## Deviations from Plan

None -- plan executed exactly as written.

## Commits

| Hash | Message |
|------|---------|
| ee8c277b | feat(21-02): proactive invoicing + collection reminder workflows |

## Verification

- [x] Proactive invoicing detects unbilled completed projects (via detectUnbilledProjects)
- [x] Collection workflow starts when invoice becomes 7+ days overdue
- [x] Reminder steps skipped if invoice paid between steps (invoiceNotPaid condition + execute check)
- [x] Time delays between collection steps work (delaySeconds on each step def)
- [x] Observer mode: overdue invoices surface as insights, no reminders sent
- [x] Co-pilot mode: reminder drafts queued for approval
- [x] Autopilot mode: high-confidence reminders auto-approved
- [x] TypeScript compiles cleanly (zero errors in roles/finance/)

## Self-Check: PASSED
