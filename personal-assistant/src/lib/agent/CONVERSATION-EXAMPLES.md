# Conversation Interface - Usage Examples

## Basic Usage - Web Chat

```typescript
import { createConversationRouter } from '@/lib/agent/conversation-interface'
import { createClient } from '@/lib/supabase/server'

export async function handleWebMessage(message: string, userId: string) {
  const supabase = await createClient()

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const router = createConversationRouter(supabase, controller)

      const conversationMessage = {
        id: `msg_${Date.now()}`,
        content: message,
        role: 'user',
        channel: 'web',
        metadata: {
          userId,
          orgId: 'current_org_id', // From auth context
          threadId: userId, // One thread per user
        },
        timestamp: new Date(),
      }

      await router.handleMessage(conversationMessage, {
        skipCostGuard: true,
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
```

## WhatsApp Webhook Handler

```typescript
import { createConversationRouter, ConversationMessage } from '@/lib/agent/conversation-interface'
import { createClient } from '@/lib/supabase/server'

export async function handleWhatsAppWebhook(payload: {
  object: string
  entry: Array<{
    id: string
    changes: Array<{
      value: {
        messages: Array<{
          from: string
          id: string
          text: { body: string }
        }>
        contacts: Array<{ wa_id: string; profile: { name: string } }>
      }
    }>
  }>
}) {
  const supabase = await createClient()
  const router = createConversationRouter(supabase)

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const messages = change.value.messages || []
      const contacts = change.value.contacts || []

      for (const message of messages) {
        const contact = contacts.find(c => c.wa_id === message.from)

        const conversationMessage: ConversationMessage = {
          id: message.id,
          content: message.text.body,
          role: 'user',
          channel: 'whatsapp',
          metadata: {
            userId: message.from, // WhatsApp phone number
            orgId: 'current_org_id', // From webhook signature verification
            threadId: message.from, // One thread per phone
          },
          timestamp: new Date(),
        }

        await router.handleMessage(conversationMessage)
        console.log(`WhatsApp from ${contact?.profile?.name || message.from}: ${message.text.body}`)
      }
    }
  }
}
```

## Email Command Handler

```typescript
import { createConversationRouter } from '@/lib/agent/conversation-interface'
import { createClient } from '@/lib/supabase/server'

export async function handleEmailCommand(email: {
  from: string
  subject: string
  body: string
  messageId: string
  inReplyTo?: string
}) {
  const supabase = await createClient()

  // Look up user by email
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, org_id')
    .eq('email', email.from)
    .single()

  if (!profile) {
    console.warn(`Email from unknown user: ${email.from}`)
    return
  }

  const router = createConversationRouter(supabase)

  const conversationMessage = {
    id: email.messageId,
    content: `Subject: ${email.subject}\n\n${email.body}`,
    role: 'user',
    channel: 'email',
    metadata: {
      userId: profile.id,
      orgId: profile.org_id,
      threadId: email.from, // One thread per email sender
      replyTo: email.inReplyTo,
    },
    timestamp: new Date(),
  }

  await router.handleMessage(conversationMessage)
  console.log(`Email command from ${email.from}: ${email.subject}`)
}
```

## SMS Handler

```typescript
import { createConversationRouter } from '@/lib/agent/conversation-interface'
import { createClient } from '@/lib/supabase/server'

export async function handleSMSMessage(sms: {
  from: string // Phone number
  to: string
  body: string
  messageId: string
}) {
  const supabase = await createClient()

  // Look up user by phone
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, org_id')
    .eq('phone', sms.from)
    .single()

  if (!profile) {
    console.warn(`SMS from unknown number: ${sms.from}`)
    return
  }

  const router = createConversationRouter(supabase)

  const conversationMessage = {
    id: sms.messageId,
    content: sms.body,
    role: 'user',
    channel: 'sms',
    metadata: {
      userId: profile.id,
      orgId: profile.org_id,
      threadId: sms.from,
    },
    timestamp: new Date(),
  }

  await router.handleMessage(conversationMessage)
  console.log(`SMS from ${sms.from}: ${sms.body}`)
}
```

## Slack DM Handler

```typescript
import { createConversationRouter } from '@/lib/agent/conversation-interface'
import { createClient } from '@/lib/supabase/server'

export async function handleSlackDM(event: {
  user: string // Slack user ID
  channel: string // DM channel ID
  text: string
  ts: string // Slack timestamp
  client_msg_id: string
}) {
  const supabase = await createClient()

  // Look up user by Slack ID
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, org_id')
    .eq('slack_user_id', event.user)
    .single()

  if (!profile) {
    console.warn(`Slack DM from unknown user: ${event.user}`)
    return
  }

  const router = createConversationRouter(supabase)

  const conversationMessage = {
    id: event.client_msg_id,
    content: event.text,
    role: 'user',
    channel: 'slack',
    metadata: {
      userId: profile.id,
      orgId: profile.org_id,
      threadId: event.channel,
    },
    timestamp: new Date(parseInt(event.ts) * 1000),
  }

  await router.handleMessage(conversationMessage)
  console.log(`Slack DM from ${event.user}: ${event.text}`)
}
```

## Custom Transport - Telegram

```typescript
import { ConversationTransport, AgentResponse } from '@/lib/agent/conversation-interface'

export class TelegramTransport implements ConversationTransport {
  channel = 'telegram'
  private botToken: string
  private supabase: SupabaseClient

  constructor(botToken: string, supabase: SupabaseClient) {
    this.botToken = botToken
    this.supabase = supabase
  }

  async sendMessage(threadId: string, content: string): Promise<void> {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: threadId,
            text: content,
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
          }),
        }
      )

      if (!response.ok) {
        console.error(`Telegram send failed: ${response.statusText}`)
      }
    } catch (error) {
      console.error('Telegram send error:', error)
    }
  }

  formatResponse(agentResponse: AgentResponse): string {
    if (agentResponse.type === 'error') {
      return `*Error*\n${agentResponse.content}`
    }

    if (agentResponse.type === 'thinking') {
      return `_Processing..._\n${agentResponse.content.substring(0, 100)}...`
    }

    let result = agentResponse.content.substring(0, 4096)

    if (agentResponse.metadata?.toolsCalled?.length) {
      result += `\n\n_Used: ${agentResponse.metadata.toolsCalled.join(', ')}_`
    }

    return result
  }
}

// Register Telegram transport
import { createConversationRouter } from '@/lib/agent/conversation-interface'

export async function setupTelegramHandler(supabase: SupabaseClient) {
  const router = createConversationRouter(supabase)
  const telegramTransport = new TelegramTransport(
    process.env.TELEGRAM_BOT_TOKEN!,
    supabase
  )
  router.registerTransport('telegram', telegramTransport)

  return router
}
```

## Advanced - Multi-Org Routing

```typescript
import { createConversationRouter, ConversationMessage } from '@/lib/agent/conversation-interface'
import { createClient } from '@/lib/supabase/server'

export async function handleMultiOrgMessage(message: ConversationMessage) {
  // Create org-specific Supabase client (with RLS for that org)
  const supabase = await createClient()

  // Router will use the orgId from message.metadata.orgId
  const router = createConversationRouter(supabase)

  // Message already contains orgId - router handles multi-tenancy
  await router.handleMessage(message, {
    orgSettings: {
      confidence_thresholds: {
        act: 0.8, // Org-specific settings
        ask: 0.5,
      },
    },
  })
}
```

## Advanced - Thread History Context

The router automatically loads conversation history:

```typescript
// Conversation history is automatically loaded and included as context
// by ConversationRouter.loadConversationHistory()

// Example:
// Thread: thread_user123
//
// User: "Create a task called 'Review PR'"
// Assistant: "I've created the task 'Review PR' and set it to 'To Do'"
//
// User: "Make it high priority"  <- New message
//
// The router will:
// 1. Load previous messages from conversation_threads table
// 2. Prepend them to create context
// 3. Send to agent with full conversation context
//
// Result: Agent knows about the previously created task
```

## Advanced - Response Streaming

```typescript
import { ConversationRouter } from '@/lib/agent/conversation-interface'

export async function handleStreamingResponse(
  message: ConversationMessage,
  supabase: SupabaseClient,
  onChunk: (chunk: string) => Promise<void> // Callback for each chunk
) {
  const router = createConversationRouter(supabase)

  // The router streams responses through the transport as they arrive
  // For custom behavior, create a custom transport:

  class CallbackTransport implements ConversationTransport {
    channel = 'custom'

    async sendMessage(threadId: string, content: string): Promise<void> {
      await onChunk(content)
    }

    formatResponse(response: AgentResponse): string {
      return response.content
    }
  }

  router.registerTransport('custom', new CallbackTransport())

  await router.handleMessage({
    ...message,
    channel: 'custom',
  })
}
```

## Testing Custom Transports

```typescript
import { describe, it, expect, vi } from 'vitest'
import { ConversationRouter, EmailTransport } from '@/lib/agent/conversation-interface'

describe('EmailTransport', () => {
  it('should format responses as email', () => {
    const transport = new EmailTransport()

    const response = {
      type: 'text',
      content: 'Task created successfully',
    }

    const formatted = transport.formatResponse(response)

    expect(formatted).toContain('Subject:')
    expect(formatted).toContain('Task created successfully')
  })
})
```

## Error Handling

```typescript
import { createConversationRouter } from '@/lib/agent/conversation-interface'

try {
  const router = createConversationRouter(supabase)

  const message = {
    id: 'msg_1',
    content: 'Hello',
    role: 'user',
    channel: 'whatsapp',
    metadata: {
      userId: 'user_1',
      orgId: 'org_1',
      threadId: '+1234567890',
    },
    timestamp: new Date(),
  }

  // Router handles errors internally:
  // - Missing transport: logs error, doesn't throw
  // - Supabase failures: logs warning, continues
  // - Agent errors: sends error response through transport
  // - Message storage failures: logs warning, doesn't block response
  await router.handleMessage(message)
} catch (error) {
  // Application-level error handling
  console.error('Message handling failed:', error)
}
```

## Database Queries - Conversation History

```typescript
import { createClient } from '@/lib/supabase/server'

const supabase = await createClient()

// Get conversation history for a thread
const { data: history } = await supabase
  .from('conversation_threads')
  .select('*')
  .eq('thread_id', '+1234567890')
  .order('timestamp', { ascending: true })

// Get messages from a specific user
const { data: userMessages } = await supabase
  .from('conversation_threads')
  .select('*')
  .eq('user_id', 'user_id')
  .eq('org_id', 'org_id')
  .order('timestamp', { ascending: false })

// Get messages by channel
const { data: whatsappMessages } = await supabase
  .from('conversation_threads')
  .select('*')
  .eq('channel', 'whatsapp')
  .eq('org_id', 'org_id')
  .order('timestamp', { ascending: false })
```
