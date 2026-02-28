-- Add ui_profile column to organisations for configurable UI composition
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS ui_profile text NOT NULL DEFAULT 'full';

ALTER TABLE organisations ADD CONSTRAINT organisations_ui_profile_check
  CHECK (ui_profile IN ('essential', 'full', 'custom'));
