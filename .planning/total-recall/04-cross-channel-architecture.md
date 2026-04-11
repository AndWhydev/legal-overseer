# Cross-Channel Continuity Architecture -- Total Recall

## 1. Current State Analysis

The system currently has TWO completely disconnected conversational pipelines:

**Pipeline A: Web Chat (stateless)**
- Frontend (`chat-interface.tsx`) sends `{ message: trimmed }` to `POST /api/agent/chat`
- API route (`route.ts`) extracts the single string, authenticates via Supabase Auth, resolves `org_id` from profiles
- Engine (`engine.ts`) receives `runAgentChat(message, config)` with a fresh single-turn `messages = [{ role: 'user', content: message }]`
- No history is loaded. No history is stored. Every web message is a blank slate.

**Pipeline B: WhatsApp/SMS/Email (stateful but siloed)**
- WhatsApp webhook (`channels/whatsapp/route.ts`) receives messages, resolves org via `channel_configs`, inserts into `channel_messages`, then calls `processWhatsAppMessage`
- This goes through `routeIncomingConversation()` in `src/lib/conversation/interface.ts` (the lightweight adapter layer), then into `handleIncomingMessage` in the WhatsApp conversation-manager
- The conversation-manager maintains **in-memory** state (`Map<string, ConversationState>`) with 10-minute TTL, keyed by phone number
- History is a simple in-memory array of last 12 turns, lost on server restart
- SMS follows the same adapter pattern via `sms-adapter.ts`
- Email follows a separate path via `email-command` webhook

**Pipeline C: ConversationRouter (built but unused)**
- `conversation-interface.ts` defines `ConversationRouter` with `loadConversationHistory()` and `storeMessage()` that read/write `conversation_threads` table
- This table has never been created as a migration (only exists in documentation in `CONVERSATION-INTEGRATION.md`)
- The router is never instantiated by any production code path; it was a forward-looking design

**Key Gap Summary:**
1. Web chat has zero history
2. WhatsApp has ephemeral in-memory history (no cross-restart persistence)
3. No conversation_threads table exists in the database
4. No identity resolution from phone/email to auth user exists
5. No concept of a "unified thread" across channels
6. The ConversationRouter was designed for this purpose but never wired in

---

## 2. System Architecture

```
                           CHANNEL ENTRY POINTS
    +----------+  +----------+  +------+  +-------+  +-------+  +--------+
    |   Web    |  | WhatsApp |  | SMS  |  | Email |  | Slack |  |iMessage|
    |Dashboard |  | Webhook  |  |Telnyx|  |Resend |  |Events |  | Bridge |
    +----+-----+  +----+-----+  +--+---+  +---+---+  +---+---+  +---+----+
         |             |           |           |          |           |
         v             v           v           v          v           v
    +----------------------------------------------------------------------+
    |                    IDENTITY RESOLUTION LAYER                        |
    |           resolveChannelIdentity(channel, identifier)               |
    |  +--------------------------------------------------------------+   |
    |  | Web: Supabase Auth session -> user_id (direct)               |   |
    |  | WhatsApp/SMS: phone -> contacts.phones -> profiles.id        |   |
    |  | Email: email -> contacts.emails/auth.users.email             |   |
    |  | Slack: workspace+user_id -> channel_credentials -> org_id    |   |
    |  +--------------------------------------------------------------+   |
    |  Returns: { userId, orgId, contactId? }                            |
    +----------------------------+---------------------------------------+
                                 |
                                 v
    +----------------------------------------------------------------------+
    |                    THREAD RESOLUTION LAYER                          |
    |               resolveActiveThread(userId, orgId)                    |
    |                                                                     |
    |  1. Find thread WHERE user_id = X AND status = 'active'            |
    |     AND last_activity_at > now() - interval '24 hours'             |
    |  2. If found: return thread_id                                     |
    |  3. If not found: create new thread, inherit compiled_context       |
    |     from most recent archived thread                               |
    +----------------------------+---------------------------------------+
                                 |
                                 v
    +----------------------------------------------------------------------+
    |                  UNIFIED CONVERSATION PIPELINE                      |
    |                                                                     |
    |  1. Store inbound message in unified_messages (with channel tag)    |
    |  2. Load thread history (last N turns from ALL channels)            |
    |  3. Build message array for LLM (with channel metadata headers)    |
    |  4. Run through engine (buildEntityAwarePrompt + runAgentChat)     |
    |  5. Store assistant response in unified_messages                    |
    |  6. Send response via originating channel transport                 |
    |  7. Update thread.last_activity_at                                 |
    |  8. Emit realtime event for cross-channel notification             |
    +----------------------------------------------------------------------+
```

---

## 3. TypeScript Interfaces

```typescript
// --- Channel Identity ---

type Channel = 'web' | 'whatsapp' | 'sms' | 'email' | 'slack' | 'imessage'

interface ChannelIdentifier {
  channel: Channel
  /** The raw identifier from the channel (phone, email, user_id, etc.) */
  rawIdentifier: string
  /** Additional context (e.g., workspace_id for Slack) */
  context?: Record<string, string>
}

interface ResolvedIdentity {
  userId: string        // auth.users.id (Supabase Auth UUID)
  orgId: string         // organizations.id
  contactId?: string    // contacts.id (if the user has a corresponding contact record)
  displayName?: string  // Human-readable name from profile or contact
  isAuthenticated: boolean  // true for web (session), false for external channels
}

// --- Thread Model ---

type ThreadStatus = 'active' | 'archived' | 'expired'

interface UnifiedThread {
  id: string            // uuid
  userId: string        // auth.users.id -- the OWNER of this thread
  orgId: string
  status: ThreadStatus
  /** Compiled context summary carried over from previous threads */
  compiledContext?: string
  /** Most recently active channel */
  lastChannel: Channel
  createdAt: Date
  lastActivityAt: Date
  archivedAt?: Date
  /** Total message count across all channels */
  messageCount: number
}

// --- Message Model ---

interface UnifiedMessage {
  id: string            // uuid
  threadId: string      // FK to unified_threads.id
  userId: string        // message author (user or system)
  orgId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  /** Channel the message was sent FROM */
  channel: Channel
  /** Channel-specific metadata (e.g., whatsapp message_id, email subject) */
  channelMetadata?: {
    externalId?: string
    subject?: string
    isVoiceNote?: boolean
    attachments?: Array<{
      type: string
      url: string
      name: string
    }>
  }
  /** Tool calls executed during this assistant turn */
  toolCalls?: Array<{
    name: string
    input: Record<string, unknown>
    result: unknown
    success: boolean
  }>
  createdAt: Date
}

// --- Thread Resolution ---

interface ThreadResolutionResult {
  thread: UnifiedThread
  isNew: boolean
  /** If new, the compiled context inherited from the previous thread */
  inheritedContext?: string
}

// --- Channel Identity Map (for lookup table) ---

interface ChannelIdentityMapping {
  id: string
  userId: string        // auth.users.id
  orgId: string
  channel: Channel
  externalIdentifier: string  // phone number, email, slack user_id
  verified: boolean
  createdAt: Date
  lastUsedAt: Date
}
```

---

## 4. Identity Resolution Strategy Per Channel

Each channel resolves identity differently. The strategy employs a lookup cascade:

```
resolveChannelIdentity(channel, identifier, context?)
|
+- channel = 'web'
|   +- DIRECT: Supabase Auth cookie/session -> auth.users.id
|       Already works via: const { data: { user } } = await supabase.auth.getUser()
|       profiles.id = user.id, orgId from profiles.active_org_id
|
+- channel = 'whatsapp' | 'sms'
|   +- PHONE LOOKUP cascade:
|       1. Normalize phone to E.164 (use existing normalizePhoneNumber())
|       2. Check channel_identity_map WHERE channel = X AND external_identifier = phone
|       3. If not found: Check contacts WHERE phone = ANY(phones)
|          -> If single match: resolve to owner's user_id via org_id -> profiles
|          -> If multiple matches: use the org resolved from channel_credentials
|       4. If still not found: Create a "shadow identity" (unlinked message store)
|          -> Store in channel_messages with a pending_identity_resolution flag
|          -> User can link it later from the dashboard
|
+- channel = 'email'
|   +- EMAIL LOOKUP cascade:
|       1. Check channel_identity_map WHERE channel = 'email' AND external_identifier = email
|       2. Check auth.users WHERE email = X (direct Supabase Auth match)
|       3. Check contacts WHERE email = ANY(emails) -> resolve org -> profiles
|       4. Fall back to resolveOrgFromWebhook('email', emailDomain)
|
+- channel = 'slack'
|   +- WORKSPACE LOOKUP:
|       1. resolveOrgFromWebhook('slack', workspace_id) -> org_id
|       2. Check channel_identity_map WHERE channel = 'slack' AND external_identifier = slack_user_id
|       3. If not found: Check profiles WHERE preferences->>'slack_user_id' = X
|       4. If still not found: shadow identity
|
+- channel = 'imessage'
    +- PHONE/EMAIL LOOKUP (same as whatsapp/email depending on iMessage ID format)
```

**Shadow Identity Pattern:** When a message arrives from an unknown sender, the system does NOT silently drop it. Instead:
1. The message is stored with `identity_status = 'unresolved'`
2. The org is resolved from the channel credentials (which phone number/inbox received it)
3. A notification is created: "New message from +61412345678 -- link to a contact?"
4. The user can associate the identifier with an existing contact or create a new one
5. Once linked, all previous shadow messages are retroactively associated with the thread

---

## 5. Thread Resolution Algorithm

```
function resolveActiveThread(userId: string, orgId: string): ThreadResolutionResult

  INACTIVITY_THRESHOLD = 24 hours

  // Step 1: Find active thread
  thread = SELECT * FROM unified_threads
    WHERE user_id = userId
      AND org_id = orgId
      AND status = 'active'
      AND last_activity_at > now() - INACTIVITY_THRESHOLD
    ORDER BY last_activity_at DESC
    LIMIT 1

  if thread exists:
    return { thread, isNew: false }

  // Step 2: Archive any stale active threads
  UPDATE unified_threads
    SET status = 'archived', archived_at = now()
    WHERE user_id = userId
      AND org_id = orgId
      AND status = 'active'
      AND last_activity_at <= now() - INACTIVITY_THRESHOLD

  // Step 3: Compile context from most recent archived thread
  lastArchived = SELECT * FROM unified_threads
    WHERE user_id = userId
      AND org_id = orgId
      AND status = 'archived'
    ORDER BY archived_at DESC
    LIMIT 1

  inheritedContext = null
  if lastArchived:
    // Load last 10 messages from archived thread
    recentMessages = SELECT * FROM unified_messages
      WHERE thread_id = lastArchived.id
      ORDER BY created_at DESC
      LIMIT 10

    // Compile a summary (could be done by Haiku in background,
    // or use the thread's existing compiled_context if available)
    if lastArchived.compiled_context:
      inheritedContext = lastArchived.compiled_context
    else:
      inheritedContext = compileThreadSummary(recentMessages)

  // Step 4: Create new thread
  newThread = INSERT INTO unified_threads {
    user_id: userId,
    org_id: orgId,
    status: 'active',
    compiled_context: inheritedContext,
    last_channel: currentChannel,
    last_activity_at: now(),
    message_count: 0
  }

  return { thread: newThread, isNew: true, inheritedContext }
```

---

## 6. Database Schema (New Migration)

```sql
-- Migration: 067_unified_conversations.sql

-- CHANNEL IDENTITY MAP
-- Maps external channel identifiers to internal user IDs.
-- Enables: phone->user, email->user, slack_id->user resolution.

CREATE TABLE IF NOT EXISTS channel_identity_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('web', 'whatsapp', 'sms', 'email', 'slack', 'imessage')),
  external_identifier TEXT NOT NULL,  -- E.164 phone, email, slack user_id
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, channel, external_identifier)
);

CREATE INDEX idx_channel_identity_lookup
  ON channel_identity_map(channel, external_identifier);
CREATE INDEX idx_channel_identity_user
  ON channel_identity_map(user_id, org_id);

-- UNIFIED THREADS
-- One active thread per user. All channels write to the same thread.

CREATE TABLE IF NOT EXISTS unified_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'expired')),
  compiled_context TEXT,
  last_channel TEXT NOT NULL DEFAULT 'web'
    CHECK (last_channel IN ('web', 'whatsapp', 'sms', 'email', 'slack', 'imessage')),
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

-- Only one active thread per user per org at any time
CREATE UNIQUE INDEX idx_unified_threads_active
  ON unified_threads(user_id, org_id)
  WHERE status = 'active';

CREATE INDEX idx_unified_threads_user
  ON unified_threads(user_id, org_id, status, last_activity_at DESC);

-- UNIFIED MESSAGES
-- Every message from every channel, stored in chronological order per thread.

CREATE TABLE IF NOT EXISTS unified_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES unified_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  channel TEXT NOT NULL
    CHECK (channel IN ('web', 'whatsapp', 'sms', 'email', 'slack', 'imessage')),
  channel_metadata JSONB DEFAULT '{}',
  tool_calls JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_unified_messages_thread
  ON unified_messages(thread_id, created_at ASC);
CREATE INDEX idx_unified_messages_user
  ON unified_messages(user_id, org_id, created_at DESC);

-- RLS policies
ALTER TABLE channel_identity_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE unified_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE unified_messages ENABLE ROW LEVEL SECURITY;

-- Service role bypass (all webhook handlers use service client)
CREATE POLICY "channel_identity_map_service" ON channel_identity_map
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "unified_threads_service" ON unified_threads
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "unified_messages_service" ON unified_messages
  FOR ALL USING (auth.role() = 'service_role');

-- User access (dashboard reads)
CREATE POLICY "channel_identity_map_user_select" ON channel_identity_map
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "unified_threads_user_select" ON unified_threads
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "unified_messages_user_select" ON unified_messages
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));

-- Thread archival cron function
CREATE OR REPLACE FUNCTION archive_stale_threads()
RETURNS void AS $$
BEGIN
  UPDATE unified_threads
  SET status = 'archived', archived_at = now()
  WHERE status = 'active'
    AND last_activity_at < now() - interval '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 7. Web Chat Integration Plan

This is the highest-impact change: making the web dashboard chat session-aware.

### 7a. API Route Changes (`/api/agent/chat/route.ts`)

Current: Accepts `{ message }`, runs engine with single-turn.

New: Accepts `{ message, threadId? }`, uses unified pipeline.

```
POST /api/agent/chat
Body: { message: string, threadId?: string }

1. Authenticate user (existing Supabase Auth flow)
2. Resolve org_id from profile (existing)
3. Call resolveActiveThread(user.id, org_id) -> thread
4. Store user message in unified_messages
5. Load last 20 messages from unified_messages WHERE thread_id = thread.id
6. Build messages array for engine (including channel metadata headers)
7. Stream through runAgentChat(assembledContext, config) -- engine unchanged
8. Store assistant response in unified_messages
9. Update thread.last_activity_at and message_count
10. Return SSE stream (same format as today)
```

New endpoint needed:

```
GET /api/agent/chat/history?threadId=X
Returns: { thread: UnifiedThread, messages: UnifiedMessage[] }
```

### 7b. Engine Changes (`engine.ts`)

The engine signature `runAgentChat(message: string, config: EngineConfig)` currently takes a single string. The architecture has two options:

**Option A (Recommended): Assemble context string before engine call.**
The ConversationRouter already does this (lines 343-348 of conversation-interface.ts):
```typescript
let contextMessage = message.content
if (history.length > 2) {
  const historyPreview = history
    .slice(-4)
    .map(m => `${m.role}: ${m.content.substring(0, 100)}`)
    .join('\n')
  contextMessage = `[Conversation Context]\n${historyPreview}\n\n[New Message]\n${message.content}`
}
```

This approach requires zero engine changes. However, it stuffs history into the user message rather than as proper multi-turn messages.

**Option B (Better quality): Extend engine to accept message history.**
Add an optional `history` parameter to `EngineConfig`:

```typescript
interface EngineConfig {
  // ... existing fields
  history?: Array<{ role: 'user' | 'assistant', content: string }>
}
```

Then in engine.ts line 209, instead of:
```typescript
let messages: Anthropic.MessageParam[] = [{ role: 'user', content: message }]
```

Use:
```typescript
let messages: Anthropic.MessageParam[] = config.history
  ? [...config.history, { role: 'user', content: message }]
  : [{ role: 'user', content: message }]
```

**Recommendation: Option B.** It requires a small engine change but gives the LLM proper multi-turn context. The Anthropic API handles multi-turn natively, and this avoids the fragile string-packing approach.

### 7c. Frontend Changes (`chat-interface.tsx`)

1. Add `threadId` to component state (initialized as null)
2. On mount: call `GET /api/agent/chat/history` to load existing active thread
3. If history exists: populate `messages` state and set `threadId`
4. On send: include `threadId` in POST body
5. Add channel badge to `MessageBubble` for messages from non-web channels
6. Subscribe to Supabase Realtime on `unified_messages` table filtered by `thread_id` for cross-channel updates

```typescript
// Pseudocode for mount behavior
useEffect(() => {
  fetch('/api/agent/chat/history')
    .then(res => res.json())
    .then(data => {
      if (data.thread) {
        setThreadId(data.thread.id)
        setMessages(data.messages.map(toFrontendMessage))
      }
    })
}, [])
```

The `Message` interface in the frontend needs a new optional field:
```typescript
interface Message {
  // ... existing
  channel?: 'web' | 'whatsapp' | 'sms' | 'email' | 'slack' | 'imessage'
}
```

The `MessageBubble` component renders a small channel badge when `message.channel && message.channel !== 'web'`.

---

## 8. Channel-Aware Message Formatting

Response content is stored universally as rich markdown in `unified_messages`. Formatting happens at the transport layer (which already exists):

| Channel | Format | Implementation |
|---------|--------|----------------|
| Web | Full markdown, code blocks, interactive elements | Existing `ReactMarkdown` in `MessageBubble` |
| WhatsApp | WhatsApp markdown (*bold*, _italic_), truncated to 1000 chars | Existing `WhatsAppTransport.formatResponse()` |
| SMS | Plain text, 160-char segments | Existing `SMSTransport.formatResponse()` |
| Email | HTML body with professional formatting | Existing `EmailTransport.formatResponse()` |
| Slack | Slack mrkdwn (`>>>` block quotes, `*bold*`) | Existing `SlackTransport.formatResponse()` |

**Channel-aware system prompt addition:** When the user writes from a non-web channel, append to the system prompt:

```
## Response Channel
The user is currently communicating via {channel}. Adapt your response length
and formatting accordingly:
- WhatsApp: Keep responses concise (under 500 chars). Use *bold* for emphasis.
- SMS: Ultra-concise (under 160 chars). No formatting.
- Email: Professional tone. Include greeting/sign-off.
- Slack: Use Slack markdown. Can be moderate length.
```

This is added at the ConversationPipeline level, not in the engine.

---

## 9. Real-Time Cross-Channel Updates

When a message arrives from WhatsApp while the user has the web dashboard open:

1. WhatsApp webhook stores message in `unified_messages`
2. Supabase Realtime triggers on the `unified_messages` INSERT
3. The frontend's `useRealtimeSubscription` hook (already exists in `supabase-realtime.ts`) picks up the event
4. The new message is appended to the chat UI with a "via WhatsApp" badge

Implementation uses the existing `RealtimeManager`:

```typescript
// In chat-interface.tsx, after threadId is known:
useRealtimeSubscription<UnifiedMessage>(
  'unified_messages' as RealtimeTable,  // Need to add to RealtimeTable type
  { event: 'INSERT', filter: `thread_id=eq.${threadId}` },
  (payload) => {
    const newMsg = payload.new
    // Only add if it wasn't sent by the current web session
    if (newMsg.channel !== 'web' || newMsg.role === 'assistant') {
      setMessages(prev => [...prev, toFrontendMessage(newMsg)])
    }
  }
)
```

This requires adding `'unified_messages'` to the `RealtimeTable` union type in `supabase-realtime.ts`.

---

## 10. Sequence Diagrams

### 10a. Web Chat With History

```
User (Browser)          Frontend              API /chat          ThreadResolver       DB
    |                     |                      |                    |                |
    | Open dashboard      |                      |                    |                |
    |-------------------->|                      |                    |                |
    |                     | GET /chat/history     |                    |                |
    |                     |--------------------->|                    |                |
    |                     |                      | resolveActiveThread |                |
    |                     |                      |------------------>|                |
    |                     |                      |                    | SELECT active   |
    |                     |                      |                    | thread          |
    |                     |                      |                    |--------------->|
    |                     |                      |                    |<---------------|
    |                     |                      |<------------------|                |
    |                     |                      | SELECT messages    |                |
    |                     |                      | WHERE thread_id=X  |                |
    |                     |                      |---------------------------------->|
    |                     |                      |<----------------------------------|
    |                     | { thread, messages }  |                    |                |
    |                     |<---------------------|                    |                |
    | Render chat history |                      |                    |                |
    |<--------------------|                      |                    |                |
    |                     |                      |                    |                |
    | Type message        |                      |                    |                |
    |-------------------->|                      |                    |                |
    |                     | POST /chat           |                    |                |
    |                     | {message, threadId}   |                    |                |
    |                     |--------------------->|                    |                |
    |                     |                      | INSERT user msg    |                |
    |                     |                      |---------------------------------->|
    |                     |                      | Load history       |                |
    |                     |                      |---------------------------------->|
    |                     |                      | runAgentChat(msg,  |                |
    |                     |                      |   {history: [...]} |                |
    |                     |  SSE: content_delta   |                    |                |
    |                     |<---------------------|                    |                |
    | Stream response     |                      |                    |                |
    |<--------------------|                      |                    |                |
    |                     |                      | INSERT asst msg    |                |
    |                     |                      |---------------------------------->|
    |                     |  SSE: done            |                    |                |
    |                     |<---------------------|                    |                |
```

### 10b. WhatsApp Continuing Web Conversation

```
User (Phone)          WhatsApp Webhook        IdentityResolver     ThreadResolver       DB              Web Frontend
    |                     |                      |                    |                |                    |
    | Send WA msg         |                      |                    |                |                    |
    |-------------------->|                      |                    |                |                    |
    |                     | resolveChannelIdentity|                    |                |                    |
    |                     | ('whatsapp', phone)   |                    |                |                    |
    |                     |--------------------->|                    |                |                    |
    |                     |                      | SELECT FROM        |                |                    |
    |                     |                      | channel_identity_map               |                    |
    |                     |                      |---------------------------------->|                    |
    |                     |                      |<----------------------------------|                    |
    |                     | {userId, orgId}       |                    |                |                    |
    |                     |<---------------------|                    |                |                    |
    |                     |                      |                    |                |                    |
    |                     | resolveActiveThread   |                    |                |                    |
    |                     |----------------------------------------->|                |                    |
    |                     |                      |                    | SAME thread    |                    |
    |                     |                      |                    | from web!      |                    |
    |                     |                      |                    |--------------->|                    |
    |                     |                      |                    |<---------------|                    |
    |                     |<-----------------------------------------|                |                    |
    |                     |                      |                    |                |                    |
    |                     | INSERT unified_msg    |                    |                |                    |
    |                     | channel='whatsapp'    |                    |                |                    |
    |                     |----------------------------------------------------->|                    |
    |                     |                      |                    |                | Realtime INSERT    |
    |                     |                      |                    |                |------------------>|
    |                     |                      |                    |                |                    | Show WA msg
    |                     | Load thread history   |                    |                |                    | in web chat
    |                     |----------------------------------------------------->|                    |
    |                     |<-----------------------------------------------------|                    |
    |                     | runAgentChat(msg,     |                    |                |                    |
    |                     |   history incl web)   |                    |                |                    |
    |                     |                      |                    |                |                    |
    |                     | INSERT asst response  |                    |                |                    |
    |                     |----------------------------------------------------->|                    |
    |                     |                      |                    |                | Realtime INSERT    |
    |                     |                      |                    |                |------------------>|
    | WA response         |                      |                    |                |                    | Show response
    |<--------------------|                      |                    |                |                    | in web too
```

### 10c. New User First Message (Unknown Identity)

```
Unknown Phone         WhatsApp Webhook        IdentityResolver     DB
    |                     |                      |                    |
    | Send WA msg         |                      |                    |
    |-------------------->|                      |                    |
    |                     | resolveChannelIdentity|                    |
    |                     | ('whatsapp', phone)   |                    |
    |                     |--------------------->|                    |
    |                     |                      | channel_identity_map|
    |                     |                      | -> NOT FOUND       |
    |                     |                      |                    |
    |                     |                      | contacts.phones    |
    |                     |                      | -> NOT FOUND       |
    |                     |                      |                    |
    |                     | { resolved: false,    |                    |
    |                     |   orgId: from channel |                    |
    |                     |   credentials }       |                    |
    |                     |<---------------------|                    |
    |                     |                      |                    |
    |                     | INSERT channel_messages|                    |
    |                     | (legacy path, with    |                    |
    |                     |  identity_status =    |                    |
    |                     |  'unresolved')        |                    |
    |                     |------------------------------------->|
    |                     |                      |                    |
    |                     | INSERT notification   |                    |
    |                     | "New msg from unknown |                    |
    |                     |  +614xxx -- link?"    |                    |
    |                     |------------------------------------->|
    |                     |                      |                    |
    |                     | [Optional: Still      |                    |
    |                     |  process through      |                    |
    |                     |  existing WA pipeline |                    |
    |                     |  for immediate        |                    |
    |                     |  response]            |                    |
    | "Hi! I don't have   |                      |                    |
    |  your number linked |                      |                    |
    |  to an account yet. |                      |                    |
    |  Reply LINK to      |                      |                    |
    |  connect."          |                      |                    |
    |<--------------------|                      |                    |
```

---

## 11. Migration Path: Current to Unified

The migration is incremental and non-breaking:

**Phase 1: Foundation (no behavior changes)**
1. Create migration `067_unified_conversations.sql` with the three new tables
2. Create `src/lib/conversation/identity-resolver.ts` with `resolveChannelIdentity()`
3. Create `src/lib/conversation/thread-resolver.ts` with `resolveActiveThread()`
4. Create `src/lib/conversation/unified-pipeline.ts` that orchestrates the full flow
5. Backfill `channel_identity_map` from existing data: scan `contacts.phones` and `contacts.emails` to create initial mappings

**Phase 2: Web Chat Integration**
1. Create `GET /api/agent/chat/history` endpoint
2. Modify `POST /api/agent/chat` to accept optional `threadId`, route through unified pipeline
3. Add `history` parameter to `EngineConfig` and wire it in engine.ts (3 lines changed)
4. Update `chat-interface.tsx` to load history on mount and send threadId
5. Add channel badge rendering to `MessageBubble`
6. Add Realtime subscription for cross-channel messages

**Phase 3: Channel Migration**
1. Modify WhatsApp webhook to route through unified pipeline instead of in-memory conversation-manager
2. Modify SMS webhook to route through unified pipeline
3. Modify email-command webhook to route through unified pipeline
4. Each channel handler: resolve identity -> resolve thread -> unified pipeline -> channel transport

**Phase 4: Cleanup**
1. Deprecate in-memory `activeConversations` Map in conversation-manager
2. Deprecate the string-packing context approach in ConversationRouter
3. Add cron job (Cloudflare edge worker) for `archive_stale_threads()` every 15 minutes
4. Background job: compile context summaries for archived threads (Haiku)

**Rollback safety:** Each phase can be rolled back independently. Phase 1 creates tables but nothing reads them. Phase 2 adds a new code path alongside the old one (the old single-message path still works if threadId is null). Phase 3 can be toggled per-channel with a feature flag in `channel_configs.config`.

---

## 12. Edge Cases

**Simultaneous messages on two channels:**
- Race condition: two messages arrive 100ms apart, both try to resolve the active thread
- Solution: The `UNIQUE INDEX idx_unified_threads_active ON unified_threads(user_id, org_id) WHERE status = 'active'` ensures at most one active thread. The second message resolves to the same thread. Message ordering is by `created_at` timestamp with microsecond precision.

**Offline channels:**
- If WhatsApp token expires or Telnyx is down, messages are still stored in `unified_messages` with channel metadata. The response cannot be delivered, so it enters a `pending_delivery` state in the transport layer. Retry logic is per-transport.

**Identity conflicts (same phone, multiple users):**
- The `channel_identity_map` has a UNIQUE constraint on `(org_id, channel, external_identifier)`. Within an org, one phone can only map to one user. Cross-org is handled by resolving org first from channel_credentials.

**Thread compiled context overflow:**
- The `compiled_context` field stores a concise summary, not full history. Budget: 2000 chars max (approximately 500 tokens). The compilation uses Haiku to summarize the thread's key facts, pending actions, and decisions.

**Server restart during WhatsApp conversation:**
- Currently fatal (in-memory state lost). After migration: all state is in Postgres. Server restart has zero impact on conversation continuity.

**User switches org context:**
- Thread is per (user_id, org_id) pair. Switching org on the dashboard starts/resumes the thread for that org. Each org has its own conversation timeline.

**Long-running thread (active for days):**
- The 24-hour TTL is on INACTIVITY, not total duration. An active back-and-forth conversation can run indefinitely. Archival only triggers after 24 hours of silence.

---

### Critical Files for Implementation

- `personal-assistant/src/app/api/agent/chat/route.ts` - Core file to modify: add threadId handling, history loading, and unified pipeline integration
- `personal-assistant/src/lib/agent/engine.ts` - Minimal change: add optional `history` parameter to EngineConfig, prepend history to messages array (line 209)
- `personal-assistant/src/lib/agent/conversation-interface.ts` - Pattern to follow: ConversationRouter with loadConversationHistory/storeMessage already designed for this; adapt to use unified_threads/unified_messages tables instead of conversation_threads
- `personal-assistant/src/components/chat/chat-interface.tsx` - Frontend integration: add threadId state, history loading on mount, channel badges, and Realtime subscription for cross-channel updates
- `personal-assistant/src/lib/core/resolve-org.ts` - Extend with identity resolution: the existing resolveOrgFromWebhook becomes the foundation for the broader resolveChannelIdentity function
