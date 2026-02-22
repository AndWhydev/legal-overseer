-- 023_invoice_flow.sql
-- Invoice Flow metadata columns + duplicate guard index.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS project_reference text NOT NULL DEFAULT ,
  ADD COLUMN IF NOT EXISTS source_intent text,
  ADD COLUMN IF NOT EXISTS created_by text NOT NULL DEFAULT manual;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_duplicate_guard
  ON invoices (org_id, client_contact_id, project_reference, total)
  WHERE status <> cancelled AND project_reference <> ;
