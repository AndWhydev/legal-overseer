-- Beta Program Infrastructure
-- Migration: 20260327_beta_program
--
-- Tables: beta_feedback, beta_daily_tips, beta_org_config
-- Extends: waitlist (add status column), invite_codes (add metadata)

-- 1. Extend waitlist with status tracking
ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'
    CHECK (status IN ('pending', 'invited', 'accepted', 'expired'));

-- 2. Beta feedback table
CREATE TABLE IF NOT EXISTS public.beta_feedback (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id        uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category      text        NOT NULL CHECK (category IN ('bug', 'feature', 'ux', 'performance', 'other')),
  message       text        NOT NULL,
  screenshot_url text,
  page_url      text,
  user_agent    text,
  status        text        DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'resolved', 'wontfix')),
  admin_notes   text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE public.beta_feedback ENABLE ROW LEVEL SECURITY;

-- Users can insert their own feedback
CREATE POLICY "beta_feedback_user_insert" ON public.beta_feedback
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can read their own feedback
CREATE POLICY "beta_feedback_user_select" ON public.beta_feedback
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Service role full access (for admin API)
CREATE POLICY "beta_feedback_service_all" ON public.beta_feedback
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. Beta daily tips table
CREATE TABLE IF NOT EXISTS public.beta_daily_tips (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  day_number   integer     NOT NULL UNIQUE,
  title        text        NOT NULL,
  body         text        NOT NULL,
  cta_label    text,
  cta_path     text,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE public.beta_daily_tips ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read tips
CREATE POLICY "beta_daily_tips_read" ON public.beta_daily_tips
  FOR SELECT TO authenticated
  USING (true);

-- Service role full access
CREATE POLICY "beta_daily_tips_service_all" ON public.beta_daily_tips
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 4. Seed initial daily tips for first 7 days
INSERT INTO public.beta_daily_tips (day_number, title, body, cta_label, cta_path) VALUES
  (1, 'Welcome to the Beta', 'Start by connecting your Gmail account so BitBit can learn your communication style and start helping immediately.', 'Connect Gmail', '/dashboard/settings/connections'),
  (2, 'Meet Your Inbox', 'BitBit automatically triages incoming messages by priority. Check your Inbox tab to see how messages are classified.', 'Open Inbox', '/dashboard/inbox'),
  (3, 'Chat With BitBit', 'Ask BitBit anything in the Chat tab. Try "What happened today?" or "Draft a reply to the latest email from [name]".', 'Start Chatting', '/dashboard/chat'),
  (4, 'Lead Management', 'BitBit captures and qualifies leads automatically. Visit the Leads tab to see your pipeline and set up auto-responses.', 'View Leads', '/dashboard/leads'),
  (5, 'Invoice Like a Pro', 'Say "Invoice [client] for [work]" in chat and BitBit handles the rest -- entity resolution, PDF generation, and sending.', 'Try Invoicing', '/dashboard/chat'),
  (6, 'Set Your Boundaries', 'Configure which actions BitBit can take automatically vs. which need your approval in the Automations settings.', 'Configure', '/dashboard/settings/automations'),
  (7, 'Share Your Feedback', 'Use the feedback button in the bottom-right corner anytime. Bug reports, feature requests, and UX feedback all help shape the product.', 'Give Feedback', NULL)
ON CONFLICT (day_number) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_beta_feedback_org     ON public.beta_feedback(org_id);
CREATE INDEX IF NOT EXISTS idx_beta_feedback_user    ON public.beta_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_beta_feedback_status  ON public.beta_feedback(status);
CREATE INDEX IF NOT EXISTS idx_beta_feedback_created ON public.beta_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_waitlist_status       ON public.waitlist(status);
