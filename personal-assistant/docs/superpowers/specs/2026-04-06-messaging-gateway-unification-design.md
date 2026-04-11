# Messaging Gateway Unification — Design Spec

**Date:** 2026-04-06
**Status:** Approved
**Goal:** Make Telegram, WhatsApp, and Sendblue (iMessage) gateways functionally identical to web chat — same agent capabilities, same conversation continuity, same tools — while adapting BitBit's personality for messaging and supporting multi-user routing from a single number.

## Context

BitBit has four conversation entry points: web chat, Telegram, WhatsApp, and Sendblue (iMessage). Today they are wildly inconsistent:

- **Web chat:** Full identity, 20-message history, all tools, conversation threads, user profile in prompt.
- **Telegram/Sendblue:** Full TAOR agent loop but stateless — no history, no user identity, no thread continuity.
- **WhatsApp:** Deliberately constrained to 8 predefined commands via a separate command parser. No natural conversation. In-memory state lost on restart.

Users should get the same BitBit everywhere. The medium changes, the entity doesn't.

## Design Principles

1. **BitBit is an entity, not an assistant.** Messaging BitBit should feel like texting a sharp friend, not querying a dashboard.
2. **One pipeline, all channels.** Every gateway routes through `UnifiedConversationPipeline`. No per-channel agent logic.
3. **Multi-user from day one.** Architecture supports many users texting the same number, even if registration is gated today.
4. **"Connect" vs "Use BitBit from."** Connecting a channel means BitBit reads your data from it. Using BitBit from a channel means you can text BitBit through it. Two separate concepts.

---

## Section 1: Gateway Engine Parity

### Problem
Telegram, WhatsApp, and Sendblue each have their own handler that calls `runAgentChat()` directly with minimal context. Web chat goes through `UnifiedConversationPipeline` which resolves identity, loads thread history, stores messages, and runs the full engine.

### Solution
All messaging gateways route through `UnifiedConversationPipeline.handleMessage()`. The per-channel handlers (`telegram-handler.ts`, `sendblue-handler.ts`) are removed. The WhatsApp command parser (`conversation-manager.ts`, `command-parser.ts`, `agent-dispatch.ts`) is removed entirely.

Each gateway webhook becomes thin:
1. Verify webhook authenticity (channel-specific)
2. Resolve phone/chat_id → user_id + org_id via `channel_identities`
3. Call `pipeline.handleMessage()` with resolved identity + channel
4. Pipeline returns response text
5. Send response via channel-specific send function (Sendblue API, Telegram Bot API, WhatsApp Cloud API)

### EngineConfig Change
Add `channel?: 'web' | 'sendblue' | 'telegram' | 'whatsapp'` to `EngineConfig`. This propagates to the prompt builder for persona injection and to the pipeline for response formatting decisions.

### Result
All channels get: identity anchoring, conversation history (20 messages), full tool registry (30+ tools), thread continuity, entity resolution, enrichment pipeline, rate limiting.

---

## Section 2: Channel-Aware Response System

### Architecture
A new module `src/lib/agent/persona/messaging-persona.ts` exports:

```typescript
buildMessagingPersona(channel: string, userContext: UserContext): string
```

This returns prompt text injected into the system prompt after the core BitBit identity block, before tool definitions.

### Integration Point
`prompt-builder.ts` calls `buildMessagingPersona()` when `channel !== 'web'`. Web chat keeps its current behavior unchanged. The persona module is stateless — it reads from user context already assembled by the pipeline.

### Inputs
- `channel` — which gateway
- `userContext` — display name, timezone, recent interaction tone, relationship duration, last conversation timestamp

### Messaging Personality (Behavioral Framework)
The actual prompt content — message cadence rules, emotional intelligence, tool result humanization, conversational memory cues, brevity rules, entity voice guidelines — is a **separate task** (prompt engineering work, not architecture). This spec defines only the system that loads and injects it.

### Key Behavioral Goals (for the prompt engineering task)
- BitBit texts like a person: short, casual, no markdown
- Splits long responses into natural message-length chunks
- Reads urgency/mood from message style and adapts
- Humanizes tool results ("Steve paid you $200 just now" not structured data)
- References past conversations naturally
- Can be proactive on messaging ("heads up, meeting in 20 min")
- One-word replies when appropriate ("done", "on it")

---

## Section 3: User Identity & Phone Linking

### Core Mechanism
The `channel_identities` table maps phone numbers to users:

```
phone_number → user_id + org_id + channel_type + verified
```

### Web App Flow ("Link your phone")
1. User enters phone number in settings/onboarding
2. BitBit sends 6-digit verification code via Sendblue (iMessage) or Telnyx (SMS fallback)
3. User enters code on web app
4. Row created in `channel_identities`: phone → user_id + org_id + verified=true
5. User can now text BitBit and be fully recognized

### Text-First Flow (Unknown Phone Texts BitBit)
Gated by `SENDBLUE_OPEN_REGISTRATION` env var (default: `false`).

When **enabled:**
1. Unknown phone texts BitBit
2. No match in `channel_identities`
3. BitBit responds: "Hey! I don't recognize this number yet. What's your email so I can link you up?"
4. User replies with email
5. BitBit checks `profiles` table for matching email
6. If found → sends verification code, confirms, creates `channel_identities` row
7. If not found → "Looks like you don't have a BitBit account yet. Sign up at bitbit.app and I'll be here when you're ready"

When **disabled** (current state, until Sendblue upgraded):
1. Unknown phone texts BitBit
2. BitBit responds: "Hey, I'm not set up for new numbers just yet. Check back soon!"

### Phone Verification Endpoint
New route: `POST /api/auth/verify-phone`
- `{ phone, action: 'send' }` → generates code, sends via Sendblue/Telnyx, stores hashed code with TTL
- `{ phone, code, action: 'verify' }` → checks code, creates `channel_identities` row

---

## Section 4: Multi-User Routing

### One Number, Many Users
All users text the same BitBit number (+17862139363 for iMessage). Sendblue delivers all inbound to the webhook. The webhook resolves sender by phone.

### Routing Logic
1. Look up `from_number` in `channel_identities` where `channel_type` matches
2. **Match + verified** → route to user's org, run pipeline with full identity
3. **Match + unverified** → prompt to complete verification
4. **No match** → text-first registration flow (if enabled) or gated response

### Conversation Isolation
Each user gets their own `conversation_thread` keyed by `(user_id, channel_type)`. The pipeline resolves or creates the thread per sender. User A's iMessage history is completely separate from User B's.

### Response Routing
Response always goes back to `from_number` via the channel-specific send function. No cross-contamination.

---

## Section 5: WhatsApp Handler Replacement

### Removed
- `src/lib/whatsapp/conversation-manager.ts` — in-memory state machine (559 lines)
- `src/lib/whatsapp/command-parser.ts` — Haiku intent classifier
- `src/lib/whatsapp/agent-dispatch.ts` — predefined command handlers

### Replaced By
WhatsApp webhook routes through `UnifiedConversationPipeline` — same as Telegram and Sendblue. Natural conversation, full TAOR, all tools.

### Approval Flows
Previously handled by the WhatsApp state machine. Now handled naturally by the TAOR agent with conversation history — it knows what approval is pending from the thread context. The `approve_action` tool already exists.

---

## Section 6: UI — "Message BitBit From"

### Concept
"Connect {X}" = BitBit reads your data from that channel (existing connections page).
"Use BitBit from {X}" = You can text BitBit through that channel (new).

### Implementation
Minimal. During onboarding or in settings:
- Prompt: "Want to text BitBit? Enter your phone number."
- Verification code flow
- After linking, a single line in settings: "Messages: +61480..." with a small "change" link

No gateway cards, no per-channel status grids, no icons. The user doesn't care about the transport — they just text BitBit.

---

## File Summary

### New Files
| File | Purpose | Est. lines |
|------|---------|-----------|
| `src/lib/agent/persona/messaging-persona.ts` | Messaging persona module (architecture + placeholder) | ~60 |
| `src/app/api/auth/verify-phone/route.ts` | Phone verification (send code / verify code) | ~100 |

### Modified Files
| File | Change |
|------|--------|
| `src/lib/agent/engine/taor-loop.ts` | Pass `channel` through EngineConfig |
| `src/lib/agent/prompt-builder.ts` | Inject messaging persona when channel !== 'web' |
| `src/lib/conversation/unified-pipeline.ts` | Accept channel param, pass identity + channel to engine |
| `src/app/api/webhooks/sendblue/route.ts` | Route through UnifiedConversationPipeline |
| `src/app/api/channels/telegram/route.ts` | Route through UnifiedConversationPipeline |
| `src/app/api/channels/whatsapp/route.ts` | Replace command parser with pipeline route |
| `src/lib/conversation/identity-resolver.ts` | Phone → user_id resolution for gateways |

### Deleted Files
| File | Reason |
|------|--------|
| `src/lib/channels/sendblue-handler.ts` | Logic moves into pipeline |
| `src/lib/channels/telegram-handler.ts` | Logic moves into pipeline |
| `src/lib/whatsapp/conversation-manager.ts` | Replaced by unified pipeline |
| `src/lib/whatsapp/command-parser.ts` | No longer needed |
| `src/lib/whatsapp/agent-dispatch.ts` | No longer needed |

### Out of Scope (Separate Tasks)
- Messaging persona prompt content (prompt engineering)
- Connections UI redesign for "Message BitBit from" section
- Sendblue plan upgrade + `SENDBLUE_OPEN_REGISTRATION=true`
- Telegram bot setup (@BitBitBot username)
- WhatsApp Business API number provisioning for multi-user

### TODO: Sendblue Upgrade
Sendblue is currently on free plan. Upgrade to paid plan needed before enabling open registration (`SENDBLUE_OPEN_REGISTRATION=true`). Currently gated — unknown numbers get a "not set up yet" response. No code changes needed when upgrading, just flip the env var.
