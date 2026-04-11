-- 013_templates_voices.sql
-- Communication templates and voice profiles for Client Comms agent

-- =============================================================================
-- TABLES
-- =============================================================================

-- Voice profiles first (templates reference them)
CREATE TABLE voice_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  name text NOT NULL,  -- 'Andy', 'Tor-AWU', 'Formal Client'
  description text NOT NULL DEFAULT '',
  tone text NOT NULL DEFAULT 'professional',  -- 'friendly', 'professional', 'formal', 'casual'
  formality text NOT NULL DEFAULT 'professional' CHECK (formality IN ('casual', 'professional', 'formal')),
  greeting_patterns text[] DEFAULT '{}',  -- ['Hi {name}', 'Hey {name}']
  sign_off_patterns text[] DEFAULT '{}',  -- ['Cheers', 'Best regards']
  emoji_usage text NOT NULL DEFAULT 'minimal' CHECK (emoji_usage IN ('none', 'minimal', 'moderate', 'heavy')),
  example_messages jsonb DEFAULT '{}',  -- { "follow_up": "Hey mate, just checking in...", "invoice": "Hi {name}, please find attached..." }
  do_patterns text[] DEFAULT '{}',  -- ['Use Australian English', 'Keep it brief']
  dont_patterns text[] DEFAULT '{}',  -- ['No corporate jargon', 'Never use "Dear Sir/Madam"']
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, name)
);

CREATE TABLE templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('email', 'proposal', 'invoice', 'onboarding', 'follow-up', 'notification')),
  subject_template text,  -- 'Invoice {{invoice_number}} from {{company_name}}'
  body_template text NOT NULL,
  voice_profile_id uuid REFERENCES voice_profiles ON DELETE SET NULL,
  channel text,  -- 'email', 'whatsapp', null for any
  variables jsonb DEFAULT '{}',  -- { "client_name": "Client's full name", "amount": "Invoice total" }
  usage_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, name)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_voice_profiles_org ON voice_profiles (org_id);
CREATE INDEX idx_templates_org_cat ON templates (org_id, category);
CREATE INDEX idx_templates_voice ON templates (voice_profile_id) WHERE voice_profile_id IS NOT NULL;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

CREATE TRIGGER trg_voice_profiles_updated_at
  BEFORE UPDATE ON voice_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_templates_updated_at
  BEFORE UPDATE ON templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
