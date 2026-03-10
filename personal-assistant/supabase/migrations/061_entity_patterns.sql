-- 061_entity_patterns.sql
-- Behavioral patterns extracted from entity timeline

CREATE TABLE IF NOT EXISTS entity_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  pattern_type text NOT NULL,
  pattern_data jsonb NOT NULL DEFAULT '{}',
  sample_count int DEFAULT 0,
  confidence float DEFAULT 0.0,
  extracted_at timestamptz DEFAULT now(),
  valid_until timestamptz DEFAULT (now() + interval '24 hours'),
  UNIQUE(org_id, entity_type, entity_id, pattern_type),
  CHECK (pattern_type IN ('payment_timing', 'response_latency', 'activity_frequency', 'channel_preference')),
  CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX idx_entity_patterns_lookup ON entity_patterns(org_id, entity_type, entity_id);
CREATE INDEX idx_entity_patterns_stale ON entity_patterns(valid_until) WHERE valid_until < now();

ALTER TABLE entity_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entity_patterns_select" ON entity_patterns
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));
CREATE POLICY "entity_patterns_insert" ON entity_patterns
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());
CREATE POLICY "entity_patterns_update" ON entity_patterns
  FOR UPDATE USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));
CREATE POLICY "entity_patterns_delete" ON entity_patterns
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));
