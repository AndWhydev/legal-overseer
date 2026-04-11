# Conversation Interface

Abstract conversation interface that decouples message handling from the transport layer. Enables the same agent logic to work across web chat, email, SMS, WhatsApp, Slack, and future channels.

## Architecture

```
Channel (Web, WhatsApp, Email, SMS, Slack)
    ↓
ConversationMessage (normalized)
    ↓
ConversationRouter
    ├─→ Load conversation history from Supabase
    ├─→ Call runAgentChat (engine)
    └─→ Route responses through ConversationTransport
        ↓
    Channel-specific formatting & sending
```

## Core Interfaces

### ConversationMessage

Normalized message structure from any channel:

```typescript
interface ConversationMessage {
  id: string                                 // Unique message ID
  content: string                            // Message text
  role: 'user' | 'assistant' | 'system'     // Message sender
  channel: 'web' | 'email' | 'sms' | 'whatsapp' | 'slack'
  metadata: {
    userId: string                           // Who sent it
    orgId: string                            // Which org
    threadId?: string                        // Conversation thread
    replyTo?: string                         // Reply to message ID
    attachments?: MessageAttachment[]        // Files (if any)
  }
  timestamp: Date
}
```

### ConversationTransport

Interface for sending responses back through a specific channel:

```typescript
interface ConversationTransport {
  channel: ConversationMessage['channel']

  // Send formatted message to recipient
  sendMessage(threadId: string, content: string, options?: SendOptions): Promise<void>

  // Format agent response in channel-specific way
  formatResponse(agentResponse: AgentResponse): string
}
```

### ConversationRouter

Main class that orchestrates message handling:

```typescript
class ConversationRouter {
  constructor(
    transports: Map<channel, ConversationTransport>,
    supabase: SupabaseClient
  )

  // Register a new transport at runtime
  registerTransport(channel: string, transport: ConversationTransport): void

  // Handle incoming message from any channel
  async handleMessage(
    message: ConversationMessage,
    engineConfig?: Partial<EngineConfig>
  ): Promise<void>
}
```

## Transport Implementations

### WebTransport
- Uses `ReadableStreamDefaultController` for server-sent events
- Formats responses as plain text
- Used by existing chat API

### WhatsAppTransport
- Sends via Supabase Baileys bridge
- Adds emoji and truncates to WhatsApp limits
- Shows tools used and confidence

### EmailTransport (stub)
- Formats responses as email with subject
- Ready for implementation

### SMSTransport (stub)
- Truncates responses to 160 characters
- Ready for implementation

### SlackTransport (stub)
- Wraps responses in Slack quote block (`>>>`)
- Ready for implementation

## Usage

### Create a router with defaults

```typescript
import { createConversationRouter } from '@/lib/agent/conversation-interface'

const router = createConversationRouter(supabase, webController)
```

### Handle a message from any channel

```typescript
const message: ConversationMessage = {
  id: 'msg_123',
  content: 'Create a task for tomorrow',
  role: 'user',
  channel: 'whatsapp',
  metadata: {
    userId: 'user_abc',
    orgId: 'org_xyz',
    threadId: '+1234567890',
  },
  timestamp: new Date(),
}

// Router automatically:
// 1. Loads conversation history for this thread
// 2. Calls runAgentChat with the message
// 3. Formats response for WhatsApp
// 4. Sends via WhatsApp transport
// 5. Stores in conversation_threads table
await router.handleMessage(message)
```

### Register a custom transport

```typescript
class CustomTransport implements ConversationTransport {
  channel = 'telegram'

  async sendMessage(threadId: string, content: string): Promise<void> {
    // Send via Telegram API
  }

  formatResponse(agentResponse: AgentResponse): string {
    return `*${agentResponse.content}*` // Telegram markdown
  }
}

router.registerTransport('telegram', new CustomTransport())
```

## Integration with Engine

The router automatically:

1. **Loads context** from Supabase `conversation_threads` table
2. **Normalizes messages** to engine-compatible format
3. **Streams agent responses** in real-time
4. **Stores messages** back to database for history
5. **Routes responses** through appropriate transport

No modifications needed to `engine.ts` or existing chat API.

## Thread Context

Conversation history is maintained per `threadId`:

- **Web**: Typically one thread per user session
- **WhatsApp**: One thread per phone number
- **Email**: One thread per sender (reply-to)
- **SMS**: One thread per phone number
- **Slack**: One thread per DM or channel

The router loads the last N messages from history and prepends them to the new message before calling the agent engine.

## Database Requirements

The router expects a `conversation_threads` table:

```sql
CREATE TABLE conversation_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES profiles(id),
  org_id uuid NOT NULL,
  role text NOT NULL,
  channel text NOT NULL,
  content text NOT NULL,
  metadata jsonb,
  timestamp timestamptz NOT NULL,
  UNIQUE(thread_id, id)
);
```

## Testing

Comprehensive test suite in `conversation-interface.test.ts`:

- Message normalization for each channel
- Transport formatting and sending
- Thread context assembly
- Router message handling
- Multi-channel response routing
- Integration scenarios

Run tests:

```bash
npm test src/lib/agent/conversation-interface.test.ts
```

## Migration Path

To add a new channel:

1. Create a new transport class implementing `ConversationTransport`
2. Update `ConversationMessage['channel']` union type
3. Register transport with router
4. Update message normalization for that channel's incoming format
5. Add tests for the transport

No changes needed to agent engine, tools, or existing chat API.

## Performance Considerations

- **Lazy history loading**: Only loads conversation history when handling a message
- **History limit**: By default loads last 4 messages for context (configurable)
- **Async streaming**: Responses streamed in real-time to channels
- **No blocking**: Message storage errors don't block response sending
