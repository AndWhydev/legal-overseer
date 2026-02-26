-- WhatsApp Baileys session management
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organisations(id) ON DELETE CASCADE,
  phone_number text,
  status text NOT NULL DEFAULT 'disconnected',
  qr_data text,
  session_data jsonb,
  last_seen_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_org ON whatsapp_sessions(org_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_status ON whatsapp_sessions(status);

ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_whatsapp_sessions" ON whatsapp_sessions
  FOR ALL USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

-- Outbox for messages the worker picks up
CREATE TABLE IF NOT EXISTS whatsapp_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organisations(id) ON DELETE CASCADE,
  session_id uuid REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
  recipient text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  error text,
  created_at timestamptz DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_status ON whatsapp_outbox(status);

ALTER TABLE whatsapp_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_whatsapp_outbox" ON whatsapp_outbox
  FOR ALL USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );
