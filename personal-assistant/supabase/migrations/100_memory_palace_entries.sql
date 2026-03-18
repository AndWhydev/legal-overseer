-- ============================================================================
-- 100_memory_palace_entries.sql
-- Memory Palace: Core memory entries with typed categories, confidence decay,
-- full-text search (tsvector), and provenance tracking.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. MEMORY_PALACE_ENTRIES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE memory_palace_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Typed memory categories
  category TEXT NOT NULL CHECK (category IN (
    'conversation', 'decision', 'pattern', 'fact',
    'relationship', 'pricing', 'convention'
  )),

  -- Content
  title TEXT,                         -- Optional short title
  content TEXT NOT NULL,              -- The memory itself
  content_tsv TSVECTOR,              -- Full-text search vector (auto-generated)

  -- Confidence & Decay
  confidence FLOAT NOT NULL DEFAULT 0.7
    CHECK (confidence >= 0.0 AND confidence <= 1.0),
  decay_rate TEXT NOT NULL DEFAULT 'normal'
    CHECK (decay_rate IN ('never', 'slow', 'normal', 'fast')),
  last_decayed_at TIMESTAMPTZ,
  corroboration_count INTEGER NOT NULL DEFAULT 0,

  -- Entity linkage
  entity_ids UUID[] NOT NULL DEFAULT '{}',
  entity_names TEXT[] DEFAULT '{}',   -- Denormalized for display

  -- Provenance
  source TEXT NOT NULL DEFAULT 'auto'
    CHECK (source IN ('auto', 'user_explicit', 'conversation_extraction',
                      'pattern_detection', 'consolidation', 'reflection_agent')),
  source_thread_id UUID,
  source_turn_number INTEGER,
  source_channel TEXT,

  -- Supersession chain
  superseded_by UUID REFERENCES memory_palace_entries(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Vector embedding reference
  pinecone_id TEXT,                   -- mp:{id} in Pinecone

  -- Metadata
  tags TEXT[] DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-generate tsvector on insert/update
CREATE OR REPLACE FUNCTION memory_palace_tsv_trigger()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.content_tsv := to_tsvector('english',
    COALESCE(NEW.title, '') || ' ' || NEW.content
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_memory_palace_tsv
  BEFORE INSERT OR UPDATE OF content, title
  ON memory_palace_entries
  FOR EACH ROW EXECUTE FUNCTION memory_palace_tsv_trigger();

CREATE TRIGGER trg_memory_palace_updated_at
  BEFORE UPDATE ON memory_palace_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

-- Primary query: active memories for an org
CREATE INDEX idx_mp_entries_org_active
  ON memory_palace_entries (org_id, category)
  WHERE is_active = true;

-- Full-text search
CREATE INDEX idx_mp_entries_tsv
  ON memory_palace_entries USING GIN (content_tsv);

-- Entity lookup (GIN on uuid array)
CREATE INDEX idx_mp_entries_entities
  ON memory_palace_entries USING GIN (entity_ids);

-- Decay processing: find memories needing decay
CREATE INDEX idx_mp_entries_decay
  ON memory_palace_entries (decay_rate, last_decayed_at)
  WHERE is_active = true AND decay_rate != 'never';

-- Confidence-sorted retrieval
CREATE INDEX idx_mp_entries_confidence
  ON memory_palace_entries (org_id, confidence DESC)
  WHERE is_active = true;

-- Source thread linkage
CREATE INDEX idx_mp_entries_thread
  ON memory_palace_entries (source_thread_id)
  WHERE source_thread_id IS NOT NULL;

-- Tags lookup
CREATE INDEX idx_mp_entries_tags
  ON memory_palace_entries USING GIN (tags);

-- Temporal: recent memories first
CREATE INDEX idx_mp_entries_created
  ON memory_palace_entries (org_id, created_at DESC)
  WHERE is_active = true;
