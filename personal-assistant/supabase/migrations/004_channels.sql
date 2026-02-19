-- Channel connections table
CREATE TABLE IF NOT EXISTS channel_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('gmail', 'outlook', 'imessage', 'calendar', 'reminders')),
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error', 'syncing')),
  last_sync TIMESTAMPTZ,
  config JSONB NOT NULL DEFAULT '{}',
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, channel_type)
);

-- Channel messages table
CREATE TABLE IF NOT EXISTS channel_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('gmail', 'outlook', 'imessage', 'calendar', 'reminders')),
  external_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  sender_email TEXT,
  subject TEXT,
  body TEXT NOT NULL DEFAULT '',
  received_at TIMESTAMPTZ NOT NULL,
  is_actionable BOOLEAN NOT NULL DEFAULT false,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  processed BOOLEAN NOT NULL DEFAULT false,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, channel, external_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_channel_connections_org ON channel_connections(org_id);
CREATE INDEX IF NOT EXISTS idx_channel_messages_org ON channel_messages(org_id);
CREATE INDEX IF NOT EXISTS idx_channel_messages_channel ON channel_messages(org_id, channel);
CREATE INDEX IF NOT EXISTS idx_channel_messages_unprocessed ON channel_messages(org_id, processed) WHERE NOT processed;
CREATE INDEX IF NOT EXISTS idx_channel_messages_task ON channel_messages(task_id) WHERE task_id IS NOT NULL;

-- Enable RLS
ALTER TABLE channel_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies (permissive for MVP)
CREATE POLICY "channel_connections_all" ON channel_connections FOR ALL USING (true);
CREATE POLICY "channel_messages_all" ON channel_messages FOR ALL USING (true);
