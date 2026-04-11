# Context Assembly Pipeline Architecture -- Total Recall

## 1. Current State Analysis

The current codebase has these context-related components, all operating independently:

**Engine flow (engine.ts line 148-150):**
```
const systemPrompt = await buildEntityAwarePrompt(config.supabase, config.orgId, message)
```
Then at line 209:
```
let messages: Anthropic.MessageParam[] = [{ role: 'user', content: message }]
```

This means the engine today sends a single user message with zero conversation history. The `buildEntityAwarePrompt` in `prompt-builder.ts` runs 6 parallel Supabase queries (goals, tasks, columns, activity, contacts, channel cache), then optionally appends entity context if contacts are mentioned. The ConversationRouter in `conversation-interface.ts` has a rudimentary `loadConversationHistory` method but it reads from `conversation_threads` -- a table that has never been created via migration.

The approval queue (`approval-queue.ts`) stores pending actions but those are never injected into the LLM's context window. The baseplate snapshot (`baseplate-snapshot.ts`) pre-computes entity profiles into `entity_profiles` with a 6-hour TTL, but only surfaces them when entity names are string-matched in the user message.

## 2. Architecture Overview -- Data Flow

```
User Message arrives at /api/agent/chat (or ConversationRouter.handleMessage)
         |
         v
  ContextAssembler.assemble(userId, orgId, threadId, currentMessage)
         |
         +---> [Parallel Fetch Group 1]
         |       |
         |       +---> EntityMentionScanner.scan(message, contactList)    [<5ms, in-memory]
         |       +---> HistoryLoader.loadRecent(threadId, limit=10)       [<50ms, indexed]
         |       +---> PendingActionsLoader.load(orgId, userId)           [<20ms, indexed]
         |       +---> SystemPromptBuilder.build(orgId)                   [<80ms, cached]
         |
         +---> [Sequential: depends on EntityMentionScanner result]
         |       |
         |       +---> BaseplateSnapshotLoader.loadBatch(entityIds)       [<20ms, single query]
         |
         v
  TokenBudgetManager.allocate(allTiers)
         |
         v
  AssembledContext {
    systemPrompt:    string                     -- Tier 1+3 merged
    messageHistory:  Anthropic.MessageParam[]    -- Tier 2
    entityContext:   string                      -- Tier 3
    pendingActions:  string                      -- Tier 4
    metadata: {
      tokenUsage:    TokenAllocation
      tiersLoaded:   TierStatus[]
      assemblyMs:    number
    }
  }
         |
         v
  Engine builds final API call:
    system: assembledContext.systemPrompt
    messages: assembledContext.messageHistory
```

## 3. Module / Interface Design

### 3.1 Core Types

```typescript
// File: personal-assistant/src/lib/context-assembly/types.ts

/** Token budget allocation per tier */
interface TokenAllocation {
  systemPrompt: number       // Tier 1: base system prompt
  entityContext: number      // Tier 3: compiled entity profiles
  recentTurns: number        // Tier 2: verbatim recent messages
  compressedHistory: number  // Tier 2: summaries of older turns
  keyFacts: number           // Tier 2: extracted facts from oldest turns
  pendingActions: number     // Tier 4: approval queue state
  total: number
  budget: number
  overBudget: boolean
}

/** Status of each tier's loading result */
interface TierStatus {
  tier: 'working' | 'session_history' | 'compiled_memory' | 'action_state'
  loaded: boolean
  latencyMs: number
  tokenCount: number
  error?: string
}

/** The assembled context ready for the engine */
interface AssembledContext {
  /** Full system prompt including entity context, policies, voice */
  systemPrompt: string
  /** Message history array for Anthropic API messages parameter */
  messageHistory: Anthropic.MessageParam[]
  /** Structured metadata about the assembly process */
  metadata: {
    tokenUsage: TokenAllocation
    tiersLoaded: TierStatus[]
    assemblyMs: number
    entityMentions: string[]
    pendingActionCount: number
  }
}

/** Configuration for the assembler */
interface AssemblerConfig {
  /** Hard token budget for total context window */
  tokenBudget: number           // default: 8000
  /** Maximum verbatim recent turns */
  maxRecentTurns: number        // default: 10
  /** Maximum compressed history summaries */
  maxCompressedTurns: number    // default: 20
  /** Maximum entities to resolve */
  maxEntities: number           // default: 5
  /** TTL for system prompt cache in ms */
  systemPromptCacheTtlMs: number  // default: 300_000 (5 min)
  /** Whether to include pending actions */
  includePendingActions: boolean  // default: true
  /** Whether to include compressed history */
  includeCompressedHistory: boolean // default: true
}

/** A conversation turn stored in the database */
interface StoredTurn {
  id: string
  thread_id: string
  role: 'user' | 'assistant'
  content: string
  channel: string
  tool_calls?: Array<{ name: string; input: unknown; result: unknown }>
  created_at: string
  token_count?: number
  summary?: string       // populated for compressed turns
  key_facts?: string[]   // populated for fact-extracted turns
}

/** A pending action for context injection */
interface PendingAction {
  id: string
  action_type: string
  action_summary: string
  status: 'pending' | 'approved' | 'rejected'
  confidence_score: number
  created_at: string
  agent_name?: string
  payload_preview?: string  // truncated preview of action_payload
}
```

### 3.2 ContextAssembler Class

```typescript
// File: personal-assistant/src/lib/context-assembly/assembler.ts

class ContextAssembler {
  private config: AssemblerConfig
  private tokenCounter: TokenCounter
  private systemPromptCache: Map<string, { prompt: string; timestamp: number }>

  constructor(config?: Partial<AssemblerConfig>)

  /**
   * Main entry point. Assembles all 4 tiers into a single context object.
   * Target: <200ms total latency.
   */
  async assemble(
    supabase: SupabaseClient,
    userId: string,
    orgId: string,
    threadId: string,
    currentMessage: string
  ): Promise<AssembledContext>
}
```

**Internal method breakdown:**

1. `assembleParallel()` -- fires parallel fetches for all independent data sources
2. `assembleSequential()` -- runs entity snapshot loading after mention scan
3. `buildSystemPrompt()` -- composes base prompt (delegates to existing `buildSystemPrompt`)
4. `buildEntitySection()` -- formats baseplate snapshots into prompt section
5. `buildPendingActionsSection()` -- formats approval queue items
6. `buildMessageHistory()` -- assembles verbatim + compressed + facts into messages array
7. `applyTokenBudget()` -- trims lower-priority tiers if over budget

### 3.3 TokenBudgetManager

```typescript
// File: personal-assistant/src/lib/context-assembly/token-budget.ts

class TokenBudgetManager {
  private budget: number
  private allocations: Map<string, number>

  constructor(budget: number)

  /**
   * Estimate tokens for a string. Uses a fast char-based heuristic
   * (chars / 3.5 for English text) rather than tiktoken for speed.
   * Accuracy within ~10% is acceptable since we're budget-managing,
   * not billing.
   */
  estimateTokens(text: string): number

  /**
   * Allocate budget across tiers with priority ordering.
   * Priority (highest to lowest):
   *   1. System prompt (non-negotiable core identity + guidelines)
   *   2. Pending actions (enables "yep, send it" flow)
   *   3. Recent turns (last 2-3 are critical for coherence)
   *   4. Entity context (baseplate snapshots for mentioned entities)
   *   5. Remaining recent turns (4-10)
   *   6. Compressed history summaries
   *   7. Key facts from oldest turns
   */
  allocate(tiers: TierInput[]): TokenAllocation

  /**
   * Trim content to fit within a token budget.
   * Strategies per tier:
   *   - System prompt: remove lower-priority sections (channels, reminders)
   *   - History: reduce turn count
   *   - Entity context: reduce entities, then truncate per-entity
   *   - Pending actions: reduce to most recent
   */
  trimToFit(content: string, maxTokens: number, strategy: TrimStrategy): string
}
```

**Token budget allocation strategy (default 8,000 token budget):**

| Priority | Tier | Default Allocation | Min | Max | Compressible? |
|----------|------|-------------------|-----|-----|--------------|
| 1 | System prompt (base) | 1,500 | 800 | 2,000 | Yes -- drop sections |
| 2 | Pending actions | 200 | 0 | 500 | Yes -- reduce count |
| 3 | Recent turns (last 3) | 900 | 600 | 1,200 | No -- critical |
| 4 | Entity context | 2,000 | 0 | 3,000 | Yes -- reduce entities |
| 5 | Recent turns (4-10) | 2,100 | 0 | 3,000 | Yes -- reduce count |
| 6 | Compressed history | 500 | 0 | 1,000 | Yes -- reduce count |
| 7 | Key facts | 200 | 0 | 500 | Yes -- reduce count |
| 8 | Voice + Policies | 600 | 0 | 800 | Yes -- can omit |

The allocation algorithm:
1. Allocate non-negotiable minimums (system prompt 800 + last 3 turns 600 = 1,400)
2. Fill remaining budget by priority until exhausted
3. If still over budget, trim compressible tiers from lowest priority upward

### 3.4 HistoryLoader

```typescript
// File: personal-assistant/src/lib/context-assembly/history-loader.ts

class HistoryLoader {
  /**
   * Load recent conversation turns for a thread.
   * Returns turns split into three groups:
   *   - verbatim: last N turns (raw content)
   *   - compressed: turns N+1 to M (summary only)
   *   - facts: turns M+1+ (key facts only)
   */
  async loadThreadHistory(
    supabase: SupabaseClient,
    threadId: string,
    options: {
      verbatimLimit: number    // default 10
      compressedLimit: number  // default 20
      factsLimit: number       // default 50
    }
  ): Promise<{
    verbatim: StoredTurn[]
    compressed: StoredTurn[]
    facts: StoredTurn[]
    totalTurns: number
  }>

  /**
   * Format turns into Anthropic MessageParam array.
   * Verbatim turns become full message pairs.
   * Compressed turns become a single system-like summary.
   * Key facts become a bullet-point preamble.
   */
  formatAsMessages(
    verbatim: StoredTurn[],
    compressed: StoredTurn[],
    facts: StoredTurn[],
    channel?: string
  ): Anthropic.MessageParam[]
}
```

**Message history format in the Anthropic API call:**

The message history will be constructed as follows. The system prompt already occupies the `system` parameter. The `messages` array will be built as:

```
[
  // Key facts preamble (if any older turns have extracted facts)
  { role: "user", content: "[Previous conversation context]\n- Fact 1\n- Fact 2\n..." },
  { role: "assistant", content: "Understood, I have this context from our earlier conversations." },

  // Compressed history summaries (turns 11-30)
  { role: "user", content: "[Earlier in this conversation - via WhatsApp]\nSummary: User asked about..." },
  { role: "assistant", content: "[Summary] I helped with..." },

  // Verbatim recent turns (last 10)
  { role: "user", content: "Can you check on that invoice for Sarah?" },
  { role: "assistant", content: "I found invoice #1042 for Sarah Chen..." },
  ...
  // Current message
  { role: "user", content: "Yep, send it" }
]
```

### 3.5 PendingActionsLoader

```typescript
// File: personal-assistant/src/lib/context-assembly/pending-actions-loader.ts

class PendingActionsLoader {
  /**
   * Load pending and recently-resolved actions for context injection.
   * Includes: pending approvals + actions resolved in last 15 minutes.
   */
  async loadForContext(
    supabase: SupabaseClient,
    orgId: string,
    limit: number
  ): Promise<PendingAction[]>

  /**
   * Format pending actions as a system prompt section.
   * Output example:
   *
   * ## Pending Actions
   *
   * You have 2 actions awaiting approval:
   *
   * 1. [PENDING] Send email to Sarah Chen -- "Invoice #1042 Follow-up"
   *    Approval ID: abc-123 | Confidence: 85% | Queued: 3 min ago
   *
   * 2. [APPROVED] Create task "Review Q1 Report" -- completed 5 min ago
   *
   * If the user says "yes", "approve", "send it", etc., resolve the most recent
   * pending action by calling the appropriate tool.
   */
  formatSection(actions: PendingAction[]): string
}
```

This is the critical piece that enables natural approval flows. When the user says "Yep, send it," the LLM can see the pending action in context and knows exactly which action to resolve.

### 3.6 TokenCounter

```typescript
// File: personal-assistant/src/lib/context-assembly/token-counter.ts

/**
 * Fast token estimation. We use a character-ratio heuristic rather than
 * tiktoken because:
 *   1. tiktoken adds ~50ms to assembly (unacceptable in our 200ms budget)
 *   2. We only need approximate counts for budget management
 *   3. Anthropic bills on actual tokens, not our estimates
 *
 * Ratio: 1 token ~ 3.5 characters for English mixed content.
 * JSON/code: 1 token ~ 3.0 characters.
 */
function estimateTokens(text: string, type?: 'text' | 'json'): number

/**
 * Count tokens in a MessageParam array (accounting for role overhead).
 * Each message has ~4 tokens of overhead for role/formatting.
 */
function estimateMessageTokens(messages: Anthropic.MessageParam[]): number
```

## 4. Database Schema Changes

A new migration is needed to create the conversation message storage table. The existing `agent_sessions.messages` JSONB column stores messages for the agent loop but not across sessions. The `conversation_threads` table referenced in `conversation-interface.ts` was documented but never migrated.

**New migration: `067_conversation_messages.sql`**

```sql
-- Conversation threads: one per user-channel session
CREATE TABLE IF NOT EXISTS conversation_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'web',
  title TEXT,                          -- auto-generated from first message
  is_active BOOLEAN NOT NULL DEFAULT true,
  message_count INT NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conv_threads_user ON conversation_threads(user_id, is_active, last_message_at DESC);
CREATE INDEX idx_conv_threads_org ON conversation_threads(org_id, last_message_at DESC);

-- Conversation messages: individual turns within a thread
CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES conversation_threads(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'web',
  tool_calls JSONB,                     -- array of {name, input, result}
  token_count INT,                      -- estimated tokens for budget tracking
  summary TEXT,                         -- compressed summary (populated async)
  key_facts TEXT[],                     -- extracted facts (populated async)
  metadata JSONB NOT NULL DEFAULT '{}', -- channel-specific metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conv_messages_thread ON conversation_messages(thread_id, created_at ASC);
CREATE INDEX idx_conv_messages_org ON conversation_messages(org_id, created_at DESC);
CREATE INDEX idx_conv_messages_recent ON conversation_messages(thread_id, created_at DESC);
```

Key design decisions:
- Separate `conversation_threads` and `conversation_messages` tables (not the flat design from the CONVERSATION-INTEGRATION.md doc)
- `summary` and `key_facts` columns are populated asynchronously after the turn completes (fire-and-forget Haiku call)
- `token_count` is populated at insert time using the fast estimator
- `channel` on each message enables the "you mentioned this on WhatsApp earlier" capability

## 5. Integration Points with Existing Code

### 5.1 Engine Integration (engine.ts)

The assembler replaces two code sections in `engine.ts`:

**Current (lines 148-150 + 209):**
```typescript
const systemPrompt = await buildEntityAwarePrompt(config.supabase, config.orgId, message)
// ... later ...
let messages: Anthropic.MessageParam[] = [{ role: 'user', content: message }]
```

**New:**
```typescript
const assembler = new ContextAssembler()
const context = await assembler.assemble(
  config.supabase,
  userId,        // new: requires userId in EngineConfig
  config.orgId,
  threadId,      // new: requires threadId in EngineConfig
  message
)

// Use structured context
let messages = context.messageHistory
const fullSystemPrompt = context.systemPrompt
```

The `EngineConfig` interface gains two new fields:
```typescript
interface EngineConfig {
  // ... existing fields ...
  userId?: string      // NEW: for thread ownership
  threadId?: string    // NEW: for history loading
}
```

### 5.2 Chat API Integration (route.ts)

The chat API route needs to:
1. Accept an optional `threadId` from the frontend
2. Create a new thread if none provided
3. Pass `userId` and `threadId` to the engine
4. Store both the user message and assistant response after the turn

**Current (lines 43-44):**
```typescript
const events = runAgentChat(message, { orgId: profile.org_id, supabase })
```

**New:**
```typescript
const threadId = body.threadId || await createThread(supabase, user.id, profile.org_id)
await storeMessage(supabase, threadId, profile.org_id, 'user', message)

const events = runAgentChat(message, {
  orgId: profile.org_id,
  supabase,
  userId: user.id,
  threadId,
})

// After stream completes, store assistant response
// (done in the stream's close handler)
```

### 5.3 Prompt Builder Integration (prompt-builder.ts)

The existing `buildEntityAwarePrompt` function is NOT replaced. Instead, the assembler calls it internally and wraps its output with additional sections. The assembler's flow:

1. Call `buildSystemPrompt()` (existing) for the base prompt -- goals, tasks, contacts, channels, policies, voice
2. Call `scanForEntityMentions()` (existing) for entity detection
3. Call `getBaseplateSnapshot()` (existing) for entity profiles
4. Format entity context section (reuses existing `formatSnapshotContext`)
5. Add new sections: pending actions, compressed history preamble

The `buildEntityAwarePrompt` function can be refactored to expose its sub-steps so the assembler can call them individually, or the assembler can call `buildEntityAwarePrompt` as-is and append the new sections.

Recommended approach: call `buildEntityAwarePrompt` as-is for backward compatibility, then append pending actions. This means entity context assembly logic stays in `prompt-builder.ts` and is not duplicated.

### 5.4 ConversationRouter Integration (conversation-interface.ts)

The `ConversationRouter.handleMessage` method currently does its own crude history loading and context assembly (lines 342-349). After this work, it should delegate to the ContextAssembler instead, or the engine should handle it transparently. The recommended path: the engine handles context assembly internally, so neither the chat route nor the ConversationRouter need to build context manually.

### 5.5 Conversation Storage

A new `ConversationStore` module handles persistence:

```typescript
// File: personal-assistant/src/lib/context-assembly/conversation-store.ts

async function createThread(supabase, userId, orgId, channel): Promise<string>
async function storeMessage(supabase, threadId, orgId, role, content, metadata?): Promise<string>
async function getOrCreateThread(supabase, userId, orgId, channel): Promise<string>
```

The chat API route and ConversationRouter both use this module. After each assistant response completes, the response is stored with its tool calls and an estimated token count.

## 6. Performance Optimization Strategy

### 6.1 Parallel Fetch Pattern

The assembler fires all independent fetches simultaneously:

```
Time 0ms:   Start all parallel fetches
             |-- buildSystemPrompt()  [uses internal parallel queries + 5min cache]
             |-- loadThreadHistory()  [single indexed query]
             |-- loadPendingActions() [single indexed query]
             |-- loadContactsForScanning() [single query, reused from prompt-builder]

Time ~50ms: All parallel fetches complete (slowest is usually history)
             |-- scanForEntityMentions() [<1ms, pure string match]
             |-- loadBaseplateSnapshots() [batch query for matched entities]

Time ~70ms: Entity snapshots loaded
             |-- applyTokenBudget()  [<1ms, pure computation]
             |-- buildFinalPrompt()  [<5ms, string concatenation]

Time ~80ms: Assembly complete
```

**Target latencies vs. current:**
- Current `buildEntityAwarePrompt`: ~120ms (6 parallel Supabase queries + entity scan + snapshot load)
- New assembler: ~80ms (same queries + history + actions, better parallelization)

The key insight: the system prompt queries (goals, tasks, columns, activity, contacts, channels, policies, voice) are already parallelized in `buildSystemPrompt`. Adding history and actions in parallel with that group adds zero additional wall-clock time since those are faster queries.

### 6.2 Caching Strategy

| Cache | Scope | TTL | Strategy |
|-------|-------|-----|----------|
| System prompt (base) | Process memory Map | 5 min | Already exists in policy-loader.ts and voice-loader.ts |
| Contact list for scanning | Process memory Map | 2 min | New: cache per orgId |
| Entity profiles (baseplate) | Supabase table | 6 hours | Already exists via entity_profiles.valid_until |
| Cross-reference cache | Supabase table | 15 min | Already exists via cross_reference_cache |
| Thread ID resolution | Process memory Map | 30 sec | New: userId+channel -> threadId |

Note: process memory caches reset on cold start (Vercel serverless, Fly.io restart). This is acceptable because the data is quickly reloaded from Supabase.

### 6.3 Query Optimization

For `conversation_messages`, the critical query is:
```sql
SELECT * FROM conversation_messages
WHERE thread_id = $1
ORDER BY created_at DESC
LIMIT 30
```

The index `idx_conv_messages_recent(thread_id, created_at DESC)` serves this optimally. For a thread with hundreds of messages, this is still a simple index range scan.

For pending actions:
```sql
SELECT * FROM approval_queue
WHERE org_id = $1
  AND (status = 'pending' OR (status IN ('approved','rejected') AND resolved_at > now() - interval '15 minutes'))
ORDER BY created_at DESC
LIMIT 5
```

The existing index `idx_approval_queue_org_status(org_id, status)` serves this. A composite index on `(org_id, status, created_at DESC)` would be ideal but is not critical at current scale.

## 7. Error Handling -- Tier Degradation

Each tier is independently fallible. The assembler follows a "degrade gracefully, never fail" principle:

| Tier | Failure Mode | Degradation |
|------|-------------|-------------|
| System prompt | Supabase timeout | Use minimal hardcoded prompt with identity + guidelines only |
| Entity context | Baseplate snapshot missing/stale | Omit entity section; LLM can still use tools to look up entities |
| Session history | Thread not found / query fails | Send current message only (current behavior) |
| Compressed history | Summary not yet generated | Treat as if there are no older turns |
| Key facts | Facts not yet extracted | Treat as if there are no older turns |
| Pending actions | Approval queue query fails | Omit section; user can still check via dashboard |
| Token counter | Estimation error | Over-allocate by 10% safety margin |

Implementation pattern:

```typescript
// Each tier loader wraps in try/catch and returns a TierResult
interface TierResult<T> {
  data: T | null
  loaded: boolean
  latencyMs: number
  error?: string
}

// The assembler uses Promise.allSettled, not Promise.all
const [systemPromptResult, historyResult, actionsResult, contactsResult] =
  await Promise.allSettled([
    timedFetch('system_prompt', () => buildSystemPrompt(supabase, orgId)),
    timedFetch('history', () => loadThreadHistory(supabase, threadId, options)),
    timedFetch('actions', () => loadPendingActions(supabase, orgId)),
    timedFetch('contacts', () => loadContactsForScanning(supabase, orgId)),
  ])
```

## 8. Asynchronous Post-Turn Processing

After each assistant turn completes, two fire-and-forget background tasks run:

### 8.1 Summary Generation

When a thread exceeds 10 turns, the 11th-oldest turn (and beyond) needs a summary. This is generated asynchronously:

1. After storing the assistant response, check if the thread has >10 unsummarized turns
2. If so, fire a Haiku call: "Summarize this conversation turn in 1-2 sentences: [content]"
3. Store the summary in `conversation_messages.summary`
4. Cost: ~100 input + ~50 output tokens per turn = negligible at Haiku pricing

### 8.2 Key Fact Extraction

For turns older than 30, extract key facts:

1. Fire a Haiku call: "Extract 0-3 key facts from this turn that would be important to remember: [content]"
2. Store in `conversation_messages.key_facts` as a text array
3. Cost: ~100 input + ~30 output tokens per turn

Both operations are fire-and-forget. If they fail, the system still works -- it just has fewer compressed turns and key facts available. The `reflectAction` pattern in `action-reflector.ts` (lines 13-43) is the exact model to follow: try/catch with logger.error, never throw.

## 9. Example Assembled Context

For a user who says "Yep, send that email to Sarah" in an ongoing conversation:

**System prompt (system parameter):**
```
You are BitBit, an intelligent personal assistant for All Webbed Up...

## Identity
[base identity block]

## Capabilities
[standard capabilities]

## Guidelines
[standard guidelines]

## Current Context
Organization: 7abcbfb1
Date/Time: Thursday, 13 March 2026, 02:15 PM AEDT

### Channels
Gmail: 42 items, Calendar: 8 items

### Today's Schedule
- 10:00: Client call with Sarah Chen
- 14:30: Team standup

### Active Goals
- [high] Close Q1 invoicing (active)

### Current Tasks (12 total)
- [high] Follow up on Invoice #1042 (In Progress, pending)
- [medium] Review Q1 Report (To Do, pending)

### Known Contacts (8)
- Sarah Chen (client)
- Mike Park (vendor)

### Recent Activity
- [email] Drafted follow-up email to Sarah Chen

## Entity Context

The following contacts were mentioned in the user's message.

Sarah Chen (sarah@example.com): 24 events via email, whatsapp. Last contact: 2026-03-12. Recent threads: "Invoice #1042 Payment", "Q1 Review Meeting". Notes: Prefers email for formal comms; responsive within 2 hours on weekdays. Relationships: client_of.

## Pending Actions

You have 1 action awaiting approval:

1. [PENDING] Send email to Sarah Chen -- "Invoice #1042 Follow-up Reminder"
   Approval ID: a1b2c3d4 | Confidence: 87% | Queued: 2 min ago
   Preview: "Hi Sarah, Just a friendly reminder about Invoice #1042..."

If the user confirms (e.g., "yes", "send it", "approve"), resolve this action.

## Organization Policies
[policy text]

## Voice Profile
[voice text]
```

**Messages array (messages parameter):**
```json
[
  {"role": "user", "content": "[Earlier context]\n- Sarah Chen is our largest client\n- Invoice #1042 was sent on March 5th for $4,200"},
  {"role": "assistant", "content": "Understood, I have this context from our earlier conversations."},
  {"role": "user", "content": "[Earlier - via web]\nSummary: User asked to draft a follow-up email to Sarah about Invoice #1042."},
  {"role": "assistant", "content": "[Summary] I drafted a follow-up email and queued it for approval."},
  {"role": "user", "content": "Can you draft a follow-up email to Sarah about Invoice #1042?"},
  {"role": "assistant", "content": "I've drafted a follow-up email to Sarah Chen about Invoice #1042. Here's what I prepared:\n\nSubject: Invoice #1042 Follow-up Reminder\n\nHi Sarah,\n\nJust a friendly reminder about Invoice #1042 for $4,200...\n\nI've queued this for your approval before sending."},
  {"role": "user", "content": "Yep, send that email to Sarah"}
]
```

## 10. Configuration

All configuration values are settable per-org via `organizations.settings` JSONB column:

```typescript
const DEFAULT_CONFIG: AssemblerConfig = {
  tokenBudget: 8000,
  maxRecentTurns: 10,
  maxCompressedTurns: 20,
  maxEntities: 5,
  systemPromptCacheTtlMs: 300_000,
  includePendingActions: true,
  includeCompressedHistory: true,
}

// Org override example (stored in organizations.settings.context_assembly):
{
  "context_assembly": {
    "tokenBudget": 12000,        // Pro plan: more context
    "maxRecentTurns": 15,
    "maxEntities": 8
  }
}
```

## 11. File Structure

New files to create:

```
personal-assistant/src/lib/context-assembly/
  types.ts                    -- All interfaces and types
  assembler.ts                -- ContextAssembler class (main entry)
  token-budget.ts             -- TokenBudgetManager
  token-counter.ts            -- Fast token estimation
  history-loader.ts           -- HistoryLoader (thread history)
  pending-actions-loader.ts   -- PendingActionsLoader
  conversation-store.ts       -- Thread/message CRUD
  index.ts                    -- Barrel exports

personal-assistant/src/lib/context-assembly/__tests__/
  assembler.test.ts
  token-budget.test.ts
  token-counter.test.ts
  history-loader.test.ts
  pending-actions-loader.test.ts

personal-assistant/supabase/migrations/
  067_conversation_messages.sql
```

Files to modify:

```
personal-assistant/src/lib/agent/engine.ts           -- Use ContextAssembler
personal-assistant/src/app/api/agent/chat/route.ts   -- Thread management + message storage
personal-assistant/src/lib/agent/engine.ts            -- Add userId/threadId to EngineConfig
personal-assistant/src/components/chat/chat-interface.tsx -- Send/receive threadId
```

## 12. Implementation Sequence

**Phase 1: Foundation (no behavior change)**
1. Create `context-assembly/types.ts` with all interfaces
2. Create `token-counter.ts` with fast estimation
3. Create `token-budget.ts` with allocation logic
4. Create migration `067_conversation_messages.sql`
5. Write tests for token counter and budget manager

**Phase 2: Storage Layer**
6. Create `conversation-store.ts` with thread/message CRUD
7. Update `route.ts` to create threads and store messages
8. Update `chat-interface.tsx` to send/receive threadId
9. Write tests for conversation store

**Phase 3: History Assembly**
10. Create `history-loader.ts` with thread history loading
11. Create `pending-actions-loader.ts`
12. Write tests for both loaders

**Phase 4: Assembler Integration**
13. Create `assembler.ts` wiring all components together
14. Update `engine.ts` to use ContextAssembler
15. Write integration tests
16. Verify <200ms target with real data

**Phase 5: Async Post-Processing**
17. Add summary generation (Haiku, fire-and-forget)
18. Add key fact extraction (Haiku, fire-and-forget)
19. Add compressed history formatting to history-loader

## 13. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Assembly exceeds 200ms on cold start | Medium | Low | Cache warms after first call; acceptable first-call penalty |
| Token estimates diverge >20% from actual | Low | Low | Anthropic bills on actual; our budget is advisory |
| conversation_messages table grows unbounded | High | Medium | Add retention policy (archive threads >90 days, delete >1 year) |
| Summary/fact extraction fails silently | Medium | Low | System works without them; add monitoring counter |
| Thread ID not passed from frontend | Low | Medium | Auto-create thread; fall back to current behavior |
| Baseplate snapshot stale for entity | Medium | Low | Already handled: stale flag + 6h TTL + profile builder refresh |

### Critical Files for Implementation

- `personal-assistant/src/lib/agent/engine.ts` - Core integration point: lines 148-150 (context assembly) and 209 (messages array) must be updated to use the new ContextAssembler; EngineConfig needs userId and threadId fields
- `personal-assistant/src/lib/agent/prompt-builder.ts` - Existing system prompt + entity context builder that the ContextAssembler wraps; its `buildEntityAwarePrompt` and `buildSystemPrompt` functions become internal components of the pipeline
- `personal-assistant/src/app/api/agent/chat/route.ts` - Web chat API endpoint that must add thread creation, message storage, and threadId passing to engine
- `personal-assistant/src/lib/agent/approval-queue.ts` - Source for Tier 4 (pending actions); the `getPendingApprovals` function (line 206) is the query the PendingActionsLoader will use
- `personal-assistant/src/lib/context/baseplate-snapshot.ts` - Tier 3 entity profile loader; its `getBaseplateSnapshot` function is called by the assembler for each entity mention detected
