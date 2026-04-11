-- 006_entity_timeline.sql
-- Unified timeline per entity across all channels

CREATE TABLE entity_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('contact', 'task', 'invoice', 'project', 'channel_message', 'goal')),
  entity_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'message_received', 'message_sent', 'task_created', 'task_updated', 'task_completed',
    'invoice_created', 'invoice_sent', 'invoice_paid', 'invoice_overdue',
    'status_changed', 'mention', 'note_added',
    'relationship_created', 'contact_created', 'contact_updated'
  )),
  event_data jsonb NOT NULL DEFAULT '{}',
  channel_source text,
  related_entity_type text,
  related_entity_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_timeline_entity ON entity_timeline (org_id, entity_type, entity_id, occurred_at DESC);
CREATE INDEX idx_timeline_org_time ON entity_timeline (org_id, occurred_at DESC);
CREATE INDEX idx_timeline_channel ON entity_timeline (org_id, channel_source, occurred_at DESC);
CREATE INDEX idx_timeline_event_type ON entity_timeline (org_id, event_type);
