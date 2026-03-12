# Conversation Compression & Memory Consolidation Architecture

## 1. Current State Analysis

The engine (`engine.ts`) is single-shot: each call to `runAgentChat(message, config)` builds a fresh `messages` array starting with `[{ role: 'user', content: message }]`. No conversation history is loaded. The frontend `ChatInterface` holds messages in React `useState` -- lost on refresh. The `ConversationRouter` in `conversation-interface.ts` stores messages in a `conversation_threads` table and naively injects the last 4 messages as text context, but this path is not wired into the primary chat API (`/api/agent/chat/route.ts`).

This means there are two prerequisite gaps:
- **P1**: Conversation messages must be persisted per-turn to Supabase (the `conversation_threads` table, or a new `conversation_messages` table).
- **P2**: The engine must accept and use multi-turn history (not just a single `message` string).

The compression pipeline sits on top of these prerequisites.

## 2. Pipeline Architecture

```
                                    USER SENDS MESSAGE
                                           |
                                    [1. Persist Turn]  <- SYNC (must complete before response)
                                           |
                                    [2. Build Context Window]
                                           |
                        +------------------+----------------------+
                        |                  |                      |
                  [System Prompt]    [Memory Tiers]       [Entity Context]
                  ~2,000 tokens      ~3,700 tokens         ~800 tokens
                        |                  |                      |
                        |      +-----------+-----------+          |
                        |      |           |           |          |
                        |  [Verbatim]  [Summary]  [Key Facts]    |
                        |  Last 10     11-30       31+           |
                        |  ~3,000 tk   ~500 tk    ~200 tk       |
                        |      |           |           |          |
                        +------+-----------+-----------+----------+
                                           |
                                    [3. Token Budget Manager]
                                    Assembles context within 8K limit
                                           |
                                    [4. Anthropic API Call]
                                    (Sonnet/Opus for response)
                                           |
                                    [5. Stream Response to User]
                                           |
                                    [6. Async Post-Processing]  <- FIRE-AND-FORGET
                                           |
                        +------------------+------------------+
                        |                  |                  |
                  [Compression]    [Entity Extraction]   [Fact Extraction]
                  Haiku call        String-match          Haiku call
                  ~500ms            ~10ms                 ~500ms
                        |                  |                  |
                  thread_summaries  entity_timeline     semantic_memories
                                   entity_mentions
```

## 3. Database Schema (New Tables)

### 3.1 `conversation_messages` (replaces/extends `conversation_threads`)

```sql
CREATE TABLE conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id text NOT NULL,
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  turn_number integer NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  channel text NOT NULL DEFAULT 'web' CHECK (channel IN ('web', 'email', 'sms', 'whatsapp', 'slack')),
  token_count integer,                   -- pre-computed for budget management
  tool_calls jsonb DEFAULT '[]',         -- serialized tool use blocks
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),

  UNIQUE(thread_id, turn_number)
);

CREATE INDEX idx_conv_messages_thread ON conversation_messages(thread_id, turn_number);
CREATE INDEX idx_conv_messages_org ON conversation_messages(org_id, created_at DESC);
```

### 3.2 `thread_summaries`

```sql
CREATE TABLE thread_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id text NOT NULL,
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  tier text NOT NULL CHECK (tier IN ('compressed', 'key_facts', 'archived')),
  turn_range_start integer NOT NULL,     -- first turn covered
  turn_range_end integer NOT NULL,       -- last turn covered
  summary_text text NOT NULL,
  token_count integer NOT NULL,
  entity_ids uuid[] DEFAULT '{}',        -- entities mentioned in summarized turns
  key_facts jsonb DEFAULT '[]',          -- structured facts for key_facts tier
  supersedes uuid REFERENCES thread_summaries ON DELETE SET NULL,
  model_used text DEFAULT 'claude-haiku-4-5-20251001',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(thread_id, tier, turn_range_start)
);

CREATE INDEX idx_thread_summaries_thread ON thread_summaries(thread_id, tier);
CREATE INDEX idx_thread_summaries_org ON thread_summaries(org_id);
```

### 3.3 `thread_metadata`

```sql
CREATE TABLE thread_metadata (
  thread_id text PRIMARY KEY,
  org_id uuid REFERENCES organizations ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  channel text NOT NULL DEFAULT 'web',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  turn_count integer NOT NULL DEFAULT 0,
  last_activity_at timestamptz DEFAULT now(),
  archived_at timestamptz,
  final_summary_id uuid REFERENCES thread_summaries,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_thread_metadata_org ON thread_metadata(org_id, status);
CREATE INDEX idx_thread_metadata_stale ON thread_metadata(last_activity_at)
  WHERE status = 'active';
```

## 4. TypeScript Interfaces

### 4.1 Core Types

```typescript
// personal-assistant/src/lib/memory/types.ts

export interface ConversationTurn {
  turnNumber: number
  role: 'user' | 'assistant'
  content: string
  tokenCount: number
  toolCalls?: SerializedToolCall[]
  createdAt: string
}

export interface SerializedToolCall {
  name: string
  input: Record<string, unknown>
  result?: unknown
  success: boolean
}

export type SummaryTier = 'compressed' | 'key_facts' | 'archived'

export interface SummaryRecord {
  id: string
  threadId: string
  tier: SummaryTier
  turnRangeStart: number
  turnRangeEnd: number
  summaryText: string
  tokenCount: number
  entityIds: string[]
  keyFacts: KeyFact[]
  modelUsed: string
  createdAt: string
}

export interface KeyFact {
  type: 'commitment' | 'decision' | 'financial' | 'deadline' | 'entity_state' | 'action_item'
  text: string
  entityIds: string[]
  confidence: number
  extractedFromTurns: number[]
}

export interface ThreadContext {
  threadId: string
  turnCount: number
  /** Verbatim recent turns (last N) */
  recentTurns: ConversationTurn[]
  /** Compressed summary of middle turns */
  compressedSummary: string | null
  /** Key facts from oldest turns */
  keyFacts: KeyFact[]
  /** Total tokens consumed by this context */
  totalTokens: number
}

export interface CompressionConfig {
  /** Number of recent turns to keep verbatim */
  verbatimTurns: number            // default: 10
  /** Token budget for verbatim tier */
  verbatimBudget: number           // default: 3000
  /** Token budget for compressed summary tier */
  compressedBudget: number         // default: 500
  /** Token budget for key facts tier */
  keyFactsBudget: number           // default: 200
  /** Turn threshold to trigger compression */
  compressionThreshold: number     // default: 10
  /** Turn threshold to trigger key-fact extraction */
  keyFactsThreshold: number        // default: 30
  /** Model for summarization */
  summarizationModel: string       // default: 'claude-haiku-4-5-20251001'
  /** Max tokens for summarization output */
  summarizationMaxTokens: number   // default: 300
  /** Thread inactivity timeout for archival (ms) */
  archivalTimeoutMs: number        // default: 86_400_000 (24h)
}

export const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
  verbatimTurns: 10,
  verbatimBudget: 3000,
  compressedBudget: 500,
  keyFactsBudget: 200,
  compressionThreshold: 10,
  keyFactsThreshold: 30,
  summarizationModel: 'claude-haiku-4-5-20251001',
  summarizationMaxTokens: 300,
  archivalTimeoutMs: 86_400_000,
}
```

### 4.2 ConversationCompressor Interface

```typescript
// personal-assistant/src/lib/memory/conversation-compressor.ts

export interface ConversationCompressor {
  /**
   * Load tiered context for a thread, respecting token budgets.
   * SYNC -- called during context assembly before Anthropic API call.
   */
  loadThreadContext(
    threadId: string,
    config?: Partial<CompressionConfig>
  ): Promise<ThreadContext>

  /**
   * Check if compression is needed and trigger it.
   * ASYNC -- fire-and-forget after response sent.
   */
  checkAndCompress(
    threadId: string,
    currentTurnCount: number,
    config?: Partial<CompressionConfig>
  ): Promise<void>

  /**
   * Generate a compressed summary of specific turns.
   * Called by checkAndCompress when turns exceed threshold.
   */
  summarizeTurns(
    threadId: string,
    turns: ConversationTurn[],
    tier: SummaryTier
  ): Promise<SummaryRecord>

  /**
   * Extract key facts from turns for the oldest tier.
   */
  extractKeyFacts(
    threadId: string,
    turns: ConversationTurn[]
  ): Promise<KeyFact[]>
}
```

### 4.3 MemoryConsolidator Interface

```typescript
// personal-assistant/src/lib/memory/memory-consolidator.ts

export interface ExtractionResult {
  entities: ExtractedEntity[]
  facts: ExtractedFact[]
  contradictions: Contradiction[]
}

export interface ExtractedEntity {
  entityId: string | null      // null if new entity detected
  entityName: string
  entityType: string
  newFacts: string[]
}

export interface ExtractedFact {
  type: KeyFact['type']
  text: string
  entityNames: string[]
  importance: number           // 0.0 - 1.0
}

export interface Contradiction {
  existingFact: string
  existingFactId: string
  newFact: string
  entityId: string
  resolution: 'new_supersedes' | 'needs_review' | 'coexist'
}

export interface MemoryConsolidator {
  /**
   * Extract entities and facts from a single conversation turn.
   * ASYNC -- fire-and-forget after response.
   * Uses mention-extractor for entity detection (string match, ~10ms).
   * Uses Haiku for fact extraction when turn contains high-value signals.
   */
  processNewTurn(
    orgId: string,
    threadId: string,
    turn: ConversationTurn
  ): Promise<ExtractionResult>

  /**
   * Update Context Baseplate with extracted facts.
   * Writes to entity_timeline, semantic_memories, entity_patterns.
   */
  consolidateToBaseplate(
    orgId: string,
    extraction: ExtractionResult
  ): Promise<void>

  /**
   * Detect and resolve contradictions between new and existing facts.
   */
  detectContradictions(
    orgId: string,
    newFacts: ExtractedFact[],
    entityIds: string[]
  ): Promise<Contradiction[]>
}
```

## 5. Summarization Prompt Templates

### 5.1 Compressed Summary (Turns 11-30)

```
You are a conversation summarizer. Condense the following conversation turns into a brief summary (2-3 sentences).

PRESERVE:
- Decisions made and their rationale
- Action items and who is responsible
- Entity names (people, companies, projects)
- Commitments made by either party
- Financial amounts, invoice numbers
- Dates and deadlines mentioned
- Key facts about entities

DISCARD:
- Greetings and small talk
- Repeated information
- Formatting details
- Questions that were answered (keep only the answer)
- Meta-commentary about the conversation itself

CONVERSATION TURNS:
{TURNS_JSON}

Write a concise 2-3 sentence summary. Begin immediately, no preamble.
```

### 5.2 Key Facts Extraction (Turns 31+)

```
Extract structured key facts from this conversation excerpt. Return ONLY valid JSON.

Focus on facts that a future conversation would need:
- Financial: amounts, invoices, payment status
- Commitments: promises, agreements, deadlines
- Decisions: choices made, reasons given
- Entity states: status changes, relationship updates
- Action items: tasks assigned, follow-ups needed

CONVERSATION EXCERPT:
{TURNS_JSON}

Return JSON array:
[
  {
    "type": "financial|commitment|decision|entity_state|action_item|deadline",
    "text": "concise fact statement",
    "entity_names": ["Person or Company mentioned"],
    "confidence": 0.0-1.0
  }
]

Return [] if no significant facts found.
```

### 5.3 Thread Archival Summary

```
Summarize this complete conversation thread for long-term memory storage. The summary will be used to provide context if the topic comes up again in future conversations.

CONVERSATION:
{FULL_THREAD_JSON}

Write a comprehensive summary (3-5 sentences) covering:
1. What was discussed (topic/purpose)
2. Key outcomes (decisions, actions taken)
3. Outstanding items (unresolved questions, pending actions)
4. Important facts learned about entities mentioned

Begin immediately, no preamble.
```

### 5.4 Entity Fact Extraction (per-turn, for Memory Consolidation)

```
Extract facts about entities mentioned in this conversation turn. Return ONLY valid JSON.

TURN:
User: {USER_MESSAGE}
Assistant: {ASSISTANT_MESSAGE}

KNOWN ENTITIES IN THIS CONVERSATION:
{ENTITY_NAMES_LIST}

Return JSON:
{
  "facts": [
    {
      "entity_name": "Name",
      "fact": "concise factual statement",
      "type": "financial|behavioral|relationship|status|preference",
      "importance": 0.0-1.0
    }
  ]
}

Importance scale:
- 1.0: Financial (amounts, payment status, invoices)
- 0.9: Deadlines and commitments
- 0.8: Decisions made
- 0.7: Status changes
- 0.5: Preferences and patterns
- 0.3: Casual mentions

Return {"facts": []} if no significant entity facts.
```

## 6. Compression Algorithm

### 6.1 Context Assembly (Sync -- before API call)

```
FUNCTION loadThreadContext(threadId, config):
  // 1. Load thread metadata
  metadata = DB.threadMetadata.get(threadId)
  IF metadata is null OR metadata.status == 'archived':
    RETURN empty ThreadContext

  turnCount = metadata.turnCount
  budget = TokenBudgetManager(config)

  // 2. Load verbatim recent turns
  recentTurns = DB.conversationMessages
    .where(threadId, turnNumber > turnCount - config.verbatimTurns)
    .orderBy(turnNumber ASC)

  budget.allocate('verbatim', sumTokens(recentTurns))

  // 3. Load compressed summary (if exists)
  compressedSummary = null
  IF turnCount > config.compressionThreshold:
    summary = DB.threadSummaries
      .where(threadId, tier == 'compressed')
      .orderBy(createdAt DESC)
      .first()

    IF summary is not null AND summary.turnRangeEnd >= (turnCount - config.verbatimTurns):
      compressedSummary = summary.summaryText
      budget.allocate('compressed', summary.tokenCount)

  // 4. Load key facts (if exists)
  keyFacts = []
  IF turnCount > config.keyFactsThreshold:
    factSummary = DB.threadSummaries
      .where(threadId, tier == 'key_facts')
      .orderBy(createdAt DESC)
      .first()

    IF factSummary is not null:
      keyFacts = factSummary.keyFacts
      budget.allocate('key_facts', factSummary.tokenCount)

  // 5. Apply token budget constraints
  WHILE budget.isOverBudget():
    budget.trimLowestPriority()
    // Priority: verbatim(last 5) > entity_context > verbatim(6-10) >
    //           compressed > key_facts

  RETURN ThreadContext {
    threadId, turnCount, recentTurns, compressedSummary, keyFacts,
    totalTokens: budget.totalAllocated()
  }
```

### 6.2 Post-Turn Compression Check (Async -- after response)

```
FUNCTION checkAndCompress(threadId, currentTurnCount, config):
  // Gate: only compress if above threshold
  IF currentTurnCount <= config.compressionThreshold:
    RETURN

  // Check if compression is stale
  existingSummary = DB.threadSummaries
    .where(threadId, tier == 'compressed')
    .orderBy(createdAt DESC)
    .first()

  verbatimStart = currentTurnCount - config.verbatimTurns + 1
  needsRecompression = false

  IF existingSummary is null:
    needsRecompression = true
  ELSE IF existingSummary.turnRangeEnd < verbatimStart:
    // There are turns between the summary and verbatim window
    needsRecompression = true

  IF needsRecompression:
    // Load turns that need summarization (between key_facts and verbatim)
    summarizeStart = 1
    IF currentTurnCount > config.keyFactsThreshold:
      summarizeStart = config.keyFactsThreshold + 1
    summarizeEnd = verbatimStart - 1

    turns = DB.conversationMessages
      .where(threadId, turnNumber BETWEEN summarizeStart AND summarizeEnd)
      .orderBy(turnNumber ASC)

    IF turns.length > 0:
      summary = await summarizeTurns(threadId, turns, 'compressed')
      DB.threadSummaries.upsert(summary)

  // Key facts extraction for old turns
  IF currentTurnCount > config.keyFactsThreshold:
    existingKeyFacts = DB.threadSummaries
      .where(threadId, tier == 'key_facts')
      .orderBy(createdAt DESC)
      .first()

    keyFactsEnd = config.keyFactsThreshold
    needsKeyFactExtraction = false

    IF existingKeyFacts is null:
      needsKeyFactExtraction = true
    ELSE IF existingKeyFacts.turnRangeEnd < keyFactsEnd:
      needsKeyFactExtraction = true

    IF needsKeyFactExtraction:
      turns = DB.conversationMessages
        .where(threadId, turnNumber BETWEEN 1 AND keyFactsEnd)
        .orderBy(turnNumber ASC)

      facts = await extractKeyFacts(threadId, turns)
      DB.threadSummaries.upsert({
        threadId, tier: 'key_facts',
        turnRangeStart: 1, turnRangeEnd: keyFactsEnd,
        keyFacts: facts,
        summaryText: formatKeyFactsBullets(facts),
        tokenCount: countTokens(formatKeyFactsBullets(facts))
      })
```

### 6.3 Incremental Summarization Strategy

Instead of re-summarizing all turns every time (expensive), use an incremental approach:

```
FUNCTION summarizeTurns(threadId, newTurns, tier):
  // Check for existing summary to extend
  existing = DB.threadSummaries
    .where(threadId, tier)
    .orderBy(createdAt DESC)
    .first()

  IF existing is not null AND existing.turnRangeEnd == newTurns[0].turnNumber - 1:
    // Extend existing summary with new turns
    prompt = INCREMENTAL_SUMMARY_PROMPT
      .replace('{EXISTING_SUMMARY}', existing.summaryText)
      .replace('{NEW_TURNS}', serializeTurns(newTurns))
  ELSE:
    // Full re-summarization
    prompt = FULL_SUMMARY_PROMPT
      .replace('{TURNS_JSON}', serializeTurns(newTurns))

  response = await Anthropic.messages.create({
    model: config.summarizationModel,  // Haiku
    max_tokens: config.summarizationMaxTokens,
    messages: [{ role: 'user', content: prompt }]
  })

  summaryText = response.content[0].text
  tokenCount = response.usage.output_tokens

  RETURN SummaryRecord {
    threadId, tier,
    turnRangeStart: existing?.turnRangeStart ?? newTurns[0].turnNumber,
    turnRangeEnd: newTurns[newTurns.length - 1].turnNumber,
    summaryText, tokenCount,
    entityIds: extractEntityIdsFromText(summaryText),
    supersedes: existing?.id
  }
```

## 7. Token Budget Manager

```typescript
// personal-assistant/src/lib/memory/token-budget-manager.ts

export interface TokenBudget {
  /** Total token budget for memory context within the LLM context window */
  totalBudget: number                    // default: 3700
  /** Allocation by tier (priority order) */
  tiers: {
    name: string
    priority: number                     // lower = higher priority (kept last)
    budget: number                       // max tokens for this tier
    allocated: number                    // current allocation
    content: string | null               // the text for this tier
  }[]
}

// Priority order (1 = highest, kept under pressure):
// 1. pending_actions      - things the agent promised to do      (~200 tokens)
// 2. verbatim_recent_5    - last 5 turn pairs                    (~1,500 tokens)
// 3. entity_context       - mentioned entity baseplate profiles  (~800 tokens)
// 4. verbatim_older_5     - turns 6-10                           (~1,500 tokens)
// 5. compressed_summary   - turns 11-30 summary                  (~500 tokens)
// 6. key_facts            - turns 31+ extracted facts             (~200 tokens)

export class TokenBudgetManager {
  private budget: TokenBudget

  constructor(totalBudget: number = 3700) { ... }

  /** Allocate tokens to a tier. Returns actual tokens allocated (may be less). */
  allocate(tierName: string, tokens: number, content: string): number { ... }

  /** Check if total exceeds budget */
  isOverBudget(): boolean { ... }

  /** Trim from lowest-priority tier until within budget */
  trimToFit(): void { ... }

  /** Get final assembled context string */
  assembleContext(): string { ... }

  /** Get total tokens allocated */
  totalAllocated(): number { ... }
}
```

### Token Counting

Use a fast approximation for token counting during budget management (characters / 4 for Claude tokenizer approximation), with exact counts from API response metadata stored after the fact. The `token_count` column on `conversation_messages` is populated from `response.usage` data after each API call.

```typescript
export function estimateTokens(text: string): number {
  // Claude tokenizer: ~4 chars per token for English text
  // This is a fast approximation; exact counts come from API usage metadata
  return Math.ceil(text.length / 4)
}
```

For the budget manager during context assembly, this approximation is sufficient because:
- We are budgeting with margins (the 3,700 token budget leaves ~4,300 for system prompt + entity context within an 8,000 token memory budget)
- Actual token counts from previous turns are stored in `conversation_messages.token_count`
- Only the current turn's response needs estimation

## 8. Memory Consolidation Flow

### Per-Turn Processing

```
AFTER RESPONSE SENT (fire-and-forget):

1. Entity Detection (~10ms, no DB calls)
   - Use existing scanForEntityMentions() from entity-mention-scanner.ts
   - Scan both user message AND assistant response
   - Get list of matched contactIds

2. High-Value Signal Detection (~5ms, regex-based)
   - Scan for dollar amounts: /\$[\d,]+(\.\d{2})?/
   - Scan for dates: /\b(January|February|...|\d{1,2}\/\d{1,2}\/\d{2,4})\b/
   - Scan for commitments: /will|promise|commit|guarantee|by (next|monday|friday)/i
   - Scan for decisions: /decided|agreed|confirmed|approved|rejected/i
   - If no high-value signals detected: SKIP Haiku call (save cost)

3. Fact Extraction (conditional, ~500ms with Haiku)
   - ONLY if high-value signals detected in step 2
   - Call Haiku with ENTITY_FACT_EXTRACTION_PROMPT
   - Parse structured facts from response

4. Write to Context Baseplate
   - For each extracted fact:
     a. Resolve entity (existing entity-resolver.ts)
     b. Check for contradiction with existing semantic_memories
     c. If contradiction: mark old memory inactive, log contradiction
     d. Write new fact to semantic_memories with:
        - entity_ids: [resolved entity IDs]
        - category: fact.type mapping
        - confidence: fact.importance
        - source: 'conversation_extraction'
        - extracted_by: 'total_recall'
   - Write timeline event (existing writeTimelineEvent)
   - Invalidate xref cache (existing invalidateCrossRefs)
   - Trigger entity profile recomputation if fact importance > 0.7
     (existing computeEntityProfile, fire-and-forget)
```

### Contradiction Detection

```typescript
async function detectContradictions(
  supabase: SupabaseClient,
  orgId: string,
  newFacts: ExtractedFact[],
  entityIds: string[]
): Promise<Contradiction[]> {
  // Load existing active memories for the same entities
  const { data: existing } = await supabase
    .from('semantic_memories')
    .select('id, content, confidence, category')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .overlaps('entity_ids', entityIds)

  if (!existing || existing.length === 0) return []

  // Use Haiku to detect contradictions between new facts and existing
  const contradictions: Contradiction[] = []

  for (const newFact of newFacts) {
    // Only check financial/commitment/status facts for contradictions
    if (!['financial', 'commitment', 'entity_state'].includes(newFact.type)) continue

    const relatedExisting = existing.filter(m =>
      newFact.entityNames.some(name =>
        m.content.toLowerCase().includes(name.toLowerCase())
      )
    )

    if (relatedExisting.length === 0) continue

    // Simple heuristic: if same category and same entity, check for conflict
    for (const ex of relatedExisting) {
      if (ex.category === newFact.type) {
        // Call Haiku for semantic contradiction check
        const isContradiction = await checkContradiction(ex.content, newFact.text)
        if (isContradiction) {
          contradictions.push({
            existingFact: ex.content,
            existingFactId: ex.id,
            newFact: newFact.text,
            entityId: entityIds[0], // primary entity
            resolution: newFact.importance > ex.confidence
              ? 'new_supersedes'
              : 'needs_review'
          })
        }
      }
    }
  }

  return contradictions
}
```

### Importance Scoring

| Signal Type | Importance | Example |
|------------|-----------|---------|
| Financial amount | 1.0 | "$4,200 invoice #INV-234" |
| Payment status | 0.95 | "Invoice marked as paid" |
| Commitment/promise | 0.9 | "Will deliver by March 15" |
| Deadline | 0.9 | "Council permit due March 20" |
| Decision | 0.8 | "Decided to go with Option B" |
| Status change | 0.7 | "Project moved to in-progress" |
| Relationship update | 0.6 | "Dave now works for BuildRight" |
| Preference | 0.5 | "Prefers email over phone" |
| Casual mention | 0.3 | "Had lunch with Sarah" |

## 9. Thread Archival Flow

### Trigger: Cron Job (every 15 minutes)

```
// New cron route: /api/cron/thread-archival

FUNCTION archiveStaleThreads():
  staleThreads = DB.threadMetadata
    .where(status == 'active')
    .where(last_activity_at < NOW() - config.archivalTimeoutMs)
    .limit(10)  // batch size

  FOR EACH thread IN staleThreads:
    // 1. Generate final archival summary
    allTurns = DB.conversationMessages
      .where(thread.threadId)
      .orderBy(turnNumber ASC)

    archivalSummary = await Anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: ARCHIVAL_SUMMARY_PROMPT.replace('{FULL_THREAD_JSON}', serialize(allTurns)) }]
    })

    summaryRecord = DB.threadSummaries.insert({
      threadId: thread.threadId,
      tier: 'archived',
      turnRangeStart: 1,
      turnRangeEnd: thread.turnCount,
      summaryText: archivalSummary.content[0].text,
      tokenCount: archivalSummary.usage.output_tokens,
      entityIds: extractMentionedEntityIds(allTurns)
    })

    // 2. Extract all entities from the full thread
    entityIds = extractAllEntityIds(allTurns)
    FOR EACH entityId IN entityIds:
      // Trigger profile recomputation
      computeEntityProfile(supabase, { orgId: thread.orgId, entityType: 'contact', entityId })

    // 3. Mark thread as archived
    DB.threadMetadata.update(thread.threadId, {
      status: 'archived',
      archived_at: NOW(),
      final_summary_id: summaryRecord.id
    })

    logger.info('[thread-archival] Archived thread', {
      threadId: thread.threadId,
      turnCount: thread.turnCount,
      summaryTokens: summaryRecord.tokenCount
    })
```

### Thread Resurrection

When a user re-engages on a topic from an archived thread:

1. New thread is created (new `thread_id`)
2. Context Baseplate carries forward all entity knowledge (it is always up-to-date from the consolidation pipeline)
3. If the user explicitly references the old conversation, the archived summary can be loaded via `thread_summaries WHERE tier = 'archived'` and injected as additional context

The key insight: Context Baseplate is the persistent memory, not conversation history. Archived threads contribute to the Baseplate and then can be forgotten.

## 10. Proactive Context Surfacing

This leverages the existing `buildEntityAwarePrompt` pipeline in `prompt-builder.ts`, extending it with conversation-aware context.

### Enhanced Entity Context Pipeline

```
FUNCTION buildEntityAwarePromptWithMemory(supabase, orgId, userMessage, threadId):
  // 1. Existing: build base system prompt
  basePrompt = await buildSystemPrompt(supabase, orgId)

  // 2. Existing: scan for entity mentions (~10ms)
  scanContacts = await loadContactsForScanning(supabase, orgId)
  mentions = scanForEntityMentions(userMessage, scanContacts, 5)

  // 3. Existing: load baseplate snapshots (~20ms)
  snapshots = await Promise.all(
    mentions.map(m => getBaseplateSnapshot(supabase, orgId, 'contact', m.contactId))
  )

  // 4. NEW: load related entities (1-hop graph traversal, ~15ms)
  relatedEntities = []
  FOR EACH mention IN mentions:
    relationships = DB.entityRelationships
      .where(entity_a_id == mention.contactId OR entity_b_id == mention.contactId)
      .orderBy(strength DESC)
      .limit(3)

    FOR EACH rel IN relationships:
      otherId = rel.entity_a_id == mention.contactId ? rel.entity_b_id : rel.entity_a_id
      otherSnapshot = await getBaseplateSnapshot(supabase, orgId, rel.otherType, otherId)
      IF otherSnapshot:
        relatedEntities.push({ relationship: rel, snapshot: otherSnapshot })

  // 5. NEW: load thread context (compressed history)
  threadContext = await conversationCompressor.loadThreadContext(threadId)

  // 6. Assemble final prompt
  entitySection = formatSnapshotContexts(mentions, snapshots, relatedEntities)
  historySection = formatThreadContext(threadContext)

  RETURN basePrompt + entitySection + historySection

  // Total latency: ~50ms (all parallel DB calls)
```

### Context Injection Format

```
## Conversation History

### Key Facts (from earlier in this conversation)
- Dave owes $4,200 (invoice #INV-234, 42 days overdue)
- User committed to follow up on council permit by March 15
- BuildRight Pty Ltd project deadline: March 20

### Earlier Discussion (turns 11-25)
Discussed BuildRight project timeline and Dave's outstanding invoices. User asked to send a reminder email (completed). Agreed to hold off on escalation until March 15 permit deadline. Dave mentioned potential new project for April.

### Recent Conversation
[verbatim last 10 turn pairs]
```

## 11. Performance Characteristics

| Operation | Sync/Async | Latency | Cost | Frequency |
|-----------|-----------|---------|------|-----------|
| Store turn | Sync | ~20ms | $0 (DB write) | Every turn |
| Load thread context | Sync | ~30ms | $0 (DB reads) | Every turn |
| Entity mention scan | Sync | ~10ms | $0 (string match) | Every turn |
| Load baseplate snapshots | Sync | ~20ms | $0 (DB reads) | Every turn |
| Token budget assembly | Sync | ~5ms | $0 (in-memory) | Every turn |
| Compression check | Async | ~5ms | $0 (DB read) | Every turn |
| Summarization (Haiku) | Async | ~500ms | ~$0.0003 | Every ~5 turns past threshold |
| Key fact extraction (Haiku) | Async | ~500ms | ~$0.0003 | When turns cross 30 threshold |
| High-value signal scan | Async | ~5ms | $0 (regex) | Every turn |
| Entity fact extraction (Haiku) | Async | ~500ms | ~$0.0003 | Only when high-value signals detected |
| Contradiction detection | Async | ~200ms | ~$0.0001 | Only when new facts conflict |
| Thread archival | Async (cron) | ~1s | ~$0.0005 | On 24h inactivity |
| Entity profile recomputation | Async | ~100ms | $0 (DB) | After high-importance facts |

**Critical path latency** (what the user waits for): ~85ms total additional latency vs current system.

**Background processing per turn**: ~500ms Haiku call (amortized -- only runs when compression threshold crossed or high-value signal detected).

**Cost per 50-turn conversation**: ~$0.003 for all summarization/extraction (approximately 10 Haiku calls total).

## 12. Error Handling

### Summarization Failure

```
IF Haiku summarization call fails:
  1. Log error with full context
  2. DO NOT block the conversation
  3. Mark thread as 'compression_pending' in metadata
  4. On next turn, retry compression
  5. After 3 consecutive failures:
     - Fall back to naive truncation (drop oldest turns beyond budget)
     - Write to dead_letter_queue for investigation
  6. Stale summaries are always better than no summaries
     - If summary exists but doesn't cover latest turns, use it anyway
     - The verbatim window (last 10) provides recency regardless
```

### Stale Summary Detection

```
FUNCTION isSummaryStale(summary, currentTurnCount, config):
  verbatimStart = currentTurnCount - config.verbatimTurns + 1
  gap = verbatimStart - summary.turnRangeEnd - 1
  RETURN gap > 5  // More than 5 uncovered turns = stale
```

### Data Consistency

- **Idempotency**: Summarization uses `UNIQUE(thread_id, tier, turn_range_start)` -- re-running compression for the same range is a no-op (upsert).
- **Race conditions**: Multiple concurrent turns for the same thread could trigger parallel compression. Solution: Use a simple advisory lock pattern -- check `compression_pending` flag on thread_metadata before starting compression.
- **Orphaned summaries**: If a thread is deleted, CASCADE on `org_id` cleans up summaries.

## 13. Configuration Options

All configuration lives in the `CompressionConfig` interface (section 4.1) with sensible defaults. Override per-organization via `organizations.settings` JSONB:

```json
{
  "total_recall": {
    "verbatim_turns": 10,
    "verbatim_budget": 3000,
    "compressed_budget": 500,
    "key_facts_budget": 200,
    "compression_threshold": 10,
    "key_facts_threshold": 30,
    "summarization_model": "claude-haiku-4-5-20251001",
    "archival_timeout_hours": 24,
    "enable_fact_extraction": true,
    "enable_contradiction_detection": true
  }
}
```

## 14. Worked Example: 50-Turn Conversation

### Setup
User "Tor" chats with BitBit about a client "Dave" and "BuildRight Pty Ltd".

### Turn-by-Turn Compression

| Turn | Event | Compression Action |
|------|-------|-------------------|
| 1 | "What invoices are overdue?" | Stored. Entity scan: none. |
| 2-5 | Discussion about Dave's $4,200 invoice | Stored. Entity scan: Dave detected. Baseplate loaded. |
| 6-10 | Follow-up about BuildRight project deadline, sending reminder email | Stored. High-value signal: "$4,200", "March 20 deadline". Fact extraction fires (Haiku). |
| 11 | **Compression threshold crossed** | Async: Haiku summarizes turns 1-10 into compressed summary (~150 tokens). Stored in `thread_summaries(tier='compressed')`. |
| 12-15 | New topic: council permit status | Context window now uses: verbatim(2-11) + compressed(1-10 summary). |
| 16-20 | Approval of invoice reminder, discussion of new lead | Compression re-runs: extends summary to cover turns 1-15. Verbatim: 11-20. |
| 21-25 | "Schedule a call with Dave next Tuesday" | High-value signal: deadline. Fact: "Meeting with Dave scheduled for Tuesday." Written to semantic_memories. |
| 26-30 | Follow-up on permit, pricing discussion | Summary now covers turns 1-20 (~300 tokens). Verbatim: 21-30. |
| 31 | **Key facts threshold crossed** | Async: Haiku extracts key facts from turns 1-30. Result: "Dave owes $4,200 (invoice #INV-234, 42 days overdue)", "BuildRight project deadline: March 20", "Council permit follow-up committed by March 15", "Meeting with Dave scheduled next Tuesday". Stored in `thread_summaries(tier='key_facts')`. |
| 32-40 | Various follow-ups | Context window: key_facts(1-30, ~120 tokens) + compressed(31-35, ~200 tokens) + verbatim(36-40, ~1,500 tokens). Total memory: ~1,820 tokens. |
| 41-50 | Wrapping up, new topic | Key facts updated to cover 1-40. Compressed: 41-45. Verbatim: 46-50. |

### Final Context Window at Turn 50

```
[System Prompt: ~2,000 tokens]

[Entity Context: ~600 tokens]
Dave (dave@buildright.com.au): 47 events via email, whatsapp. Last contact: 2026-03-12.
  Outstanding Invoices: $4,200 (1 overdue). Active Tasks: 3.
  Notes: "Pays typically in 28 days"; "Prefers WhatsApp for quick items"

BuildRight Pty Ltd: Client of Dave. Project deadline March 20.
  Related: Council permit application (pending).

[Key Facts from earlier conversation: ~120 tokens]
- Dave owes $4,200 (invoice #INV-234, 42 days overdue)
- BuildRight Pty Ltd project deadline: March 20
- Council permit follow-up committed by March 15
- Meeting with Dave scheduled next Tuesday
- New lead from BuildRight for April project discussed

[Compressed summary of turns 41-45: ~200 tokens]
Discussed follow-up strategy for Dave's overdue payment. Agreed to send a final
reminder before escalating. User asked about the April project scope. BitBit
created a task for "BuildRight April Project Scope" in the pipeline.

[Verbatim turns 46-50: ~1,200 tokens]
Turn 46: User: "Did Dave respond to the reminder yet?"
Turn 46: Assistant: "I checked email -- no response from Dave in the last 24 hours. ..."
Turn 47: User: "Send him a WhatsApp saying we need payment by end of week"
...
Turn 50: User: "What's my schedule look like tomorrow?"
Turn 50: Assistant: "Tomorrow you have: 9am BuildRight site visit, ..."

TOTAL MEMORY CONTEXT: ~4,120 tokens (within 8,000 budget)
```

## 15. Integration Points with Existing Code

### 15.1 Engine Modification (`engine.ts`)

The engine needs a new optional `threadId` in `EngineConfig` and must accept pre-loaded conversation history:

```typescript
// Added to EngineConfig:
threadId?: string
conversationHistory?: Anthropic.MessageParam[]
```

When `conversationHistory` is provided, the engine prepends it to the messages array instead of starting with just `[{ role: 'user', content: message }]`.

### 15.2 Chat Route Modification (`/api/agent/chat/route.ts`)

The route must:
1. Accept an optional `threadId` from the frontend (or generate one)
2. Store the user message to `conversation_messages` (sync)
3. Load thread context via `ConversationCompressor.loadThreadContext`
4. Pass the thread context as `conversationHistory` to the engine
5. Store the assistant response to `conversation_messages` (sync)
6. Fire-and-forget: `ConversationCompressor.checkAndCompress` + `MemoryConsolidator.processNewTurn`

### 15.3 Prompt Builder Enhancement (`prompt-builder.ts`)

The `buildEntityAwarePrompt` function should accept an optional `ThreadContext` parameter and format it into a `## Conversation History` section in the system prompt (not as message history, but as system-level context).

### 15.4 Cron Routes (New)

- `/api/cron/thread-archival` -- runs every 15 minutes, archives stale threads
- Existing `/api/cron/consolidation` -- unchanged, continues to run memory consolidation

## 16. Implementation Sequence

| Phase | Files | Description |
|-------|-------|-------------|
| **Phase 1: Storage** | Migration SQL, `conversation-store.ts` | Create tables, implement turn persistence |
| **Phase 2: Compression** | `conversation-compressor.ts`, `token-budget-manager.ts` | Implement tiered loading and Haiku summarization |
| **Phase 3: Integration** | `engine.ts`, `/api/agent/chat/route.ts`, `prompt-builder.ts` | Wire compression into the chat pipeline |
| **Phase 4: Consolidation** | `memory-consolidator.ts` | Implement per-turn fact extraction and baseplate updates |
| **Phase 5: Archival** | `/api/cron/thread-archival/route.ts` | Thread archival cron |
| **Phase 6: Proactive** | `prompt-builder.ts` enhancements | Related entity surfacing, graph traversal |

---

### Critical Files for Implementation

- `personal-assistant/src/app/api/agent/chat/route.ts` - Must be modified to persist turns, load thread context, and fire async compression. Currently a simple pass-through to the engine with no conversation state.
- `personal-assistant/src/lib/agent/engine.ts` - Must accept conversation history via `EngineConfig.conversationHistory` so the `messages` array starts with prior context instead of a single user message.
- `personal-assistant/src/lib/agent/prompt-builder.ts` - Must be extended to accept `ThreadContext` and format compressed history/key facts into the system prompt alongside the existing entity context section.
- `personal-assistant/src/lib/agent/memory-consolidation.ts` - Existing Haiku-based consolidation for `semantic_memories`. The new `MemoryConsolidator` should follow the same pattern (same Anthropic client initialization, same JSON parsing, same fire-and-forget error handling).
- `personal-assistant/src/lib/context/entity-mention-scanner.ts` - Already provides the fast (~10ms) entity detection needed for the per-turn extraction pipeline. Will be reused directly by the MemoryConsolidator without modification.
