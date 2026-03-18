-- Add invoice_template JSONB column to organizations
-- Stores per-org invoice branding: logo, colors, business details, payment info
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS invoice_template jsonb DEFAULT '{}';
