# Sendblue iMessage Channel — Design Spec

**Date:** 2026-04-05
**Status:** Approved
**Goal:** Give BitBit its own iMessage identity so users can text BitBit and get AI-powered responses via blue bubble iMessages.

## Context

BitBit currently has no production iMessage capability. The existing `imessage.ts` adapter reads the *user's own* messages via SSH to a MacBook — a dev-only hack that can't scale.

Lindy.ai, Poke, and Linq all solve this the same way: a commercial iMessage API (Sendblue) that manages Apple hardware in the cloud. Users text a phone number, messages arrive via webhook, the AI responds, and the reply goes back as a blue bubble iMessage.

This spec adds Sendblue as an inbound/outbound messaging channel — following the Telegram pattern (webhook → TAOR agent loop → send response).

## Architecture

```
User sends iMessage to BitBit's number
  → Apple iMessage servers
  → Sendblue cloud infrastructure (Mac hardware)
  → POST /api/webhooks/sendblue (webhook)
  → Verify auth headers
  → Resolve sender → contact + org
  → Store in channel_messages (channel='sendblue', direction='inbound')
  → Run TAOR agent loop in background (after() pattern)
  → Collect response text
  → POST https://api.sendblue.co/api/send-message
  → Sendblue → Apple → User receives blue bubble reply
```

## Sendblue API Reference

### Authentication
Every request requires two headers:
- `sb-api-key-id` — API key
- `sb-api-secret-key` — API secret

### Send Message
```
POST https://api.sendblue.co/api/send-message
Content-Type: application/json

{
  "number": "+61400699890",        // recipient (E.164)
  "from_number": "+1XXXXXXXXXX",   // BitBit's Sendblue number
  "content": "Hey! Here's what I found...",
  "status_callback": "https://bitbit.app/api/webhooks/sendblue/status"
}
```

Required: `number`, `from_number`. At least one of `content` or `media_url`.
Max content length: 18,996 characters.

### Receive Message (Webhook)
Sendblue POSTs to a configured webhook URL:
```json
{
  "from_number": "+61400699890",
  "to_number": "+1XXXXXXXXXX",
  "content": "Hey BitBit, what's on my calendar today?",
  "media_url": null,
  "service": "iMessage",
  "group_id": null,
  "date_sent": "2026-04-05T12:30:00Z"
}
```

Webhook must respond with HTTP 2xx.

### Status Callback
Delivery status updates POSTed to `status_callback` URL (if provided).

## Components

### 1. Webhook Route — `src/app/api/webhooks/sendblue/route.ts`

Handles inbound iMessages from Sendblue.

**Flow:**
1. Verify request has valid Sendblue auth headers (`sb-api-key-id` matches env)
2. Parse JSON body
3. Ignore messages from BitBit's own number (echo prevention)
4. Resolve sender identity via `resolveChannelIdentity()` using `from_number`
5. Resolve org from channel_connections or fall back to default org
6. Upsert into `channel_messages` with dedup on `(org_id, 'sendblue', external_id)`
7. Fire-and-forget: `enrichInboundMessage()` for entity resolution + timeline
8. Return 200 immediately
9. In `after()`: run `handleSendblueMessage()` for agent processing

**Auth verification:** Compare incoming `sb-api-key-id` header against `SENDBLUE_API_KEY` env var. Sendblue doesn't support HMAC webhook signatures — header matching is the verification method.

### 2. Sendblue Client — `src/lib/channels/sendblue.ts`

Thin wrapper around the Sendblue REST API.

```typescript
export async function sendSendblueMessage(
  to: string,
  content: string,
): Promise<{ success: boolean; messageId?: string; error?: string }>

export async function isSendblueConfigured(): boolean
```

- Auth via `sb-api-key-id` + `sb-api-secret-key` headers
- `from_number` from `SENDBLUE_FROM_NUMBER` env var
- `status_callback` pointing to `/api/webhooks/sendblue/status` (optional, future)
- Phone number normalization: strip spaces, ensure E.164 with `+` prefix
- Error handling: return `{ success: false, error }` on API failure, don't throw

### 3. Message Handler — `src/lib/channels/sendblue-handler.ts`

Mirrors `telegram-handler.ts`. Runs the full TAOR agent loop and sends the response back.

```typescript
export async function handleSendblueMessage(
  orgId: string,
  fromNumber: string,
  text: string,
  messageId: string,
): Promise<void>
```

**Flow:**
1. Build `EngineConfig` with orgId, supabase, skipCostGuard: true
2. Call `runAgentChat(text, engineConfig)`
3. Iterate events, collect `event.type === 'message'` content
4. Call `sendSendblueMessage(fromNumber, responseText)`
5. Store outbound message in `channel_messages` (direction='outbound')
6. On error: send "Something went wrong, try again" via Sendblue

### 4. Environment Variables

```env
SENDBLUE_API_KEY=sb-api-key-XXXXX
SENDBLUE_API_SECRET=XXXXX
SENDBLUE_FROM_NUMBER=+1XXXXXXXXXX
```

### 5. Channel Connection Seed

Insert a `channel_connections` row:
```sql
INSERT INTO channel_connections (org_id, channel_type, status, config)
VALUES (
  '7abcbfb1-67e5-4a3b-aa08-a17cfd2867e9',
  'sendblue',
  'connected',
  '{"transport": "sendblue-api"}'
);
```

### 6. Channel Type Registration

Add `'sendblue'` to the `ChannelType` union in `src/lib/channels/types.ts`.

## What This Does NOT Include

- **Relay daemon registration** — Sendblue is push-based (webhooks), not pull-based. No polling needed.
- **Read receipts / typing indicators** — Future enhancement.
- **Media/attachment handling** — Text-only for v1. `media_url` logged in metadata but not processed.
- **Group messaging** — Single-user conversations only for v1.
- **Agent tool for proactive sending** — A `send_imessage` tool could be added later, but v1 is reactive (user texts first, BitBit responds).
- **Conversation state machine** — Unlike WhatsApp's command parser, this uses the full TAOR loop for natural conversation. No structured intent parsing.
- **SMS fallback** — Sendblue handles iMessage→SMS fallback automatically if the recipient doesn't have iMessage.

## File Summary

| File | Purpose | Lines (est.) |
|------|---------|-------------|
| `src/app/api/webhooks/sendblue/route.ts` | Webhook endpoint | ~120 |
| `src/lib/channels/sendblue.ts` | API client (send) | ~60 |
| `src/lib/channels/sendblue-handler.ts` | Agent loop + response | ~80 |
| `src/lib/channels/types.ts` | Add 'sendblue' to ChannelType | ~1 line change |

Total: ~260 lines of new code + 1 type change.

## Testing

1. Set Sendblue webhook URL to `https://<tunnel>/api/webhooks/sendblue`
2. Text BitBit's number from a phone
3. Verify: message stored in `channel_messages`, agent responds, reply arrives as iMessage
4. Verify: echo prevention (messages from BitBit's own number ignored)
5. Verify: unknown sender creates/resolves contact
