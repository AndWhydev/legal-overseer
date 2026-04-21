---
epic: B1
title: Sent Message Capture
status: scoped
scoped: 2026-04-18
owner: unassigned
blocks:
  - Phase 47 (Theory of Mind + Temporal Reasoning) — belief ledger completeness
  - Phase 46 response_latency metric — currently deferred (anomaly-detector TODO)
  - FEATURES.md "Exposure tracking on outbound"
  - FEATURES.md "Information gap detection" (transitively)
depends_on:
  - channel_messages.direction column (already live — 20260329100000)
  - knowledge_log WAL signal_type='message' (already live)
---

# Epic B1: Sent Message Capture

## Purpose

BitBit must record every outbound message (email, WhatsApp, iMessage, SMS,
Slack, Telegram) in the same table + WAL that captures inbound messages, with
`direction='outbound'` and enough structure to answer:

> "When did BitBit tell entity X about fact Y, on which channel?"

Without this, the per-entity belief ledger in Phase 47 is missing its most
reliable data source — anything *we* said to the entity. Phase 47 can't build
information-gap detection on top of an inbound-only feed.

## Current State (as of 2026-04-18)

| Concern | State |
| --- | --- |
| `channel_messages.direction` column | **Live.** Defaults to `'inbound'`. Migration `20260329100000_add_message_direction.sql`. |
| Outbound rows written | **Partial.** Only `/api/agent/inbox/[id]/reply` persists an outbound row. Other send paths skip it. |
| `knowledge_log` entries for outbound | **None.** `signal_type='message'` entries are inbound-only. |
| Recipient entity resolution | **Per-channel ad-hoc.** No shared helper yet. |
| Fact extraction from outbound content | **Not built.** Belongs to Phase 47 (belief ledger compiler), not B1. |

## Call Sites That Send Without Logging

Confirmed outbound-but-unlogged paths (from `grep dispatchNotification|sendMessage|sendChannelMessage`):

- `src/lib/notifications/dispatcher.ts` — channel-agnostic dispatcher used by
  anomaly-detector, morning-briefing, proactive-alerts, approval-queue
- `src/lib/channels/telegram.ts`, `telnyx-whatsapp.ts`, `baileys-bridge.ts`,
  `sendblue.ts`, `sms.ts` — per-channel senders
- `src/lib/agent/tools.ts` + role action-dispatcher — agent-initiated sends
  (send_email, send_whatsapp, send_sms tool variants)
- `src/lib/roles/comms/follow-up-tracker.ts` — follow-up dispatch
- `src/lib/proactive/executor.ts` — proactive rule-triggered sends

The shape of what each path already knows (org_id, channel, recipient, body,
external_id from the provider's ack) is mostly uniform — they just drop it on
the floor after the send succeeds.

## Data Model

No schema changes required. Both tables are ready.

**`channel_messages`** — existing row, set:
- `direction='outbound'`
- `sender` = BitBit's identifier for the channel (email address, WhatsApp
  number, etc.)
- `sender_email` = org's email when channel is email (already used for inbound)
- `received_at` = send timestamp (reused as "message timestamp", matches
  existing semantics)
- `external_id` = provider's message ID when available (Telnyx msg id, Gmail
  message-id header, etc.); fallback to `outbound-{org}-{uuid}` only when the
  provider doesn't return one
- `metadata.recipient` = entity identifier (email / phone / handle)
- `metadata.recipient_entity_id` = resolved `entity_nodes.id` when the
  recipient matches a known entity; null otherwise
- `metadata.sent_by` = `'agent'` (agent-initiated) | `'user'` (user-typed
  reply via inbox) | `'proactive'` (rule-triggered) | `'delegated'` (delegated
  action)

**`knowledge_log`** — emit one entry per successful outbound send:
- `signal_type='message'` (same as inbound — downstream consolidation already
  handles this type)
- `entity_ids` = `[recipient_entity_id]` when resolved, else `[]`
- `content` = message body prefixed with a direction marker so intake-clerk
  can parse it out during fact extraction:
  `'[outbound to {entity_name}] {body}'`
- `confidence` = 0.95 (we know with high confidence what we sent)
- `source_memory_id` = null (not from memory)
- `source_thread_id` = conversation thread id when available

## Implementation Plan

Three waves, roughly two days of work.

### B1-01 — Shared helper + dispatcher hook (half-day)

Create `src/lib/channels/outbound-recorder.ts`:

```typescript
export async function recordOutbound(
  supabase: SupabaseClient,
  params: {
    orgId: string
    channel: ChannelType
    recipient: string                 // email/phone/handle
    recipientEntityId?: string | null
    body: string
    sender: string
    externalId?: string
    sentBy: 'agent' | 'user' | 'proactive' | 'delegated'
    threadId?: string
  },
): Promise<{ messageId: string | null }>
```

Writes both the `channel_messages` outbound row and the `knowledge_log`
entry in a single function. Non-critical: failures warn + return null,
never throw (must not break the send flow).

Wire it into `dispatcher.ts` as an awaited step after successful dispatch.
Every notification/alert type flows through here.

### B1-02 — Per-channel sender adoption (half-day)

Call `recordOutbound` from the remaining direct senders that bypass the
dispatcher:

- `channels/telegram.ts`, `telnyx-whatsapp.ts`, `baileys-bridge.ts`,
  `sendblue.ts`, `sms.ts`
- Agent tool sends (`tools.ts` send_email / send_sms / send_whatsapp)
- `proactive/executor.ts`
- `roles/comms/follow-up-tracker.ts`
- Fold the one-off insert at `api/agent/inbox/[id]/reply/route.ts:184`
  through the helper so the shape stays consistent

### B1-03 — Recipient entity resolution (half-day)

Add `src/lib/knowledge-graph/resolve-entity-by-contact.ts`:

```typescript
export async function resolveEntityByContact(
  supabase: SupabaseClient,
  orgId: string,
  channel: ChannelType,
  identifier: string,  // email, phone, handle
): Promise<EntityNode | null>
```

Checks `entity_aliases` for a match on the contact string. The helper is
the one dependency Phase 47 will layer its fact-extraction step on top of
— without an `entity_id` on the outbound row, exposure tracking has
nothing to join against.

## Explicit Non-Goals

These belong to Phase 47 or later, not B1:

1. **Fact extraction from outbound content.** B1 records *that* we said
   something to someone; Phase 47 extracts *what facts* were communicated
   and writes them to the belief ledger.
2. **Belief ledger schema.** Phase 47 creates `entity_beliefs` (or extends
   `entity_dossiers.schema_json` with a `known_facts[]` section) on top of
   B1 data.
3. **Retroactive backfill.** B1 captures from the point it ships forward.
   Historical sent messages remain unrecovered — acceptable because the
   belief ledger's signal ages out quickly anyway (PITFALLS.md notes
   14-day decay).

## Minimum For Phase 47 to Proceed

Phase 47 can start *planning* as soon as B1 is scoped (this doc). Phase 47
execution needs B1-01 and B1-03 landed — B1-02 can lag the non-critical
channels without blocking initial ToM work, since B1-01 covers the
dispatcher (which is the highest-volume path).

## Risk Notes

- **Double-write amplification.** Every outbound send now does +1 DB write
  to channel_messages and +1 WAL entry. At current volume this is fine;
  flag if daily brain-consolidation runtime approaches the Phase 45 budget
  (see `project_brain-infra-scale-triggers.md`).
- **External ID fallbacks.** If a provider doesn't return a message ID
  within the send call (rare but happens on fire-and-forget SMS), the
  generated `outbound-{uuid}` external_id breaks idempotency against
  provider-side delivery receipt webhooks. Acceptable — the receipt flow
  can fuzzy-match on (channel, recipient, sent_at ± 5s, body_hash).
- **RLS.** `channel_messages` RLS is permissive (`FOR ALL USING (true)`)
  in migration 004. Outbound rows inherit that — revisit only if org
  isolation becomes a concern (not a B1 problem).
