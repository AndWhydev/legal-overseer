-- 057: Leads Enrichment & Discovery
-- Extends leads table with PCC discovery, scoring, outreach intelligence, and pipeline management fields.

ALTER TABLE leads
  -- Discovery metadata
  ADD COLUMN IF NOT EXISTS discovery_source text DEFAULT 'inbound',
  ADD COLUMN IF NOT EXISTS prospect_name text,
  ADD COLUMN IF NOT EXISTS prospect_website text,
  ADD COLUMN IF NOT EXISTS prospect_domain text,
  ADD COLUMN IF NOT EXISTS prospect_phone text,
  ADD COLUMN IF NOT EXISTS prospect_address text,
  ADD COLUMN IF NOT EXISTS prospect_emails text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS prospect_rating numeric(2,1),
  ADD COLUMN IF NOT EXISTS prospect_review_count integer,

  -- PCC Scoring
  ADD COLUMN IF NOT EXISTS fit_score integer,
  ADD COLUMN IF NOT EXISTS opportunity_score integer,
  ADD COLUMN IF NOT EXISTS priority_score numeric(5,2),
  ADD COLUMN IF NOT EXISTS fit_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS opportunity_breakdown jsonb,

  -- Outreach Intelligence
  ADD COLUMN IF NOT EXISTS opportunity_notes text,
  ADD COLUMN IF NOT EXISTS outreach_angle text,
  ADD COLUMN IF NOT EXISTS priority_services text[] DEFAULT '{}',

  -- Enrichment Signals
  ADD COLUMN IF NOT EXISTS website_signals jsonb,
  ADD COLUMN IF NOT EXISTS serp_presence jsonb,

  -- Deal Rotting / Speed-to-Lead / Next Action
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS first_ack_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS next_action_at timestamptz;

-- Indexes for filtering and sorting
CREATE INDEX IF NOT EXISTS idx_leads_org_discovery
  ON leads (org_id, discovery_source);

CREATE INDEX IF NOT EXISTS idx_leads_org_priority
  ON leads (org_id, priority_score DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_leads_org_activity
  ON leads (org_id, last_activity_at);

CREATE INDEX IF NOT EXISTS idx_leads_org_fit
  ON leads (org_id, fit_score DESC NULLS LAST);
