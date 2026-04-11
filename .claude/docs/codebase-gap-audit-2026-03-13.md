# BitBit Codebase Gap Audit — 2026-03-13

Comprehensive audit of features that appear functional in the UI but are stubs, placeholders, broken, or not wired to real data.

---

## CRITICAL: Inbox Empty Bug (Task A)

### Root Cause: Multi-Layer Failure

The inbox shows "All caught up" because of **three compounding issues**:

#### 1. `relay_enabled` defaults to `false` on channel connect

**File:** `/home/claude/bitbit/personal-assistant/src/app/api/channels/connect/route.ts` (line 99)

When a user connects Gmail (or any channel), the `channel_connections` row is created with `relay_enabled: false`. The channel-sync cron (`/api/cron/channel-sync`) filters for `relay_enabled: true`, so no messages are ever pulled from connected channels.

The user would need to manually open the channel config drawer and toggle the "Relay" switch, which is not obvious or documented in the onboarding flow.

#### 2. Column name mismatches in `channel_messages` table

The DB schema (migration 004) defines columns `channel` and `sender`, but `queryInbox()` in `channel-triage.ts` reads `channel_type` and `sender_name`. These columns do not exist. Supabase returns `null` for nonexistent columns without error, so:

- `queryInbox()` returns messages with `channelType: null`, `senderName: null`
- Filters by channel type never match
- The triage system's `runTriage()` reads `msg.channel_type` and `msg.sender_name` which are always null

**Missing columns** (used by channel-triage.ts but not in any migration):
- `channel_type` (DB has `channel`)
- `sender_name` (DB has `sender`)
- `contact_id`
- `contact_name`
- `thread_status`
- `deduplicated_with`
- `processed_at`
- `archived`
- `category` (on channel_messages)

The `runTriage()` function writes to these columns at line 574-586, but those updates silently fail because the columns don't exist.

#### 3. No automatic sync trigger on channel connect

After connecting Gmail via OAuth, there is no immediate sync. The user must wait for the next cron cycle (every 5 minutes), and even then it won't fire because of issue #1.

### Data Flow (When Working)

The intended flow is fully implemented but broken by the above issues:

1. Cron `/api/cron/channel-sync` runs every 5 minutes (vercel.json)
2. It calls `pollChannel()` from `relay-daemon.ts` for each connected channel with `relay_enabled: true`
3. `pollChannel()` uses `gmailAdapter.pull()` which fetches via Gmail API (OAuth) or IMAP (app password)
4. Messages are upserted into `channel_messages`
5. Cron `/api/cron/triage` runs `runTriage()` to classify messages
6. `queryInbox()` reads from `channel_messages` and returns to the UI

The Gmail adapter is fully implemented with OAuth token refresh, API pull with retry, and IMAP fallback.

---

## Feature-by-Feature Stub Audit

### BROKEN (user-visible failures)

| Feature | Issue | Severity | Files |
|---------|-------|----------|-------|
| **Inbox** | Empty due to relay_enabled=false + column mismatches (see above) | CRITICAL | `channel-triage.ts`, `connect/route.ts` |
| **Inbox message actions** | Archive and Done buttons have no `onClick` handlers | HIGH | `inbox-tab.tsx` lines 588-594 |
| **Proposals tab** | Calls `/api/proposals` but route doesn't exist (agent proposals is at `/api/agent/proposals`) | HIGH | `proposals-tab.tsx` line 99 |
| **Admin health check** | Calls `/api/admin/health` which doesn't exist | MEDIUM | `admin-tab.tsx` line 146 |
| **Email command replies** | TODO at line 255: email responses are formatted but never actually sent | HIGH | `email-command.ts` lines 254-258 |
| **GSC adapter** | JWT signature is hardcoded as `placeholder` string, will never authenticate | LOW | `gsc.ts` line 111 |

### HARDCODED/SEED DATA (works in dev, empty in production)

| Feature | Issue | Files |
|---------|-------|-------|
| **Inbox seed data** | 8 hardcoded `SEED_MESSAGES` shown only when dev toolbar's `seed_data.inbox` is true. Production shows empty. | `inbox-tab.tsx` lines 127-184 |
| **Contacts seed data** | 8 hardcoded `SEED_CONTACTS` shown only via dev toolbar. Production fetches from `/api/contacts`. | `contacts-tab.tsx` lines 38-71 |
| **Medications tab** | Entirely hardcoded from `seed-data.ts`. No API, no database. Feature-gated behind `NEXT_PUBLIC_ENABLE_MEDICATIONS`. Renders February 2026 data with specific medications. | `medications-tab.tsx`, `lib/medications/seed-data.ts` |

### COMING SOON / DISABLED INTEGRATIONS

These are marked `coming_soon` in the integration registry and show a "Coming Soon" badge:

| Integration | File |
|-------------|------|
| Slack | `lib/integrations/types.ts` line 44 |
| iMessage | `lib/integrations/types.ts` line 74 |
| Notion | `lib/integrations/types.ts` line 116 |
| HubSpot | `lib/integrations/types.ts` line 126 |
| Google Analytics | `lib/integrations/types.ts` line 138 |

Note: Slack and Google Analytics have adapter code written (`src/lib/channels/slack.ts`, `src/lib/channels/ga4.ts`) but are marked as coming soon in the UI.

### FUNCTIONAL BUT HOLLOW (data-dependent, will be empty for new users)

These tabs are properly wired to real APIs/database but will show empty states because no data flows into them automatically:

| Feature | What happens | Why |
|---------|-------------|-----|
| **Analytics** | Calls `/api/analytics` which queries real MRR/usage/churn data | Empty without Stripe invoices |
| **Reports** | Calls `/api/reports` to generate reports | Empty without historical data |
| **Knowledge Graph** | Calls `/api/knowledge/graph` | Empty until entity_relationships + entity_profiles populated by triage |
| **Sentry/Watch Manager** | Calls `/api/agent/sentry/watches` and `/api/agent/sentry/alerts` | Empty without Sentry project config |
| **Tenders** | Calls `/api/agent/tenders` | Empty without tender data |
| **Leads** | Calls `/api/agent/leads` | Empty until leads arrive via channels or manual import |
| **Jobs** | Queries `jobs` table via Supabase | Empty without job creation |
| **Quotes** | Queries `quotes` table via Supabase | Empty without quotes |
| **Invoices** | Calls `/api/agent/invoices` | Empty without invoice creation |
| **Approvals** | Calls `/api/agent/approvals` | Empty until agent actions need approval |
| **Costs** | Calls `/api/monitoring/costs` | Empty without LLM usage tracking data |
| **Activity Log** | Calls `/api/audit` | Empty until user/system actions recorded |

### FULLY FUNCTIONAL

These features are properly wired and work end-to-end:

| Feature | Notes |
|---------|-------|
| **Chat** | Calls `/api/agent/chat` with Anthropic SDK |
| **AI Search** | Calls `/api/agent/ai-search` |
| **Contacts** | Fetches from `/api/contacts`, real Supabase data |
| **Dashboard/Kanban** | Queries `kanban_columns` + `tasks` from Supabase |
| **Command Center** | Aggregates from multiple Supabase tables |
| **Connections/Channels** | Full OAuth flow, channel config, connect/disconnect |
| **Settings** | Real profile/org settings |
| **Global Search (Cmd+K)** | Calls `/api/search`, queries across contacts/leads/invoices/proposals/tenders |
| **Notification Center** | Queries real approval_queue, leads, invoices from Supabase |
| **Ad Scripts** | Calls `/api/agent/ad-scripts` |
| **Creator Studio** | Client-side only tool, no data dependency |
| **Onboarding** | Full flow with first-value API |

### CRON JOBS (infrastructure state)

All 14 cron jobs are configured in `vercel.json` and have real route handlers. However:

| Cron | Schedule | Status |
|------|----------|--------|
| `channel-sync` | */5 min | Runs but no-op due to `relay_enabled: false` |
| `triage` | */5 min | Runs but column mismatches cause degraded results |
| `scheduler` | Every min | Functional |
| `sentry` | */5 min | Functional (needs Sentry DSN) |
| `morning-briefing` | Daily 7am AEST | Functional |
| `monday-briefing` | Weekly | Functional |
| `proactive-alerts` | */15 min | Functional |
| `daily-digest` | Daily | Functional |
| `weekly-report` | Weekly | Functional |
| `monthly-report` | Monthly | Functional |
| `token-refresh` | Hourly | Functional |
| `consolidation` | Daily 1pm AEST | Functional |
| `entity-profile-refresh` | Every 2h | Functional |
| `archive-threads` | */15 min | Functional |

### OUTSTANDING TODOs IN CODE

| Location | TODO |
|----------|------|
| `email-command.ts:255` | "TODO: Use the emailResponse object to send the formatted email via Gmail/Outlook adapters" |

---

## Priority Fix Recommendations

1. **P0 — Inbox pipeline**: Add missing columns to `channel_messages` (channel_type, sender_name alias or rename, contact_id, contact_name, thread_status, deduplicated_with, processed_at, archived, category). OR update code to use existing column names.
2. **P0 — relay_enabled**: Set `relay_enabled: true` in the connect route, or auto-enable it during onboarding/first-connection.
3. **P1 — Proposals route**: Change `proposals-tab.tsx` to call `/api/agent/proposals` instead of `/api/proposals`.
4. **P1 — Inbox actions**: Wire Archive/Done buttons to an API call.
5. **P2 — Email command sending**: Implement actual email dispatch in `email-command.ts`.
6. **P2 — Admin health route**: Create `/api/admin/health` or point admin tab to `/api/health`.
7. **P3 — GSC adapter**: Replace placeholder JWT signature with real crypto signing.
