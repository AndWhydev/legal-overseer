-- BitBit AWU Seed Data
-- Seeds: AWU organization, Andy's profile, 6 client contacts, kanban tasks, goals
-- Target Supabase project: jxapxazvythejyuxgvyv (ap-southeast-2)
--
-- PREREQUISITES:
--   - Migrations 001-004 applied
--   - Run via Supabase SQL Editor or MCP
--
-- NOTE: This does NOT create an auth.users entry. Andy's auth account
-- must be created via Supabase Auth (dashboard or Admin API) separately.
-- Once created, update the profile INSERT below with Andy's auth user UUID.

-- =============================================================================
-- STEP 1: CREATE AWU ORGANIZATION
-- =============================================================================

INSERT INTO organizations (id, name, slug, plan, settings)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'All Webbed Up',
  'awu',
  'pro',
  '{
    "default_model_tier": "haiku",
    "confidence_thresholds": {"act": 0.85, "ask": 0.55},
    "notification_channels": ["whatsapp", "email"],
    "timezone": "Australia/Brisbane",
    "branding": {
      "company_name": "All Webbed Up",
      "primary_color": "#1a1a2e",
      "logo_url": null
    }
  }'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  plan = EXCLUDED.plan,
  settings = EXCLUDED.settings;

-- =============================================================================
-- STEP 2: CREATE ANDY'S PROFILE
-- =============================================================================
-- Andy's auth.users entry must be created first via Supabase Auth Admin API:
--   email: andy@allwebbedup.com.au
-- Then replace this UUID with his actual auth user ID.
-- For now, using a placeholder that can be updated after auth user creation.

-- Placeholder: create auth user via Supabase dashboard or Admin API,
-- then run:
--   INSERT INTO profiles (id, org_id, display_name, role)
--   VALUES ('<andy-auth-uuid>', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Andy Taleb', 'owner');

-- =============================================================================
-- STEP 3: SEED 6 AWU CLIENT CONTACTS
-- =============================================================================

INSERT INTO contacts (org_id, slug, name, type, emails, phones, aliases, profile_data, communication_patterns)
VALUES
-- 1. Sezer Yunus (White House RE)
('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'sezer-yunus',
 'Sezer Yunus',
 'client',
 ARRAY[]::text[],
 ARRAY[]::text[],
 ARRAY['sezer', 'white house re', 'white house real estate'],
 '{
   "company": "White House RE",
   "project_type": "website",
   "status": "active",
   "notes": "WordPress + VaultRE. 6 changes completed, invoiced $200."
 }'::jsonb,
 '{
   "preferred_channels": ["email"],
   "tone": "professional"
 }'::jsonb),

-- 2. Harun (Event Hero)
('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'harun-event-hero',
 'Harun',
 'client',
 ARRAY[]::text[],
 ARRAY[]::text[],
 ARRAY['harun', 'event hero'],
 '{
   "company": "Event Hero",
   "project_type": "marketplace",
   "status": "scoping",
   "budget": "$10-12k MVP",
   "notes": "Scope doc stuck behind SharePoint access. Need .docx from Harun."
 }'::jsonb,
 '{
   "preferred_channels": ["email"],
   "tone": "professional"
 }'::jsonb),

-- 3. Dima & Rawya (BEPOP)
('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'bepop',
 'Dima & Rawya',
 'client',
 ARRAY[]::text[],
 ARRAY[]::text[],
 ARRAY['dima', 'rawya', 'bepop'],
 '{
   "company": "BEPOP",
   "project_type": "marketplace",
   "status": "proposal_sent",
   "budget": "$7-15k",
   "notes": "3 tiers quoted. NDA: Andy, Dima, Rawya."
 }'::jsonb,
 '{
   "preferred_channels": ["email"],
   "tone": "professional"
 }'::jsonb),

-- 4. SexPay
('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'sexpay',
 'SexPay',
 'client',
 ARRAY[]::text[],
 ARRAY[]::text[],
 ARRAY['sexpay'],
 '{
   "company": "SexPay",
   "project_type": "platform",
   "status": "quote_pending",
   "budget": "$7k",
   "notes": "Adult content platform. Supabase + Vercel + Bunny CDN. Need ABN."
 }'::jsonb,
 '{
   "preferred_channels": ["email"],
   "tone": "professional"
 }'::jsonb),

-- 5. Ghazi (Ozy Homes)
('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'ghazi-ozy-homes',
 'Ghazi',
 'client',
 ARRAY[]::text[],
 ARRAY[]::text[],
 ARRAY['ghazi', 'ozy homes'],
 '{
   "company": "Ozy Homes",
   "project_type": "ads",
   "status": "active",
   "notes": "Ad materials using Ghazi branding."
 }'::jsonb,
 '{
   "preferred_channels": ["email", "whatsapp"],
   "tone": "casual"
 }'::jsonb),

-- 6. Marquis Abela (Salken / Club Team Manager)
('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'marquis-abela',
 'Marquis Abela',
 'client',
 ARRAY[]::text[],
 ARRAY[]::text[],
 ARRAY['marquis', 'salken', 'club team manager', 'salken engineering'],
 '{
   "company": "Salken Engineering / Club Team Manager",
   "project_type": "mobile_app",
   "status": "active",
   "notes": "Client frustrated at month 5. Demo: harry.thomas@pbfc.com / demo1234"
 }'::jsonb,
 '{
   "preferred_channels": ["email"],
   "tone": "professional"
 }'::jsonb)

ON CONFLICT (org_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  emails = EXCLUDED.emails,
  phones = EXCLUDED.phones,
  aliases = EXCLUDED.aliases,
  profile_data = EXCLUDED.profile_data,
  communication_patterns = EXCLUDED.communication_patterns;

-- =============================================================================
-- STEP 4: SEED KANBAN TASKS (~12)
-- =============================================================================

-- Kanban columns are auto-created by the 003_seed_defaults trigger on org insert.
-- Columns: Backlog(0), To Do(1), In Progress(2), Review(3), Done(4)

INSERT INTO tasks (org_id, title, description, status, priority, column_id, position, metadata) VALUES

-- To Do (high priority)
('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'Invoice Sezer for White House RE changes',
 'WordPress + VaultRE changes completed (6 items). Invoice $200. Check if already sent.',
 'pending', 'high',
 (SELECT id FROM kanban_columns WHERE org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' AND title = 'To Do'),
 0,
 '{"source": "client-work", "client": "sezer-yunus"}'::jsonb),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'Event Hero scope doc - get .docx from Harun',
 'Scope doc stuck behind SharePoint access. Chase Harun for the .docx so we can finalize MVP scope ($10-12k).',
 'pending', 'high',
 (SELECT id FROM kanban_columns WHERE org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' AND title = 'To Do'),
 1,
 '{"source": "client-work", "client": "harun-event-hero"}'::jsonb),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'BEPOP proposal follow-up',
 'Follow up with Dima and Rawya on 3-tier proposal ($7-15k). NDA signed. Awaiting decision.',
 'pending', 'medium',
 (SELECT id FROM kanban_columns WHERE org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' AND title = 'To Do'),
 2,
 '{"source": "client-work", "client": "bepop"}'::jsonb),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'SexPay quote - finalize scope and ABN',
 'Adult content platform quoted at $7k. Need ABN from client before proceeding. Tech: Supabase + Vercel + Bunny CDN.',
 'pending', 'medium',
 (SELECT id FROM kanban_columns WHERE org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' AND title = 'To Do'),
 3,
 '{"source": "client-work", "client": "sexpay"}'::jsonb),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'Club Team Manager - demo prep for Marquis',
 'Client frustrated at month 5. Prepare polished demo. Demo creds: harry.thomas@pbfc.com / demo1234.',
 'pending', 'high',
 (SELECT id FROM kanban_columns WHERE org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' AND title = 'To Do'),
 4,
 '{"source": "client-work", "client": "marquis-abela"}'::jsonb),

-- In Progress
('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'Ozy Homes ad materials',
 'Create ad materials using Ghazi branding. Coordinate with Ghazi on creative direction.',
 'in_progress', 'medium',
 (SELECT id FROM kanban_columns WHERE org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' AND title = 'In Progress'),
 0,
 '{"source": "client-work", "client": "ghazi-ozy-homes"}'::jsonb),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'White House RE - ongoing WordPress support',
 'Active support contract. Handle change requests as they come in from Sezer.',
 'in_progress', 'medium',
 (SELECT id FROM kanban_columns WHERE org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' AND title = 'In Progress'),
 1,
 '{"source": "client-work", "client": "sezer-yunus"}'::jsonb),

-- Backlog
('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'Review AWU website analytics',
 'Monthly analytics review for allwebbedup.com.au. Check SEO performance, traffic trends, conversion rates.',
 'pending', 'low',
 (SELECT id FROM kanban_columns WHERE org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' AND title = 'Backlog'),
 0,
 '{"source": "internal"}'::jsonb),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'Update AWU portfolio with recent projects',
 'Add White House RE, Event Hero, BEPOP case studies to AWU website portfolio section.',
 'pending', 'low',
 (SELECT id FROM kanban_columns WHERE org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' AND title = 'Backlog'),
 1,
 '{"source": "internal"}'::jsonb),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'Set up BitBit for AWU operations',
 'Deploy BitBit personal assistant for AWU day-to-day ops. Automate client comms, invoicing, task triage.',
 'pending', 'medium',
 (SELECT id FROM kanban_columns WHERE org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' AND title = 'Backlog'),
 2,
 '{"source": "internal"}'::jsonb),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'Prepare Meta Business Verification docs',
 'Submit Meta Business Verification for WhatsApp Business API access. 3-14 day review.',
 'pending', 'low',
 (SELECT id FROM kanban_columns WHERE org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' AND title = 'Backlog'),
 3,
 '{"source": "internal"}'::jsonb);

-- =============================================================================
-- STEP 5: SEED GOALS
-- =============================================================================

INSERT INTO goals (org_id, description, priority, status, target_date) VALUES
('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'Grow AWU to 10 active clients',
 'high', 'active', NULL),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'Launch BitBit for AWU ops',
 'high', 'active', NULL),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'Close Event Hero MVP deal ($10-12k)',
 'high', 'active', NULL);

-- =============================================================================
-- VERIFICATION
-- =============================================================================

SELECT 'organizations' as t, count(*) FROM organizations WHERE slug = 'awu'
UNION ALL SELECT 'contacts', count(*) FROM contacts WHERE org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
UNION ALL SELECT 'tasks', count(*) FROM tasks WHERE org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
UNION ALL SELECT 'goals', count(*) FROM goals WHERE org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
UNION ALL SELECT 'kanban_columns', count(*) FROM kanban_columns WHERE org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
