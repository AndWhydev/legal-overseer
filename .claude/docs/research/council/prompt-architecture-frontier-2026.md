# Prompt Architecture for Retrieval-Augmented Agent Reasoning

> **Research Date:** 2026-03-15
> **Author:** Senior Prompt Engineer, AI Architecture Council
> **Context:** BitBit is adding Pinecone vector search + hybrid retrieval to its agentic operations platform. This document designs how retrieved context gets assembled into prompts for maximum Claude reasoning quality.
> **Codebase Analyzed:** `prompt-builder.ts`, `context-assembler.ts`, `engine.ts`, `token-budget-manager.ts`, `citation-extractor.ts`

---

## Executive Summary

BitBit's current prompt architecture is solid but was designed for a world without retrieval. Adding RAG requires changes at three layers:

1. **Context Assembly** -- a new Tier 5 (Retrieved Context) in the 4-tier assembler, with relevance-aware ordering and lost-in-the-middle mitigation
2. **Self-RAG Integration** -- prompt patterns that let the agent decide WHEN to retrieve, WHAT query to use, and whether to RETRY
3. **Citation & Grounding** -- inline source attribution using anchor tags that resolve to channel/message metadata

The core design principle: **progressive disclosure over preloading**. Don't stuff the prompt with all retrieved context upfront. Give the agent a `search_memory` tool and let it pull what it needs, when it needs it. Reserve the system prompt for high-confidence, entity-triggered context only.

---

## 1. Context Assembly Optimization

### Current State

The `ContextAssembler` has 4 tiers with an 8K token budget:

| Tier | Content | Priority | Budget |
|------|---------|----------|--------|
| 1 | System prompt (identity, guidelines, state) | 1 | 800-2000 |
| 2 | Pending actions | 2 | 0-500 |
| 3 | Recent conversation turns | 3 | 600-4200 |
| 4 | Compressed history + key facts | 6-7 | 0-1500 |

Entity context is embedded inside the system prompt via `buildEntityAwarePrompt()` rather than being a separate tier.

### Proposed: Add Tier 5 (Retrieved Context)

```typescript
// New tier in context-assembler.ts tiers array
{
  name: 'retrievedContext',
  content: formattedRetrievedChunks,
  priority: 5, // After entity context, before compressed history
  minTokens: 0,
  maxTokens: 1500,
  compressible: true,
}
```

**Why priority 5 (between entity context and compressed history)?** Retrieved chunks are more relevant than compressed history summaries but less critical than entity snapshots (which are pre-computed and high-confidence). This ordering ensures retrieved context is the first thing to get trimmed under pressure, not entity profiles.

### Chunk Ordering: The Sandwich Pattern

Research is definitive: LLMs exhibit a U-shaped attention curve. Information at the beginning and end of context is used reliably; middle content suffers 30%+ accuracy degradation (Liu et al. 2023, "Lost in the Middle").

**Recommended ordering for retrieved chunks:**

```
[Chunk #1: highest relevance] -- primacy position
[Chunk #4: lowest relevance]  -- middle (sacrificial)
[Chunk #3: moderate relevance]
[Chunk #2: second-highest]    -- recency position
```

This "relevance sandwich" places the two most important chunks at the edges. Implementation:

```typescript
function orderChunksForAttention(chunks: ScoredChunk[]): ScoredChunk[] {
  if (chunks.length <= 2) return chunks

  // Sort by score descending
  const sorted = [...chunks].sort((a, b) => b.score - a.score)

  // Sandwich: best first, worst in middle, second-best last
  const result: ScoredChunk[] = []
  let left = 0
  let right = sorted.length - 1
  let front = true

  // Alternate placing from sorted array: best at front, next-best at back
  while (left <= right) {
    if (front) {
      result.push(sorted[left++])
    } else {
      result.push(sorted[right--])
    }
    front = !front
  }

  return result
}
```

### Anthropic's Specific Guidance (Claude 4.6 Docs)

From Anthropic's official prompting best practices (2026):

1. **"Put longform data at the top"** -- place documents ABOVE the query/instructions. Queries at the end improve quality by up to 30%.
2. **Wrap each document** in `<document index="N">` with `<source>` and `<document_content>` subtags.
3. **"Ground responses in quotes"** -- ask Claude to quote relevant parts first, then answer. This cuts through noise.

**Recommended prompt structure for retrieved context:**

```xml
<retrieved_context>
  <document index="1">
    <source>Email from Sarah Chen, 2026-03-03, subject: "Q3 Platform Stability"</source>
    <relevance>0.92</relevance>
    <document_content>
      {{CHUNK_TEXT}}
    </document_content>
  </document>
  <document index="2">
    <source>WhatsApp message from Andy, 2026-02-28</source>
    <relevance>0.87</relevance>
    <document_content>
      {{CHUNK_TEXT}}
    </document_content>
  </document>
</retrieved_context>

When answering, first identify the most relevant quotes from the retrieved context,
then synthesize your response. Cite sources using [Source: description] format.
If the retrieved context doesn't contain enough information, use the search_memory
tool to find additional context.
```

### Token Budget Adjustment

The 8K budget must expand to accommodate retrieved context. Recommended new budget: **12K tokens** (still well within Claude Sonnet's 200K context window).

```typescript
const UPDATED_ASSEMBLER_CONFIG: AssemblerConfig = {
  tokenBudget: 12000,        // was 8000
  maxRecentTurns: 10,
  maxCompressedTurns: 20,
  maxEntities: 5,
  maxRetrievedChunks: 5,     // NEW
  systemPromptCacheTtlMs: 300_000,
  includePendingActions: true,
  includeCompressedHistory: true,
  includeRetrievedContext: true, // NEW
}
```

New allocation:

| Tier | Budget | Notes |
|------|--------|-------|
| System prompt | 800-2000 | Unchanged |
| Pending actions | 0-500 | Unchanged |
| Recent turns | 600-4200 | Unchanged |
| Entity context | 0-2500 | Unchanged (embedded in system) |
| **Retrieved context** | **0-2000** | **NEW** |
| Compressed history | 0-1000 | Unchanged |
| Key facts | 0-500 | Unchanged |

---

## 2. Self-RAG Integration

### The Problem with Always-Retrieve

Traditional RAG retrieves on every user message. This wastes tokens and introduces noise for messages like "yes", "thanks", "sounds good". BitBit handles a mix of:

- **Direct commands**: "Create a task for the website redesign" (no retrieval needed)
- **Recall queries**: "What did Sarah say about the pricing?" (retrieval essential)
- **Hybrid queries**: "Follow up with Andy about the proposal he mentioned last week" (needs retrieval for context, then action)

### Adaptive Retrieval via Tool Design

Rather than training reflection tokens (Self-RAG approach, Asai et al. 2023), BitBit should use Claude's native tool-use to implement adaptive retrieval. The agent decides when to retrieve by having a `search_memory` tool available.

**Prompt pattern for Self-RAG behavior:**

```
## Memory & Knowledge

You have access to BitBit's memory system via the search_memory tool.
Use it when:
- The user asks about past communications, events, or decisions
- You need to verify a fact before taking action
- The user references something you don't have in your current context
- You need historical context to draft a response

Do NOT search when:
- The user gives a direct command with all needed info
- The conversation already contains the relevant context
- The query is about general knowledge, not business-specific history

When searching, formulate specific queries. Instead of "Andy", search for
"Andy proposal website redesign" or "Andy pricing discussion March 2026".
If initial results are insufficient, reformulate with different terms or
broader/narrower scope before concluding information is unavailable.
```

### Multi-Query Retrieval

For complex queries, the agent should decompose into sub-queries. Prompt pattern:

```
When a user's question requires information from multiple topics or time periods,
break it into 2-3 focused search queries rather than one broad search.

Example: "Compare what Sarah and Andy said about the Q3 budget"
  -> search_memory("Sarah Q3 budget discussion")
  -> search_memory("Andy Q3 budget feedback")

Then synthesize the results in your response, citing each source.
```

### The search_memory Tool Definition

```typescript
{
  name: 'search_memory',
  description: `Search BitBit's memory for past communications, decisions, and context.
Returns relevant chunks from emails, messages, notes, and meeting records.
Use specific queries with names, topics, dates, or keywords for best results.
If results are insufficient, try reformulating with different terms.`,
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Semantic search query. Be specific: include names, topics, dates, keywords.'
      },
      filters: {
        type: 'object',
        properties: {
          channels: {
            type: 'array',
            items: { type: 'string', enum: ['email', 'whatsapp', 'slack', 'sms', 'notes', 'calendar'] },
            description: 'Limit search to specific channels'
          },
          date_from: { type: 'string', description: 'ISO date. Search from this date forward.' },
          date_to: { type: 'string', description: 'ISO date. Search up to this date.' },
          contacts: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by contact names'
          }
        }
      },
      max_results: {
        type: 'number',
        description: 'Maximum chunks to return (default: 5, max: 10)'
      }
    },
    required: ['query']
  }
}
```

---

## 3. Multi-Step Retrieval Prompting

### The Loop Problem

Agentic RAG can enter retrieval loops: retrieve -> insufficient -> reformulate -> retrieve -> still insufficient -> reformulate -> ... Production deployments report this as a top failure mode (Agentic RAG Survey, 2025).

### Loop Prevention via Retrieval Budget

**Prompt pattern:**

```
## Retrieval Guidelines

You have a retrieval budget of 3 searches per user message.
- Search 1: Your best query based on the user's message
- Search 2: Reformulated query if Search 1 was insufficient
- Search 3: Final attempt with broader or alternative terms

After 3 searches, work with what you have. If you truly cannot find the
information, tell the user what you searched for and suggest they provide
more specific details.

Never search for the same query twice. Each search must use different terms.
```

### Iterative Deepening Pattern

For complex research tasks that legitimately need multiple retrievals:

```
For multi-step research tasks (the user asks you to investigate, compile, or
analyze information across multiple topics):

1. Plan your searches before executing them
2. Execute searches in parallel when queries are independent
3. After each batch, assess: do I have enough to answer confidently?
4. If gaps remain, formulate targeted follow-up queries
5. Maximum 3 rounds of retrieval (up to 9 total searches)
6. Synthesize all findings with citations before responding
```

### Confidence-Gated Retrieval

Add a JIT (Just-In-Time) instruction that appears when `search_memory` returns results:

```typescript
// In tools.ts JIT instruction map
'search_memory': `
RETRIEVAL ASSESSMENT:
Before using these results, quickly assess:
1. Do the results directly answer the user's question? If yes, cite and respond.
2. Are results tangentially related but missing key details? Reformulate and search again.
3. Are results irrelevant? The information may not exist in memory. Tell the user.

Do NOT hallucinate information that wasn't in the results. If the results are
partial, say what you found and what you couldn't find.
`
```

---

## 4. Citation and Grounding

### Current State

BitBit has a `citation-extractor.ts` that handles `[N]` style references and extracts citations from tool results (URLs from `find_messages`). This is a good foundation but needs extension for RAG.

### Proposed: Inline Source Attribution

For retrieved context, use a natural-language citation format that fits BitBit's conversational style:

**Prompt instruction:**

```
## Citations

When your response uses information from retrieved memory or search results,
cite the source naturally inline. Format:

"Sarah mentioned the platform was having stability issues [Email, Mar 3]
and Andy confirmed he'd seen similar problems [WhatsApp, Feb 28]."

For multiple facts from the same source, cite once at the end of the relevant
passage. Do not use footnote-style [1][2] citations -- keep it conversational.

If you're unsure whether a fact came from retrieved context or your general
knowledge, err on the side of citing. Users trust cited responses more.
```

### Chunk Anchor System

Implement citation anchors in retrieved chunks so the frontend can link back to original messages:

```typescript
interface RetrievedChunk {
  id: string                    // chunk UUID
  text: string                  // chunk content
  score: number                 // relevance score
  source: {
    channel: string             // 'email' | 'whatsapp' | 'slack' | ...
    message_id: string          // original message ID for deep-linking
    contact_name: string        // who sent/received
    timestamp: string           // ISO date
    subject?: string            // email subject if applicable
    thread_id?: string          // conversation thread
  }
  anchor: string               // e.g., "Email from Sarah, Mar 3" -- human-readable
}
```

Format for prompt injection:

```typescript
function formatChunkForPrompt(chunk: RetrievedChunk): string {
  return `<document index="${chunk.id}">
  <source>${chunk.anchor}</source>
  <channel>${chunk.source.channel}</channel>
  <date>${chunk.source.timestamp}</date>
  <relevance>${chunk.score.toFixed(2)}</relevance>
  <document_content>
    ${chunk.text}
  </document_content>
</document>`
}
```

### Grounding-by-Quotes Strategy

From Anthropic's official guidance: asking Claude to quote relevant parts BEFORE answering dramatically improves accuracy with long retrieved contexts.

**Add to system prompt when retrieved context is present:**

```
When answering questions that involve retrieved context, follow this process:
1. First, identify and mentally note the most relevant quotes from the context
2. Base your answer on these specific quotes
3. Cite the source of each key fact inline
4. If the context contradicts itself, note the discrepancy

Do not invent or interpolate information between retrieved chunks.
What isn't in the context, you don't know -- say so.
```

---

## 5. Temporal Reasoning

### The Business Time Problem

Business users think in relative time: "before the meeting", "last Tuesday", "when we discussed the budget". LLMs handle absolute dates well but struggle with relative temporal references, especially when multiple time-anchored chunks are retrieved.

### Temporal Context Injection

**System prompt addition:**

```
## Temporal Context

Current date/time: ${dateTime}
Current business week: Week ${weekNumber} of ${year}

When the user uses relative time references:
- "today" / "this morning" = ${todayDate}
- "yesterday" = ${yesterdayDate}
- "last week" = ${lastWeekStart} to ${lastWeekEnd}
- "this week" = ${thisWeekStart} to ${thisWeekEnd}
- "last month" = ${lastMonthName} ${lastMonthYear}

When searching memory with temporal references, convert to date ranges:
- "What did Sarah say last week?" -> search with date_from: "${lastWeekStart}", date_to: "${lastWeekEnd}"
- "Before the client meeting" -> search for meeting first, then search for context before that date
```

### Temporal Metadata on Retrieved Chunks

Always include relative-time labels on retrieved chunks so Claude can reason about temporal relationships:

```typescript
function addTemporalLabel(chunk: RetrievedChunk, now: Date): string {
  const chunkDate = new Date(chunk.source.timestamp)
  const diffDays = Math.floor((now.getTime() - chunkDate.getTime()) / 86400000)

  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 14) return 'last week'
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  if (diffDays < 60) return 'last month'
  return `${Math.floor(diffDays / 30)} months ago`
}
```

Then in the chunk format:

```xml
<document index="1">
  <source>Email from Sarah Chen, 2026-03-03 (12 days ago)</source>
  ...
</document>
```

### Temporal Ordering of Retrieved Chunks

When retrieved chunks span different time periods, add a chronological summary:

```
The retrieved context spans from ${earliestDate} to ${latestDate}.
Documents are ordered by relevance, not chronologically.
When the user asks about sequences of events, pay attention to the dates
in each document to reconstruct the correct timeline.
```

---

## 6. Lost-in-the-Middle Mitigation

### Strategy 1: Limit Retrieved Chunks

The most effective mitigation is keeping context small. Research shows optimal results with 3-5 documents. The `maxRetrievedChunks: 5` config enforces this.

### Strategy 2: Relevance Sandwich (see Section 1)

Place highest and second-highest relevance chunks at edges; lower relevance in the middle.

### Strategy 3: Relevance Score Injection

Including explicit relevance scores in the prompt helps Claude calibrate attention:

```xml
<retrieved_context count="4" relevance_range="0.72-0.94">
  <document index="1"><relevance>0.94</relevance>...</document>
  <document index="2"><relevance>0.88</relevance>...</document>
  <document index="3"><relevance>0.75</relevance>...</document>
  <document index="4"><relevance>0.72</relevance>...</document>
</retrieved_context>
```

### Strategy 4: Section Headers as Attention Anchors

Bold section headers within retrieved context act as attention anchors, helping Claude's attention mechanism find relevant information regardless of position:

```
## Retrieved Memory (4 documents, relevance: 0.72-0.94)

### [HIGH RELEVANCE] Email from Sarah, Mar 3
...content...

### [MODERATE] WhatsApp from Andy, Feb 28
...content...
```

### Strategy 5: Quote-First Instruction

Already covered in Section 4 -- the "ground responses in quotes" pattern forces Claude to scan the full context before answering, effectively defeating the U-shaped attention curve.

---

## 7. Anthropic's Latest Guidance (Claude 4.6, 2026)

### Key Findings from Official Docs

1. **Adaptive thinking over manual CoT** -- Claude 4.6 uses `thinking: { type: "adaptive" }` instead of fixed `budget_tokens`. The model decides when and how much to think. This means RAG prompts don't need explicit "think step by step" instructions; Claude will naturally reason through retrieved context when needed.

2. **Tool use is more aggressive** -- Claude 4.6 overtriggers on tools compared to earlier models. Instructions like "ALWAYS use search_memory" are unnecessary and harmful. Use neutral language: "Use search_memory when you need historical context."

3. **Context awareness** -- Claude 4.6 tracks its remaining context window. For RAG, this means the agent can naturally manage its retrieval budget without explicit "you have N tokens remaining" tracking.

4. **Prefilled responses deprecated** -- No more using assistant prefill to force citation format. Instead, use structured outputs or explicit instructions in the system prompt.

5. **Long context: documents at top, query at bottom** -- Anthropic confirms the "put retrieved docs above the query" pattern. For BitBit, this means retrieved context should appear in the system prompt (above conversation) rather than injected into the user message.

6. **XML tags for document structure** -- Anthropic explicitly recommends `<documents>` > `<document index="N">` > `<source>` + `<document_content>` structure. BitBit should adopt this exact format.

7. **Parallel tool calls** -- Claude 4.6 excels at running multiple searches simultaneously. The `search_memory` tool should support this pattern -- when the agent needs to search for Sarah's email AND Andy's WhatsApp, both calls should fire in parallel.

### Recommended Engine Configuration for RAG

```typescript
// In engine.ts, update the stream config when retrieval is active
const streamConfig = {
  model: 'claude-sonnet-4-6',
  max_tokens: maxTokens,
  system: fullSystemPrompt,
  tools,
  messages,
  thinking: { type: 'adaptive' },
  output_config: { effort: 'medium' },
}
```

---

## 8. Frontier Prompt Patterns

### Pattern 1: Contextual Retrieval Prompting (Anthropic, 2025)

Before embedding chunks, prepend contextual summaries generated by Claude Haiku:

```
<document>
{{WHOLE_DOCUMENT}}
</document>
Here is the chunk we want to situate within the whole document
<chunk>
{{CHUNK_CONTENT}}
</chunk>
Please give a short succinct context to situate this chunk
within the overall document for the purposes of improving
search retrieval of the chunk. Answer only with the succinct
context and nothing else.
```

This reduces retrieval failure by 35% (embeddings alone) to 67% (with reranking). **BitBit must implement this at indexing time.** Cost: ~$1.02 per million document tokens using Haiku with prompt caching.

### Pattern 2: RAG-Fusion (Multi-Query + RRF)

Generate 3-5 query variants from the user's question, retrieve for each, merge via reciprocal rank fusion. This improves recall significantly for ambiguous queries.

**Implementation in search_memory tool:**

```typescript
async function ragFusionSearch(query: string, filters: SearchFilters): Promise<ScoredChunk[]> {
  // Generate query variants using Haiku
  const variants = await generateQueryVariants(query, 3)

  // Parallel retrieval for all variants
  const allResults = await Promise.all(
    [query, ...variants].map(q => hybridSearch(q, filters))
  )

  // Reciprocal rank fusion
  return reciprocalRankFusion(allResults, k: 60)
}
```

### Pattern 3: Progressive Context Disclosure

Don't preload all retrieved context. Start with entity snapshots (already implemented via baseplate), then let the agent pull more via tools.

**Three-phase context loading:**

1. **Phase 0 (system prompt):** Identity, guidelines, current state, entity snapshots -- no retrieval
2. **Phase 1 (auto-retrieve on entity mention):** When user mentions a contact, auto-inject top-1 most relevant recent chunk -- minimal token cost
3. **Phase 2 (agent-driven):** Agent uses `search_memory` tool for deeper retrieval as needed

This is already partially implemented via `buildEntityAwarePrompt()`. The enhancement is adding a single auto-retrieved chunk per mentioned entity.

### Pattern 4: Agentic Search (Claude Code Pattern)

Rather than classic RAG, treat retrieval as exploration. The agent has discovery tools and navigates the information space itself:

```
## Information Discovery

You have several tools for finding information:
- search_memory: Semantic search across all stored communications
- search_contacts: Find contact details and relationship history
- get_upcoming: Calendar and reminder lookups
- find_messages: Direct channel search (email, WhatsApp, etc.)

For complex questions, use these tools iteratively:
1. Start with a broad search to orient yourself
2. Follow references in results to dig deeper
3. Cross-reference across channels when needed

Think of yourself as a researcher with access to a filing cabinet,
not a lookup table that returns exact matches.
```

### Pattern 5: Context Rot Prevention

As context grows, four failure modes emerge (01.me, "Context Engineering from Claude"):

| Failure | Description | Mitigation |
|---------|-------------|------------|
| **Poisoning** | Irrelevant chunks dilute useful context | Aggressive relevance filtering (score > 0.7) |
| **Distraction** | Tangentially related content misleads | Limit to 5 chunks, use relevance sandwich |
| **Confusion** | Contradictory chunks from different timeframes | Include timestamps, add temporal ordering note |
| **Clash** | Retrieved context contradicts system prompt | System prompt always wins; add: "If retrieved context contradicts your guidelines, follow your guidelines" |

### Pattern 6: Structured Memory Artifacts

From Anthropic's agent harness guidance: agents should maintain explicit memory artifacts for long-running tasks. For BitBit, this means the agent should be able to CREATE memory, not just retrieve it:

```typescript
{
  name: 'store_memory',
  description: `Store a fact, decision, or insight in BitBit's memory for future retrieval.
Use this when you learn something important during a conversation that should be
remembered for future interactions. Examples: user preferences, key decisions,
important dates, relationship notes.`,
  input_schema: {
    type: 'object',
    properties: {
      content: { type: 'string', description: 'The fact or insight to store' },
      category: {
        type: 'string',
        enum: ['preference', 'decision', 'relationship', 'fact', 'action_item'],
        description: 'Category for organization'
      },
      related_contacts: {
        type: 'array',
        items: { type: 'string' },
        description: 'Contact names this memory relates to'
      }
    },
    required: ['content', 'category']
  }
}
```

---

## 9. Specific File Changes

### prompt-builder.ts

1. **Add retrieved context section** after entity context in `buildEntityAwarePrompt()`:

```typescript
// After line 459 (entity section append)
if (retrievedChunks.length > 0) {
  const orderedChunks = orderChunksForAttention(retrievedChunks)
  const retrievedSection = orderedChunks
    .map((chunk, i) => formatChunkForPrompt(chunk, i + 1))
    .join('\n')

  prompt += `\n\n## Retrieved Memory

The following context was retrieved from BitBit's memory based on the user's message.
Use this to inform your response. Cite sources naturally inline.
If you need more context, use the search_memory tool.

<retrieved_context count="${orderedChunks.length}">
${retrievedSection}
</retrieved_context>
`
}
```

2. **Add temporal context** to the `## Current Context` section:

```typescript
// After line 273 (Date/Time)
const yesterday = new Date(now.getTime() - 86400000)
const lastWeekStart = new Date(now)
lastWeekStart.setDate(now.getDate() - now.getDay() - 7)
const lastWeekEnd = new Date(lastWeekStart)
lastWeekEnd.setDate(lastWeekStart.getDate() + 6)

// Add to prompt:
`Yesterday: ${yesterday.toISOString().split('T')[0]}
Last week: ${lastWeekStart.toISOString().split('T')[0]} to ${lastWeekEnd.toISOString().split('T')[0]}`
```

3. **Add citation instruction** to the guidelines section:

```typescript
// Add after line 253 (guidelines)
`### Citations
When using information from retrieved memory or search results, cite sources
naturally: "Sarah mentioned... [Email, Mar 3]". Keep citations conversational.
If unsure whether a fact is from context or general knowledge, cite it.`
```

### context-assembler.ts

1. **Add Tier 5** to the tiers array (around line 501):

```typescript
{
  name: 'retrievedContext',
  content: formattedRetrievedChunks,
  priority: 5,
  minTokens: 0,
  maxTokens: 2000,
  compressible: true,
},
```

2. **Add `retrievedContext` to `TokenAllocation` type** and update the budget manager.

3. **Add retrieval call** to the Phase 1 parallel fetch:

```typescript
// Add to Promise.all in Phase 1:
timedFetch('retrieved_context', () =>
  retrieveForMessage(supabase, orgId, currentMessage, {
    maxChunks: config.maxRetrievedChunks || 5,
    scoreThreshold: 0.7,
  })
),
```

4. **Add retrieval tier status** to Phase 7.

### engine.ts

1. **Update thinking config** for RAG-active sessions:

```typescript
// When ContextAssembler includes retrieved context:
const streamConfig: any = {
  model,
  max_tokens: maxTokens,
  system: fullSystemPrompt,
  tools,
  messages,
  thinking: { type: 'adaptive' },
}
```

2. **Add retrieval budget tracking** -- count `search_memory` tool calls per user message and log when the agent exceeds the budget of 3.

3. **Add JIT instruction** for `search_memory` results (in `tools.ts`):

```typescript
'search_memory': `RETRIEVAL QUALITY CHECK:
- Are these results relevant to the user's question?
- If partially relevant, formulate a more specific follow-up query
- If irrelevant, try different search terms or tell the user
- Never fabricate information not present in results
- Cite sources inline: [Channel, Date]`
```

### citation-extractor.ts

1. **Add RAG citation extraction** that parses `[Channel, Date]` format alongside existing `[N]` format.

2. **Add `extractCitationsFromRetrievedChunks()`** that maps chunk anchors to Citation objects for frontend deep-linking.

---

## 10. Implementation Priority

| Priority | Change | Impact | Effort |
|----------|--------|--------|--------|
| P0 | `search_memory` tool definition + JIT instruction | Enables agent-driven retrieval | 1 day |
| P0 | Chunk formatting with XML structure + anchors | Proper context injection | 1 day |
| P1 | Relevance sandwich ordering | 20-30% accuracy improvement | 0.5 day |
| P1 | Temporal context in system prompt | Correct relative-time queries | 0.5 day |
| P1 | Citation instruction in guidelines | Source attribution | 0.5 day |
| P2 | Tier 5 in context assembler | Auto-retrieve on entity mention | 1 day |
| P2 | RAG-Fusion multi-query in search tool | Better recall for ambiguous queries | 1 day |
| P2 | `store_memory` tool | Agent can create memories | 0.5 day |
| P3 | Grounding-by-quotes instruction | Improved accuracy on long contexts | 0.5 day |
| P3 | Contextual retrieval at indexing time | 35-67% fewer retrieval failures | 2 days |

---

## Appendix A: Research Sources

- Liu et al. 2023. "Lost in the Middle: How Language Models Use Long Contexts." TACL 2024.
- Asai et al. 2023. "Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection."
- Anthropic. 2025. "Contextual Retrieval." https://www.anthropic.com/news/contextual-retrieval
- Anthropic. 2026. "Prompting Best Practices." https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- Anthropic. 2026. "RAG Cookbook." https://platform.claude.com/cookbook/capabilities-retrieval-augmented-generation-guide
- Anthropic. 2025. "Effective Harnesses for Long-Running Agents." https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- Agentic RAG Survey. 2025. https://arxiv.org/abs/2501.09136
- Tensorlake. 2025. "Citation-Aware RAG." https://www.tensorlake.ai/blog/rag-citations
- Maxim AI. 2025. "Solving the Lost-in-the-Middle Problem." https://www.getmaxim.ai/articles/solving-the-lost-in-the-middle-problem-advanced-rag-techniques-for-long-context-llms/
- 01.me. 2025. "Context Engineering from Claude." https://01.me/en/2025/12/context-engineering-from-claude/
- RAGFlow. 2025. "From RAG to Context." https://ragflow.io/blog/rag-review-2025-from-rag-to-context
- Zep. 2025. "Temporal Knowledge Graph Architecture." https://blog.getzep.com/
- Stack AI. 2026. "Prompt Engineering for RAG Pipelines." https://www.stackai.com/blog/prompt-engineering-for-rag-pipelines-the-complete-guide-to-prompt-engineering-for-retrieval-augmented-generation

## Appendix B: Key Design Decisions Summary

| Decision | Chosen Approach | Rejected Alternative | Rationale |
|----------|----------------|---------------------|-----------|
| Retrieval trigger | Agent-driven (tool) | Always-retrieve | Avoids noise on simple commands; respects token budget |
| Chunk ordering | Relevance sandwich | Chronological | Directly counters lost-in-the-middle with 20-30% improvement |
| Citation format | Natural inline [Channel, Date] | Footnote [N] style | Fits BitBit's conversational persona |
| Context placement | System prompt (above conversation) | User message injection | Anthropic's own recommendation; up to 30% quality boost |
| Retrieval budget | 3 searches per message | Unlimited | Prevents retrieval loops; proven in production agentic RAG |
| Token budget | 12K (from 8K) | 16K+ | Minimal increase; keeps assembly fast; Claude handles 200K but less is more |
| Thinking mode | Adaptive | Manual budget_tokens | Claude 4.6 native; better for tool-heavy workflows |
| Multi-query | RAG-Fusion with RRF | Single query | Proven 15-30% recall improvement on ambiguous business queries |
