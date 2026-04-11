-- Baseplate Foundation tables: entity mentions, threads, and cross-reference cache
-- Enables pre-computed relationships and efficient context assembly

-- Entity mentions: extracted references from messages/events
CREATE TABLE IF NOT EXISTS entity_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_entity_type text NOT NULL,
  source_entity_id uuid NOT NULL,
  mentioned_entity_type text NOT NULL,
  mentioned_entity_id uuid NOT NULL,
  mention_context text,
  confidence float DEFAULT 0.8,
  extracted_by text DEFAULT 'haiku',
  occurred_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX idx_entity_mentions_org ON entity_mentions(org_id);
CREATE INDEX idx_entity_mentions_mentioned ON entity_mentions(mentioned_entity_type, mentioned_entity_id);
CREATE INDEX idx_entity_mentions_source ON entity_mentions(source_entity_type, source_entity_id);

ALTER TABLE entity_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org mentions" ON entity_mentions
  FOR SELECT USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

-- Entity threads: conversation linkage
CREATE TABLE IF NOT EXISTS entity_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  thread_id text NOT NULL,
  channel_source text NOT NULL,
  subject text,
  entity_ids uuid[] DEFAULT '{}',
  first_message_at timestamptz,
  last_message_at timestamptz,
  message_count integer DEFAULT 0,
  is_open boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_entity_threads_thread ON entity_threads(org_id, thread_id);
CREATE INDEX idx_entity_threads_entities ON entity_threads USING gin(entity_ids);

ALTER TABLE entity_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org threads" ON entity_threads
  FOR SELECT USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

-- Cross-reference cache: pre-computed entity relationships
CREATE TABLE IF NOT EXISTS cross_reference_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  cache_type text NOT NULL,
  cache_data jsonb NOT NULL DEFAULT '{}',
  computed_at timestamptz DEFAULT now(),
  valid_until timestamptz DEFAULT (now() + interval '15 minutes'),
  UNIQUE(org_id, entity_type, entity_id, cache_type),
  CHECK (cache_type IN ('financial', 'tasks', 'deadlines', 'waiting_for', 'contacts'))
);

CREATE INDEX idx_xref_cache_lookup ON cross_reference_cache(org_id, entity_type, entity_id);
CREATE INDEX idx_xref_cache_expiry ON cross_reference_cache(valid_until);

ALTER TABLE cross_reference_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org cache" ON cross_reference_cache
  FOR SELECT USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
