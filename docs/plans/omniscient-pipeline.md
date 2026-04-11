# BitBit Omniscient Pipeline — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill. Separate worktrees per track.

**Goal:** Build the structured AI processing backbone that makes BitBit truly omniscient — every channel message gets typed extraction, every entity gets relationship-mapped, intelligence workflows run continuously, and the proactive agent layer acts within confidence thresholds.

**Architecture:** Three new layers on top of existing channel infrastructure:
1. **Structured Ingestion** — AI SDK generateObject() with Zod schemas replacing regex/heuristic extraction
2. **Intelligence Workflows** — WDK patterns (parallel, sequential, evaluator) for automated analysis
3. **Proactive Agent Layer** — Confidence-gated autonomous actions

**Branch:** `feat/omniscient-pipeline`
**Working dir:** `~/bitbit/personal-assistant`
**Depends on:** Tracks A-E from ai-sdk-patterns-integration (provider config, patterns)

---

## Track G: Structured Channel Ingestion Pipeline

Replace the current ingest-enrichment.ts (360 lines, regex + single Haiku call for summary) with a comprehensive AI SDK generateObject() pipeline that extracts typed, validated data from every channel message.

### Task G1: Create ingestion Zod schemas

**Objective:** Define typed schemas for everything extracted from channel messages.

**Files:**
- Create: `src/lib/ingestion/schemas.ts`

The schemas should cover:
```typescript
// MessageClassification — what kind of message is this?
z.object({
  category: z.enum(['billing', 'project_update', 'client_request', 'meeting', 'lead', 'support', 'personal', 'newsletter', 'notification', 'other']),
  subcategory: z.string().optional(),
  confidence: z.number().min(0).max(1),
  isActionable: z.boolean(),
  urgency: z.enum(['critical', 'high', 'medium', 'low', 'none']),
  suggestedActions: z.array(z.string()).max(3),
})

// EntityExtraction — who/what is mentioned?
z.object({
  people: z.array(z.object({
    name: z.string(),
    role: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
  })),
  organisations: z.array(z.object({
    name: z.string(),
    type: z.string().optional(),
  })),
  monetary: z.array(z.object({
    amount: z.number(),
    currency: z.string().default('AUD'),
    context: z.string(),  // "invoice payment", "quote", "overdue"
  })),
  dates: z.array(z.object({
    date: z.string(),  // ISO
    context: z.string(),  // "deadline", "meeting", "follow-up"
  })),
  references: z.array(z.object({
    type: z.enum(['invoice', 'project', 'ticket', 'order', 'contract']),
    value: z.string(),
  })),
})

// RelationshipSignal — what does this tell us about the relationship?
z.object({
  sentiment: z.enum(['very_positive', 'positive', 'neutral', 'negative', 'very_negative']),
  intent: z.enum(['request', 'inform', 'approve', 'reject', 'escalate', 'thank', 'complain', 'follow_up', 'other']),
  engagementLevel: z.enum(['high', 'medium', 'low']),
  riskSignals: z.array(z.string()),  // "delayed payment", "scope creep", "going quiet"
  opportunitySignals: z.array(z.string()),  // "upsell potential", "referral mention"
})

// MessageSummary — concise structured summary
z.object({
  oneLiner: z.string().max(120),
  keyPoints: z.array(z.string()).max(5),
  actionItems: z.array(z.object({
    description: z.string(),
    assignee: z.string().optional(),
    dueDate: z.string().optional(),
    priority: z.enum(['high', 'medium', 'low']),
  })),
})
```

### Task G2: Create the structured ingestion engine

**Objective:** A pipeline that runs generateObject() for each schema against incoming messages, replacing the single Haiku summary call.

**Files:**
- Create: `src/lib/ingestion/engine.ts`
- Create: `src/lib/ingestion/index.ts`

The engine should:
- Accept a ChannelMessage (from existing types)
- Run classification, entity extraction, relationship signal, and summary in PARALLEL (Promise.allSettled)
- Use models.fast (Haiku) for classification + entity extraction (high volume, needs speed)
- Use models.balanced (Sonnet) for relationship signals + summary (needs nuance)
- Return a typed IngestionResult combining all extractions
- Be fire-and-forget safe (never throw, log warnings)
- Include token cost tracking
- Include timing metrics

### Task G3: Create contact resolution and graph population

**Objective:** Cross-reference extracted entities against existing contacts and populate the knowledge graph.

**Files:**
- Create: `src/lib/ingestion/contact-resolver.ts`
- Create: `src/lib/ingestion/graph-writer.ts`

Contact resolver should:
- Take extracted people/orgs and match against contacts table
- Fuzzy match on name, exact match on email/phone
- Return matched contact IDs or flag new contacts for creation
- Cache lookups per org (existing pattern in entity-extractor.ts)

Graph writer should:
- Write entity mentions to the knowledge graph (existing rag/graph-populator.ts pattern)
- Create/update relationship edges between entities
- Store relationship signals (sentiment, engagement, risk)

### Task G4: Wire ingestion engine into channel sync

**Objective:** Replace the existing ingest-enrichment.ts call in the synthesizer with the new structured pipeline.

**Files:**
- Modify: `src/lib/channels/synthesizer.ts` — swap enrichMessage() call
- Modify: `src/lib/intelligence/ingest-enrichment.ts` — deprecate, redirect to new engine
- Create: `src/lib/ingestion/adapters.ts` — adapter from ChannelMessage to ingestion input

### Task G5: Create ingestion monitoring dashboard data

**Objective:** API route to expose ingestion metrics (messages processed, extraction quality, cost).

**Files:**
- Create: `src/app/api/ingestion/stats/route.ts`
- Create: `src/app/api/ingestion/health/route.ts`

---

## Track H: Intelligence Workflows

Use the WDK patterns (from Track E) to build automated intelligence workflows that run on ingested data.

### Task H1: Lead Research Pipeline

**Objective:** When a new lead is detected (from email, form, WhatsApp), automatically research and score them.

**Files:**
- Create: `src/lib/intelligence/workflows/lead-research.ts`

Uses the PARALLEL workflow pattern:
1. Parallel: web search for company, check LinkedIn, search existing contacts
2. Sequential: score lead fit, enrich contact record, draft outreach
3. Evaluator: quality-gate the outreach draft

### Task H2: Revenue Health Monitor

**Objective:** Continuous monitoring of financial signals across all channels.

**Files:**
- Create: `src/lib/intelligence/workflows/revenue-health.ts`

Uses the SEQUENTIAL workflow pattern:
1. Aggregate all monetary mentions from recent ingestion
2. Cross-reference with invoice status (Stripe/Xero data)
3. Detect: overdue payments, scope creep signals, pricing conversations
4. Generate revenue health score per client
5. Flag anomalies for proactive alerts

### Task H3: Relationship Drift Detector

**Objective:** Detect when client relationships are changing (going quiet, sentiment shift, engagement drop).

**Files:**
- Create: `src/lib/intelligence/workflows/relationship-drift.ts`

Uses the EVALUATOR workflow pattern:
1. Aggregate relationship signals per contact over time windows (7d, 30d, 90d)
2. Evaluate: is there a statistically significant drift?
3. Score drift severity and direction
4. If significant: generate alert with recommended action

### Task H4: Meeting Intelligence Pipeline

**Objective:** After a meeting transcript is processed, extract structured intelligence.

**Files:**
- Create: `src/lib/intelligence/workflows/meeting-intel.ts`

Uses the ORCHESTRATOR workflow pattern:
1. Plan: identify what kind of meeting (sales, project, internal)
2. Worker 1: Extract decisions made
3. Worker 2: Extract action items with owners and dates
4. Worker 3: Extract commitments and promises
5. Worker 4: Assess relationship dynamics
6. Synthesise into structured meeting intelligence object

### Task H5: Workflow registry and scheduler integration

**Objective:** Register all intelligence workflows so they can be triggered by cron jobs and channel events.

**Files:**
- Create: `src/lib/intelligence/workflows/index.ts` (registry)
- Create: `src/lib/intelligence/workflows/types.ts` (shared types)
- Modify: `src/app/api/cron/intelligence/route.ts` — wire in new workflows

---

## Track I: Proactive Agent Layer

The layer that decides "should BitBit act without being asked?"

### Task I1: Proactive action classifier

**Objective:** Given accumulated intelligence signals, decide whether to act.

**Files:**
- Create: `src/lib/proactive/classifier.ts`

Uses generateObject() with a decision schema:
```typescript
z.object({
  shouldAct: z.boolean(),
  action: z.enum(['alert_user', 'draft_message', 'create_task', 'update_contact', 'flag_risk', 'suggest_opportunity', 'none']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  urgency: z.enum(['immediate', 'today', 'this_week', 'whenever']),
  channel: z.enum(['chat_whisper', 'email_digest', 'push_notification', 'whatsapp']).optional(),
})
```

### Task I2: Action execution engine

**Objective:** Execute approved proactive actions within autonomy boundaries.

**Files:**
- Create: `src/lib/proactive/executor.ts`
- Create: `src/lib/proactive/types.ts`

Must respect existing autonomy levels (L1-L4) from intelligence/autonomy-levels.ts.
L4 (silent): execute without telling user
L3 (notify): execute and notify
L2 (suggest): suggest action, wait for approval
L1 (ask): present options, require explicit choice

### Task I3: Proactive alert aggregator

**Objective:** Batch and prioritise proactive alerts to avoid overwhelming the user.

**Files:**
- Create: `src/lib/proactive/aggregator.ts`

Deduplicates similar alerts, batches low-urgency ones into digests, ensures critical ones go through immediately.

### Task I4: Wire proactive layer into cron system

**Objective:** Proactive classifier runs on a schedule, processing accumulated intelligence.

**Files:**
- Create: `src/app/api/cron/proactive-intelligence/route.ts`
- Create: `src/lib/proactive/index.ts`

---

## Execution Strategy

```
Track G (Structured Ingestion): 6 files, foundational — do first
Track H (Intelligence Workflows): 6 files, depends on G schemas
Track I (Proactive Agent): 5 files, depends on H outputs

PARALLEL EXECUTION:
  - G1-G3 can run in parallel (schemas, engine, graph writer)
  - G4-G5 depend on G1-G3
  - H1-H4 can ALL run in parallel (independent workflows)
  - H5 depends on H1-H4
  - I1-I3 can run in parallel
  - I4 depends on I1-I3
```

**Agent assignment:**
- Team 1 (Claude Code): Track G (ingestion — needs full codebase context for existing types/patterns)
- Team 2 (delegate_task): Track H (workflows — pattern-based, more self-contained)
- Team 3 (delegate_task): Track I (proactive — needs intelligence layer understanding)
