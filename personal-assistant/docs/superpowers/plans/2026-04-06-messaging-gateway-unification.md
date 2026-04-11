# Messaging Gateway Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Unify Telegram, WhatsApp, and Sendblue gateways to route through UnifiedConversationPipeline with full identity, history, and channel-aware persona — matching web chat capabilities.

**Architecture:** All messaging webhooks become thin routing layers: verify auth → resolve phone to user via channel_identities → call UnifiedConversationPipeline.handleMessage() → send response via channel-specific API. WhatsApp command parser removed. New messaging persona module injects channel-aware prompt text. Phone verification endpoint enables self-service linking.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase (Postgres), Anthropic Claude API, Sendblue API, Telegram Bot API, WhatsApp Cloud API.

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/lib/agent/persona/messaging-persona.ts` | Build channel-aware persona prompt text |
| `src/lib/channels/gateway-handler.ts` | Shared gateway response handler (pipeline → channel send) |
| `src/app/api/auth/verify-phone/route.ts` | Phone verification (send code / check code) |

### Modified Files
| File | Change |
|------|--------|
| `src/lib/agent/engine/types.ts` | Add `channel` to EngineConfig |
| `src/lib/agent/prompt-builder.ts` | Inject messaging persona |
| `src/lib/conversation/unified-pipeline.ts` | Pass channel to engine config |
| `src/app/api/channels/telegram/route.ts` | Rewrite to use pipeline + gateway handler |
| `src/app/api/channels/whatsapp/route.ts` | Rewrite to use pipeline + gateway handler |
| `src/app/api/webhooks/sendblue/route.ts` | Rewrite to use pipeline + gateway handler |

### Deleted Files
| File | Reason |
|------|--------|
| `src/lib/channels/telegram-handler.ts` | Replaced by gateway-handler.ts |
| `src/lib/channels/sendblue-handler.ts` | Replaced by gateway-handler.ts |
| `src/lib/whatsapp/conversation-manager.ts` | Replaced by pipeline |
| `src/lib/whatsapp/command-parser.ts` | No longer needed |
| `src/lib/whatsapp/agent-dispatch.ts` | No longer needed |

---

### Task 1: Add `channel` to EngineConfig and Pipeline

**Files:**
- Modify: `src/lib/agent/engine/types.ts`
- Modify: `src/lib/conversation/unified-pipeline.ts`

- [ ] **Step 1: Add channel field to EngineConfig**

In `src/lib/agent/engine/types.ts`, add to the EngineConfig interface after the `userDisplayName` field:

```typescript
  /** Channel the message arrived from (web, sendblue, telegram, whatsapp). */
  channel?: 'web' | 'sendblue' | 'telegram' | 'whatsapp'
```

- [ ] **Step 2: Add channel to InboundMessage type**

Check `src/lib/conversation/types.ts` — the `InboundMessage` interface already has `channel: Channel`. Verify the `Channel` type includes `'sendblue' | 'telegram' | 'whatsapp'`. If not, add them.

- [ ] **Step 3: Pass channel from pipeline to engine config**

In `src/lib/conversation/unified-pipeline.ts`, find the `engineConfig` construction (~line 260). It already spreads `config.engineOverrides`. Add channel explicitly:

```typescript
    const engineConfig: EngineConfig = {
      orgId: identity.orgId,
      supabase: this.supabase,
      skipCostGuard: true,
      agentConfigId: agentConfigId ?? undefined,
      history,
      threadId: threadId || undefined,
      userId: identity.userId,
      userEmail: identity.email,
      userDisplayName: identity.displayName,
      contentBlocks: config.contentBlocks,
      channel: inbound.channel === 'web' ? 'web'
        : inbound.channel === 'sendblue' ? 'sendblue'
        : inbound.channel === 'telegram' ? 'telegram'
        : inbound.channel === 'whatsapp' ? 'whatsapp'
        : 'web',
      ...config.engineOverrides,
    }
```

- [ ] **Step 4: Verify compilation**

```bash
cd /home/claude/bitbit/personal-assistant
# Turbopack will check on next request — trigger a compile:
curl -s -m 30 http://localhost:3000/api/cron/scheduler > /dev/null
tail -5 /tmp/bitbit-dev.log
```

Expected: No TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/engine/types.ts src/lib/conversation/unified-pipeline.ts
git commit -m "feat: add channel field to EngineConfig for channel-aware prompts"
```

---

### Task 2: Messaging Persona Module

**Files:**
- Create: `src/lib/agent/persona/messaging-persona.ts`
- Modify: `src/lib/agent/prompt-builder.ts`

- [ ] **Step 1: Create messaging persona module**

Create `src/lib/agent/persona/messaging-persona.ts`:

```typescript
/**
 * Messaging Persona Module
 *
 * Injects channel-aware behavioral rules into the system prompt when
 * BitBit is responding via a messaging gateway (iMessage, WhatsApp, Telegram).
 * Web chat uses the default prompt with no messaging persona.
 */

export interface MessagingPersonaContext {
  channel: 'sendblue' | 'telegram' | 'whatsapp'
  displayName?: string
}

/**
 * Build messaging persona prompt text. Returns empty string for web channel.
 */
export function buildMessagingPersona(ctx: MessagingPersonaContext): string {
  const channelLabel =
    ctx.channel === 'sendblue' ? 'iMessage'
    : ctx.channel === 'telegram' ? 'Telegram'
    : 'WhatsApp'

  const name = ctx.displayName ? ctx.displayName.split(' ')[0] : 'the user'

  return `
## Messaging Mode (${channelLabel})

You're texting with ${name} right now. This changes how you communicate:

### Voice
- Text like a real person. Short messages. Casual. No formalities.
- You're BitBit — not "an AI assistant." Never break character.
- Match their energy. If they text one word, you can reply with one word.
- Use lowercase freely. Punctuation is optional. Emojis sparingly and only if they use them first.

### Format
- NO markdown. No bullet points. No headers. No tables. No code blocks.
- If you'd normally make a list, just say it in a sentence or two.
- If data would be a table on web, describe it naturally: "Steve owes us $400, Maya paid her $500 last week"
- Never use asterisks for bold or formatting of any kind.

### Length
- Default to 1-3 sentences. That's a text message.
- If the answer is genuinely complex, give the short version. Then ask "want me to break it down more?"
- Never send a wall of text. If you must go longer, split into 2-3 natural chunks.

### Personality
- You're a sharp friend who happens to know everything about their business.
- Be direct. Be useful. Be fast.
- If something is done, say "done" — don't describe what you did.
- If something went wrong, say what happened plainly — no apology paragraphs.
- Reference past conversations naturally when relevant: "like that invoice thing last week"
- You can be proactive: "heads up, you've got that meeting with Steve in 20 min"

### Tool Results
- When a tool returns structured data, translate it to how a person would text it.
- "Steve paid the $200 invoice just now" not "Invoice INV-2024-003 status: paid, amount: $200.00"
- "3 emails, nothing urgent" not "You have 3 unread emails in your inbox"
- "calendar's clear today" not "No upcoming events found for today"
`
}
```

- [ ] **Step 2: Inject persona into prompt-builder.ts**

In `src/lib/agent/prompt-builder.ts`, add the import at the top:

```typescript
import { buildMessagingPersona } from './persona/messaging-persona'
```

Find where the system prompt sections are assembled (after `BITBIT_IDENTITY_PREAMBLE` is used). Add the messaging persona injection. Search for where `engineConfig` or `config` is referenced and the system prompt string is being built. Insert after the identity preamble:

```typescript
// Messaging persona injection (channel-aware)
const messagingChannel = engineConfig?.channel
if (messagingChannel && messagingChannel !== 'web') {
  sections.push(buildMessagingPersona({
    channel: messagingChannel as 'sendblue' | 'telegram' | 'whatsapp',
    displayName: engineConfig?.userDisplayName,
  }))
}
```

The exact insertion point depends on how `prompt-builder.ts` assembles sections — it may use an array of strings joined, or concatenation. Follow the existing pattern.

- [ ] **Step 3: Verify prompt builder compiles**

```bash
curl -s -m 30 http://localhost:3000/api/cron/scheduler > /dev/null
tail -3 /tmp/bitbit-dev.log
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/persona/messaging-persona.ts src/lib/agent/prompt-builder.ts
git commit -m "feat: add messaging persona module for channel-aware prompts"
```

---

### Task 3: Shared Gateway Response Handler

**Files:**
- Create: `src/lib/channels/gateway-handler.ts`

- [ ] **Step 1: Create the gateway handler**

This is the shared function all messaging webhooks call after resolving identity. It runs the pipeline and sends the response back via the channel-specific send function.

Create `src/lib/channels/gateway-handler.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'
import { UnifiedConversationPipeline } from '@/lib/conversation/unified-pipeline'
import { sendTelegramMessage } from './telegram'
import { sendSendblueMessage } from './sendblue'
import { sendWhatsAppTextMessage } from './whatsapp'
import { logger } from '@/lib/core/logger'

type GatewayChannel = 'sendblue' | 'telegram' | 'whatsapp'

interface GatewayRequest {
  channel: GatewayChannel
  /** Resolved user identity */
  identity: {
    userId: string
    orgId: string
    email?: string
    displayName?: string
  }
  /** Message text */
  text: string
  /** Channel-specific reply address (phone number or chat ID) */
  replyTo: string
  /** Optional thread ID for conversation continuity */
  threadId?: string
}

const SEND_FN: Record<GatewayChannel, (to: string, text: string) => Promise<unknown>> = {
  sendblue: (to, text) => sendSendblueMessage(to, text),
  telegram: (to, text) => sendTelegramMessage(to, text),
  whatsapp: (to, text) => sendWhatsAppTextMessage(to, text),
}

const ERROR_MSG = "something went wrong on my end, try again in a sec"

/**
 * Run the full conversation pipeline for a messaging gateway and send
 * the response back via the channel-specific send function.
 */
export async function handleGatewayMessage(req: GatewayRequest): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    logger.error(`[gateway/${req.channel}] Missing Supabase env vars`)
    await SEND_FN[req.channel](req.replyTo, ERROR_MSG)
    return
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const pipeline = new UnifiedConversationPipeline(supabase)

  try {
    const events = pipeline.handleMessage(
      {
        content: req.text,
        channel: req.channel,
      },
      {
        supabase,
        identity: req.identity,
        threadId: req.threadId,
      },
    )

    let responseText = ''
    for await (const event of events) {
      if (event.type === 'message') {
        responseText = event.data
      }
    }

    if (responseText) {
      await SEND_FN[req.channel](req.replyTo, responseText)
    } else {
      await SEND_FN[req.channel](req.replyTo, "processed that but didn't have anything to say back")
    }
  } catch (error) {
    logger.error(`[gateway/${req.channel}] Handler error:`, error)
    await SEND_FN[req.channel](req.replyTo, ERROR_MSG)
  }
}
```

- [ ] **Step 2: Verify the WhatsApp send function export exists**

Check `src/lib/channels/whatsapp.ts` for a function that sends a text message. It may be called `sendMessage`, `sendWhatsAppMessage`, or similar. If the export name differs from `sendWhatsAppTextMessage`, update the import in `gateway-handler.ts` to match.

```bash
grep -n "export.*function.*send" src/lib/channels/whatsapp.ts | head -5
```

Update the import in the gateway handler to use the actual function name.

- [ ] **Step 3: Commit**

```bash
git add src/lib/channels/gateway-handler.ts
git commit -m "feat: add shared gateway handler for messaging channels"
```

---

### Task 4: Rewrite Sendblue Webhook

**Files:**
- Modify: `src/app/api/webhooks/sendblue/route.ts`
- Delete: `src/lib/channels/sendblue-handler.ts`

- [ ] **Step 1: Rewrite the Sendblue webhook route**

Replace the entire contents of `src/app/api/webhooks/sendblue/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { handleGatewayMessage } from '@/lib/channels/gateway-handler'
import { resolveChannelIdentity } from '@/lib/conversation/identity-resolver'
import { sendSendblueMessage } from '@/lib/channels/sendblue'
import { after } from 'next/server'
import { logger } from '@/lib/core/logger'

export const maxDuration = 60

const OPEN_REGISTRATION = process.env.SENDBLUE_OPEN_REGISTRATION === 'true'

interface SendblueWebhook {
  from_number: string
  to_number: string
  content: string
  media_url?: string
  service?: string
  group_id?: string | null
  date_sent?: string
  message_handle?: string
  status?: string
  error_code?: string | null
}

export async function POST(request: NextRequest) {
  let body: SendblueWebhook
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  // Status callback — log and return
  if (body.status && !body.content) {
    logger.info('[webhook/sendblue] Status update', { status: body.status, to: body.to_number })
    return NextResponse.json({ ok: true })
  }

  const fromNumber = body.from_number
  const content = body.content
  if (!fromNumber || !content) return NextResponse.json({ ok: true })

  // Echo prevention
  const ourNumber = process.env.SENDBLUE_FROM_NUMBER
  if (ourNumber && fromNumber === ourNumber) return NextResponse.json({ ok: true })

  // Resolve identity
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) return NextResponse.json({ ok: false }, { status: 503 })

  const supabase = createClient(supabaseUrl, supabaseKey)

  const identity = await resolveChannelIdentity(supabase, {
    channelType: 'sms',
    channelIdentifier: fromNumber,
  })

  if (!identity) {
    // Unknown user
    if (OPEN_REGISTRATION) {
      await sendSendblueMessage(fromNumber, "hey! I don't recognize this number yet. what's your email so I can link you up?")
    } else {
      await sendSendblueMessage(fromNumber, "hey, I'm not set up for new numbers just yet. check back soon!")
    }
    return NextResponse.json({ ok: true })
  }

  // Run pipeline in background
  after(async () => {
    try {
      await handleGatewayMessage({
        channel: 'sendblue',
        identity: {
          userId: identity.userId,
          orgId: identity.orgId,
          email: identity.email,
          displayName: identity.displayName,
        },
        text: content,
        replyTo: fromNumber,
      })
    } catch (err) {
      logger.error('[sendblue] Gateway error', { error: err instanceof Error ? err.message : String(err) })
    }
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Delete the old handler**

```bash
rm src/lib/channels/sendblue-handler.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/webhooks/sendblue/route.ts
git rm src/lib/channels/sendblue-handler.ts
git commit -m "refactor: sendblue webhook routes through unified pipeline"
```

---

### Task 5: Rewrite Telegram Webhook

**Files:**
- Modify: `src/app/api/channels/telegram/route.ts`
- Delete: `src/lib/channels/telegram-handler.ts`

- [ ] **Step 1: Rewrite the Telegram webhook route**

Replace the entire contents of `src/app/api/channels/telegram/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { handleGatewayMessage } from '@/lib/channels/gateway-handler'
import { resolveChannelIdentity } from '@/lib/conversation/identity-resolver'
import { timingSafeCompare } from '@/lib/security/webhook-verification'
import { sendTelegramMessage } from '@/lib/channels/telegram'
import { after } from 'next/server'
import { logger } from '@/lib/core/logger'

export const maxDuration = 60

interface TelegramUpdate {
  message?: {
    message_id: number
    chat: { id: number }
    from?: { id: number; first_name?: string; username?: string }
    text?: string
  }
}

export async function POST(request: NextRequest) {
  // Verify webhook secret
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (expectedSecret) {
    const secret = request.headers.get('x-telegram-bot-api-secret-token')
    if (!secret || !timingSafeCompare(secret, expectedSecret)) {
      return NextResponse.json({ ok: false }, { status: 403 })
    }
  }

  let update: TelegramUpdate
  try {
    update = await request.json()
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const message = update.message
  if (!message?.text) return NextResponse.json({ ok: true })

  const chatId = String(message.chat.id)
  const text = message.text
  const senderName = message.from?.first_name || message.from?.username || chatId

  // Resolve identity
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) return NextResponse.json({ ok: false }, { status: 503 })

  const supabase = createClient(supabaseUrl, supabaseKey)

  const identity = await resolveChannelIdentity(supabase, {
    channelType: 'telegram' as any,
    channelIdentifier: chatId,
  })

  if (!identity) {
    // Fall back to resolveOrgFromWebhook for backwards compat
    const { resolveOrgFromWebhook } = await import('@/lib/core/resolve-org')
    const orgId = await resolveOrgFromWebhook('telegram', chatId)
    if (!orgId) {
      await sendTelegramMessage(chatId, "I don't recognize this chat yet. Link your Telegram in BitBit settings first.")
      return NextResponse.json({ ok: true })
    }

    // Run with org-only identity (no user — legacy path)
    after(async () => {
      try {
        await handleGatewayMessage({
          channel: 'telegram',
          identity: { userId: 'system', orgId, displayName: senderName },
          text,
          replyTo: chatId,
        })
      } catch (err) {
        logger.error('[telegram] Gateway error', { error: err instanceof Error ? err.message : String(err) })
      }
    })
    return NextResponse.json({ ok: true })
  }

  after(async () => {
    try {
      await handleGatewayMessage({
        channel: 'telegram',
        identity: {
          userId: identity.userId,
          orgId: identity.orgId,
          email: identity.email,
          displayName: identity.displayName || senderName,
        },
        text,
        replyTo: chatId,
      })
    } catch (err) {
      logger.error('[telegram] Gateway error', { error: err instanceof Error ? err.message : String(err) })
    }
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Delete the old handler**

```bash
rm src/lib/channels/telegram-handler.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/channels/telegram/route.ts
git rm src/lib/channels/telegram-handler.ts
git commit -m "refactor: telegram webhook routes through unified pipeline"
```

---

### Task 6: Rewrite WhatsApp Webhook

**Files:**
- Modify: `src/app/api/channels/whatsapp/route.ts`
- Delete: `src/lib/whatsapp/conversation-manager.ts`
- Delete: `src/lib/whatsapp/command-parser.ts`
- Delete: `src/lib/whatsapp/agent-dispatch.ts`

- [ ] **Step 1: Read the current WhatsApp webhook route**

```bash
cat -n src/app/api/channels/whatsapp/route.ts | head -80
```

Understand the existing webhook verification, message parsing, and media handling (voice transcription). These must be preserved — only the routing changes.

- [ ] **Step 2: Rewrite the WhatsApp webhook route**

Keep: webhook verification (HMAC-SHA256), message parsing, voice note transcription, media download.
Remove: all references to `conversation-manager`, `command-parser`, `agent-dispatch`, `routeIncomingConversation`.
Replace with: identity resolution → `handleGatewayMessage()`.

The exact code depends on the current file's message parsing logic (which handles both text and voice messages). Preserve the message extraction and transcription, but replace the routing:

```typescript
// After extracting messageText from msg.text.body or voice transcription:

const identity = await resolveChannelIdentity(supabase, {
  channelType: 'whatsapp',
  channelIdentifier: senderPhone,
})

if (!identity) {
  // Unknown user — send registration prompt or gated message
  await sendWhatsAppTextMessage(senderPhone, "hey, I don't recognize this number yet. link your WhatsApp in BitBit settings to get started.")
  return NextResponse.json({ ok: true })
}

after(async () => {
  try {
    await handleGatewayMessage({
      channel: 'whatsapp',
      identity: {
        userId: identity.userId,
        orgId: identity.orgId,
        email: identity.email,
        displayName: identity.displayName || contactName,
      },
      text: messageText,
      replyTo: senderPhone,
    })
  } catch (err) {
    logger.error('[whatsapp] Gateway error', { error: err instanceof Error ? err.message : String(err) })
  }
})
```

- [ ] **Step 3: Delete the old WhatsApp command system**

```bash
rm src/lib/whatsapp/conversation-manager.ts
rm src/lib/whatsapp/command-parser.ts
rm src/lib/whatsapp/agent-dispatch.ts
```

Check for other files in `src/lib/whatsapp/` that may import these. Fix any broken imports.

```bash
grep -rn "conversation-manager\|command-parser\|agent-dispatch" src/ --include="*.ts" | grep -v node_modules | grep -v ".next"
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/channels/whatsapp/route.ts
git rm src/lib/whatsapp/conversation-manager.ts src/lib/whatsapp/command-parser.ts src/lib/whatsapp/agent-dispatch.ts
git commit -m "refactor: whatsapp webhook routes through unified pipeline, remove command parser"
```

---

### Task 7: Phone Verification Endpoint

**Files:**
- Create: `src/app/api/auth/verify-phone/route.ts`

- [ ] **Step 1: Create the phone verification endpoint**

Create `src/app/api/auth/verify-phone/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getServiceClient } from '@/lib/supabase/service-client'
import { sendSendblueMessage, isSendblueConfigured } from '@/lib/channels/sendblue'
import { linkChannelIdentity } from '@/lib/conversation/identity-resolver'
import { logger } from '@/lib/core/logger'

// In-memory code store (TTL 10 minutes)
const pendingCodes = new Map<string, { code: string; userId: string; orgId: string; expires: number }>()

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export async function POST(request: NextRequest) {
  const { action, phone, code, userId, orgId, channelType } = await request.json()

  if (action === 'send') {
    if (!phone || !userId || !orgId) {
      return NextResponse.json({ error: 'Missing phone, userId, or orgId' }, { status: 400 })
    }

    const verifyCode = generateCode()
    pendingCodes.set(phone, {
      code: verifyCode,
      userId,
      orgId,
      expires: Date.now() + 10 * 60 * 1000,
    })

    // Send via Sendblue (iMessage) or fall back to noting the code
    if (isSendblueConfigured()) {
      await sendSendblueMessage(phone, `your BitBit verification code is: ${verifyCode}`)
    } else {
      logger.warn('[verify-phone] Sendblue not configured, code:', verifyCode)
    }

    return NextResponse.json({ sent: true })
  }

  if (action === 'verify') {
    if (!phone || !code) {
      return NextResponse.json({ error: 'Missing phone or code' }, { status: 400 })
    }

    const pending = pendingCodes.get(phone)
    if (!pending || Date.now() > pending.expires) {
      return NextResponse.json({ error: 'Code expired or not found' }, { status: 400 })
    }

    if (pending.code !== code) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 400 })
    }

    // Link the phone to the user
    const supabase = getServiceClient()
    const record = await linkChannelIdentity(
      supabase,
      pending.userId,
      pending.orgId,
      { channelType: channelType || 'sms', channelIdentifier: phone },
      { verified: true },
    )

    pendingCodes.delete(phone)

    if (!record) {
      return NextResponse.json({ error: 'Failed to link phone' }, { status: 500 })
    }

    return NextResponse.json({ verified: true, identityId: record.id })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
```

- [ ] **Step 2: Add 'telegram' and 'sendblue' to channel_identities CHECK constraint**

The `channel_identities` table CHECK constraint only allows: `'web', 'whatsapp', 'sms', 'email', 'slack', 'imessage'`. Need to add `'telegram'` and `'sendblue'`.

Apply via Supabase Management API:

```bash
curl -s -X POST \
  -H "Authorization: Bearer $(op read 'op://Personal/Supabase Management API PAT/credential')" \
  -H "Content-Type: application/json" \
  -d '{"query": "ALTER TABLE channel_identities DROP CONSTRAINT IF EXISTS channel_identities_channel_type_check; ALTER TABLE channel_identities ADD CONSTRAINT channel_identities_channel_type_check CHECK (channel_type IN ('"'"'web'"'"','"'"'whatsapp'"'"','"'"'sms'"'"','"'"'email'"'"','"'"'slack'"'"','"'"'imessage'"'"','"'"'telegram'"'"','"'"'sendblue'"'"'));"}' \
  "https://api.supabase.com/v1/projects/johvduasrhmufrfdxjus/database/query"
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/verify-phone/route.ts
git commit -m "feat: add phone verification endpoint for messaging gateway linking"
```

---

### Task 8: Add SENDBLUE_OPEN_REGISTRATION env var

**Files:**
- Modify: `.env.local` on studio-server

- [ ] **Step 1: Add the env var**

```bash
echo 'SENDBLUE_OPEN_REGISTRATION="false"' >> .env.local
```

- [ ] **Step 2: Create your channel_identity row**

Link your phone number so you're a verified user on the production path:

```bash
curl -s -X POST \
  -H "Authorization: Bearer $(op read 'op://Personal/Supabase Management API PAT/credential')" \
  -H "Content-Type: application/json" \
  -d '{"query": "INSERT INTO channel_identities (user_id, org_id, channel_type, channel_identifier, display_name, verified, verified_at) VALUES ('"'"'02ce2616-c01b-45a5-a2ad-16ebe936a6b2'"'"', '"'"'7abcbfb1-67e5-4a3b-aa08-a17cfd2867e9'"'"', '"'"'sms'"'"', '"'"'+61480126540'"'"', '"'"'Tor'"'"', true, now()) ON CONFLICT (org_id, channel_type, channel_identifier) DO UPDATE SET verified = true, verified_at = now();"}' \
  "https://api.supabase.com/v1/projects/johvduasrhmufrfdxjus/database/query"
```

- [ ] **Step 3: Commit env template update**

Don't commit `.env.local`. Instead, if there's an `.env.example`, add `SENDBLUE_OPEN_REGISTRATION=` to it.

```bash
git commit -m "chore: document SENDBLUE_OPEN_REGISTRATION env var"
```

---

### Task 9: End-to-End Test

- [ ] **Step 1: Restart dev server to pick up all changes**

```bash
pkill -f 'next dev'; sleep 2
rm -rf .next
nohup npx next dev -p 3000 > /tmp/bitbit-dev.log 2>&1 &
sleep 15
grep "Ready" /tmp/bitbit-dev.log
```

- [ ] **Step 2: Test Sendblue gateway**

```bash
curl -s -m 90 -X POST -H "Content-Type: application/json" \
  -d '{"from_number":"+61480126540","to_number":"+17862139363","content":"hey what have I got on today?","service":"iMessage"}' \
  http://localhost:3000/api/webhooks/sendblue
```

Expected: `{"ok":true}`. Then check logs:

```bash
sleep 20 && grep "sendblue\|gateway\|pipeline\|persona" /tmp/bitbit-dev.log | tail -15
```

Verify:
- Identity resolved (should show userId/displayName)
- Pipeline ran with full context
- Messaging persona was injected
- Response sent via Sendblue API
- Response style is short/casual (not markdown-heavy)

- [ ] **Step 3: Test Telegram gateway**

```bash
# Simulate a Telegram webhook:
curl -s -m 90 -X POST -H "Content-Type: application/json" \
  -d '{"message":{"message_id":1,"chat":{"id":12345},"from":{"id":12345,"first_name":"Test"},"text":"what time is it?"}}' \
  http://localhost:3000/api/channels/telegram
```

Expected: `{"ok":true}`. Check logs for pipeline execution.

- [ ] **Step 4: Test unknown number gating**

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"from_number":"+19999999999","to_number":"+17862139363","content":"hello","service":"iMessage"}' \
  http://localhost:3000/api/webhooks/sendblue
```

Expected: BitBit sends "not set up for new numbers yet" response (since OPEN_REGISTRATION=false).

- [ ] **Step 5: Commit any fixes from testing**

```bash
git add -u
git commit -m "fix: adjustments from end-to-end gateway testing"
```

---

### Task 10: Cleanup

- [ ] **Step 1: Remove any remaining imports of deleted files**

```bash
grep -rn "telegram-handler\|sendblue-handler\|conversation-manager\|command-parser\|agent-dispatch" src/ --include="*.ts" | grep -v node_modules | grep -v ".next"
```

Fix any broken imports found.

- [ ] **Step 2: Final commit**

```bash
git add -u
git commit -m "chore: clean up dead imports from gateway unification"
```
