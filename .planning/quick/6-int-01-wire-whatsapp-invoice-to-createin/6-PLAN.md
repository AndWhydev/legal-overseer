---
phase: quick
plan: 6
type: quick-task
title: "INT-01: Wire WhatsApp invoice to createInvoiceFromIntent pipeline"
autonomous: true
requirements: [INVC-06, INVC-07, INVC-08, INVC-09, INVC-10, WHATS-02]
---

# Quick Task 6: Wire WhatsApp Invoice to createInvoiceFromIntent Pipeline

## Objective

Replace the `executeAgentTool('create_task', ...)` proxy in `agent-dispatch.ts` `handleInvoice` with a proper call to `createInvoiceFromIntent` from `invoice-flow.ts`. This enables the full invoice pipeline (entity resolution, duplicate detection, invoice number generation, PDF/email) to execute from WhatsApp commands instead of only via the scheduler cron.

## Context

- `agent-dispatch.ts` line 86: uses `create_task` as proxy for invoice creation
- `invoice-flow.ts` exports `createInvoiceFromIntent` with full pipeline
- `createInvoiceFromIntent` requires: supabase, orgId, InvoiceIntent, agentConfigId, options
- Agent config resolution pattern exists in `/api/agent/invoices/route.ts` via `resolveInvoiceAgentConfigId`
- WhatsApp command parser already extracts: contactNames, amounts, projectReference, resolvedContacts
- Confidence routing: invoice-flow has act=0.92, ask=0.60 thresholds

## Tasks

### Task 1: Wire handleInvoice to createInvoiceFromIntent
type="auto"

**Do:**
1. Import `createInvoiceFromIntent`, `InvoiceIntent` from `@/lib/agent/invoice-flow`
2. Add a local `resolveInvoiceAgentConfigId` helper (same pattern as in the API route)
3. Replace the `executeAgentTool('create_task', ...)` block with:
   - Build an `InvoiceIntent` from ParsedCommand entities
   - Resolve the invoice-flow agent config ID
   - Call `createInvoiceFromIntent` with `requireApproval: true` (WhatsApp commands always queue for approval)
   - Return appropriate WhatsApp-friendly responses for each outcome status (queued, created, duplicate, error)
4. Also replace the "search existing invoices" block to use `searchInvoices` from shared-tools instead of `search_tasks` proxy
5. Update existing imports if any become unused

**Done when:**
- `handleInvoice` calls `createInvoiceFromIntent` instead of `executeAgentTool('create_task', ...)`
- Invoice search uses `searchInvoices` instead of `search_tasks`
- All outcome statuses (queued, created, duplicate, error) have proper WhatsApp responses
- TypeScript compiles without errors in agent-dispatch.ts

### Task 2: Verify build and existing tests
type="auto"

**Do:**
1. Run TypeScript type-check on the modified file
2. Run the full build to verify no regressions
3. Run existing invoice-flow and agent-dispatch related tests

**Done when:**
- Build passes
- No type errors in modified files
- Existing tests pass

## Success Criteria

- WhatsApp "invoice Sezer for the White House RE work" routes to real invoice pipeline
- Invoice pipeline handles: entity resolution, duplicate detection, approval queue
- Confidence routing preserved (always queues for approval via WhatsApp)
- Existing invoice search still works
- Build passes with zero new errors
