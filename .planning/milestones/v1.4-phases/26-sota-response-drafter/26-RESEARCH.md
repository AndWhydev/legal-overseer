# Phase 26: SOTA Response Drafter - Research

**Researched:** 2026-03-26
**Domain:** LLM-powered contextual response drafting with rich entity context assembly
**Confidence:** HIGH

## Summary

The current response drafting path (`generateContextualReplyWithLLM` in `client-comms.ts`) operates with zero business context. It receives only the contact name, incoming message text, voice tone, style guide, and channel type. It knows nothing about conversation history with the contact, active projects, outstanding invoices, entity relationships, Memory Palace entries, RAG-retrieved context, standing orders, or relationship health. This makes every draft generic, requiring the user to manually add context or heavily edit.

The codebase already contains all the building blocks needed for contextually rich drafts. The `ContextAssembler` (used by the TAOR loop) assembles system prompts with entity mentions, baseplate snapshots, RAG retrieval, Memory Palace proactive recall, and pending actions. The `briefing-packets.ts` module pre-computes per-contact context. The `relationship-scorer.ts` computes 0-100 strength with trend. The `contact-timing.ts` identifies optimal send windows. The `standing-orders.ts` stores persistent directives with context matching. The `tone-adapter.ts` learns and adapts per-contact communication styles. All these exist but are not wired into the draft path.

**Primary recommendation:** Build a `DraftContextAssembler` that reuses the same context sources as the main `ContextAssembler` but tailored for the response drafting use case -- focused on a specific contact rather than general conversation. Wire it into the LLM drafting call in `client-comms.ts`, replacing the current context-free prompt with a rich entity briefing. Add confidence scoring that reflects actual context depth (not a hardcoded 0.7).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DRAFT-01 | Draft replies reference specific projects, tasks, invoices, and recent interactions with the contact | DraftContextAssembler pulls baseplate snapshots, entity timeline, active tasks/invoices, and recent channel_messages for the contact |
| DRAFT-02 | Draft quality assessed via blind comparison against user's actual replies | Build evaluation harness that collects (incoming, user_actual_reply, bitbit_draft) triples and runs LLM-as-judge scoring |
| DRAFT-03 | ContextAssembler provides same rich context to drafts as main chat engine | DraftContextAssembler reuses same infrastructure: buildEntityAwarePrompt, baseplateSnapshot, proactiveRecall, searchVectors, getActiveOrders |
| DRAFT-04 | Confidence scoring reflects actual context depth | Replace hardcoded 0.7 with computed score: base + entity_timeline_bonus + memory_palace_bonus + rag_bonus + conversation_history_bonus |
| DRAFT-05 | Standing orders and per-contact voice preferences applied to every draft | matchOrdersToContext() for standing orders + resolveVoice() already handles per-contact voice_profile_id; wire both into draft prompt |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @anthropic-ai/sdk | existing | LLM calls for draft generation | Already used throughout codebase |
| @supabase/supabase-js | existing | Database access for all context sources | Already used throughout codebase |
| vitest | existing | Unit + integration testing | Already configured in project |

### Supporting (All Already in Codebase)
| Module | Location | Purpose | How Used |
|--------|----------|---------|----------|
| ContextAssembler | `lib/context-assembly/context-assembler.ts` | Multi-tier context assembly | Reuse pattern, not the class directly (draft context is contact-scoped) |
| BaseplateSnapshot | `lib/context/baseplate-snapshot.ts` | Pre-computed entity profiles with graph enrichment | Load for the target contact |
| Proactive Recall | `lib/memory-palace/proactive-recall.ts` | Surface relevant memories, decisions, patterns | Recall for contact entity ID |
| RAG Retriever | `lib/rag/retriever.ts` | Hybrid dense+sparse search with reranking | Search for messages involving this contact |
| Standing Orders | `lib/intelligence/standing-orders.ts` | Persistent user directives | matchOrdersToContext() + formatOrdersForPrompt() |
| Relationship Scorer | `lib/intelligence/relationship-scorer.ts` | 0-100 strength with trend | Include score in draft prompt for calibration |
| Contact Timing | `lib/intelligence/contact-timing.ts` | Optimal send windows per contact | Surface in draft metadata (not prompt) |
| Briefing Packets | `lib/intelligence/briefing-packets.ts` | Pre-computed per-contact context | Use buildContactBriefing() pattern |
| Voice Resolution | `lib/agent/client-comms.ts` | Contact-level -> org-level -> disk voice cascade | Already called; just pass to enriched prompt |
| Tone Adapter | `lib/roles/comms/tone-adapter.ts` | Formality/verbosity/greeting adaptation | Apply after LLM draft via adaptDraft() |
| Client Profiles | `lib/agent/client-profiles.ts` | Per-contact communication_patterns JSONB | Read preferred channel, tone, frequency |
| Sentiment Analysis | `lib/agent/sentiment.ts` | Incoming message sentiment | Already called in draftReply() |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom DraftContextAssembler | Reuse ContextAssembler directly | ContextAssembler is thread-scoped (userId+threadId), drafts are contact-scoped. Building a focused assembler avoids unnecessary thread history and adds contact-specific data. |
| Sonnet for all drafts | Haiku for simple acks, Sonnet for complex | Cost savings, but consistency matters more for voice matching. Use `conversation` model (Sonnet) for all drafts. |
| Separate evaluation service | LLM-as-judge in vitest | External service adds infra overhead. In-test evaluation with stored fixtures is sufficient for v1. |

## Architecture Patterns

### Recommended Project Structure
```
personal-assistant/src/lib/agent/
  client-comms.ts                    # MODIFY: wire DraftContextAssembler into draftReply
  draft-context-assembler.ts         # NEW: contact-scoped context assembly for drafts

personal-assistant/src/lib/agent/__tests__/
  draft-context-assembler.test.ts    # NEW: unit tests
  draft-quality-eval.test.ts         # NEW: blind comparison evaluation harness
```

### Pattern 1: Contact-Scoped Context Assembly
**What:** A focused context assembler that gathers all context relevant to drafting a reply to a specific contact, in parallel.
**When to use:** Every time `draftReply` is called for LLM-generated (non-template) drafts.
**Example:**
```typescript
// Source: Derived from existing ContextAssembler pattern in context-assembler.ts
export interface DraftContext {
  contactBriefing: string       // Entity profile, recent interactions, projects
  conversationHistory: string   // Last N messages with this contact across channels
  memoryRecall: string          // Memory Palace entries for this entity
  ragContext: string            // Relevant retrieved documents
  standingOrders: string        // Matching standing orders for this contact/channel
  relationshipScore: number     // 0-100
  relationshipTrend: string     // rising/stable/declining/cold
  confidenceScore: number       // Computed from context depth
  metadata: DraftContextMetadata
}

export async function assembleDraftContext(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string,
  contactSlug: string,
  incomingMessage: string,
  channel: string,
): Promise<DraftContext> {
  // Parallel fetch all sources (same pattern as ContextAssembler.assemble)
  const [baseplate, memories, rag, orders, relationship, history] = await Promise.all([
    getBaseplateSnapshot(supabase, orgId, 'contact', contactId),
    proactiveRecall(supabase, orgId, [contactId]),
    searchVectors({ query: incomingMessage, orgId, topK: 5 }),
    getActiveOrders(supabase, orgId),
    computeRelationshipStrength(supabase, orgId, contactId),
    loadContactMessageHistory(supabase, orgId, contactId, 10),
  ])
  // ... format and return
}
```

### Pattern 2: Context-Depth Confidence Scoring
**What:** Confidence is computed from actual context availability, not hardcoded.
**When to use:** After context assembly, before returning the draft.
**Example:**
```typescript
function computeDraftConfidence(ctx: DraftContext): number {
  let score = 0.40 // base: we have the incoming message and voice

  if (ctx.conversationHistory.length > 0) score += 0.15  // know conversation history
  if (ctx.contactBriefing.length > 100)   score += 0.15  // have entity context
  if (ctx.memoryRecall.length > 0)        score += 0.10  // have memory palace entries
  if (ctx.ragContext.length > 0)          score += 0.10  // have RAG-retrieved docs
  if (ctx.standingOrders.length > 0)      score += 0.05  // have applicable standing orders
  if (ctx.relationshipScore > 50)         score += 0.05  // know relationship well

  return Math.min(score, 0.95) // never fully confident for auto-send
}
```

### Pattern 3: Enriched Draft Prompt
**What:** Replace the minimal system prompt in `generateContextualReplyWithLLM` with a context-rich prompt.
**When to use:** For all LLM-generated drafts.
**Example:**
```typescript
const systemPrompt = `You are drafting a ${channel} reply on behalf of the business owner.

## Contact: ${contactName}
${ctx.contactBriefing}

## Relationship
Strength: ${ctx.relationshipScore}/100, Trend: ${ctx.relationshipTrend}

## Recent Conversation History
${ctx.conversationHistory || 'No prior messages found.'}

## Relevant Context
${ctx.ragContext || 'No additional context.'}

## Institutional Knowledge
${ctx.memoryRecall || 'No specific memories.'}

## Standing Orders
${ctx.standingOrders || 'No specific directives.'}

## Voice
Tone: ${tone}
${styleGuide ? `Style Guide: ${styleGuide}` : ''}
Sign off: ${signOff}
${sentimentNote}

${channelGuidance[channel]}

Draft a natural reply that demonstrates knowledge of the relationship and ongoing work.
Reference specific projects, tasks, or interactions where relevant.
Return ONLY the message body, no metadata.`
```

### Anti-Patterns to Avoid
- **Stuffing all context into prompt without budgeting:** Context assembly must respect token limits. Use the existing TokenBudgetManager pattern from ContextAssembler.
- **Calling ContextAssembler.assemble() directly:** It expects userId+threadId (chat thread context), not contactId. The draft path needs contact-scoped context.
- **Making the LLM call synchronous with all context fetches:** All context sources MUST be fetched in parallel (Promise.all), not sequentially.
- **Hardcoding confidence:** The current 0.7 hardcode tells the user nothing about draft quality. Compute from actual context depth.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Entity profile compilation | Custom contact summary generator | `getBaseplateSnapshot()` | Already pre-computed with 6h TTL, includes graph enrichment |
| Memory retrieval | Custom memory search for contacts | `proactiveRecall()` + `formatProactiveRecall()` | Already handles confidence thresholds, token budgets, formatting |
| Document retrieval | Custom search | `searchVectors()` + `formatChunksForContext()` | Already has hybrid dense+sparse, reranking, sandwich ranking, caching |
| Standing order matching | Custom filter logic | `matchOrdersToContext()` + `formatOrdersForPrompt()` | Already handles AND-logic condition matching |
| Voice resolution | Custom voice lookup | `resolveVoice()` (already in client-comms.ts) | Already handles contact -> client profile -> org -> disk cascade |
| Tone adaptation | Custom post-processing | `adaptDraft()` from tone-adapter.ts | Already handles formality, verbosity, greeting/sign-off adaptation |
| Token counting | Custom tokenizer | `TokenBudgetManager` from context-assembly | Already has fast char-based heuristic within 10% accuracy |

**Key insight:** Every context source for the draft path already exists in the codebase. The work is wiring them together and building the contact-scoped context assembly, NOT building new data sources.

## Common Pitfalls

### Pitfall 1: Context Overflow Blowing Token Budget
**What goes wrong:** Stuffing baseplate + history + memories + RAG + standing orders into a single prompt exceeds Sonnet's effective context window for quality output.
**Why it happens:** Each source can independently be large. A busy contact might have 20 recent messages, 5 memory entries, 5 RAG chunks, and a detailed baseplate snapshot.
**How to avoid:** Implement token budgeting for the draft context. Total draft context budget: ~4000 tokens (leaving room for the incoming message and response). Use the existing `TokenBudgetManager` pattern with priority tiers: (1) incoming message + voice, (2) conversation history, (3) entity briefing, (4) standing orders, (5) memory palace, (6) RAG context.
**Warning signs:** Drafts that ignore parts of the conversation or hallucinate project names not in the context.

### Pitfall 2: Latency Spike From Sequential Fetches
**What goes wrong:** Draft assembly takes 2+ seconds because context sources are fetched one at a time.
**Why it happens:** Each source is an independent database/API call. Sequential execution adds latency.
**How to avoid:** Use `Promise.all` for all independent fetches (same pattern as ContextAssembler). Target: <200ms for context assembly (matches ContextAssembler's target).
**Warning signs:** User-perceptible delay between "draft response" action and draft appearing.

### Pitfall 3: Confidence Score Not Calibrated to Reality
**What goes wrong:** High confidence on a draft that references wrong projects or misses critical standing orders.
**Why it happens:** Confidence is computed from context availability, not from whether the context is correct or complete.
**How to avoid:** Cap confidence at 0.95 (never auto-send without review). Add negative modifiers: if contact has < 5 entity_timeline events, reduce confidence. If relationship_score < 20 (cold/unknown), reduce confidence. If no conversation history found, reduce confidence.
**Warning signs:** Auto-sent replies that miss important context the user would have included.

### Pitfall 4: Evaluation Harness Without Real Data
**What goes wrong:** Blind comparison test passes with synthetic data but doesn't reflect actual draft quality.
**Why it happens:** The evaluation needs real (incoming_message, user_actual_reply) pairs, not synthetic ones.
**How to avoid:** Build a fixture-based evaluation using real message pairs from channel_messages (Andy's actual replies). Store 10-20 pairs as test fixtures. Use LLM-as-judge (Sonnet or Opus) to score drafts against the user's actual reply on dimensions: correctness, tone match, detail level, actionability.
**Warning signs:** Evaluation passes but user consistently rejects or heavily edits drafts.

### Pitfall 5: Standing Orders Not Contact-Filtered
**What goes wrong:** All standing orders are dumped into the draft prompt, including irrelevant ones.
**Why it happens:** `getActiveOrders()` returns all active orders. Only orders matching the current contact/channel should be included.
**How to avoid:** Use `matchOrdersToContext()` with the contact's name, email, and channel before formatting for the prompt.
**Warning signs:** Drafts that follow directives intended for other contacts.

## Code Examples

### Current Draft Path (What Exists)
```typescript
// Source: personal-assistant/src/lib/agent/client-comms.ts, line 286-349
// The LLM receives ONLY: contact name, message, voice tone, style guide, sign-off, channel
// ZERO context about projects, history, relationships, memories, or standing orders
async function generateContextualReplyWithLLM(
  name: string,
  incoming: string,
  tone: string,
  styleGuide: string,
  signOff: string,
  channel: 'email' | 'whatsapp' | 'sms',
  sentiment?: SentimentResult,
): Promise<string> {
  // ...
  const systemPrompt = `You are a professional communication assistant drafting ${channel} replies.
Tone: ${tone}
${styleGuide ? `Style Guide: ${styleGuide}` : ''}
// ... no entity context, no history, no memories, no standing orders
`
}
```

### Proposed Integration Point
```typescript
// Source: Proposed modification to client-comms.ts draftReply()
export async function draftReply(
  supabase: SupabaseClient,
  orgId: string,
  request: DraftRequest,
): Promise<DraftedReply> {
  const voice = await resolveVoice(supabase, orgId, request.contactSlug)

  // Resolve contact for context assembly
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, name, communication_patterns, emails')
    .eq('org_id', orgId)
    .eq('slug', request.contactSlug)
    .single()

  // ... template paths remain unchanged ...

  // LLM draft: NOW with full context
  const draftCtx = await assembleDraftContext(
    supabase, orgId,
    contact.id, request.contactSlug,
    request.incomingMessage, request.channel,
  )

  const body = await generateContextualReplyWithLLM(
    contact.name,
    request.incomingMessage,
    voice.tone, voice.styleGuide, voice.signOff,
    request.channel,
    sentiment,
    draftCtx, // NEW: rich context
  )

  // Apply tone adaptation
  const adapted = adaptDraft(body, toneProfile)

  return maybeQueueForApproval(supabase, orgId, request, {
    body: adapted.adaptedDraft,
    voice: voice.voiceName,
    confidence: draftCtx.confidenceScore, // NEW: computed, not hardcoded 0.7
    sentiment,
  })
}
```

### Loading Contact Message History
```typescript
// Source: Derived from existing channel_messages queries in follow-up-tracker.ts
async function loadContactMessageHistory(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string,
  limit: number = 10,
): Promise<string> {
  const { data: messages } = await supabase
    .from('channel_messages')
    .select('body, subject, channel, direction, received_at, sender')
    .eq('org_id', orgId)
    .eq('contact_id', contactId)
    .order('received_at', { ascending: false })
    .limit(limit)

  if (!messages || messages.length === 0) return ''

  // Format as chronological conversation thread
  return messages.reverse().map(m => {
    const dir = m.direction === 'inbound' ? m.sender : 'Us'
    const date = new Date(m.received_at).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
    return `[${date} via ${m.channel}] ${dir}: ${(m.body || '').slice(0, 300)}`
  }).join('\n')
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Generic LLM draft with just name + message | Context-enriched draft with full entity knowledge | This phase | Drafts reference real projects, invoices, and past interactions |
| Hardcoded confidence 0.7/0.75/0.85 | Computed confidence from context depth | This phase | Autonomy gate makes better approve/escalate decisions |
| Voice only from org-level profile | Per-contact voice preferences + tone learning | Phase 22b (exists) | Just needs wiring into draft prompt |
| Standing orders in chat prompt only | Standing orders matched and injected in draft prompt | This phase | Drafts follow user directives ("never discount for Steve") |

**Already built (just needs wiring):**
- Baseplate snapshots with graph enrichment (Phase 3/Total Recall)
- Memory Palace proactive recall (Total Recall)
- RAG hybrid search with reranking (T034 council sprint)
- Standing orders with context matching (Intelligence Layer)
- Relationship scoring with trend detection (Intelligence Layer)
- Contact timing analysis (Intelligence Layer)
- Tone learning and adaptation (Phase 22b Comms Role)
- Client profiles with communication_patterns (Phase 11/client-comms)

## Open Questions

1. **Evaluation data availability**
   - What we know: channel_messages contains Andy's actual sent replies alongside inbound messages
   - What's unclear: How many high-quality (incoming, reply) pairs exist for evaluation? Need at least 10-20 pairs for meaningful blind comparison.
   - Recommendation: Build the evaluation harness first, then populate fixtures from channel_messages. If insufficient real data, supplement with synthetic but note this in evaluation results.

2. **Token budget for draft context**
   - What we know: ContextAssembler uses 48k budget for the main chat. Drafts use `conversation` model (Sonnet) with 8192 max_tokens output.
   - What's unclear: Optimal input budget for draft quality. Too little context = generic draft. Too much = diluted attention.
   - Recommendation: Start with ~4000 token input budget for draft context (leaving 400 for output). Tune based on evaluation results.

3. **Contact ID availability in draft path**
   - What we know: `draftReply()` receives contactSlug, not contactId. The response-drafter passes contactId.
   - What's unclear: All callers.
   - Recommendation: Resolve contactId from slug in draftReply (it already does a contact lookup). No schema change needed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (already configured) |
| Config file | `personal-assistant/vitest.config.ts` |
| Quick run command | `cd personal-assistant && npx vitest run src/lib/agent/__tests__/draft-context-assembler.test.ts` |
| Full suite command | `cd personal-assistant && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DRAFT-01 | Draft context includes projects, tasks, invoices, recent interactions | unit | `npx vitest run src/lib/agent/__tests__/draft-context-assembler.test.ts -t "includes entity briefing"` | Wave 0 |
| DRAFT-02 | Blind comparison evaluation harness | integration | `npx vitest run src/lib/agent/__tests__/draft-quality-eval.test.ts` | Wave 0 |
| DRAFT-03 | Same context sources as main chat engine | unit | `npx vitest run src/lib/agent/__tests__/draft-context-assembler.test.ts -t "uses same infrastructure"` | Wave 0 |
| DRAFT-04 | Confidence reflects context depth | unit | `npx vitest run src/lib/agent/__tests__/draft-context-assembler.test.ts -t "confidence scoring"` | Wave 0 |
| DRAFT-05 | Standing orders and voice preferences applied | unit | `npx vitest run src/lib/agent/__tests__/draft-context-assembler.test.ts -t "standing orders"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd personal-assistant && npx vitest run src/lib/agent/__tests__/draft-context-assembler.test.ts`
- **Per wave merge:** `cd personal-assistant && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/agent/__tests__/draft-context-assembler.test.ts` -- covers DRAFT-01, DRAFT-03, DRAFT-04, DRAFT-05
- [ ] `src/lib/agent/__tests__/draft-quality-eval.test.ts` -- covers DRAFT-02 (blind comparison harness)
- [ ] Test fixtures: 10-20 real (incoming, actual_reply) pairs from channel_messages

## Sources

### Primary (HIGH confidence)
- `personal-assistant/src/lib/agent/client-comms.ts` -- current draft path, all functions analyzed
- `personal-assistant/src/lib/context-assembly/context-assembler.ts` -- full ContextAssembler implementation
- `personal-assistant/src/lib/roles/comms/response-drafter.ts` -- current response drafter wrapper
- `personal-assistant/src/lib/roles/comms/tone-adapter.ts` -- tone learning and adaptation
- `personal-assistant/src/lib/roles/comms/comms-role.ts` -- comms role evaluate() flow
- `personal-assistant/src/lib/memory-palace/proactive-recall.ts` -- proactive memory recall
- `personal-assistant/src/lib/rag/retriever.ts` -- RAG hybrid search
- `personal-assistant/src/lib/intelligence/standing-orders.ts` -- standing order management
- `personal-assistant/src/lib/intelligence/relationship-scorer.ts` -- relationship strength computation
- `personal-assistant/src/lib/intelligence/contact-timing.ts` -- optimal send windows
- `personal-assistant/src/lib/intelligence/briefing-packets.ts` -- pre-computed briefing pattern
- `personal-assistant/src/lib/context/baseplate-snapshot.ts` -- entity profile snapshots
- `personal-assistant/src/lib/agent/client-profiles.ts` -- per-contact communication patterns
- `personal-assistant/src/lib/agent/prompt-builder.ts` -- system prompt builder (standing orders already wired here)
- `personal-assistant/src/lib/agent/engine/taor-loop.ts` -- TAOR loop context assembly integration point
- `personal-assistant/src/lib/agent/model-registry.ts` -- model resolution (conversation = Sonnet)
- `.planning/total-recall/02-context-assembly-architecture.md` -- architectural design doc

### Secondary (MEDIUM confidence)
- Phase 22b summaries -- confirmed comms role implementation details

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all modules already exist in codebase, thoroughly analyzed
- Architecture: HIGH -- clear wiring pattern, follows existing ContextAssembler approach
- Pitfalls: HIGH -- based on direct analysis of current code gaps and existing patterns
- Evaluation approach: MEDIUM -- depends on availability of real message pairs in channel_messages

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (stable codebase, all dependencies already built)
