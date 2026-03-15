-- 078_gdpr_soft_delete.sql
-- GDPR compliance: soft delete requests with 30-day grace period

CREATE TABLE IF NOT EXISTS soft_delete_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'cancelled', 'completed', 'failed')),
  grace_period_until timestamptz NOT NULL,
  cancelled_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, user_id, status)
);

CREATE INDEX idx_soft_delete_requests_grace ON soft_delete_requests(grace_period_until);
CREATE INDEX idx_soft_delete_requests_org_user ON soft_delete_requests(org_id, user_id, status);

ALTER TABLE soft_delete_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "soft_delete_requests_select" ON soft_delete_requests
  FOR SELECT USING (user_id = auth.uid() OR org_id IN (SELECT get_user_accessible_org_ids()));
CREATE POLICY "soft_delete_requests_insert" ON soft_delete_requests
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());
CREATE POLICY "soft_delete_requests_update" ON soft_delete_requests
  FOR UPDATE USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

-- Add deleted_at column to profiles for account disabling
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE TRIGGER trg_soft_delete_requests_updated_at
  BEFORE UPDATE ON soft_delete_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
