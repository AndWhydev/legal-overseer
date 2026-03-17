-- Whisper impressions — tracks which whispers were shown to prevent repetition
create table if not exists whisper_impressions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references organisations(id) on delete cascade,
  source text not null,
  entity_key text not null,
  shown_at timestamptz not null default now()
);

create index idx_whisper_impressions_lookup
  on whisper_impressions (user_id, org_id, source, entity_key, shown_at desc);

-- Auto-prune rows older than 7 days (run via pg_cron or app-level cleanup)
