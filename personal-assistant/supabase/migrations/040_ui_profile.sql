-- Add ui_profile column to organizations for configurable UI composition
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ui_profile text NOT NULL DEFAULT 'full';

ALTER TABLE organizations ADD CONSTRAINT organizations_ui_profile_check
  CHECK (ui_profile IN ('essential', 'full', 'custom'));
