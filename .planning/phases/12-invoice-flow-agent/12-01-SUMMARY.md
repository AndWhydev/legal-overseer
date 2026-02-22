# 12-01 Summary

## Completed
- Added migration `personal-assistant/supabase/migrations/023_invoice_flow.sql` to extend `invoices` with:
  - `project_reference`
  - `source_intent`
  - `created_by`
  - duplicate guard unique partial index (`org_id`, `client_contact_id`, `project_reference`, `total`) for non-cancelled invoices
- Implemented `personal-assistant/src/lib/agent/invoice-flow.ts` with:
  - `parseInvoiceIntent`
  - `resolveInvoiceEntities`
  - `detectDuplicateInvoice`
  - `createInvoiceFromIntent`
  - `runInvoiceFlowTick`
  - invoice number generation (`{ORG_PREFIX}-{YYYYMM}-{NNN}`)
- Extended shared invoice creation in `personal-assistant/src/lib/agent/shared-tools.ts` to persist invoice-flow metadata.
- Added coverage in `personal-assistant/src/lib/agent/invoice-flow.test.ts` for:
  - NL parsing variants
  - duplicate detection behavior
  - invoice number sequencing
  - unknown-contact/entity resolution failures

## Verification
- `cd personal-assistant && npx vitest run src/lib/agent/invoice-flow.test.ts`

## Requirements
- INVC-01: Implemented
- INVC-05: Implemented
