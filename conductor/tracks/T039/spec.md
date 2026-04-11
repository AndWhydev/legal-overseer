# T039 — Composio Integration: Unified Connections Layer

## Vision

Replace 90% of BitBit's hand-coded channel adapters with Composio's managed integration platform. Composio handles OAuth flows, token refresh, and API abstraction for 1000+ apps through a single SDK. BitBit keeps its custom bridge infrastructure (iMessage, WhatsApp, Android Messages) for protocols Composio can't cover.

**Result**: Adding a new integration goes from days of custom code to minutes of configuration. Users get instant access to hundreds of apps. Token refresh, auth failures, and API version changes become Composio's problem.

## Current State

### What we have today
- **25+ bespoke channel adapter files** in `src/lib/channels/` (~7,500 LOC total)
- Each adapter: its own OAuth handling, API calls, response parsing, token refresh
- **13 registered providers** in `src/lib/connections/built-in-providers.ts` (9 working, 4 `comingSoon`)
- **2 abstraction layers** that overlap: `ChannelAdapter` (pull/isAvailable) and `ProviderPlugin` (pull/send/webhookParse/healthCheck)
- Every new integration = days of work: study API docs, implement OAuth, write pull/send, handle pagination, token refresh, error mapping

### What stays custom (Composio can't replace these)
| Connection | Why custom | Implementation |
|---|---|---|
| iMessage (BlueBubbles) | macOS bridge + Mac VPS | `bluebubbles.ts` + `mac-vps-provisioner.ts` |
| WhatsApp (Baileys) | Matrix bridge on Fly.io | `baileys-bridge.ts` + `fly-machines.ts` |
| Android Messages (Beeper) | Matrix bridge on Fly.io | `beeper.ts` (in connections/providers/) |
| SMS (Telnyx) | Direct carrier API, env key | `sms.ts` — simple, no OAuth |
| Resend | Outbound-only email, env key | Already just an API key tool |
| macOS Calendar/Reminders | AppleScript via SSH bridge | `calendar.ts`, `reminders.ts` |

### What Composio replaces (~15 adapters)
| Current adapter | LOC | Composio toolkit | Auth today |
|---|---|---|---|
| gmail.ts | 533 | `gmail` | OAuth2 + IMAP |
| outlook.ts | 418 | `outlook` | OAuth2 refresh |
| google-calendar.ts | 510 | `googlecalendar` | OAuth2 refresh |
| asana.ts | 341 | `asana` | OAuth2 bearer |
| calendly.ts | 337 | `calendly` | OAuth2 bearer |
| stripe.ts | 314 | `stripe` | Secret key |
| slack.ts | 340 | `slack` | Bot token + HMAC |
| xero.ts | 557 | `xero` | OAuth2 + tenant |
| instagram.ts | 453 | `instagram` | Meta Graph API |
| facebook-messenger.ts | 312 | `facebookpages` | Meta Graph API |
| telegram.ts | 52 | `telegram` | Bot token |
| clickup.ts | 325 | `clickup` | OAuth2 bearer |
| wordpress.ts | 325 | `wordpress` | App password |
| ga4.ts | 261 | `googleanalytics` | OAuth2 bearer |
| gsc.ts | 117 | `googlesearchconsole` | Service account |
| hubspot (coming soon) | 0 | `hubspot` | OAuth2 |
| notion (coming soon) | 0 | `notion` | OAuth2 |

**Total code eliminated**: ~5,200 LOC of adapter code + ~2,000 LOC of tests
**New integrations unlocked**: HubSpot, Notion, Slack, Linear, Jira, Salesforce, Shopify, Zendesk, Intercom, Discord, Trello, Monday, Airtable, GitHub, GitLab, and 900+ more

## Composio SDK Integration Design

### Core concept
```typescript
import { Composio } from '@composio/core'

// One Composio instance per BitBit server
const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY })

// Per-user sessions (maps to BitBit org_id or user_id)
const session = await composio.create(orgId)

// Tools ready for the agent
const tools = await session.tools()
```

### Auth flow for users
1. User clicks "Connect Gmail" in BitBit dashboard
2. BitBit calls `composio.connectedAccounts.initiate(userId, authConfigId, { callbackUrl })`
3. User is redirected to Composio-hosted OAuth page
4. After auth, callback hits BitBit with `connectedAccountId`
5. BitBit stores the `connectedAccountId` in `org_connections`
6. All future API calls go through Composio — token refresh is automatic

### Pricing fit
- **Free tier**: 20,000 tool calls/month — sufficient for beta (1-5 users)
- **$29/month tier**: 200,000 calls — covers ~20 active users
- **$229/month tier**: 2,000,000 calls — production scale
- Overage: $0.25-0.30 per 1,000 calls

## Architecture

### New files
```
src/lib/composio/
  client.ts          — Singleton Composio client, env config
  adapter.ts         — ComposioAdapter implementing ChannelAdapter interface
  auth.ts            — Connection initiation, callback handling
  triggers.ts        — Webhook/trigger subscription management
  mapping.ts         — Maps Composio toolkit IDs ↔ BitBit ChannelType
```

### Adapter bridge pattern
The key insight: BitBit's `ChannelAdapter` interface stays the same. We create a single `ComposioAdapter` factory that wraps Composio actions behind the existing `pull`/`isAvailable` interface:

```typescript
// src/lib/composio/adapter.ts
import { Composio } from '@composio/core'
import type { ChannelAdapter, ChannelMessage } from '../channels/types'

const TOOLKIT_MAP: Record<string, string> = {
  gmail: 'gmail',
  outlook: 'outlook',
  'google-calendar': 'googlecalendar',
  asana: 'asana',
  // ... etc
}

export function createComposioAdapter(
  channelType: ChannelType,
  composio: Composio
): ChannelAdapter {
  const toolkit = TOOLKIT_MAP[channelType]

  return {
    type: channelType,
    name: toolkit,
    description: `${toolkit} via Composio`,
    icon: channelType,
    pull: async (config, since) => {
      const session = await composio.create(config.orgId as string)
      // Execute the appropriate Composio action
      // Transform response to ChannelMessage[]
      return transformToChannelMessages(result, channelType)
    },
    isAvailable: async () => {
      // Check if user has an active connected account for this toolkit
      const accounts = await composio.connectedAccounts.list({
        userIds: [config.orgId],
        statuses: ['ACTIVE']
      })
      return accounts.items.some(a => a.toolkit === toolkit)
    }
  }
}
```

### Agent tool integration
Composio tools can be passed directly to the TAOR engine alongside BitBit's existing tools:

```typescript
// In engine or tool-loader
const session = await composio.create(orgId)
const composioTools = await session.tools()  // All connected app tools

// Merge with BitBit's custom tools (bridges, memory, etc.)
const allTools = [...bitbitNativeTools, ...composioTools]
```

This is complementary to the existing T028 tool orchestration — the Haiku planner just gets more tool groups to choose from.

### Connection management
```
org_connections table (existing)
├── provider: 'gmail'
├── status: 'connected'
├── config: {
│     composio_connected_account_id: 'ca_abc123',  // NEW
│     composio_auth_config_id: 'ac_gmail_oauth2',  // NEW
│     legacy_token: null  // No longer needed
│   }
└── transport: 'composio'  // NEW transport type
```

### Trigger/webhook integration
Composio triggers replace our polling for supported apps:
- Gmail: trigger on new email (replaces 5-min poll cron)
- Slack: trigger on new message
- Stripe: trigger on payment events (replaces webhook endpoint)

```typescript
// Subscribe to events
await composio.triggers.create({
  connectedAccountId: 'ca_abc123',
  triggerType: 'GMAIL_NEW_EMAIL',
  webhookUrl: 'https://app.bitbit.chat/api/webhooks/composio'
})
```

## Workstreams

### WS1: Foundation (P0 — blocks everything)
**Goal**: Composio SDK wired in, one adapter migrated end-to-end.

1. Install `@composio/core` + create `.env` key
2. Build `src/lib/composio/client.ts` singleton
3. Build `src/lib/composio/mapping.ts` toolkit mapping
4. Build `src/lib/composio/adapter.ts` bridge pattern
5. Migrate Gmail adapter as proof-of-concept
6. Add `composio` transport type to `org_connections`
7. Build `/api/connections/composio/callback` route
8. Dashboard: Gmail connect button → Composio OAuth flow
9. Verify: pull emails, send email via Composio
10. Keep old `gmail.ts` as fallback (feature flag: `USE_COMPOSIO_GMAIL`)

### WS2: Auth & Dashboard UX (P0)
**Goal**: Users can connect/disconnect Composio-backed services from the dashboard.

1. Build `src/lib/composio/auth.ts` — initiate, callback, disconnect
2. Update connections grid UI to show Composio-backed services
3. White-label: use BitBit's own OAuth app credentials via Composio custom auth configs
4. Connection status sync (Composio ACTIVE/EXPIRED → BitBit connected/error)
5. Re-auth flow for expired connections

### WS3: Bulk adapter migration (P1)
**Goal**: Migrate all 15 Composio-compatible adapters.

1. Google Calendar → Composio
2. Outlook → Composio
3. Asana → Composio
4. Calendly → Composio
5. Stripe → Composio
6. Slack → Composio (removes `comingSoon`)
7. Xero → Composio
8. Instagram → Composio
9. Facebook Messenger → Composio
10. Telegram → Composio
11. ClickUp → Composio
12. WordPress → Composio
13. GA4 → Composio
14. GSC → Composio
15. Enable HubSpot + Notion (removes `comingSoon`)

Each migration: create Composio adapter → verify pull/send → add feature flag → deprecate old adapter.

### WS4: Triggers & real-time (P1)
**Goal**: Replace polling with Composio triggers where available.

1. Build `/api/webhooks/composio` endpoint
2. Wire trigger payloads → Envelope normalization → ingestion pipeline
3. Subscribe Gmail trigger (new email)
4. Subscribe Stripe trigger (payment events)
5. Subscribe Slack trigger (new message)
6. Deprecate corresponding poll cron jobs

### WS5: Agent tools expansion (P2)
**Goal**: Expose Composio's full action catalog to the TAOR engine.

1. Add `composio` tool group to T028 orchestration
2. Haiku planner learns when to select Composio tools vs native tools
3. Agent can execute any Composio action (send Slack DM, create Jira ticket, etc.)
4. Per-user tool scoping: only show tools for apps the user has connected

### WS6: Cleanup & cutover (P2)
**Goal**: Remove old adapter code, single source of truth.

1. Remove feature flags, make Composio the default
2. Archive old adapter files (git history preserved)
3. Update all tests to use Composio mocks
4. Update connection templates and provider registry
5. Deprecate old OAuth routes for migrated providers

## Implementation Order

| Phase | Workstreams | Effort | Blocks |
|-------|------------|--------|--------|
| **Phase 1** | WS1 (Gmail proof) + WS2 (auth UX) | 1-2 days | Everything |
| **Phase 2** | WS3 (bulk migration) + WS4 (triggers) | 2-3 days | WS5 |
| **Phase 3** | WS5 (agent tools) + WS6 (cleanup) | 1-2 days | - |

**Total: ~5-7 days to full migration**

## Acceptance Criteria

### Phase 1
- [ ] `@composio/core` installed and configured with API key
- [ ] Gmail connects via Composio OAuth flow from BitBit dashboard
- [ ] Gmail pull returns messages in `ChannelMessage[]` format
- [ ] Gmail send works through Composio
- [ ] Feature flag allows fallback to old adapter
- [ ] Old gmail.ts still works when flag is off

### Phase 2
- [ ] All 15 adapters migrated to Composio
- [ ] Slack, HubSpot, Notion no longer `comingSoon`
- [ ] At least 3 triggers active (Gmail, Stripe, Slack)
- [ ] Polling crons removed for triggered services
- [ ] ~5,200 LOC of adapter code archived

### Phase 3
- [ ] Agent can execute any Composio action via TAOR engine
- [ ] Tool count scales to 100+ without code changes
- [ ] Per-user tool scoping based on connected accounts
- [ ] All old OAuth routes deprecated
- [ ] Zero regression in existing channel functionality

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Composio rate limits / downtime | Feature flags for instant fallback to old adapters |
| Composio action schema doesn't match ChannelMessage | Transform layer in adapter.ts with per-toolkit mapping |
| OAuth white-labeling gaps | Use Composio custom auth configs with BitBit's own OAuth app credentials |
| Free tier exhaustion during dev | 20K calls/month is generous; monitor via Composio dashboard |
| Composio doesn't support a niche action we need | Keep old adapter as escape hatch; file feature request |
| Latency added by Composio proxy layer | Monitor; Composio claims <100ms overhead. Triggers eliminate polling latency |

## Cost Analysis

| Scenario | Monthly calls | Cost |
|----------|-------------|------|
| Beta (5 users, light) | ~2,000 | $0 (free tier) |
| Growth (20 users) | ~15,000 | $0 (free tier) |
| Production (50 users) | ~80,000 | $29/mo |
| Scale (200 users) | ~500,000 | $229/mo + ~$75 overage |

vs. current cost: $0/mo but ~300 hours of accumulated engineering time maintaining adapters, plus every new integration = 8-16 hours of work.

## Reference Material

- Composio docs: https://docs.composio.dev
- Composio TypeScript SDK: `@composio/core` on npm
- Composio Vercel AI SDK provider: `@composio/vercel`
- Composio Claude Agent SDK provider: `@composio/claude-agent-sdk`
- Composio pricing: https://composio.dev/pricing
- Composio toolkits catalog: https://composio.dev/tools
- BitBit connections: `src/lib/connections/`
- BitBit channels: `src/lib/channels/`
- BitBit tool orchestration: T028 (ADR-001)
