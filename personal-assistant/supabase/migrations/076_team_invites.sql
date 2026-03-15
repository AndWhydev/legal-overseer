-- 076_team_invites.sql
-- Create team_invites table for managing org member invitations

CREATE TABLE IF NOT EXISTS team_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  invited_by UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  token TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}',

  UNIQUE(org_id, email, status) WHERE status = 'pending'
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_team_invites_org_id ON team_invites(org_id);
CREATE INDEX IF NOT EXISTS idx_team_invites_email ON team_invites(email);
CREATE INDEX IF NOT EXISTS idx_team_invites_token ON team_invites(token);
CREATE INDEX IF NOT EXISTS idx_team_invites_status ON team_invites(status);
CREATE INDEX IF NOT EXISTS idx_team_invites_expires_at ON team_invites(expires_at);

-- Enable RLS
ALTER TABLE team_invites ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Allow users to view invites for their org
CREATE POLICY team_invites_select_policy ON team_invites
  FOR SELECT
  USING (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

-- Allow org admins/owners to create invites
CREATE POLICY team_invites_insert_policy ON team_invites
  FOR INSERT
  WITH CHECK (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid())::text IN ('owner', 'admin')
    )
  );

-- Allow org admins/owners to update invite status
CREATE POLICY team_invites_update_policy ON team_invites
  FOR UPDATE
  USING (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid())::text IN ('owner', 'admin')
    )
  );

-- Allow org admins/owners to delete invites
CREATE POLICY team_invites_delete_policy ON team_invites
  FOR DELETE
  USING (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid())::text IN ('owner', 'admin')
    )
  );
