-- BitBit Personal Assistant - Seed Data for amatorri847@gmail.com
-- Run via Supabase SQL Editor or service_role API
-- Target org: 8dc46a71-d82b-4f74-8b97-f49db44c818e

-- =============================================================================
-- STEP 1: CLEAN UP ORGS
-- =============================================================================

-- Move contacts from orphan org to target org
UPDATE contacts
SET org_id = '8dc46a71-d82b-4f74-8b97-f49db44c818e'
WHERE org_id = '8dc46a71-d9c2-47d5-87c8-c13b3cbe0bae';

-- Delete orphan org's kanban columns
DELETE FROM kanban_columns
WHERE org_id = '8dc46a71-d9c2-47d5-87c8-c13b3cbe0bae';

-- Delete orphan org
DELETE FROM organizations
WHERE id = '8dc46a71-d9c2-47d5-87c8-c13b3cbe0bae';

-- Rename target org
UPDATE organizations
SET name = 'Torkay Digital', slug = 'torkay-digital'
WHERE id = '8dc46a71-d82b-4f74-8b97-f49db44c818e';

-- Update profile display name
UPDATE profiles
SET display_name = 'Tor Kay'
WHERE id = '300d6384-4f1d-4deb-ba53-d4afabc42285';

-- =============================================================================
-- STEP 2: ENRICH CONTACTS
-- =============================================================================

-- Update Steve West
UPDATE contacts SET
  name = 'Steve West',
  type = 'client',
  emails = ARRAY['steve.west55@icloud.com'],
  phones = ARRAY['+61413065815'],
  aliases = ARRAY['steve', 'steve west', 'presale services'],
  profile_data = '{
    "company": "Presale Services",
    "website": "presaleservices.com.au",
    "location": "Greater Brisbane, Australia",
    "role": "Owner",
    "first_contact": "2025-11-01",
    "business_description": "Pre-sale property preparation services — house washing, gutter cleaning, garden tidy-ups, rubbish removal, tree lopping, deceased estates",
    "total_paid": 1000,
    "projects": {
      "phase1_seo": {"status": "complete", "amount": 800, "paid": true},
      "citations": {"status": "complete", "amount": 200, "paid": true},
      "phase2_seo": {"status": "proposal_sent", "amount_range": "700-1000"}
    },
    "social_media": {
      "linkedin": true,
      "facebook": true,
      "instagram": true,
      "pinterest": true,
      "next_door": true
    }
  }'::jsonb,
  communication_patterns = '{
    "preferred_channels": ["iMessage", "email", "phone"],
    "tone": "casual_friendly",
    "emoji_usage": "frequent",
    "message_style": "detailed_when_researching",
    "sign_off": "Regards Steve",
    "response_speed": "fast",
    "key_traits": ["research_obsessed", "validation_seeking", "risk_averse", "trust_but_verify"],
    "frustrations": ["slow_responses", "generic_ai_content", "black_hat_seo"]
  }'::jsonb
WHERE slug = 'steve-west' AND org_id = '8dc46a71-d82b-4f74-8b97-f49db44c818e';

-- Update Andy Taleb
UPDATE contacts SET
  name = 'Andy Taleb',
  type = 'business',
  emails = ARRAY['andy@allwebbedup.com.au'],
  phones = ARRAY['+61400699890', '1800714148'],
  aliases = ARRAY['andy', 'andy taleb', 'all webbed up', 'awu'],
  profile_data = '{
    "company": "All Webbed Up",
    "website": "allwebbedup.com.au",
    "location": "Australia",
    "role": "Founder and Digital Strategist",
    "relationship": "Business partner — subcontracts dev and IT work to Tor",
    "contractor_rate": "$90/hr",
    "goal_for_tor": "5-10k/month in projects, eventually tech 2IC",
    "projects": {
      "strata_doc_processing": {"status": "scoping", "amount": "2-3k"},
      "scooturu_migration": {"status": "complete", "amount": 200},
      "meta_capi": {"status": "waiting"},
      "mcctv": {"status": "potential"}
    }
  }'::jsonb,
  communication_patterns = '{
    "preferred_channels": ["iMessage", "WhatsApp", "email"],
    "tone": "very_casual",
    "text_speak": true,
    "abbreviations": ["u", "lmk", "pls", "ur", "ofc"],
    "message_style": "short_punchy",
    "sign_off": "none or brief",
    "key_traits": ["needs_certainty", "risk_averse", "tests_through_small_jobs", "protective_of_clients"],
    "pricing_style": "compares_to_indian_team_but_pays_fair"
  }'::jsonb
WHERE slug = 'andy-taleb' AND org_id = '8dc46a71-d82b-4f74-8b97-f49db44c818e';

-- Update Maya Mendoza
UPDATE contacts SET
  name = 'Maya Mendoza',
  type = 'client',
  emails = ARRAY['maya.milagro@gmail.com'],
  phones = ARRAY[]::text[],
  aliases = ARRAY['maya', 'maya mendoza'],
  profile_data = '{
    "website": "mayamendoza.com",
    "location": "Scotland, UK",
    "role": "Energy healer, spiritual psychologist, author",
    "referred_by": "Steve West (her brother)",
    "first_contact": "2026-02-03",
    "projects": {
      "website_rebuild": {"status": "accepted", "amount": 500, "currency": "AUD", "hosting": "Hostinger", "platform": "WordPress"}
    },
    "social_media": {
      "linkedin": "www.linkedin.com/in/mayamendoza",
      "youtube": "https://www.youtube.com/mayamendoza",
      "facebook": "https://www.facebook.com/mendoza.maya"
    },
    "amazon_author": "The Hidden Power of Emotional Intuition",
    "preferred_contact": "WhatsApp"
  }'::jsonb,
  communication_patterns = '{
    "preferred_channels": ["email", "WhatsApp"],
    "tone": "warm_articulate",
    "message_style": "long_well_structured",
    "sign_off": "All the best ~ Maya",
    "key_traits": ["thorough", "business_savvy", "spiritual", "collaborative"],
    "uses_ai_tools": ["Grok", "DeepSeek"]
  }'::jsonb
WHERE slug = 'maya-mendoza' AND org_id = '8dc46a71-d82b-4f74-8b97-f49db44c818e';

-- Update Mum
UPDATE contacts SET
  name = 'Mum',
  type = 'family',
  emails = ARRAY[]::text[],
  phones = ARRAY['+61457648322'],
  aliases = ARRAY['mum', 'mama', 'mother'],
  profile_data = '{
    "location": "Sunshine Coast area (near Landsborough), Australia",
    "family": {
      "husband": "Dad",
      "daughters": ["Amy", "Tal/Talia"],
      "pet": "Misha (cat)"
    }
  }'::jsonb,
  communication_patterns = '{
    "preferred_channels": ["iMessage", "FaceTime", "phone"],
    "tone": "warm_loving",
    "message_style": "brief_conversational",
    "sign_off": "xx",
    "key_traits": ["caring", "practical", "supportive"],
    "typical_topics": ["family_logistics", "household_reminders", "offers_of_help"]
  }'::jsonb
WHERE slug = 'mum' AND org_id = '8dc46a71-d82b-4f74-8b97-f49db44c818e';

-- Insert Ranal Charan (if not exists)
INSERT INTO contacts (org_id, slug, name, type, emails, phones, aliases, profile_data, communication_patterns)
VALUES (
  '8dc46a71-d82b-4f74-8b97-f49db44c818e',
  'ranal-charan',
  'Ranal Charan',
  'acquaintance',
  ARRAY['ranal.charan@64property.com.au'],
  ARRAY['+61401521040'],
  ARRAY['ranal', 'ranal charan', '64 property'],
  '{
    "company": "64 Property",
    "role": "Real Estate Agent",
    "locations": ["650 Brunswick St New Farm", "420 Pitt St Sydney"],
    "referred_by": "Steve West",
    "first_contact": "2026-02-07",
    "status": "follow_up_mid_march",
    "notes": "Website being redone, requested 30-day delay before proceeding"
  }'::jsonb,
  '{
    "preferred_channels": ["email"],
    "tone": "professional",
    "status": "initial_contact"
  }'::jsonb
)
ON CONFLICT (org_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  emails = EXCLUDED.emails,
  phones = EXCLUDED.phones,
  aliases = EXCLUDED.aliases,
  profile_data = EXCLUDED.profile_data,
  communication_patterns = EXCLUDED.communication_patterns;

-- =============================================================================
-- STEP 3: SEED TASKS (~15)
-- =============================================================================

-- First, get kanban column IDs (we'll use subqueries)
-- Backlog = position 0, To Do = position 1, In Progress = position 2, Review = position 3, Done = position 4

INSERT INTO tasks (org_id, title, description, status, priority, column_id, position, metadata) VALUES
-- To Do tasks
('8dc46a71-d82b-4f74-8b97-f49db44c818e',
 'Steve Phase 2 SEO proposal',
 'Follow up on Phase 2 proposal sent Jan 29. Options: $700 (9 pages), $850 (12 pages + video), $1000 (+ citations). Suburbs: Ashgrove, Bardon, Red Hill, New Farm.',
 'pending', 'high',
 (SELECT id FROM kanban_columns WHERE org_id = '8dc46a71-d82b-4f74-8b97-f49db44c818e' AND title = 'To Do'),
 0,
 '{"source": "client-work", "client": "steve-west"}'::jsonb),

('8dc46a71-d82b-4f74-8b97-f49db44c818e',
 'Steve LinkedIn articles — 10+ articles',
 'Post 10+ articles on Steve''s LinkedIn as Articles (NOT regular posts). Credentials: Elsa2023*. Login blocked by 2FA — need Steve awake to approve. Part of content pipeline: website → Medium → LinkedIn → Substack.',
 'pending', 'high',
 (SELECT id FROM kanban_columns WHERE org_id = '8dc46a71-d82b-4f74-8b97-f49db44c818e' AND title = 'To Do'),
 1,
 '{"source": "client-work", "client": "steve-west", "urgent": true}'::jsonb),

('8dc46a71-d82b-4f74-8b97-f49db44c818e',
 'Maya website rebuild $500',
 'Rebuild mayamendoza.com — $500 AUD accepted Feb 11. WordPress rebuild with Astra + Elementor. 7 pages. Awaiting hosting credentials from Maya (contact via WhatsApp — email bounced).',
 'pending', 'high',
 (SELECT id FROM kanban_columns WHERE org_id = '8dc46a71-d82b-4f74-8b97-f49db44c818e' AND title = 'To Do'),
 2,
 '{"source": "client-work", "client": "maya-mendoza", "amount": 500}'::jsonb),

('8dc46a71-d82b-4f74-8b97-f49db44c818e',
 'Send Maya requirements email via WhatsApp',
 'Previous requirements email bounced (contact@torkay.com was down). Need to resend via WhatsApp since Maya is in Scotland. Include hosting access request, GSC, content, photos, YouTube links.',
 'pending', 'high',
 (SELECT id FROM kanban_columns WHERE org_id = '8dc46a71-d82b-4f74-8b97-f49db44c818e' AND title = 'To Do'),
 3,
 '{"source": "client-work", "client": "maya-mendoza"}'::jsonb),

('8dc46a71-d82b-4f74-8b97-f49db44c818e',
 'Check 4 myGov messages',
 'Messages from Feb 6, 9, 10, 12 — could be Centrelink debt review updates. Check inbox for formal review progress.',
 'pending', 'medium',
 (SELECT id FROM kanban_columns WHERE org_id = '8dc46a71-d82b-4f74-8b97-f49db44c818e' AND title = 'To Do'),
 4,
 '{"source": "centrelink"}'::jsonb),

('8dc46a71-d82b-4f74-8b97-f49db44c818e',
 'Fix Stripe identity verification',
 'Stripe payouts paused since Jan 31. Need to upload identity document to resume payouts.',
 'pending', 'high',
 (SELECT id FROM kanban_columns WHERE org_id = '8dc46a71-d82b-4f74-8b97-f49db44c818e' AND title = 'To Do'),
 5,
 '{"source": "billing"}'::jsonb),

('8dc46a71-d82b-4f74-8b97-f49db44c818e',
 'Pay AWS past due bill',
 'AWS account has past due balance. Update payment method and clear outstanding balance.',
 'pending', 'high',
 (SELECT id FROM kanban_columns WHERE org_id = '8dc46a71-d82b-4f74-8b97-f49db44c818e' AND title = 'To Do'),
 6,
 '{"source": "billing"}'::jsonb),

('8dc46a71-d82b-4f74-8b97-f49db44c818e',
 'Update Anthropic payment card',
 'Credit card on file is expiring. Update to prevent service interruption.',
 'pending', 'medium',
 (SELECT id FROM kanban_columns WHERE org_id = '8dc46a71-d82b-4f74-8b97-f49db44c818e' AND title = 'To Do'),
 7,
 '{"source": "billing"}'::jsonb),

('8dc46a71-d82b-4f74-8b97-f49db44c818e',
 'SYC meeting Feb 27 2:30pm with Kaylem',
 'Fortnightly in-person Centrelink jobseeker meeting at SYC Mitchelton. Must decide between SYC and personalised agency as ongoing provider.',
 'pending', 'medium',
 (SELECT id FROM kanban_columns WHERE org_id = '8dc46a71-d82b-4f74-8b97-f49db44c818e' AND title = 'To Do'),
 8,
 '{"source": "centrelink", "date": "2026-02-27T14:30:00"}'::jsonb),

('8dc46a71-d82b-4f74-8b97-f49db44c818e',
 'Check Andy''s ClickUp tasks',
 'Andy sent ClickUp link with "Tor notes" and tasks. Review and action items from ClickUp. Also check landing page implementation request.',
 'pending', 'medium',
 (SELECT id FROM kanban_columns WHERE org_id = '8dc46a71-d82b-4f74-8b97-f49db44c818e' AND title = 'To Do'),
 9,
 '{"source": "client-work", "client": "andy-taleb"}'::jsonb),

('8dc46a71-d82b-4f74-8b97-f49db44c818e',
 'Reply to Andy re: dev ads Saturday shoot',
 'Andy needs dev ads ready for Saturday shoot. Also asked "Is there anything u are waiting on me for other than website assets?" Need to respond and coordinate.',
 'pending', 'medium',
 (SELECT id FROM kanban_columns WHERE org_id = '8dc46a71-d82b-4f74-8b97-f49db44c818e' AND title = 'To Do'),
 10,
 '{"source": "client-work", "client": "andy-taleb"}'::jsonb),

-- In Progress tasks
('8dc46a71-d82b-4f74-8b97-f49db44c818e',
 'Centrelink debt review — deadline Mar 30',
 'Formal review of $5,217 debt in progress. Target: reduce to ~$1,000. Currently deducting $73.36/payment. Deadline: March 30, 2026.',
 'in_progress', 'high',
 (SELECT id FROM kanban_columns WHERE org_id = '8dc46a71-d82b-4f74-8b97-f49db44c818e' AND title = 'In Progress'),
 0,
 '{"source": "centrelink", "amount": 5217, "deadline": "2026-03-30"}'::jsonb),

-- Backlog tasks
('8dc46a71-d82b-4f74-8b97-f49db44c818e',
 'Ranal Charan follow-up mid-March',
 'Follow up with Ranal Charan at 64 Property. He requested 30-day delay (website being redone). Introduced by Steve West Feb 7. Email: ranal.charan@64property.com.au',
 'pending', 'medium',
 (SELECT id FROM kanban_columns WHERE org_id = '8dc46a71-d82b-4f74-8b97-f49db44c818e' AND title = 'Backlog'),
 0,
 '{"source": "client-work", "client": "ranal-charan", "follow_up_date": "2026-03-11"}'::jsonb),

('8dc46a71-d82b-4f74-8b97-f49db44c818e',
 'Fix Twilio suspension',
 'Twilio account suspended but still charging. Need to resolve or cancel.',
 'pending', 'low',
 (SELECT id FROM kanban_columns WHERE org_id = '8dc46a71-d82b-4f74-8b97-f49db44c818e' AND title = 'Backlog'),
 1,
 '{"source": "billing"}'::jsonb),

('8dc46a71-d82b-4f74-8b97-f49db44c818e',
 'Renew Namecheap domain by Mar 21',
 'torkay.com domain renewal due March 21 ($18.68). Credit card on file expired — update before renewal date.',
 'pending', 'medium',
 (SELECT id FROM kanban_columns WHERE org_id = '8dc46a71-d82b-4f74-8b97-f49db44c818e' AND title = 'Backlog'),
 2,
 '{"source": "billing", "amount": 18.68, "deadline": "2026-03-21"}'::jsonb);

-- =============================================================================
-- STEP 4: SEED GOALS
-- =============================================================================

INSERT INTO goals (org_id, description, priority, status, target_date) VALUES
('8dc46a71-d82b-4f74-8b97-f49db44c818e',
 'Launch BitBit Personal Assistant MVP',
 'high', 'active', NULL),

('8dc46a71-d82b-4f74-8b97-f49db44c818e',
 'Grow Torkay Digital to 5 paying clients',
 'high', 'active', NULL),

('8dc46a71-d82b-4f74-8b97-f49db44c818e',
 'Resolve Centrelink debt to ~$1,000',
 'medium', 'active', '2026-03-30'),

('8dc46a71-d82b-4f74-8b97-f49db44c818e',
 'Complete Steve West Phase 2 SEO',
 'high', 'active', NULL);

-- =============================================================================
-- STEP 5: SEED MEMORY ENTRIES
-- =============================================================================

INSERT INTO memory_entries (org_id, category, content, confidence) VALUES
('8dc46a71-d82b-4f74-8b97-f49db44c818e',
 'safety',
 'NEVER send multiple versions of the same email. Always draft first, confirm, send ONCE.',
 1.0),

('8dc46a71-d82b-4f74-8b97-f49db44c818e',
 'client',
 'Steve West is generous and values good work. Don''t undersell. Total paid $1,000.',
 0.9),

('8dc46a71-d82b-4f74-8b97-f49db44c818e',
 'infrastructure',
 'Email: SMTP2GO for outbound, Cloudflare for inbound routing. Google Workspace cancelled.',
 1.0),

('8dc46a71-d82b-4f74-8b97-f49db44c818e',
 'workflow',
 'Team swarm with 4 parallel agents works well. Gmail needs newer_than:14d constraint.',
 0.8),

('8dc46a71-d82b-4f74-8b97-f49db44c818e',
 'billing',
 'Stripe identity needed, AWS past due, Twilio suspended, Anthropic card expiring, Namecheap renewal Mar 21.',
 0.9);

-- =============================================================================
-- STEP 6: SEED ACTIVITY FEED
-- =============================================================================

INSERT INTO activity_feed (org_id, action_type, action, reasoning, result, user_confirmed, created_at) VALUES
('8dc46a71-d82b-4f74-8b97-f49db44c818e',
 'email',
 'Completed email migration from Google Workspace to SMTP2GO + Cloudflare',
 'Google Workspace was overdue ($23.60/mo). Migrated to free Cloudflare routing + SMTP2GO for outbound.',
 'Inbound routing active (contact@, hi@, catch-all). Outbound via Gmail Send-as with SMTP2GO. ~$283/year saved.',
 true,
 '2026-02-17T08:00:00Z'),

('8dc46a71-d82b-4f74-8b97-f49db44c818e',
 'system',
 'Full multi-channel triage completed (iMessage, Gmail, Calendar, Reminders, Notes)',
 'User requested comprehensive catchup across all channels after 3-day gap.',
 'Discovered: Steve LinkedIn articles urgent, Maya email bounced, Ranal wants 30-day delay, 4 new myGov messages, billing issues across AWS/Twilio/Anthropic/Stripe.',
 true,
 '2026-02-17T09:00:00Z'),

('8dc46a71-d82b-4f74-8b97-f49db44c818e',
 'task',
 'Set up AWU Outlook email forwarding for tor@allwebbedup.com.au',
 'Andy''s emails to tor@allwebbedup.com.au were not being seen. Set up forwarding to Gmail.',
 'Outlook forwarding active → amatorri847@gmail.com. Browser auth state saved. Inbox scanned — found outstanding tasks from Andy.',
 true,
 '2026-02-17T10:00:00Z'),

('8dc46a71-d82b-4f74-8b97-f49db44c818e',
 'communication',
 'Drafted requirements email to Maya Mendoza for website rebuild',
 'Maya accepted $500 proposal. Need hosting credentials, content, photos, YouTube links to begin work.',
 'Draft ready but previous send bounced (contact@torkay.com was down). Need to resend via WhatsApp.',
 false,
 '2026-02-17T11:00:00Z'),

('8dc46a71-d82b-4f74-8b97-f49db44c818e',
 'system',
 'Initialized BitBit Personal Assistant with real user data',
 'Seeding database with actual contacts, tasks, goals, and memory from existing agent context.',
 'Loaded 5 contacts, 15 tasks, 4 goals, 5 memory entries from .agent/ context files.',
 true,
 '2026-02-17T12:00:00Z');

-- =============================================================================
-- VERIFICATION COUNTS
-- =============================================================================

SELECT 'organizations' as table_name, count(*) as count FROM organizations WHERE id = '8dc46a71-d82b-4f74-8b97-f49db44c818e'
UNION ALL
SELECT 'profiles', count(*) FROM profiles WHERE org_id = '8dc46a71-d82b-4f74-8b97-f49db44c818e'
UNION ALL
SELECT 'contacts', count(*) FROM contacts WHERE org_id = '8dc46a71-d82b-4f74-8b97-f49db44c818e'
UNION ALL
SELECT 'kanban_columns', count(*) FROM kanban_columns WHERE org_id = '8dc46a71-d82b-4f74-8b97-f49db44c818e'
UNION ALL
SELECT 'tasks', count(*) FROM tasks WHERE org_id = '8dc46a71-d82b-4f74-8b97-f49db44c818e'
UNION ALL
SELECT 'goals', count(*) FROM goals WHERE org_id = '8dc46a71-d82b-4f74-8b97-f49db44c818e'
UNION ALL
SELECT 'memory_entries', count(*) FROM memory_entries WHERE org_id = '8dc46a71-d82b-4f74-8b97-f49db44c818e'
UNION ALL
SELECT 'activity_feed', count(*) FROM activity_feed WHERE org_id = '8dc46a71-d82b-4f74-8b97-f49db44c818e'
ORDER BY table_name;
