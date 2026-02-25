# Channel Adapter Guide

How to add a new channel adapter to BitBit. Channel adapters pull messages from external services into the unified inbox.

---

## Architecture

```
Channel Adapter (gmail.ts, outlook.ts, etc.)
  -> implements ChannelAdapter interface
  -> registered in synthesizer.ts
  -> synthesizer pulls, classifies, deduplicates, creates tasks
  -> webhook route receives real-time events
```

---

## Step 1: Implement the ChannelAdapter Interface

Create `personal-assistant/src/lib/channels/my-channel.ts`.

The interface is defined in `types.ts`:

```typescript
export interface ChannelAdapter {
  type: ChannelType          // e.g., 'my-channel'
  name: string               // Human-readable name
  description: string        // Short description
  icon: string               // Emoji icon
  pull: (
    config: Record<string, unknown>,
    since?: Date,
    options?: Record<string, unknown>,
  ) => Promise<ChannelMessage[]>
  isAvailable: () => Promise<boolean>
}
```

Example implementation:

```typescript
import type { ChannelAdapter, ChannelMessage } from './types'

export const myChannelAdapter: ChannelAdapter = {
  type: 'my-channel' as any,  // Add to ChannelType union first
  name: 'My Channel',
  description: 'Pull messages from My Channel',
  icon: '📡',

  async pull(config, since) {
    const apiKey = process.env.MY_CHANNEL_API_KEY
    if (!apiKey) return []

    // Fetch messages from external API
    const response = await fetch('https://api.mychannel.com/messages', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const data = await response.json()

    return data.messages.map((msg: any): ChannelMessage => ({
      id: crypto.randomUUID(),
      channel: 'my-channel' as any,
      externalId: msg.id,
      sender: msg.from.name,
      senderEmail: msg.from.email,
      subject: msg.subject || undefined,
      body: msg.text,
      receivedAt: new Date(msg.timestamp),
      isActionable: false,     // synthesizer will classify
      priority: 'medium',      // synthesizer will re-score
      metadata: { raw: msg },
    }))
  },

  async isAvailable() {
    return Boolean(process.env.MY_CHANNEL_API_KEY)
  },
}
```

---

## Step 2: Add to ChannelType Union

Edit `personal-assistant/src/lib/channels/types.ts`:

```typescript
export type ChannelType =
  | 'gmail' | 'outlook' | 'imessage' | 'calendar' | 'reminders'
  | 'whatsapp' | 'asana' | 'calendly' | 'stripe' | 'gsc'
  | 'my-channel'  // Add here
```

---

## Step 3: Register in Synthesizer

Edit `personal-assistant/src/lib/channels/synthesizer.ts`:

```typescript
import { myChannelAdapter } from './my-channel'

const adapters: Partial<Record<ChannelType, ChannelAdapter>> = {
  gmail: gmailAdapter,
  outlook: outlookAdapter,
  // ...existing adapters...
  'my-channel': myChannelAdapter,  // Add here
}
```

Once registered, the synthesizer handles:
- **Classification:** Keywords-based actionability and priority scoring
- **Deduplication:** Same sender + subject/body dedup
- **Task creation:** Actionable messages become tasks in the "To Do" column
- **Timeline events:** All messages logged to the activity timeline

---

## Step 4: Add a Webhook Route (if applicable)

If the external service sends real-time events, add a webhook:

`personal-assistant/src/app/api/webhooks/my-channel/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  // 1. Verify webhook signature
  const signature = request.headers.get('x-my-channel-signature')
  if (!signature) {
    console.warn('[webhook/my-channel] Unsigned request')
  }

  // 2. Parse payload
  const body = await request.json()

  // 3. Process events
  for (const event of body.events) {
    console.log('[webhook/my-channel]', event.type, event.id)
    // Dispatch to handler or queue
  }

  return NextResponse.json({ received: true, count: body.events.length })
}
```

---

## Step 5: Add Tests

Create `personal-assistant/src/lib/channels/__tests__/my-channel.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { myChannelAdapter } from '../my-channel'

describe('my-channel adapter', () => {
  beforeEach(() => {
    process.env.MY_CHANNEL_API_KEY = 'test-key'
  })

  it('reports available when API key set', async () => {
    expect(await myChannelAdapter.isAvailable()).toBe(true)
  })

  it('reports unavailable when API key missing', async () => {
    delete process.env.MY_CHANNEL_API_KEY
    expect(await myChannelAdapter.isAvailable()).toBe(false)
  })

  it('returns ChannelMessage array from pull', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        messages: [
          { id: 'ext-1', from: { name: 'Alice', email: 'a@b.com' }, text: 'Hello', timestamp: Date.now() },
        ],
      }),
    })

    const messages = await myChannelAdapter.pull({})
    expect(messages).toHaveLength(1)
    expect(messages[0].sender).toBe('Alice')
    expect(messages[0].channel).toBe('my-channel')
  })
})
```

---

## Existing Adapters Reference

| Adapter | File | Auth Mechanism | Real-time |
|---------|------|---------------|-----------|
| Gmail | `gmail.ts` | IMAP (user + app password) | No (poll) |
| Outlook | `outlook.ts` | OAuth2 (Microsoft Graph) | No (poll) |
| iMessage | `imessage.ts` | Local SQLite DB (macOS only) | No (poll) |
| Calendar | `calendar.ts` | Local cache file | No (poll) |
| Reminders | `reminders.ts` | Local cache file | No (poll) |
| WhatsApp | `whatsapp.ts` | Meta Business API | Yes (webhook) |
| Asana | `asana.ts` | PAT or OAuth2 | Yes (webhook) |
| Calendly | `calendly.ts` | API key | Yes (webhook) |
| Stripe | `stripe.ts` | Secret key | Yes (webhook) |
| GSC | `gsc.ts` | Service account JSON | No (poll) |

---

## Message Flow

1. **Poll:** Cron triggers `/api/cron/channel-sync` or `/api/channels/sync`
2. **Pull:** Synthesizer calls `adapter.pull()` for each enabled channel
3. **Classify:** Keywords scored for actionability and priority
4. **Dedup:** Same sender + subject/body prefix deduplication
5. **Store:** Actionable messages create tasks; all messages logged to timeline
6. **Triage:** Channel triage agent further classifies with AI (categories, entity resolution)
7. **Route:** Action router dispatches to appropriate agent based on message type
