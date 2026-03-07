# Conversation Interface Integration Guide

## Files Created

1. **`conversation-interface.ts`** (371 lines)
   - Core abstractions: `ConversationMessage`, `ConversationTransport`, `ConversationRouter`
   - Transport implementations: `WebTransport`, `WhatsAppTransport`, `EmailTransport`, `SMSTransport`, `SlackTransport`
   - Factory function: `createConversationRouter()`

2. **`conversation-interface.test.ts`** (514 lines)
   - 40+ test cases covering all transports
   - Integration scenarios with multi-channel routing
   - Thread context assembly tests

3. **`CONVERSATION-INTERFACE.md`**
   - Architecture and usage documentation
   - Transport implementation guide
   - Database schema requirements

## No Breaking Changes

The conversation interface is **purely additive**:
- ✓ No modifications to `engine.ts`
- ✓ No modifications to `src/app/api/agent/chat/route.ts`
- ✓ No modifications to `tools.ts`
- ✓ No modifications to existing channel adapters
- ✓ Existing chat API continues to work unchanged

## How to Integrate with Existing Chat API

The existing chat route can be refactored to use the router:

```typescript
// BEFORE (src/app/api/agent/chat/route.ts)
export async function POST(request: NextRequest) {
  const { message } = await request.json()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const events = runAgentChat(message, { orgId: profile.org_id, supabase })
      for await (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
    },
  })

  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
}

// AFTER (using ConversationRouter)
import { createConversationRouter } from '@/lib/agent/conversation-interface'

export async function POST(request: NextRequest) {
  const { message } = await request.json()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const router = createConversationRouter(supabase, controller)
      const msg = {
        id: `msg_${Date.now()}`,
        content: message,
        role: 'user',
        channel: 'web',
        metadata: { userId: user.id, orgId: profile.org_id, threadId: user.id },
        timestamp: new Date(),
      }
      await router.handleMessage(msg, { skipCostGuard: true })
    },
  })

  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
}
```

## Multi-Channel Implementation Examples

### WhatsApp Integration

```typescript
// Incoming WhatsApp message webhook
import { ConversationRouter, ConversationMessage } from '@/lib/agent/conversation-interface'

export async function handleWhatsAppWebhook(payload: any, supabase: SupabaseClient) {
  const router = createConversationRouter(supabase)

  const message: ConversationMessage = {
    id: payload.messages[0].id,
    content: payload.messages[0].text?.body || '',
    role: 'user',
    channel: 'whatsapp',
    metadata: {
      userId: payload.contacts[0].wa_id,
      orgId: 'org_id_from_auth', // Look up org from user
      threadId: payload.contacts[0].wa_id,
    },
    timestamp: new Date(),
  }

  await router.handleMessage(message)
}
```

### Email Integration

```typescript
// Process incoming email command
import { ConversationRouter, ConversationMessage } from '@/lib/agent/conversation-interface'

export async function handleEmailCommand(
  email: {
    from: string
    subject: string
    body: string
    attachments?: Array<{ filename: string; data: Buffer }>
  },
  supabase: SupabaseClient
) {
  const router = createConversationRouter(supabase)

  const attachments = email.attachments?.map(a => ({
    type: 'email_attachment',
    url: `s3://attachments/${a.filename}`,
    name: a.filename,
  }))

  const message: ConversationMessage = {
    id: `email_${Date.now()}`,
    content: `Subject: ${email.subject}\n\n${email.body}`,
    role: 'user',
    channel: 'email',
    metadata: {
      userId: email.from, // Or look up user by email
      orgId: 'org_id_from_auth',
      threadId: email.from,
      attachments,
    },
    timestamp: new Date(),
  }

  await router.handleMessage(message)
}
```

### Slack DM Handler

```typescript
// Process Slack DM
import { SlackTransport, ConversationMessage } from '@/lib/agent/conversation-interface'

export async function handleSlackDM(event: any, supabase: SupabaseClient) {
  const router = createConversationRouter(supabase)

  // Register Slack transport with token
  const slackTransport = new SlackTransport()
  router.registerTransport('slack', slackTransport)

  const message: ConversationMessage = {
    id: event.client_msg_id,
    content: event.text,
    role: 'user',
    channel: 'slack',
    metadata: {
      userId: event.user,
      orgId: 'org_id_from_workspace',
      threadId: event.channel, // Slack channel/DM ID
    },
    timestamp: new Date(),
  }

  await router.handleMessage(message)
}
```

## Extending with New Transports

Create a custom transport by implementing `ConversationTransport`:

```typescript
import { ConversationTransport, AgentResponse } from '@/lib/agent/conversation-interface'

export class TelegramTransport implements ConversationTransport {
  channel = 'telegram'
  private botToken: string
  private telegramApi = 'https://api.telegram.org'

  constructor(botToken: string) {
    this.botToken = botToken
  }

  async sendMessage(threadId: string, content: string): Promise<void> {
    await fetch(`${this.telegramApi}/bot${this.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: threadId,
        text: content,
        parse_mode: 'Markdown',
      }),
    })
  }

  formatResponse(agentResponse: AgentResponse): string {
    if (agentResponse.type === 'error') {
      return `*Error*: ${agentResponse.content}`
    }
    return agentResponse.content.substring(0, 4096) // Telegram limit
  }
}

// Register it
const router = createConversationRouter(supabase)
router.registerTransport('telegram', new TelegramTransport(process.env.TELEGRAM_BOT_TOKEN))
```

## Database Setup

The router assumes a `conversation_threads` table. Create it with:

```sql
CREATE TABLE IF NOT EXISTS conversation_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  channel text NOT NULL CHECK (channel IN ('web', 'email', 'sms', 'whatsapp', 'slack')),
  content text NOT NULL,
  metadata jsonb DEFAULT '{}',
  timestamp timestamptz NOT NULL DEFAULT now(),
  UNIQUE(thread_id, id)
);

CREATE INDEX idx_conversation_threads_thread_id ON conversation_threads(thread_id);
CREATE INDEX idx_conversation_threads_user_id ON conversation_threads(user_id);
CREATE INDEX idx_conversation_threads_org_id ON conversation_threads(org_id);
CREATE INDEX idx_conversation_threads_timestamp ON conversation_threads(timestamp DESC);
```

## Design Principles

1. **Decoupling**: Message handling separate from transport
2. **Normalization**: All channels map to common `ConversationMessage` format
3. **Extensibility**: New transports added without modifying existing code
4. **No coupling to engine**: Router doesn't know about tools, models, or agent internals
5. **Streaming**: Real-time responses without buffering
6. **History**: Thread context automatically assembled from conversation history

## Testing

Run the test suite:

```bash
npm test src/lib/agent/conversation-interface.test.ts
```

Test coverage includes:
- All transport formatting and sending
- Message normalization from each channel
- Thread context assembly
- Router delegation to transports
- Multi-channel response routing
- Integration scenarios
- Error handling

## Future Enhancements

Potential extensions (outside scope of this task):

1. **Message approval queue**: Store responses in approval table before sending
2. **Formatting templates**: Per-channel response templates
3. **Context enrichment**: Auto-load relevant entities before calling agent
4. **Rate limiting**: Per-channel rate limits
5. **Analytics**: Track messages by channel and user
6. **Translation**: Auto-translate responses to user's preferred language
7. **Attachment handling**: Download/upload files from channels
