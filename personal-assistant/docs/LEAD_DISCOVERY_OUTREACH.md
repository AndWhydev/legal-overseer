# LeadSwarm: Lead Discovery & Email Outreach

Integrated lead discovery and email campaign management system in BitBit.

## Features

### 1. Lead Discovery (via SerpAPI)
- Search for prospects by business type + location
- Deduplicate across ads, maps, and organic results
- Website enrichment (analytics, pixels, CMS detection, contact info)
- Three-tier scoring (Fit, Opportunity, Priority)
- Direct import to pipeline

### 2. Lead Enrichment
- Website signals: CMS, tracking pixels, booking systems, load time
- Contact detection: emails, phone numbers, social links
- Local SEO positioning (Maps, Organic ranking)
- Paid advertising detection (Google Ads)
- SERP presence tracking

### 3. Email Campaign Management
- Template builder with HTML editor
- Dynamic variable support ({{name}}, {{company}}, etc.)
- Campaign creation with daily sending limits
- Batch operations (add multiple leads)
- Draft/Active/Paused/Completed statuses
- Daily rate limiting to avoid spam filters

### 4. Email Outreach (via Resend)
- Send campaigns via Resend API
- Proper reply-to and tracking headers
- Dry-run mode for testing
- Per-lead metadata tracking (message ID, timestamps)
- Open/Click/Reply/Bounce tracking (ready for webhooks)

### 5. Campaign Analytics
- Sent count, open rate, click rate, reply rate, bounce rate
- Per-lead status tracking
- Campaign performance dashboard
- Metrics by template and category

## Usage

### Create Email Template
1. Go to Leads → Email Campaigns tab
2. Click "New Campaign" → "Create Template"
3. Set name, subject, body (HTML)
4. Add variables for personalization (name, company, phone, etc.)
5. Choose category (cold_outreach, followup, demo_request, proposal)
6. Save

### Create Campaign
1. Click "New Campaign"
2. Name the campaign
3. Select email template
4. Set daily sending limit (1-1000)
5. Optionally select specific leads
6. Create

### Send Emails
1. Select campaign
2. Click "Send" button
3. Optionally run dry-run first
4. View metrics as emails are sent

## Architecture

### Database Schema

**email_templates**
- org_id, name, subject, body, variables, category
- Unique constraint on (org_id, name)

**email_campaigns**
- org_id, name, template_id, status
- start_date, end_date, daily_limit
- Counters: sent_count, opened_count, clicked_count, replied_count, bounced_count

**campaign_leads** (join table)
- campaign_id, lead_id, recipient_email
- status (pending → sent → opened/clicked/replied/bounced)
- Metadata with Resend message_id and timestamps

All tables have:
- RLS enabled with org_id isolation
- Indexes on org_id, status, created_at

### API Routes

**GET /api/agent/leads/campaigns**
List campaigns with optional status/template filters

**POST /api/agent/leads/campaigns**
Create campaign with leads
- Validates template exists
- Creates campaign_leads entries for each lead with email
- Returns campaign object

**PATCH /api/agent/leads/campaigns/:id**
Update campaign status, daily limit, metadata

**GET /api/agent/leads/templates**
List templates with optional category filter

**POST /api/agent/leads/templates**
Create template with variable validation
- Variables must be valid JS identifiers
- Returns 409 if name already exists in org

**PATCH /api/agent/leads/templates/:id**
Update template fields

**DELETE /api/agent/leads/templates/:id**
Delete template

**POST /api/agent/leads/outreach/send**
Send campaign emails via Resend
- Fetches pending campaign_leads
- Respects daily_limit
- Substitutes variables using prospect data
- Updates campaign_leads status and metadata
- Returns: { success, sent, failed, results }

### React Hooks

**useEmailCampaigns()**
```typescript
{
  campaigns: EmailCampaign[]
  templates: EmailTemplate[]
  isLoading: boolean
  loadCampaigns(status?: string): Promise<void>
  loadTemplates(category?: string): Promise<void>
  createCampaign(name, templateId, leadIds?, dailyLimit?): Promise<EmailCampaign>
  createTemplate(name, subject, body, variables?, category?): Promise<EmailTemplate>
  updateCampaign(campaignId, updates): Promise<EmailCampaign>
  sendCampaign(campaignId, dryRun?): Promise<{sent, failed, results}>
}
```

### Components

**EmailTemplateBuilder**
- Modal for creating/editing templates
- HTML editor with variable tag input
- Category dropdown
- Validates variable names

**CampaignCreator**
- Modal for creating campaigns
- Template selector
- Lead pre-selection
- Daily limit input

**CampaignsDashboard**
- Grid view of campaigns
- Metrics cards (sent, open rate, clicked, replied)
- Status badges
- Action buttons: Toggle Status, Send, View Details

**LeadsPage Tabs**
- Leads Pipeline (existing)
- Email Campaigns (new)
- Tab switcher at top

## Plan Limits (Stripe integration ready)

Future: Enforce via middleware check on org subscription tier

- **Free**: 50 prospects/mo, no outreach
- **Starter**: 250 prospects/mo, 1 campaign, 750 emails/mo
- **Growth**: 1,500 prospects/mo, 3 campaigns, 5,000 emails/mo
- **Scale**: 5,000 prospects/mo, unlimited campaigns, 15,000 emails/mo

## Migration

Migration file: `supabase/migrations/145_email_campaigns.sql`

Creates three tables with RLS policies for org isolation.

## Environment Variables

- `RESEND_API_KEY` - Resend API key for email sending
- `RESEND_FROM_EMAIL` - Default from address (campaigns@bitbit.so)
- `SERPAPI_KEY` - Already required for prospect discovery

## Webhook Hooks (Future)

Resend can POST to `/api/webhook/resend` on:
- Email opened
- Link clicked
- Bounce/complaint

Update `campaign_leads` status based on webhooks for real-time tracking.

## Next Steps

1. Implement Resend webhook handler for tracking
2. Add subscription tier enforcement
3. Add campaign detail view with lead list
4. Add template preview before sending
5. Add CSV export of campaign results
6. Add A/B testing support
7. Add schedule sending (start_date/end_date)
8. Add unsubscribe link injection

## Testing

```bash
# Create template (via API or UI)
# Create campaign with test leads
# Send with dryRun: true to verify personalization
# Send real emails with dryRun: false
# Check campaign_leads table for status updates
```

## Security

- RLS on all tables: org_id isolation
- Variables validated as JS identifiers (prevent injection)
- User must own the campaign to update/delete
- Resend API key in env (never exposed to client)
- Rate limiting: daily_limit field prevents abuse
