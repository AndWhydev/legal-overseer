-- 120_meeting_intelligence_core.sql
-- Meeting Intelligence: recordings, transcripts, action items, follow-ups

-- =============================================================================
-- MEETINGS TABLE (core meeting record)
-- =============================================================================

CREATE TABLE meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  meeting_type text NOT NULL DEFAULT 'general' CHECK (meeting_type IN (
    'general', 'standup', 'client_call', 'internal', 'sales', 'onboarding', 'review'
  )),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'recording', 'transcribing', 'processing', 'completed', 'failed'
  )),
  -- Timing
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  -- Source
  source text NOT NULL DEFAULT 'upload' CHECK (source IN (
    'upload', 'zoom', 'google_meet', 'teams', 'manual'
  )),
  source_meeting_id text, -- external platform meeting ID
  source_url text,
  -- Storage
  recording_path text, -- Supabase Storage path
  recording_size_bytes bigint,
  recording_mime_type text,
  -- AI outputs
  summary text,
  key_decisions jsonb DEFAULT '[]'::jsonb,
  sentiment_score float, -- -1.0 to 1.0
  sentiment_label text CHECK (sentiment_label IS NULL OR sentiment_label IN (
    'very_positive', 'positive', 'neutral', 'negative', 'very_negative'
  )),
  -- Associations
  contact_id uuid REFERENCES contacts ON DELETE SET NULL,
  project_id uuid, -- references projects if table exists
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_meetings_org_status ON meetings (org_id, status);
CREATE INDEX idx_meetings_org_created ON meetings (org_id, created_at DESC);
CREATE INDEX idx_meetings_contact ON meetings (contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX idx_meetings_type ON meetings (org_id, meeting_type);

CREATE TRIGGER trg_meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- MEETING PARTICIPANTS
-- =============================================================================

CREATE TABLE meeting_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid REFERENCES meetings ON DELETE CASCADE NOT NULL,
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  email text,
  role text DEFAULT 'attendee' CHECK (role IN ('host', 'attendee', 'guest', 'note_taker')),
  speaker_label text, -- for diarization: "Speaker 1", "Speaker 2" etc.
  contact_id uuid REFERENCES contacts ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_meeting_participants_meeting ON meeting_participants (meeting_id);
CREATE INDEX idx_meeting_participants_contact ON meeting_participants (contact_id) WHERE contact_id IS NOT NULL;

-- =============================================================================
-- MEETING TRANSCRIPT SEGMENTS (chunked with speaker labels)
-- =============================================================================

CREATE TABLE meeting_transcript_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid REFERENCES meetings ON DELETE CASCADE NOT NULL,
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  segment_index integer NOT NULL,
  speaker_label text, -- "Speaker 1", participant name, etc.
  speaker_id uuid REFERENCES meeting_participants ON DELETE SET NULL,
  start_time_ms integer NOT NULL DEFAULT 0,
  end_time_ms integer NOT NULL DEFAULT 0,
  text text NOT NULL,
  confidence float, -- transcription confidence 0-1
  language text DEFAULT 'en',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_transcript_segments_meeting ON meeting_transcript_segments (meeting_id, segment_index);
CREATE INDEX idx_transcript_segments_search ON meeting_transcript_segments USING gin (to_tsvector('english', text));

-- =============================================================================
-- MEETING ACTION ITEMS (extracted by AI)
-- =============================================================================

CREATE TABLE meeting_action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid REFERENCES meetings ON DELETE CASCADE NOT NULL,
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  assigned_to text, -- name of person from transcript
  assigned_participant_id uuid REFERENCES meeting_participants ON DELETE SET NULL,
  due_date date,
  priority text DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  -- Link to kanban task if created
  task_id uuid REFERENCES tasks ON DELETE SET NULL,
  -- Source context
  source_segment_id uuid REFERENCES meeting_transcript_segments ON DELETE SET NULL,
  source_quote text, -- the exact quote that triggered this action item
  -- AI extraction metadata
  confidence float DEFAULT 0.8,
  extraction_method text DEFAULT 'ai',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_action_items_meeting ON meeting_action_items (meeting_id);
CREATE INDEX idx_action_items_org_status ON meeting_action_items (org_id, status);
CREATE INDEX idx_action_items_task ON meeting_action_items (task_id) WHERE task_id IS NOT NULL;

CREATE TRIGGER trg_action_items_updated_at
  BEFORE UPDATE ON meeting_action_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- MEETING FOLLOW-UPS (drafted emails for approval)
-- =============================================================================

CREATE TABLE meeting_follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid REFERENCES meetings ON DELETE CASCADE NOT NULL,
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  follow_up_type text NOT NULL DEFAULT 'email' CHECK (follow_up_type IN ('email', 'whatsapp', 'slack', 'task')),
  recipient_name text,
  recipient_email text,
  subject text,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'sent', 'failed')),
  approved_by uuid REFERENCES auth.users ON DELETE SET NULL,
  approved_at timestamptz,
  sent_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_follow_ups_meeting ON meeting_follow_ups (meeting_id);
CREATE INDEX idx_follow_ups_org_status ON meeting_follow_ups (org_id, status);

CREATE TRIGGER trg_follow_ups_updated_at
  BEFORE UPDATE ON meeting_follow_ups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- MEETING SEARCH (full-text across all transcript segments for a meeting)
-- =============================================================================

-- Materialized view for efficient full-text search across meetings
CREATE OR REPLACE FUNCTION search_meeting_transcripts(
  p_org_id uuid,
  p_query text,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  meeting_id uuid,
  meeting_title text,
  segment_text text,
  speaker_label text,
  start_time_ms integer,
  rank real
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id AS meeting_id,
    m.title AS meeting_title,
    ts.text AS segment_text,
    ts.speaker_label,
    ts.start_time_ms,
    ts_rank(to_tsvector('english', ts.text), plainto_tsquery('english', p_query)) AS rank
  FROM meeting_transcript_segments ts
  JOIN meetings m ON m.id = ts.meeting_id
  WHERE ts.org_id = p_org_id
    AND to_tsvector('english', ts.text) @@ plainto_tsquery('english', p_query)
  ORDER BY rank DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_transcript_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_follow_ups ENABLE ROW LEVEL SECURITY;

-- meetings
CREATE POLICY "meetings_select" ON meetings
  FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "meetings_insert" ON meetings
  FOR INSERT WITH CHECK (org_id = get_user_org_id());
CREATE POLICY "meetings_update" ON meetings
  FOR UPDATE USING (org_id = get_user_org_id());
CREATE POLICY "meetings_delete" ON meetings
  FOR DELETE USING (org_id = get_user_org_id());

-- meeting_participants
CREATE POLICY "meeting_participants_select" ON meeting_participants
  FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "meeting_participants_insert" ON meeting_participants
  FOR INSERT WITH CHECK (org_id = get_user_org_id());
CREATE POLICY "meeting_participants_update" ON meeting_participants
  FOR UPDATE USING (org_id = get_user_org_id());
CREATE POLICY "meeting_participants_delete" ON meeting_participants
  FOR DELETE USING (org_id = get_user_org_id());

-- meeting_transcript_segments
CREATE POLICY "transcript_segments_select" ON meeting_transcript_segments
  FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "transcript_segments_insert" ON meeting_transcript_segments
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

-- meeting_action_items
CREATE POLICY "action_items_select" ON meeting_action_items
  FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "action_items_insert" ON meeting_action_items
  FOR INSERT WITH CHECK (org_id = get_user_org_id());
CREATE POLICY "action_items_update" ON meeting_action_items
  FOR UPDATE USING (org_id = get_user_org_id());

-- meeting_follow_ups
CREATE POLICY "follow_ups_select" ON meeting_follow_ups
  FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "follow_ups_insert" ON meeting_follow_ups
  FOR INSERT WITH CHECK (org_id = get_user_org_id());
CREATE POLICY "follow_ups_update" ON meeting_follow_ups
  FOR UPDATE USING (org_id = get_user_org_id());
