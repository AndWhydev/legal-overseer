# RFC: Unified Connection Framework

**Status:** Draft  
**Author:** BitBit Architecture  
**Date:** 2026-04-04

---

## Problem

BitBit has 20+ channel adapters (`src/lib/channels/`) each with bespoke implementations. Adding a new connection requires:

1. Writing a full `ChannelAdapter` implementation
2. Adding the type to the `ChannelType` union (hardcoded)
3. Registering in `synthesizer.ts` adapter map
4. Adding to `AVAILABLE_INTEGRATIONS` in `integrations/types.ts`
5. Writing credential handling in `integrations/credentials.ts`
6. Adding webhook route if push-based

This is rigid. Users cannot plug in their own data sources. The `ChannelType` union is a compile-time gate that prevents runtime extensibility.

## Goal

A **provider-agnostic connection framework** where:
- Any data source can be registered at runtime via config (no code deploy)
- Inbound data flows through a single normalisation pipeline
- The system is indifferent to whether data arrives via poll, webhook, SDK, bridge script, or manual push
- First-party adapters (Gmail, Outlook, etc.) remain optimised but use the same interface

## Architecture: Connection > Envelope > Pipeline

```
CONNECTION REGISTRY (Supabase: org_connections)
  Each row = one configured connection instance:
  { id, org_id, provider, transport, credentials, config, status, capabilities[] }
        |
        v
TRANSPORTS
  poll     - Cron pulls via adapter.pull()
  webhook  - HTTP POST to /api/connections/[id]/ingest
  bridge   - External script pushes via REST API
  stream   - SSE/WebSocket for real-time feeds
  manual   - User pastes/uploads data
        |  All transports produce the same thing:
        v
ENVELOPE (Canonical Format)
  {
    connection_id, org_id, provider, transport, timestamp, dedup_key,
    payload: { type, sender?, subject?, body, body_html?, attachments?, metadata }
  }
        |
        v
INGESTION PIPELINE (existing, unchanged)
  1. Dedup (envelope.dedup_key)
  2. AI Extraction (classification, entities, relationships)
  3. Contact Resolution
  4. Knowledge Graph Write
  5. Action Router (triage, approval queue, task creation)
  6. Activity Feed
```

## Key Design Decisions

### 1. `provider` is a free string, not an enum

```typescript
// OLD: compile-time locked
type ChannelType = 'gmail' | 'outlook' | ... // 20 values, requires deploy to add

// NEW: runtime-registered string
interface Connection {
  provider: string          // "gmail", "outlook", "my-custom-crm", "shopify-orders"
  capabilities: Capability[] // ["pull", "push", "send", "webhook"]
}
```

First-party providers ship with built-in adapter code; custom providers use generic transport handlers.

### 2. Four transport modes

| Transport | Direction | Trigger | Use Case |
|-----------|-----------|---------|----------|
| `poll` | Pull | Cron schedule | Gmail, Outlook, Xero (API polling) |
| `webhook` | Push | HTTP POST | Stripe events, Slack events, custom CRMs |
| `bridge` | Push | External script | outlook.py, iMessage bridge, MacBook relay |
| `stream` | Push | Persistent conn | WhatsApp (Baileys), Telegram bot |

All transports normalise into the same **Envelope** before hitting the pipeline.

### 3. Bridge transport for "super ambiguous connectivity"

The `bridge` transport is the escape hatch for anything that doesn't fit poll/webhook/stream. Any language, any source -- just POST an envelope:

```bash
curl -X POST https://app.bitbit.au/api/connections/{connection_id}/ingest \
  -H "Authorization: Bearer {connection_token}" \
  -H "Content-Type: application/json" \
  -d '{"type":"message","sender":{"name":"John","email":"john@example.com"},"subject":"Order shipped","body":"Your order has been shipped...","metadata":{"order_id":"1234"}}'
```

### 4. First-party adapters become "provider plugins"

Existing adapters (`gmail.ts`, `outlook.ts`, etc.) become provider plugins that register themselves:

```typescript
export const outlookProvider: ProviderPlugin = {
  id: 'outlook',
  name: 'Microsoft Outlook',
  category: 'communication',
  auth: { method: 'oauth', scopes: ['Mail.Read', 'Mail.Send'] },
  capabilities: ['pull', 'send', 'webhook'],
  pull: async (connection, since) => { /* existing fetchOutlookMessages */ },
  send: async (connection, envelope) => { /* existing sendOutlookMessage */ },
  webhookParse: async (req) => { /* parse Graph API notification into Envelope */ },
  healthCheck: async (connection) => { /* token validity check */ },
}
```

### 5. Database schema

```sql
CREATE TABLE org_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organisations ON DELETE CASCADE NOT NULL,
  provider text NOT NULL,
  display_name text NOT NULL,
  transport text NOT NULL CHECK (transport IN ('poll','webhook','bridge','stream')),
  capabilities text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','connected','error','disabled')),
  credentials_encrypted text,
  config jsonb NOT NULL DEFAULT '{}',
  poll_interval_seconds int,
  webhook_secret text,
  bridge_token text,
  last_sync_at timestamptz,
  last_error text,
  message_count bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, provider, display_name)
);
```

## Interface Definitions

```typescript
type TransportType = 'poll' | 'webhook' | 'bridge' | 'stream'
type PayloadType = 'message' | 'event' | 'record' | 'signal'
type Capability = 'pull' | 'push' | 'send' | 'webhook' | 'search' | 'delete'

interface Envelope {
  connection_id: string
  org_id: string
  provider: string
  transport: TransportType
  timestamp: string
  dedup_key: string
  payload: {
    type: PayloadType
    sender?: { name?: string; email?: string; phone?: string; external_id?: string }
    subject?: string
    body: string
    body_html?: string
    attachments?: { filename: string; mime_type: string; size_bytes: number; url?: string }[]
    metadata: Record<string, unknown>
  }
}

interface ProviderPlugin {
  id: string
  name: string
  category: string
  auth: { method: 'oauth' | 'api_key' | 'token' | 'bridge' | 'none'; scopes?: string[] }
  capabilities: Capability[]
  pull?: (connection: OrgConnection, since?: Date) => Promise<Envelope[]>
  send?: (connection: OrgConnection, envelope: Envelope) => Promise<void>
  webhookVerify?: (req: Request) => Promise<boolean>
  webhookParse?: (req: Request, connection: OrgConnection) => Promise<Envelope[]>
  healthCheck?: (connection: OrgConnection) => Promise<HealthStatus>
}

class ProviderRegistry {
  private providers = new Map<string, ProviderPlugin>()
  register(plugin: ProviderPlugin): void
  get(id: string): ProviderPlugin | undefined
  list(): ProviderPlugin[]
}
```

## Bridge Example: The "Outlook.py" Pattern

```python
# Any script becomes a connection bridge
import requests

BITBIT_URL = "https://app.bitbit.au/api/connections/{id}/ingest"
TOKEN = "bt_abc123..."

def push_email(msg):
    requests.post(BITBIT_URL, json={
        "type": "message",
        "dedup_key": f"outlook-{msg['id']}",
        "sender": {"name": msg["from_name"], "email": msg["from_email"]},
        "subject": msg["subject"],
        "body": msg["body_text"],
        "metadata": {"outlook_id": msg["id"]},
    }, headers={"Authorization": f"Bearer {TOKEN}"})
```

## Migration Path

| Phase | Scope | Ships Independently |
|-------|-------|---------------------|
| **1** | `org_connections` table + `/api/connections/[id]/ingest` bridge endpoint | Yes |
| **2** | `ProviderPlugin` interface, wrap existing adapters, `ProviderRegistry` | Yes |
| **3** | Dashboard UI for connection management | Yes |
| **4** | Deprecate `ChannelType` union, migrate `channel_configs` | Requires Phase 2 |

## What This Enables

| Scenario | How |
|----------|-----|
| Custom CRM | Bridge: 20-line script to POST records |
| Shopify orders | Webhook: Shopify webhook to connection endpoint |
| Legacy IMAP | Bridge: cron + imaplib + POST envelopes |
| Real-time chat | Stream: existing pattern in provider plugin |
| IoT sensor data | Bridge: device POSTs JSON payloads |
| CSV import | Manual: upload endpoint parses CSV into envelopes |
| Zapier/Make | Webhook: standard URL + bridge token |

## Industry Alignment

Mirrors: **Segment Sources**, **Airbyte Connectors**, **CloudEvents (CNCF)**, **Stripe webhooks**.

| CloudEvents | Envelope |
|-------------|----------|
| `source` | `provider` |
| `type` | `payload.type` |
| `id` | `dedup_key` |
| `data` | `payload` |
| `time` | `timestamp` |

## Open Questions

1. Full CloudEvents compliance? Adds interop but verbosity.
2. Per-connection rate limiting? Current is per-channel-type.
3. Outbound via Envelope? Should `send` use the same format?
4. Connection marketplace for community provider templates?
