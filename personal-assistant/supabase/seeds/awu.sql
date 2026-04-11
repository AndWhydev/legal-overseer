-- 029_awu_seed_data.sql
-- Comprehensive AWU seed data: org, contacts, projects, voice profiles,
-- policy packs, offer packages, agent configs for all registered types.
--
-- Idempotent: uses ON CONFLICT ... DO UPDATE throughout.

-- AWU org ID constant
-- (matches seed_awu.sql: a1b2c3d4-e5f6-7890-abcd-ef1234567890)

DO $$ BEGIN RAISE NOTICE 'Seeding AWU data...'; END $$;

-- =============================================================================
-- 1. ORGANIZATION (upsert)
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
      "tagline": "Web solutions that work",
      "primary_color": "#1a1a2e",
      "logo_url": null
    },
    "billing": {
      "abn": null,
      "default_currency": "AUD",
      "payment_terms_days": 14,
      "tax_rate": 0.10
    }
  }'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  plan = EXCLUDED.plan,
  settings = EXCLUDED.settings;

-- =============================================================================
-- 2. ADMIN USER PLACEHOLDER
-- =============================================================================
-- Andy's auth.users entry must be created via Supabase Auth Admin API first.
-- Once created, run:
--   INSERT INTO profiles (id, org_id, display_name, role)
--   VALUES ('<andy-auth-uuid>', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Andy Taleb', 'owner')
--   ON CONFLICT (id) DO UPDATE SET display_name = 'Andy Taleb', role = 'owner';

-- =============================================================================
-- 3. CONTACTS (Sezer + key AWU clients)
-- =============================================================================

INSERT INTO contacts (org_id, slug, name, type, emails, phones, aliases, profile_data, communication_patterns)
VALUES
-- Sezer Yunus (White House RE)
('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'sezer-yunus', 'Sezer Yunus', 'client',
 ARRAY[]::text[], ARRAY[]::text[],
 ARRAY['sezer', 'white house re', 'white house real estate'],
 '{"company": "White House RE", "project_type": "website", "status": "active", "notes": "WordPress + VaultRE. 6 changes completed, invoiced $200."}'::jsonb,
 '{"preferred_channels": ["email"], "tone": "professional"}'::jsonb),

-- Harun (Event Hero)
('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'harun-event-hero', 'Harun', 'client',
 ARRAY[]::text[], ARRAY[]::text[],
 ARRAY['harun', 'event hero'],
 '{"company": "Event Hero", "project_type": "marketplace", "status": "scoping", "budget": "$10-12k MVP"}'::jsonb,
 '{"preferred_channels": ["email"], "tone": "professional"}'::jsonb),

-- Dima & Rawya (BEPOP)
('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'bepop', 'Dima & Rawya', 'client',
 ARRAY[]::text[], ARRAY[]::text[],
 ARRAY['dima', 'rawya', 'bepop'],
 '{"company": "BEPOP", "project_type": "marketplace", "status": "proposal_sent", "budget": "$7-15k"}'::jsonb,
 '{"preferred_channels": ["email"], "tone": "professional"}'::jsonb),

-- SexPay
('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'sexpay', 'SexPay', 'client',
 ARRAY[]::text[], ARRAY[]::text[],
 ARRAY['sexpay'],
 '{"company": "SexPay", "project_type": "platform", "status": "quote_pending", "budget": "$7k"}'::jsonb,
 '{"preferred_channels": ["email"], "tone": "professional"}'::jsonb),

-- Ghazi (Ozy Homes)
('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'ghazi-ozy-homes', 'Ghazi', 'client',
 ARRAY[]::text[], ARRAY[]::text[],
 ARRAY['ghazi', 'ozy homes'],
 '{"company": "Ozy Homes", "project_type": "ads", "status": "active"}'::jsonb,
 '{"preferred_channels": ["email", "whatsapp"], "tone": "casual"}'::jsonb),

-- Marquis Abela (Salken / Club Team Manager)
('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'marquis-abela', 'Marquis Abela', 'client',
 ARRAY[]::text[], ARRAY[]::text[],
 ARRAY['marquis', 'salken', 'club team manager', 'salken engineering'],
 '{"company": "Salken Engineering / Club Team Manager", "project_type": "mobile_app", "status": "active"}'::jsonb,
 '{"preferred_channels": ["email"], "tone": "professional"}'::jsonb),

-- Tor (AWU team / co-founder)
('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'tor', 'Tor', 'business',
 ARRAY[]::text[], ARRAY[]::text[],
 ARRAY['tor'],
 '{"company": "All Webbed Up", "role": "co-founder", "status": "active"}'::jsonb,
 '{"preferred_channels": ["whatsapp"], "tone": "casual"}'::jsonb)

ON CONFLICT (org_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  aliases = EXCLUDED.aliases,
  profile_data = EXCLUDED.profile_data,
  communication_patterns = EXCLUDED.communication_patterns;

-- =============================================================================
-- 4. SAMPLE PROJECTS WITH RATES (as invoices in draft)
-- =============================================================================

INSERT INTO invoices (org_id, invoice_number, client_contact_id, status, items, subtotal, tax, total, currency, due_date)
VALUES
('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'AWU-2026-001',
 (SELECT id FROM contacts WHERE org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' AND slug = 'sezer-yunus'),
 'draft',
 '[{"description": "WordPress changes (6 items)", "quantity": 1, "unit_price": 200, "total": 200}]'::jsonb,
 200, 20, 220, 'AUD', CURRENT_DATE + interval '14 days'),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'AWU-2026-002',
 (SELECT id FROM contacts WHERE org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' AND slug = 'ghazi-ozy-homes'),
 'draft',
 '[{"description": "Ad materials creation - Ozy Homes branding", "quantity": 1, "unit_price": 1500, "total": 1500}]'::jsonb,
 1500, 150, 1650, 'AUD', CURRENT_DATE + interval '14 days')

ON CONFLICT (org_id, invoice_number) DO NOTHING;

-- =============================================================================
-- 5. VOICE PROFILES (Andy, Tor)
-- =============================================================================

INSERT INTO voice_profiles (org_id, name, description, tone, formality, greeting_patterns, sign_off_patterns, emoji_usage, example_messages, do_patterns, dont_patterns)
VALUES
-- Andy's voice
('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'Andy',
 'Andy Taleb - AWU founder. Casual Australian, direct, friendly.',
 'friendly',
 'casual',
 ARRAY['Hey {name}', 'Hi {name}', 'G''day {name}'],
 ARRAY['Cheers', 'Talk soon', 'Cheers mate'],
 'minimal',
 '{"follow_up": "Hey mate, just checking in on this - any update?", "invoice": "Hi {name}, here''s the invoice for the recent work. Let me know if any questions.", "proposal": "Hey {name}, put together a proposal based on our chat. Have a look and let me know your thoughts."}'::jsonb,
 ARRAY['Use Australian English', 'Keep it brief and direct', 'Be genuinely helpful', 'Use first names'],
 ARRAY['No corporate jargon', 'Never use Dear Sir/Madam', 'No excessive formality', 'Don''t oversell']),

-- Tor's voice
('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'Tor',
 'Tor - AWU team. Professional but warm.',
 'professional',
 'professional',
 ARRAY['Hi {name}', 'Hello {name}'],
 ARRAY['Best regards', 'Kind regards', 'Thanks'],
 'none',
 '{"follow_up": "Hi {name}, hope you''re well. Just following up on our previous discussion.", "status_update": "Hi {name}, here''s a quick update on where things are at."}'::jsonb,
 ARRAY['Professional tone', 'Clear and concise', 'Structured communication'],
 ARRAY['No slang', 'No excessive casualness'])

ON CONFLICT (org_id, name) DO UPDATE SET
  description = EXCLUDED.description,
  tone = EXCLUDED.tone,
  formality = EXCLUDED.formality,
  greeting_patterns = EXCLUDED.greeting_patterns,
  sign_off_patterns = EXCLUDED.sign_off_patterns,
  emoji_usage = EXCLUDED.emoji_usage,
  example_messages = EXCLUDED.example_messages,
  do_patterns = EXCLUDED.do_patterns,
  dont_patterns = EXCLUDED.dont_patterns;

-- =============================================================================
-- 6. OFFER PACKAGES (from pricing-templates.ts categories)
-- =============================================================================

INSERT INTO offer_packages (org_id, name, description, service_type, price_range, inclusions, exclusions, usp, target_audience, status)
VALUES
-- Web Development
('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'Website Build', 'Custom website design and development',
 'web-development', '$3,500 - $7,700',
 ARRAY['Custom design', 'Responsive layout', 'CMS setup', 'Basic SEO', '2-5 revision rounds', '30-90 day support'],
 ARRAY['Ongoing hosting', 'Content creation', 'Stock photography'],
 ARRAY['Australian-built', 'Mobile-first approach', 'Fast turnaround'],
 'Small businesses needing online presence', 'active'),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'Landing Page', 'Single conversion-focused landing page',
 'web-development', '$1,200 - $2,640',
 ARRAY['Conversion-optimized design', 'A/B test ready', 'Analytics setup', 'Form integration'],
 ARRAY['Ongoing ads management', 'Content writing'],
 ARRAY['Conversion focused', 'Quick delivery'],
 'Businesses running ad campaigns', 'active'),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'E-commerce Setup', 'Online store with payments and inventory',
 'web-development', '$5,000 - $11,000',
 ARRAY['Product catalog', 'Payment gateway', 'Inventory management', 'Shipping integration', 'Order notifications'],
 ARRAY['Product photography', 'Inventory data entry', 'Ongoing maintenance'],
 ARRAY['Full-stack e-commerce', 'Scalable platform'],
 'Retailers moving online', 'active'),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'Marketplace Platform', 'Multi-vendor marketplace',
 'web-development', '$12,000 - $26,400',
 ARRAY['Multi-vendor support', 'Commission system', 'Vendor dashboards', 'Search and filtering', 'Payment splitting'],
 ARRAY['Vendor recruitment', 'Content moderation staff', 'Legal compliance'],
 ARRAY['End-to-end marketplace', 'Scalable architecture'],
 'Entrepreneurs building platforms', 'active'),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'Mobile App', 'Cross-platform mobile application',
 'web-development', '$8,000 - $17,600',
 ARRAY['iOS and Android', 'Push notifications', 'API integration', 'App store submission'],
 ARRAY['Apple developer account fees', 'Ongoing server costs'],
 ARRAY['Cross-platform efficiency', 'Native feel'],
 'Businesses needing mobile presence', 'active'),

-- SEO
('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'SEO Setup', 'Initial SEO audit, on-page optimization, schema markup',
 'seo', '$2,000 - $4,400',
 ARRAY['Technical audit', 'On-page optimization', 'Schema markup', 'Keyword research', 'Competitor analysis'],
 ARRAY['Ongoing content creation', 'Link building'],
 ARRAY['Data-driven approach', 'Comprehensive audit'],
 'Businesses wanting organic traffic', 'active'),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'SEO Monthly', 'Ongoing SEO, content optimization, reporting',
 'seo', '$1,500 - $3,300/mo',
 ARRAY['Monthly reporting', 'Content optimization', 'Ranking monitoring', 'Technical fixes', 'Strategy updates'],
 ARRAY['Content writing (separate)', 'Paid ads'],
 ARRAY['Continuous improvement', 'Transparent reporting'],
 'Businesses committed to organic growth', 'active'),

-- Content
('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'Content Strategy', 'Content calendar, topic research, editorial plan',
 'content', '$1,500 - $3,300',
 ARRAY['Content audit', 'Topic research', 'Editorial calendar', 'Content pillars', 'Distribution plan'],
 ARRAY['Content writing', 'Graphic design'],
 ARRAY['Strategic approach', 'Research-backed'],
 'Businesses investing in content marketing', 'active'),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'Copywriting Package', 'Website copy for up to 8 pages',
 'content', '$1,200 - $2,640',
 ARRAY['Up to 8 pages', 'SEO-optimized', 'Brand voice alignment', '2 revision rounds'],
 ARRAY['Photography', 'Graphic design'],
 ARRAY['SEO-focused copy', 'Conversion oriented'],
 'Businesses launching or refreshing websites', 'active'),

-- Ads
('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'Google Ads Setup', 'Campaign structure, keyword research, ad creation',
 'ads', '$1,500 - $3,300',
 ARRAY['Campaign structure', 'Keyword research', 'Ad copy creation', 'Conversion tracking', 'Landing page recommendations'],
 ARRAY['Ad spend', 'Ongoing management', 'Landing page development'],
 ARRAY['ROI focused', 'Data-driven targeting'],
 'Businesses wanting paid search traffic', 'active'),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'Meta Ads Setup', 'Facebook/Instagram campaign creation',
 'ads', '$1,200 - $2,640',
 ARRAY['Campaign creation', 'Audience targeting', 'Creative direction', 'Pixel setup', 'A/B test framework'],
 ARRAY['Ad spend', 'Creative production', 'Ongoing management'],
 ARRAY['Social-first strategy', 'Audience insights'],
 'Businesses wanting social media advertising', 'active'),

-- Branding
('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'Brand Identity', 'Logo, color palette, typography, brand guidelines',
 'branding', '$2,500 - $5,500',
 ARRAY['Logo design', 'Color palette', 'Typography', 'Brand guidelines PDF', 'Business card design'],
 ARRAY['Printing', 'Signage', 'Vehicle wraps'],
 ARRAY['Complete brand package', 'Professional guidelines'],
 'New businesses or rebranding', 'active'),

-- Automation
('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'CRM Setup', 'CRM configuration, data import, workflow setup',
 'automation', '$2,000 - $4,400',
 ARRAY['CRM selection guidance', 'Configuration', 'Data import', 'Workflow automation', 'Team training'],
 ARRAY['CRM subscription fees', 'Ongoing support'],
 ARRAY['Tailored setup', 'Workflow automation'],
 'Growing businesses needing client management', 'active'),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'Analytics Setup', 'GA4, GTM, and conversion tracking',
 'analytics', '$800 - $1,760',
 ARRAY['GA4 setup', 'GTM configuration', 'Conversion tracking', 'Custom dashboards', 'Event tracking'],
 ARRAY['Ongoing reporting', 'Data analysis'],
 ARRAY['Full tracking stack', 'Custom events'],
 'Businesses wanting data-driven decisions', 'active')

ON CONFLICT (org_id, name) DO UPDATE SET
  description = EXCLUDED.description,
  service_type = EXCLUDED.service_type,
  price_range = EXCLUDED.price_range,
  inclusions = EXCLUDED.inclusions,
  exclusions = EXCLUDED.exclusions,
  usp = EXCLUDED.usp,
  target_audience = EXCLUDED.target_audience,
  status = EXCLUDED.status;

-- =============================================================================
-- 7. AGENT CONFIGS (all 10 registered agent types)
-- =============================================================================

INSERT INTO agent_configs (org_id, agent_type, name, description, enabled, schedule, policy_rules, channel_access, confidence_thresholds)
VALUES
('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'lead-swarm', 'Lead Swarm', 'Detects and qualifies new leads from inbound messages',
 true,
 '{"type": "interval", "interval_seconds": 300}'::jsonb,
 '{"auto_acknowledge": true, "min_score_for_hot": 80}'::jsonb,
 ARRAY['email', 'whatsapp', 'web'],
 '{"act": 0.85, "ask": 0.55}'::jsonb),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'invoice-flow', 'Invoice Flow', 'Manages invoice lifecycle: creation, sending, reminders, overdue tracking',
 true,
 '{"type": "cron", "cron_expression": "0 9 * * 1-5"}'::jsonb,
 '{"auto_send_threshold": 500, "reminder_days": [7, 14, 30]}'::jsonb,
 ARRAY['email'],
 '{"act": 0.85, "ask": 0.55}'::jsonb),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'channel-triage', 'Channel Triage', 'Classifies and routes inbound messages across all channels',
 true,
 '{"type": "interval", "interval_seconds": 120}'::jsonb,
 '{"auto_create_tasks": true, "spam_threshold": 0.9}'::jsonb,
 ARRAY['email', 'whatsapp', 'slack'],
 '{"act": 0.85, "ask": 0.55}'::jsonb),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'client-comms', 'Client Comms', 'Drafts client communications using voice profiles and sentiment analysis',
 true,
 '{"type": "interval", "interval_seconds": 300}'::jsonb,
 '{"auto_send": false, "require_approval_above": 0}'::jsonb,
 ARRAY['email', 'whatsapp'],
 '{"act": 0.85, "ask": 0.55}'::jsonb),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'proposal-bot', 'Proposal Bot', 'Generates proposals from briefs with tiered pricing',
 true,
 '{"type": "interval", "interval_seconds": 600}'::jsonb,
 '{"auto_follow_up_days": 3, "max_follow_ups": 3}'::jsonb,
 ARRAY['email'],
 '{"act": 0.70, "ask": 0.40}'::jsonb),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'client-onboarding', 'Client Onboarding', 'Automates new client onboarding after proposal acceptance',
 true,
 '{"type": "interval", "interval_seconds": 600}'::jsonb,
 '{"auto_welcome": true, "credential_reminder_days": [3, 7]}'::jsonb,
 ARRAY['email'],
 '{"act": 0.85, "ask": 0.55}'::jsonb),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'ad-script-gen', 'Ad Script Generator', 'Creates ad scripts across platforms with A/B variations',
 true,
 '{"type": "interval", "interval_seconds": 900}'::jsonb,
 '{"platforms": ["meta", "google"], "default_hook_types": ["pain-point", "benefit"]}'::jsonb,
 ARRAY[]::text[],
 '{"act": 0.70, "ask": 0.40}'::jsonb),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'ai-search-optimizer', 'AI Search Optimizer', 'Monitors AI search visibility and optimizes content',
 true,
 '{"type": "cron", "cron_expression": "0 6 * * 1"}'::jsonb,
 '{"auto_optimize": false, "alert_on_drop": true}'::jsonb,
 ARRAY[]::text[],
 '{"act": 0.85, "ask": 0.55}'::jsonb),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'tender-hunter', 'Tender Hunter', 'Scrapes government tender sites and evaluates fit',
 true,
 '{"type": "cron", "cron_expression": "0 7 * * 1-5"}'::jsonb,
 '{"sources": ["austender", "qtenders"], "min_fit_score": 60}'::jsonb,
 ARRAY[]::text[],
 '{"act": 0.70, "ask": 0.40}'::jsonb),

('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
 'sentry', 'Sentry Monitor', 'Monitors error alerts and escalates critical issues',
 true,
 '{"type": "interval", "interval_seconds": 300}'::jsonb,
 '{"auto_escalate_critical": true, "batch_window_minutes": 15}'::jsonb,
 ARRAY['email'],
 '{"act": 0.85, "ask": 0.55}'::jsonb)

ON CONFLICT (org_id, agent_type) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  enabled = EXCLUDED.enabled,
  schedule = EXCLUDED.schedule,
  policy_rules = EXCLUDED.policy_rules,
  channel_access = EXCLUDED.channel_access,
  confidence_thresholds = EXCLUDED.confidence_thresholds;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

SELECT 'organizations' as entity, count(*) as n FROM organizations WHERE slug = 'awu'
UNION ALL SELECT 'contacts', count(*) FROM contacts WHERE org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
UNION ALL SELECT 'invoices', count(*) FROM invoices WHERE org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
UNION ALL SELECT 'voice_profiles', count(*) FROM voice_profiles WHERE org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
UNION ALL SELECT 'offer_packages', count(*) FROM offer_packages WHERE org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
UNION ALL SELECT 'agent_configs', count(*) FROM agent_configs WHERE org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
