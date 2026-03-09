-- Add industry column to organisations for vertical pack resolution
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS industry text NOT NULL DEFAULT 'agency';
