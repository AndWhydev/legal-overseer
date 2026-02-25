-- 035_audit_log.sql
-- Structured audit log for all agent and user actions.
-- Future: partition by month on created_at for scale.

create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  actor_type  text not null check (actor_type in ('user','agent','system','cron')),
  actor_id    text not null,
  action      text not null check (action in ('created','updated','deleted','approved','rejected','sent','escalated','executed')),
  entity_type text not null check (entity_type in ('invoice','lead','approval','contact','task','message','proposal','tender','watch')),
  entity_id   text not null,
  metadata    jsonb default '{}'::jsonb,
  ip_address  text,
  created_at  timestamptz not null default now()
);

-- Partition hint: when table exceeds ~10M rows, convert to range partition on created_at by month.
comment on table audit_log is 'Partition candidate: range on created_at by month';

-- Indexes
create index if not exists idx_audit_log_org_created
  on audit_log (org_id, created_at desc);

create index if not exists idx_audit_log_org_entity
  on audit_log (org_id, entity_type, entity_id);

-- RLS
alter table audit_log enable row level security;

create policy "audit_log_org_isolation"
  on audit_log
  for all
  using (org_id = (select org_id from profiles where id = auth.uid()));
