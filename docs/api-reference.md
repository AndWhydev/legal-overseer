# BitBit API Reference

All routes are Next.js App Router API routes under `personal-assistant/src/app/api/`.

Most authenticated routes use Supabase cookie-based auth (the user must be logged in via the dashboard). Service/cron routes use Bearer token auth via `SCHEDULER_SECRET`, `RELAY_SECRET`, or `CRON_SECRET`.

Common error responses across all authenticated endpoints:

| Status | Body | Meaning |
|--------|------|---------|
| 401 | `{ "error": "Unauthorized" }` | Missing or invalid auth |
| 503 | `{ "error": "Not configured" }` | Supabase env vars missing |
| 400 | `{ "error": "No profile found" }` | User has no org profile |

---

## Agent

### POST /api/agent/chat

Streaming agent chat. Sends user message through the agentic engine with tool use.

- **Auth:** Supabase session (cookie)
- **Request body:** `{ "message": "string" }`
- **Response:** SSE stream (`text/event-stream`)
- **Event types:** `thinking`, `tool_call`, `tool_result`, `message`, `error`, `done`

```json
// Request
{ "message": "What leads came in today?" }

// SSE events
data: {"type":"thinking","data":"Routing to fast (simple query)"}
data: {"type":"tool_call","data":{"name":"search_leads","input":{}}}
data: {"type":"tool_result","data":{"name":"search_leads","result":[...],"success":true}}
data: {"type":"message","data":"You have 3 new leads today..."}
data: {"type":"done","data":{"tokens":{"input_tokens":450,"output_tokens":120},"model":"claude-haiku-3-5-20241022","tier":"fast"}}
```

### GET /api/agent/approvals

List pending approval queue items.

- **Auth:** Supabase session
- **Query params:**
  - `limit` (number, default 20, max 100)
  - `offset` (number, default 0)
  - `priority` (`urgent` | `normal` | `low`)
- **Response:** `{ "approvals": [...] }`

### PATCH /api/agent/approvals

Resolve an approval (approve or reject).

- **Auth:** Supabase session
- **Request body:** `{ "approvalId": "uuid", "decision": "approved" | "rejected" }`
- **Response:** `{ "approval": {...} }`

### POST /api/agent/approvals/digest

Send daily approval digest and expire stale approvals.

- **Auth:** Bearer token (`SCHEDULER_SECRET`)
- **Response:** `{ "digestSent": true, "expired": 0 }`

### GET /api/agent/leads

List leads for the user's organization.

- **Auth:** Supabase session
- **Query params:**
  - `status` (comma-separated: `new`, `qualified`, `booked`, `converted`, `lost`)
- **Response:** `{ "leads": [...] }`

### PATCH /api/agent/leads/[leadId]

Update a lead's status.

- **Auth:** Supabase session
- **Request body:** `{ "status": "qualified" }`
- **Response:** `{ "lead": {...} }`

### POST /api/agent/leads/ack

Process pending lead acknowledgments (auto-respond to new leads).

- **Auth:** Bearer token (`SCHEDULER_SECRET`)
- **Response:** `{ "processed": 5, "sent": 3, "failed": 0 }`

### GET /api/agent/invoices

List invoices for the user's organization.

- **Auth:** Supabase session
- **Query params:**
  - `status` (comma-separated: `draft`, `sent`, `viewed`, `overdue`, `paid`, `cancelled`)
  - `q` (search query)
- **Response:** `{ "invoices": [...] }`

### POST /api/agent/invoices

Create an invoice from natural language or structured data.

- **Auth:** Supabase session
- **Request body:**
  ```json
  {
    "command": "Invoice Acme Corp $5000 for website redesign",
    // OR structured:
    "contact_name": "Acme Corp",
    "amount": 5000,
    "currency": "AUD",
    "terms_days": 14,
    "line_items": [{ "description": "Website redesign", "quantity": 1, "unit_price": 5000 }]
  }
  ```
- **Response:** `{ "invoice": {...} }`

### PATCH /api/agent/invoices/[invoiceId]

Update invoice status (send, mark paid, cancel).

- **Auth:** Supabase session
- **Request body:** `{ "status": "sent" | "paid" | "cancelled", "payment_method?": "string", "paid_date?": "ISO date" }`
- **Response:** `{ "invoice": {...} }`

### GET /api/agent/inbox

Query unified inbox with filters.

- **Auth:** Supabase session
- **Query params:** `channel`, `priority`, `category`, `status`, `threadStatus`, `limit`, `offset`
- **Response:** `{ "messages": [...], "total": 42 }`

### POST /api/agent/inbox

Get active conversation threads.

- **Auth:** Supabase session
- **Response:** `{ "threads": [...] }`

### POST /api/agent/triage

Run triage on unprocessed messages.

- **Auth:** Supabase session
- **Response:** `{ "processed": 10, "actionable": 3, "informational": 5, "spam": 2 }`

### GET /api/agent/triage

Get triage digest summary.

- **Auth:** Supabase session
- **Response:** Digest object with message categories and counts.

### PUT /api/agent/triage

Run daily digest generation.

- **Auth:** Supabase session
- **Response:** Digest result.

### POST /api/agent/scheduler

Trigger a scheduler tick (checks which agents are due and fires them).

- **Auth:** Bearer token (`SCHEDULER_SECRET`)
- **Request body:** `{ "orgId?": "uuid" }` (optional; omit to check all orgs)
- **Response:**
  ```json
  {
    "results": [{ "agentType": "lead-swarm", "orgId": "...", "triggered": true, "reason": "due" }],
    "triggeredCount": 3,
    "checkedCount": 8
  }
  ```

### GET /api/agent/proposals

List proposals for the user's organization.

- **Auth:** Supabase session
- **Response:** Array of proposal objects.

### POST /api/agent/proposals

Generate a new proposal.

- **Auth:** Supabase session
- **Request body:** Proposal generation parameters (client, scope, etc.)
- **Response:** Generated proposal object.

### POST /api/agent/ad-scripts

Generate ad scripts using AI.

- **Auth:** Supabase session
- **Request body:** Script generation parameters (platform, hook type, offer, etc.)
- **Response:** Generated scripts object.

### GET /api/agent/ad-scripts

List script batches.

- **Auth:** Supabase session
- **Response:** `{ "batches": [...] }`

### GET /api/agent/ad-scripts/offers

List active offer packages for ad script generation.

- **Auth:** Supabase session
- **Response:** `{ "offers": [{ "id": "uuid", "name": "Summer Sale" }] }`

### POST /api/agent/ai-search

AI search optimization actions.

- **Auth:** Supabase session
- **Request body:** `{ "action": "audit" | "audit-legacy" | "content" | "schema" | "report", ...params }`
- **Response:** Varies by action.

### GET /api/agent/tenders

List tenders with optional filters.

- **Auth:** Supabase session
- **Query params:** `status`, `source`, `min_fit`
- **Response:** Array of tender objects.

### POST /api/agent/tenders

Tender actions: scan, evaluate, generate response, check compliance.

- **Auth:** Supabase session
- **Request body:** `{ "action": "scan" | "evaluate" | "response" | "compliance", ...params }`
- **Response:** Varies by action.

### GET /api/agent/tenders/capabilities

List capability profiles.

- **Auth:** Supabase session
- **Response:** Array of capability profile objects.

### POST /api/agent/tenders/capabilities

Create/update a capability profile.

- **Auth:** Supabase session
- **Request body:** Capability profile data.

### GET /api/agent/sentry/alerts

List Sentry alerts.

- **Auth:** Supabase session
- **Query params:**
  - `limit` (number, default 50, max 200)
  - `statuses` (comma-separated: `pending`, `escalated`, `acknowledged`, `resolved`)
- **Response:** Array of alert objects.

### PATCH /api/agent/sentry/alerts

Acknowledge a Sentry alert.

- **Auth:** Supabase session
- **Request body:** `{ "alertId": "uuid" }`

### POST /api/agent/sentry/alerts

Trigger Sentry escalation processing.

- **Auth:** Supabase session

### GET /api/agent/sentry/watches

List Sentry watches.

- **Auth:** Supabase session

### POST /api/agent/sentry/watches

Create a Sentry watch.

- **Auth:** Supabase session
- **Request body:** `{ "type": "error_keyword" | "uptime" | "negative_sentiment", "config": {...} }`

---

## AI

### POST /api/ai/text

Placeholder AI text endpoint.

- **Auth:** None
- **Request body:** `{ "query": "string" }`
- **Response:** `{ "response": "You asked: \"...\". AI responses will be connected soon." }`

### POST /api/ai/voice

Voice processing placeholder (not yet implemented).

- **Auth:** None
- **Response:** `{ "error": "Voice processing is not yet implemented." }` (501)

---

## Billing

### POST /api/billing/checkout

Create a Stripe checkout session.

- **Auth:** Supabase session
- **Request body:** `{ "tier": "starter" | "growth" | "scale", "orgId": "uuid" }`
- **Response:** `{ "sessionId": "cs_...", "url": "https://checkout.stripe.com/..." }`

### GET /api/billing/checkout

Redirect to login with checkout intent.

- **Query params:** `tier`
- **Response:** 302 redirect.

### POST /api/billing/webhook

Stripe billing webhook for subscription events.

- **Auth:** Stripe signature (`stripe-signature` header + `STRIPE_WEBHOOK_SECRET`)
- **Request body:** Raw Stripe event payload
- **Response:** `{ "received": true, "type": "customer.subscription.created" }`

---

## Monitoring

### GET /api/monitoring/health

Health check endpoint.

- **Auth:** None
- **Response:**
  ```json
  {
    "status": "ok" | "degraded" | "down",
    "timestamp": "2026-02-26T10:00:00Z",
    "version": "abc123",
    "checks": {
      "supabase": "ok" | "error" | "unconfigured",
      "environment": "production",
      "uptime_seconds": 3600
    }
  }
  ```

### GET /api/monitoring/costs

Get AI cost summary and budget alerts.

- **Auth:** Supabase session
- **Query params:** `period` (`today` | `7d` | `30d` | `month`)
- **Response:** `{ "summary": {...}, "alerts": [...] }`

---

## Analytics

### GET /api/analytics

Business analytics (MRR, usage, churn).

- **Auth:** Supabase session
- **Query params:**
  - `type` (`all` | `mrr` | `usage` | `churn`)
  - `orgId` (required for `usage`)
- **Response:** Varies by type. For `all`:
  ```json
  {
    "mrr": { "current": 5000, "previous": 4500, "growth": 11.1 },
    "usage": { "agentRuns": 150, "messagesProcessed": 1200 },
    "churn": { "atRiskOrgs": 2, "risks": [...], "actions": [...] }
  }
  ```

---

## Onboarding

### POST /api/onboarding

Organization onboarding (self-serve or beta).

- **Auth:** Supabase session
- **Request body (beta):**
  ```json
  { "action": "beta", "orgName": "AWU", "adminEmail": "andy@example.com", "adminName": "Andy" }
  ```
- **Request body (setup-channels):**
  ```json
  { "action": "setup-channels", "orgId": "uuid", "channels": [{ "type": "gmail", "config": {} }] }
  ```
- **Request body (self-serve):**
  ```json
  { "name": "My Agency", "plan": "starter" }
  ```
- **Response:** Created org object (201).

---

## Webhooks

### POST /api/webhooks/stripe

Stripe payment event webhook.

- **Auth:** Stripe signature (`stripe-signature` header + `STRIPE_WEBHOOK_SECRET`)
- **Handles:** `payment_intent.succeeded`, `payment_intent.payment_failed`, `invoice.paid`, `invoice.payment_failed`
- **Response:** `{ "received": true, "type": "payment_intent.succeeded" }`

### POST /api/webhooks/asana

Asana event webhook.

- **Auth:** Asana handshake (`X-Hook-Secret` header) or signature (`X-Hook-Signature`)
- **Handles:** Task created, updated, completed events
- **Response:** `{ "received": true, "count": 3 }`

### POST /api/webhooks/calendly

Calendly booking webhook.

- **Auth:** Calendly signature (`Calendly-Webhook-Signature` header)
- **Handles:** `invitee.created`, `invitee.canceled`
- **Response:** `{ "received": true, "event": "invitee.created" }`

---

## Channels

### GET /api/channels/status

Get availability status of all channel adapters.

- **Auth:** None
- **Response:** `{ "channels": [{ "type": "gmail", "name": "Gmail", "available": true, ... }] }`

### POST /api/channels/sync

Trigger channel synchronization.

- **Auth:** None (intended for internal use)
- **Request body:** `{ "channels?": ["gmail", "outlook"], "since?": "ISO date", "orgId?": "uuid" }`
- **Response:** `{ "success": true, "results": [{ "channel": "gmail", "messagesFound": 12, "tasksCreated": 3 }] }`

### POST /api/channels/relay

Trigger channel relay polling for relay-enabled channels.

- **Auth:** Bearer token (`RELAY_SECRET`)
- **Request body:** `{ "orgId?": "uuid", "channel?": "gmail" }`
- **Response:** Array of poll results.

### GET /api/channels/whatsapp

WhatsApp webhook verification (Meta handshake).

- **Query params:** `hub.mode`, `hub.verify_token`, `hub.challenge`
- **Response:** Challenge string (200) or Forbidden (403).

### POST /api/channels/whatsapp

WhatsApp incoming message webhook.

- **Auth:** HMAC signature (`x-hub-signature-256` header + `WHATSAPP_APP_SECRET`)
- **Request body:** Meta WhatsApp webhook payload
- **Response:** 200 OK

---

## Cron

All cron routes use `GET` method, authenticated via `CRON_SECRET` Bearer token. Designed for Vercel Cron or external cron services.

| Route | Purpose | Max Duration |
|-------|---------|--------------|
| `GET /api/cron/scheduler` | Run all scheduled agents | 5 min |
| `GET /api/cron/sentry` | Run Sentry checks across all orgs | 5 min |
| `GET /api/cron/triage` | Run message triage across all orgs | 5 min |
| `GET /api/cron/channel-sync` | Poll and classify channel messages | 5 min |
| `GET /api/cron/morning-briefing` | Send WhatsApp morning briefing | 1 min |
| `GET /api/cron/proactive-alerts` | Check and send proactive WhatsApp alerts | 1 min |

---

## Activity

### GET /api/activity

List activity feed entries.

- **Auth:** Supabase session
- **Response:** `{ "activities": [...] }`

### POST /api/activity

Create an activity feed entry.

- **Auth:** Supabase session
- **Request body:** `{ "action_type": "string", "action": "string", "reasoning?": "string", "result?": "string" }`
- **Response:** `{ "activity": {...} }` (201)

---

## Contacts

### GET /api/contacts

List all contacts.

- **Auth:** Supabase session
- **Response:** `{ "contacts": [...] }`

### POST /api/contacts

Create a contact.

- **Auth:** Supabase session
- **Request body:** `{ "name": "string", "slug": "string", "type?": "contact", "emails?": [], "phones?": [] }`
- **Response:** `{ "contact": {...} }` (201)

### PATCH /api/contacts/[id]

Update a contact.

- **Auth:** Supabase session
- **Request body:** Partial contact fields.

### DELETE /api/contacts/[id]

Delete a contact.

- **Auth:** Supabase session

---

## Tasks

### GET /api/tasks

List all tasks ordered by position.

- **Auth:** Supabase session
- **Response:** `{ "tasks": [...] }`

### POST /api/tasks

Create a task.

- **Auth:** Supabase session
- **Request body:** `{ "title": "string", "description?": "string", "status?": "pending", "priority?": "medium", "column_id?": "uuid", "position?": 0 }`
- **Response:** `{ "task": {...} }` (201)

### PATCH /api/tasks/[id]

Update a task.

- **Auth:** Supabase session
- **Request body:** Partial task fields.

### DELETE /api/tasks/[id]

Delete a task.

- **Auth:** Supabase session

### POST /api/tasks/reorder

Batch reorder tasks across columns.

- **Auth:** Supabase session
- **Request body:** `{ "updates": [{ "id": "uuid", "column_id": "uuid", "position": 0 }] }`
- **Response:** `{ "updated": 5 }`

---

## Settings

### GET /api/settings

Get user profile and preferences.

- **Auth:** Supabase session
- **Response:**
  ```json
  {
    "profile": {
      "displayName": "Andy",
      "email": "andy@example.com",
      "preferences": {
        "autonomyLevel": "medium",
        "communicationStyle": "concise",
        "defaultEmailAction": "draft"
      }
    }
  }
  ```

### PATCH /api/settings

Update user preferences.

- **Auth:** Supabase session
- **Request body:** `{ "preferences": { "autonomyLevel": "high" } }`

### GET /api/settings/integrations

List organization integrations.

- **Auth:** Supabase session
- **Response:** `{ "integrations": [...] }`

### POST /api/settings/integrations

Store API key credentials for an integration.

- **Auth:** Supabase session
- **Request body:** `{ "provider": "stripe", "credentials": { "secret_key": "sk_..." } }`

### DELETE /api/settings/integrations

Remove integration credentials.

- **Auth:** Supabase session
- **Request body:** `{ "provider": "stripe" }`
