-- 093_billing_hardening.sql
-- Add stripe_customer_id to organizations for reliable bidirectional lookup

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer
  ON organizations (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
