-- Persistent rate limit buckets (replaces in-memory Map)
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_key TEXT NOT NULL UNIQUE,
  tokens DOUBLE PRECISION NOT NULL,
  max_tokens DOUBLE PRECISION NOT NULL,
  refill_rate DOUBLE PRECISION NOT NULL,
  last_refill TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for cleanup of stale buckets
CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_updated ON rate_limit_buckets(updated_at);

-- RLS: service role only (no user-facing access)
ALTER TABLE rate_limit_buckets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rate_limit_buckets_service_only" ON rate_limit_buckets FOR ALL USING (true);
