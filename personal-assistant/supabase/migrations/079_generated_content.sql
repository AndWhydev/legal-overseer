-- 079_generated_content.sql
-- Generated content storage for AI-powered templates (ad scripts, social posts, etc.)

CREATE TABLE IF NOT EXISTS generated_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_type text NOT NULL CHECK (template_type IN ('ad_scripts', 'social_posts', 'email_campaigns', 'blog_posts')),
  inputs jsonb NOT NULL,
  output text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_generated_content_org_created ON generated_content(org_id, created_at DESC);
CREATE INDEX idx_generated_content_template ON generated_content(org_id, template_type);

ALTER TABLE generated_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "generated_content_select" ON generated_content
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "generated_content_insert" ON generated_content
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());

CREATE POLICY "generated_content_update" ON generated_content
  FOR UPDATE USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE POLICY "generated_content_delete" ON generated_content
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));

CREATE TRIGGER trg_generated_content_updated_at
  BEFORE UPDATE ON generated_content
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
