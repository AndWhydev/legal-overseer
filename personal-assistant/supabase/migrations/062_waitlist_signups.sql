-- Waitlist signups for the BitBit landing page
CREATE TABLE IF NOT EXISTS public.waitlist_signups (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL UNIQUE,
  source text DEFAULT 'landing-page',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.waitlist_signups ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (landing page uses anon key)
CREATE POLICY "allow_anon_insert" ON public.waitlist_signups
  FOR INSERT TO anon
  WITH CHECK (true);

-- Allow service role full access
CREATE POLICY "allow_service_role_all" ON public.waitlist_signups
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
