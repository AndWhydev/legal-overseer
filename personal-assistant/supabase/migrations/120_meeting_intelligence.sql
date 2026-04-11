-- 120_meeting_intelligence.sql
-- Meeting Intelligence: meetings, participants, transcripts, action items, summaries
-- Supports MTG-01 through MTG-11

-- Meeting status enum
DO $$ BEGIN
  CREATE TYPE meeting_status AS ENUM ('uploading', 'uploaded', 'transcribing', 'transcribed', 'processing', 'ready', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Meeting source enum
DO $$ BEGIN
  CREATE TYPE meeting_source AS ENUM ('upload', 'zoom', 'google_meet', 'teams', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Action item status enum
DO $$ BEGIN
  CREATE TYPE action_item_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- MEETINGS — Core meeting record
-- ============================================================================
CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  source meeting_source NOT NULL DEFAULT 'upload',
  status meeting_status NOT NULL DEFAULT 'uploading',

  -- Timing
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,

  -- Storage
  recording_path TEXT,           -- Supabase Storage path: meetings/{org_id}/{meeting_id}/recording.ext
  recording_mime_type TEXT,
  recording_size_bytes BIGINT,

  -- AI-generated
  summary TEXT,
  key_decisions JSONB DEFAULT '[]',
  sentiment_score REAL,          -- -1 to 1
  sentiment_label TEXT,          -- positive, neutral, negative, mixed

  -- Associations
  project_id UUID,               -- optional project link

  -- External refs
  external_id TEXT,              -- Zoom/Meet meeting ID
  external_url TEXT,             -- link to recording on external platform
  webhook_payload JSONB,         -- raw webhook data

  -- Search
  search_vector tsvector,

  -- Metadata
  metadata JSONB DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- MEETING_PARTICIPANTS — People in the meeting
-- ============================================================================
CREATE TABLE IF NOT EXISTS meeting_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Identity
  display_name TEXT NOT NULL,
  email TEXT,
  speaker_label TEXT,            -- e.g., "Speaker 1", assigned during diarization

  -- Association
  contact_id UUID,               -- resolved to existing contact

  -- Role
  role TEXT DEFAULT 'attendee',  -- host, attendee, presenter

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- TRANSCRIPT_SEGMENTS — Chunked transcript with timestamps and speakers
-- ============================================================================
CREATE TABLE IF NOT EXISTS transcript_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Ordering
  segment_index INTEGER NOT NULL,

  -- Content
  text TEXT NOT NULL,
  speaker_label TEXT,            -- "Speaker 1", "Speaker 2", etc.
  speaker_name TEXT,             -- resolved name after diarization

  -- Timing
  start_seconds REAL NOT NULL,
  end_seconds REAL NOT NULL,

  -- AI metadata
  is_actionable BOOLEAN DEFAULT false,
  sentiment_score REAL,          -- -1 to 1 per segment
  confidence REAL,               -- transcription confidence 0-1

  -- Language
  language TEXT,                 -- ISO 639-1 code

  -- Search
  search_vector tsvector,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- MEETING_ACTION_ITEMS — Extracted commitments and tasks
-- ============================================================================
CREATE TABLE IF NOT EXISTS meeting_action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Content
  title TEXT NOT NULL,
  description TEXT,
  status action_item_status NOT NULL DEFAULT 'pending',

  -- Assignment
  assignee_name TEXT,            -- from transcript
  assignee_contact_id UUID,      -- resolved contact

  -- Deadline
  due_date DATE,
  due_date_raw TEXT,             -- original text: "by Friday", "next week"

  -- Source
  source_segment_id UUID REFERENCES transcript_segments(id) ON DELETE SET NULL,
  source_text TEXT,              -- exact quote from transcript

  -- Kanban integration
  task_id UUID,                  -- linked kanban task (auto-created)

  -- AI metadata
  confidence REAL,               -- extraction confidence 0-1
  priority TEXT DEFAULT 'medium',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Meetings
CREATE INDEX IF NOT EXISTS idx_meetings_org ON meetings(org_id);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(org_id, status);
CREATE INDEX IF NOT EXISTS idx_meetings_started ON meetings(org_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_project ON meetings(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meetings_search ON meetings USING gin(search_vector);

-- Participants
CREATE INDEX IF NOT EXISTS idx_meeting_participants_meeting ON meeting_participants(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_participants_contact ON meeting_participants(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meeting_participants_org ON meeting_participants(org_id);

-- Transcript segments
CREATE INDEX IF NOT EXISTS idx_transcript_segments_meeting ON transcript_segments(meeting_id, segment_index);
CREATE INDEX IF NOT EXISTS idx_transcript_segments_org ON transcript_segments(org_id);
CREATE INDEX IF NOT EXISTS idx_transcript_segments_search ON transcript_segments USING gin(search_vector);
CREATE INDEX IF NOT EXISTS idx_transcript_segments_actionable ON transcript_segments(meeting_id) WHERE is_actionable = true;

-- Action items
CREATE INDEX IF NOT EXISTS idx_meeting_action_items_meeting ON meeting_action_items(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_action_items_org ON meeting_action_items(org_id, status);
CREATE INDEX IF NOT EXISTS idx_meeting_action_items_assignee ON meeting_action_items(assignee_contact_id) WHERE assignee_contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meeting_action_items_task ON meeting_action_items(task_id) WHERE task_id IS NOT NULL;

-- ============================================================================
-- SEARCH VECTOR TRIGGERS
-- ============================================================================

-- Meetings: update search vector on insert/update
CREATE OR REPLACE FUNCTION meetings_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.summary, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS meetings_search_vector_trigger ON meetings;
CREATE TRIGGER meetings_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, description, summary ON meetings
  FOR EACH ROW EXECUTE FUNCTION meetings_search_vector_update();

-- Transcript segments: update search vector
CREATE OR REPLACE FUNCTION transcript_segments_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', coalesce(NEW.text, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS transcript_segments_search_vector_trigger ON transcript_segments;
CREATE TRIGGER transcript_segments_search_vector_trigger
  BEFORE INSERT OR UPDATE OF text ON transcript_segments
  FOR EACH ROW EXECUTE FUNCTION transcript_segments_search_vector_update();

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_meetings_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS meetings_updated_at ON meetings;
CREATE TRIGGER meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION update_meetings_updated_at();

DROP TRIGGER IF EXISTS meeting_action_items_updated_at ON meeting_action_items;
CREATE TRIGGER meeting_action_items_updated_at
  BEFORE UPDATE ON meeting_action_items
  FOR EACH ROW EXECUTE FUNCTION update_meetings_updated_at();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_action_items ENABLE ROW LEVEL SECURITY;

-- Meetings RLS
CREATE POLICY meetings_org_read ON meetings FOR SELECT
  USING (org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid()));
CREATE POLICY meetings_org_insert ON meetings FOR INSERT
  WITH CHECK (org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid()));
CREATE POLICY meetings_org_update ON meetings FOR UPDATE
  USING (org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid()));
CREATE POLICY meetings_org_delete ON meetings FOR DELETE
  USING (org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid()));

-- Meeting participants RLS
CREATE POLICY meeting_participants_org_read ON meeting_participants FOR SELECT
  USING (org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid()));
CREATE POLICY meeting_participants_org_insert ON meeting_participants FOR INSERT
  WITH CHECK (org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid()));
CREATE POLICY meeting_participants_org_update ON meeting_participants FOR UPDATE
  USING (org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid()));
CREATE POLICY meeting_participants_org_delete ON meeting_participants FOR DELETE
  USING (org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid()));

-- Transcript segments RLS
CREATE POLICY transcript_segments_org_read ON transcript_segments FOR SELECT
  USING (org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid()));
CREATE POLICY transcript_segments_org_insert ON transcript_segments FOR INSERT
  WITH CHECK (org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid()));
CREATE POLICY transcript_segments_org_update ON transcript_segments FOR UPDATE
  USING (org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid()));
CREATE POLICY transcript_segments_org_delete ON transcript_segments FOR DELETE
  USING (org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid()));

-- Meeting action items RLS
CREATE POLICY meeting_action_items_org_read ON meeting_action_items FOR SELECT
  USING (org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid()));
CREATE POLICY meeting_action_items_org_insert ON meeting_action_items FOR INSERT
  WITH CHECK (org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid()));
CREATE POLICY meeting_action_items_org_update ON meeting_action_items FOR UPDATE
  USING (org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid()));
CREATE POLICY meeting_action_items_org_delete ON meeting_action_items FOR DELETE
  USING (org_id IN (SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid()));

-- Service role bypass for all tables (for API routes using service role)
CREATE POLICY meetings_service ON meetings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY meeting_participants_service ON meeting_participants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY transcript_segments_service ON transcript_segments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY meeting_action_items_service ON meeting_action_items FOR ALL USING (true) WITH CHECK (true);
