---
phase: quick
plan: 6
subsystem: whatsapp-invoice-pipeline
tags: [integration, invoice, whatsapp, pipeline]
dependency-graph:
  requires: [invoice-flow, agent-dispatch, shared-tools]
  provides: [whatsapp-invoice-pipeline]
  affects: [agent-dispatch, whatsapp-conversation-flow]
tech-stack:
  patterns: [intent-based-dispatch, approval-queue, structured-error-mapping]
key-files:
  modified:
    - personal-assistant/src/lib/whatsapp/agent-dispatch.ts
decisions:
  - Always requireApproval=true for WhatsApp-initiated invoices (financial safety)
  - Map invoice-flow error codes to WhatsApp-friendly messages
  - Use searchInvoices from shared-tools for real invoice search
metrics:
  duration: 10min
  completed: 2026-03-12
---

# Quick Task 6: INT-01 Wire WhatsApp Invoice to createInvoiceFromIntent Pipeline

Replaced executeAgentTool('create_task') proxy in agent-dispatch.ts with real createInvoiceFromIntent pipeline call, enabling full invoice flow (entity resolution, duplicate detection, approval queue) from WhatsApp.

## What Changed

### agent-dispatch.ts (127 insertions, 38 deletions)

**Removed:**
- `executeAgentTool('create_task', ...)` proxy that created tasks instead of invoices
- `search_tasks` proxy for invoice search

**Added:**
- `resolveInvoiceAgentConfigId()` - resolves the invoice-flow agent config from the DB (same pattern as `/api/agent/invoices/route.ts`)
- `formatInvoiceOutcome()` - maps all 4 `CreateInvoiceFromIntentResult` statuses to WhatsApp-friendly responses:
  - `queued` - approval pending message
  - `created` - invoice number confirmation
  - `duplicate` - duplicate warning with override approval
  - `error` - user-friendly error messages
- `formatInvoiceError()` - maps error codes (missing_contact, unknown_contact, ambiguous_contact, amount_required) to actionable user messages
- Structured logging for invoice dispatch events
- Real `searchInvoices()` call from shared-tools for invoice list queries

**Key decisions:**
- `requireApproval: true` always for WhatsApp (money leaves the business, needs confirmation)
- Contact name resolved from `resolvedContacts[0].contact.name` (pre-resolved by command parser) or fallback to raw `contactNames[0]`
- Invoice search shows `invoice_number` and `project_reference` instead of task titles

## Pipeline Flow (Before vs After)

**Before:** WhatsApp "Invoice Sezer for $500" -> parseCommand -> dispatchCommand -> executeAgentTool('create_task') -> creates a TASK, not an invoice

**After:** WhatsApp "Invoice Sezer for $500" -> parseCommand -> dispatchCommand -> resolveInvoiceAgentConfigId -> createInvoiceFromIntent -> resolveInvoiceEntities -> detectDuplicateInvoice -> queueInvoiceCreationApproval -> WhatsApp "Queued invoice for Sezer -- $500. Awaiting your approval."

## Verification

- TypeScript: compiles cleanly (0 errors)
- Invoice-flow unit tests: 22/22 passing
- Invoice-flow integration tests: 7/7 passing
- All outcome statuses handled with appropriate WhatsApp messages

## Deviations from Plan

None - plan executed exactly as written.

## Commits

- `4b2f0673`: agent-dispatch.ts changes (bundled with concurrent Q7 commit)

## Self-Check: PASSED
