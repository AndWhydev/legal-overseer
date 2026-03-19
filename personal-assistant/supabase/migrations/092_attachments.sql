-- Attachments: file upload storage infrastructure for chat attachments
-- Supports images, PDFs, DOCX, TXT, CSV with org-scoped RLS

-- =============================================================================
-- TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  thread_id UUID REFERENCES conversation_threads(id),
  message_id UUID REFERENCES conversation_messages(id),
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading', 'ready', 'processing', 'failed', 'deleted')),
  extracted_text TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY attachments_org_read ON attachments
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY attachments_org_insert ON attachments
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

CREATE POLICY attachments_org_update ON attachments
  FOR UPDATE USING (org_id = get_user_org_id());

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_attachments_org ON attachments (org_id) WHERE status != 'deleted';
CREATE INDEX idx_attachments_thread ON attachments (thread_id) WHERE status = 'ready';
CREATE INDEX idx_attachments_message ON attachments (message_id) WHERE message_id IS NOT NULL;

-- =============================================================================
-- STORAGE QUOTA RPC
-- =============================================================================

CREATE OR REPLACE FUNCTION get_org_storage_bytes(p_org_id UUID)
RETURNS BIGINT AS $$
  SELECT COALESCE(SUM(size), 0)
  FROM attachments
  WHERE org_id = p_org_id AND status != 'deleted'
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- =============================================================================
-- UPDATED_AT TRIGGER (reuses existing update_updated_at() from 001_core_schema)
-- =============================================================================

CREATE TRIGGER trg_attachments_updated_at
  BEFORE UPDATE ON attachments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- SUPABASE STORAGE BUCKET
-- Note: This INSERT may fail on some Supabase setups where storage.buckets
-- is not directly writable via SQL. If so, create the bucket manually via
-- Supabase Dashboard: Storage > New Bucket > Name: 'chat-attachments',
-- Public: OFF, File size limit: 10MB, Allowed MIME types: image/jpeg,
-- image/png, image/gif, image/webp, application/pdf,
-- application/vnd.openxmlformats-officedocument.wordprocessingml.document,
-- text/plain, text/csv
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments',
  'chat-attachments',
  false,
  10485760,  -- 10MB
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/csv'
  ]
) ON CONFLICT (id) DO NOTHING;
