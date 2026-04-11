-- Email Templates table
create table if not exists email_templates (
  id uuid default gen_random_uuid() primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  subject text not null,
  body text not null, -- HTML content
  variables jsonb default '[]'::jsonb, -- Array of variable names: ["name", "company", "phone"]
  category text, -- 'cold_outreach', 'followup', 'demo_request', etc.
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint email_templates_name_org_unique unique(org_id, name)
);

create index idx_email_templates_org_id on email_templates(org_id);
create index idx_email_templates_created_at on email_templates(created_at desc);

-- Email Campaigns table
create table if not exists email_campaigns (
  id uuid default gen_random_uuid() primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  template_id uuid not null references email_templates(id) on delete restrict,
  status text default 'draft' check (status in ('draft', 'scheduled', 'active', 'paused', 'completed')),
  start_date timestamptz,
  end_date timestamptz,
  daily_limit int default 50 check (daily_limit > 0 and daily_limit <= 1000),
  sent_count int default 0,
  opened_count int default 0,
  clicked_count int default 0,
  replied_count int default 0,
  bounced_count int default 0,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_email_campaigns_org_id on email_campaigns(org_id);
create index idx_email_campaigns_status on email_campaigns(status);
create index idx_email_campaigns_created_at on email_campaigns(created_at desc);
create index idx_email_campaigns_template_id on email_campaigns(template_id);

-- Campaign Leads join table
create table if not exists campaign_leads (
  id uuid default gen_random_uuid() primary key,
  campaign_id uuid not null references email_campaigns(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  recipient_email text not null,
  status text default 'pending' check (status in ('pending', 'sent', 'opened', 'clicked', 'replied', 'bounced')),
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  replied_at timestamptz,
  bounce_reason text,
  metadata jsonb default '{}'::jsonb, -- Resend message_id, tracking info, etc.
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint campaign_leads_unique unique(campaign_id, lead_id)
);

create index idx_campaign_leads_campaign_id on campaign_leads(campaign_id);
create index idx_campaign_leads_lead_id on campaign_leads(lead_id);
create index idx_campaign_leads_status on campaign_leads(status);
create index idx_campaign_leads_sent_at on campaign_leads(sent_at);

-- Enable RLS
alter table email_templates enable row level security;
alter table email_campaigns enable row level security;
alter table campaign_leads enable row level security;

-- RLS Policies for email_templates
create policy "email_templates_select_own_org"
  on email_templates for select
  using (org_id in (select org_id from profiles where id = auth.uid()));

create policy "email_templates_insert_own_org"
  on email_templates for insert
  with check (org_id in (select org_id from profiles where id = auth.uid()));

create policy "email_templates_update_own_org"
  on email_templates for update
  using (org_id in (select org_id from profiles where id = auth.uid()))
  with check (org_id in (select org_id from profiles where id = auth.uid()));

create policy "email_templates_delete_own_org"
  on email_templates for delete
  using (org_id in (select org_id from profiles where id = auth.uid()));

-- RLS Policies for email_campaigns
create policy "email_campaigns_select_own_org"
  on email_campaigns for select
  using (org_id in (select org_id from profiles where id = auth.uid()));

create policy "email_campaigns_insert_own_org"
  on email_campaigns for insert
  with check (org_id in (select org_id from profiles where id = auth.uid()));

create policy "email_campaigns_update_own_org"
  on email_campaigns for update
  using (org_id in (select org_id from profiles where id = auth.uid()))
  with check (org_id in (select org_id from profiles where id = auth.uid()));

create policy "email_campaigns_delete_own_org"
  on email_campaigns for delete
  using (org_id in (select org_id from profiles where id = auth.uid()));

-- RLS Policies for campaign_leads
create policy "campaign_leads_select_own_org"
  on campaign_leads for select
  using (campaign_id in (select id from email_campaigns where org_id in (select org_id from profiles where id = auth.uid())));

create policy "campaign_leads_insert_own_org"
  on campaign_leads for insert
  with check (campaign_id in (select id from email_campaigns where org_id in (select org_id from profiles where id = auth.uid())));

create policy "campaign_leads_update_own_org"
  on campaign_leads for update
  using (campaign_id in (select id from email_campaigns where org_id in (select org_id from profiles where id = auth.uid())))
  with check (campaign_id in (select id from email_campaigns where org_id in (select org_id from profiles where id = auth.uid())));

create policy "campaign_leads_delete_own_org"
  on campaign_leads for delete
  using (campaign_id in (select id from email_campaigns where org_id in (select org_id from profiles where id = auth.uid())));
