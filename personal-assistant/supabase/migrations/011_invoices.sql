-- 011_invoices.sql
-- Invoice tracking for Invoice Flow agent

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  invoice_number text NOT NULL,
  client_contact_id uuid REFERENCES contacts ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'overdue', 'paid', 'cancelled')),
  items jsonb NOT NULL DEFAULT '[]',
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'AUD',
  issued_date date,
  due_date date,
  paid_date date,
  payment_method text,
  stripe_payment_link text,
  pdf_url text,
  sent_via text,
  reminder_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, invoice_number)
);

-- Indexes
CREATE INDEX idx_invoices_org_status ON invoices (org_id, status);
CREATE INDEX idx_invoices_client ON invoices (client_contact_id);
CREATE INDEX idx_invoices_due ON invoices (org_id, due_date) WHERE status IN ('sent', 'viewed');
CREATE INDEX idx_invoices_overdue ON invoices (org_id) WHERE status = 'overdue';

-- Trigger
CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
