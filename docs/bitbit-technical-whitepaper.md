# BitBit Technical White Paper
## Six Core Innovations in Autonomous Agentic AI for Small Business

**Version 1.0 — April 2026**  
**Confidential — Not for Public Distribution Prior to Patent Filing**

---

## Abstract

BitBit is an agentic AI operations platform that gives small business operators a continuously-running AI that reads their messages, manages their finances, triages communications, and acts autonomously across connected services. This white paper details six novel technical systems that underpin the BitBit platform, each addressing a specific unsolved problem in the deployment of autonomous AI agents at the individual business level. These systems span infrastructure provisioning, knowledge representation, inference optimisation, context management, action safety, and compute lifecycle management.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Invention I — Warm Pool Pre-Provisioning for iMessage Bridge Instances](#2-invention-i)
3. [Invention II — Ingestion-Time Entity Knowledge Graph (Context Baseplate)](#3-invention-ii)
4. [Invention III — Two-Model Tool Group Pre-Planner with KV Cache Optimisation](#4-invention-iii)
5. [Invention IV — Tiered Conversation Compression with Cross-Channel Identity Resolution](#5-invention-iv)
6. [Invention V — Per-Agent Confidence Threshold Cascade with Three-Way Action Routing](#6-invention-v)
7. [Invention VI — Tiered Lifecycle Management for Per-User Protocol Bridge Machines](#7-invention-vi)
8. [System Integration](#8-system-integration)
9. [Conclusion](#9-conclusion)

---

## 1. Introduction

### The Problem Space

Small business operators — agency owners, tradespeople, consultants, service providers — spend a disproportionate share of their working hours on administrative overhead: responding to messages across multiple platforms, issuing and following up on invoices, qualifying leads, preparing proposals. The tools available to them are either passive (they require instruction to act) or siloed (they operate on one channel at a time with no shared understanding of the business).

Existing AI assistant products are almost universally reactive. They wait for a prompt, execute a task, and stop. They do not maintain a persistent model of the business's relationships, financial state, or communications context. They cannot act on your behalf while you are on a job site with dirty hands.

BitBit is designed around a different model: a continuously-running AI that learns the business at ingestion time, not query time, and acts autonomously within configurable safety boundaries. To achieve this, six foundational technical problems had to be solved.

### Architecture Overview

BitBit runs as a cloud-hosted platform where each user receives their own isolated AI instance. The core data layer is a Postgres database (via Supabase) with Row Level Security enforced at every query boundary. The AI engine is built on Anthropic's Claude model family. Messaging bridges to WhatsApp, Android Messages, and iMessage run as per-user compute instances on Fly.io and Mac VPS infrastructure. The six inventions described in this paper are implemented across this stack.

```
User Devices (WhatsApp / iMessage / SMS / Email / Web)
        │
        ▼
Per-User Bridge Machines ──► Message Ingestion Pipeline
        │                              │
        │                    Entity Mention Scanner
        │                    Cross-Reference Builder
        │                    Pattern Extractor
        │                    Dossier Compiler
        │                              │
        │                     Context Baseplate
        │                    (entity_dossiers DB)
        │                              │
        ▼                              ▼
  TAOR Agent Engine ◄─── Context Assembler (Token Budget)
        │
        ├─► Haiku Planner (tool group selection)
        │
        ├─► Claude Sonnet/Opus (main inference)
        │
        ▼
  Confidence Router
        │
   ┌────┴──────┐
   ▼           ▼           ▼
 AUTO-ACT   APPROVAL    ESCALATE
           QUEUE
```

---

## 2. Invention I

### Warm Pool Pre-Provisioning for iMessage Bridge Instances

#### 2.1 Background

Apple's iMessage protocol does not offer a public API. To enable AI-driven iMessage access for end users, the established approach is to run the BlueBubbles server application on a macOS instance, which authenticates with Apple ID and relays messages. Each user requires their own dedicated Mac instance to hold their Apple session.

Provisioning a Mac VPS from scratch involves: ordering a virtual machine from a provider, installing the operating system image, configuring SSH access, installing BlueBubbles, configuring network tunnels, and completing Apple ID authentication via VNC. Under optimal conditions this takes 10 to 20 minutes. At any kind of scale, this is not acceptable as an on-demand provisioning path.

The engineering challenge is clear: how do you give a new user an active iMessage bridge in under 5 seconds?

#### 2.2 The Warm Pool System

The solution is a pre-provisioned warm pool of Mac VPS instances maintained in a ready state, waiting to be claimed.

The pool operates as a logical entity within the database — a sentinel organisation with the reserved identifier `__bitbit_pool__`. Pool instances are stored as records in the `org_connections` table with `status = 'pending'` and `org_id = '__bitbit_pool__'`. Each record carries a complete `BlueBubblesConfig`:

```
bb_server_url        — BlueBubbles API endpoint
bb_password          — server authentication credential
vps_ip               — raw IP address of the Mac instance
vps_id               — provider machine identifier
ssh_key_fingerprint  — for secure tunnel operations
vnc_port             — for remote desktop access
vnc_password         — for VNC authentication
```

When a new user initiates an iMessage connection, the `VpsPool.claimInstance()` method performs an atomic ownership transfer:

```
BEFORE: { org_id: '__bitbit_pool__', status: 'pending', config: { ... } }

AFTER:  { org_id: '<real_org_id>', status: 'disabled',
          config: { ..., status: 'claimed', claimed_by: '<connectionId>' } }
```

The record transitions to `disabled` during the brief linking window (Apple ID authentication via VNC), then to `connected` once the user completes authentication. From the user's perspective, a fully pre-configured Mac instance is available the moment they initiate the connection — sub-5-second delivery.

#### 2.3 Pool Replenishment

The system continuously monitors pool depth via `getPoolCount()`. When the count falls below the target (`TARGET_POOL_SIZE = 2`), a background process provisions new Mac VPS instances, installs BlueBubbles, configures tunnels, and adds them to the pool via `addToPool()`. This provisioning happens asynchronously, disconnected from any user-facing operation.

Pool instances are invisible to standard org-scoped queries due to Row Level Security policies, which filter by `org_id`. The sentinel org is a deliberate escape hatch from multi-tenancy isolation, used only for this provisioning purpose.

#### 2.4 Technical Significance

This system inverts the provisioning model. Instead of provisioning in response to demand, it provisions in anticipation of demand. The result is deterministic sub-5-second iMessage bridge availability regardless of underlying VPS provisioning latency, which can be non-deterministic and subject to provider delays.

The database-backed ownership model also provides auditability: every pool claim is a permanent record tied to a connection ID and timestamp, enabling full lifecycle traceability.

---

## 3. Invention II

### Ingestion-Time Entity Knowledge Graph (Context Baseplate)

#### 3.1 Background

The dominant approach to AI context retrieval is Retrieval-Augmented Generation (RAG): at inference time, the system performs a vector similarity search over stored documents and injects the top results into the model context. This approach works well for document Q&A but has fundamental limitations for an AI that must understand a business's relationships:

- **Query-time latency:** Retrieval runs during inference, adding 200–800ms to every response.
- **Shallow cross-entity reasoning:** A vector search finds documents similar to the query but cannot pre-compute multi-hop relationships (e.g., "Dave mentioned Steve's project in last Tuesday's email, and Steve owes us $4,200").
- **No predictive pre-loading:** Standard RAG cannot anticipate which entities will be relevant to a message before it is read.

#### 3.2 The Context Baseplate Architecture

BitBit inverts this model. Knowledge about entities is compiled at ingestion time — when a message arrives — not at query time. The result is stored as a ready-to-serve snapshot that can be retrieved in a single database lookup with no inference overhead.

The system has two tiers:

**Tier 1 — Entity Dossiers (primary)**

The `entity_dossiers` table stores LLM-compiled rich markdown documents for known entities. A dossier is a synthesised narrative that includes:
- Communication patterns and frequency
- Relationship map (who this entity connects to and how)
- Financial history (invoices, payment timing, outstanding amounts)
- Active threads and open topics
- Key facts extracted from all historical messages

Dossiers are compiled by a language model running at ingestion time. They are versioned and timestamped. At retrieval, the system performs a case-insensitive name lookup ordered by `last_compiled_at` descending, returning the most current dossier.

**Tier 2 — Entity Profiles (fallback)**

For entities without compiled dossiers, the system falls back to structured `entity_profiles` records containing:
- `recent_events`: timestamped activity log with channel attribution
- `relationships`: typed relationship edges with strength scores
- `memories`: extracted facts with confidence ratings and categories
- `event_summary`: aggregate statistics (total events, active channels, last event timestamp)

**The Snapshot Interface**

Both tiers return a `BaseplateSnapshot` object:

```typescript
{
  source: 'dossier' | 'profile',
  dossierMarkdown?: string,   // present for tier-1 hits
  profile: {
    recent_events, relationships, memories, event_summary,
    relationship_context: {
      related_people, topics, graph_distance
    }
  },
  computedAt: string,
  validUntil: string,
  stale: boolean,
  eventCount: number
}
```

The `stale` flag allows the system to serve a cached snapshot while triggering a background recompile — ensuring inference is never blocked on freshness.

#### 3.3 Ingestion Pipeline

When a message arrives, a pipeline of specialised modules processes it before a response is generated:

| Module | Function |
|--------|----------|
| `entity-mention-scanner.ts` | Detects named entity mentions using pattern matching and fuzzy lookup against known contacts |
| `pattern-extractor.ts` | Extracts behavioural patterns: payment timing, response latency, activity frequency, channel preference |
| `cross-reference.ts` + `xref-cache.ts` | Builds and caches entity-to-entity cross-references. Links related entities based on co-occurrence in messages |
| `relationship-linker.ts` | Establishes typed relationship edges with strength scores |
| `timeline-writer.ts` | Appends attributed event records to the entity timeline |

The cross-reference cache (`xref-cache.ts`) is particularly significant. When Dave's email mentions Steve's invoice, the cross-reference builder creates a link between Dave's entity record and Steve's entity record. At inference time, retrieving Dave's snapshot automatically surfaces his connection to Steve — without performing an additional search.

#### 3.4 Technical Significance

The key insight is that the cost of reasoning about entity relationships should be paid once at ingestion, not repeatedly at every query. A business operator who messages BitBit about Dave gets an immediate, pre-compiled understanding of who Dave is, what he owes, who he knows, and what threads are active — with zero retrieval latency.

This also enables a qualitatively different kind of response. Because the dossier is compiled by a language model with access to the full history, it contains synthesised insight ("Dave tends to pay 15 days late on invoices over $2,000") that a pure vector search could not surface.

---

## 4. Invention III

### Two-Model Tool Group Pre-Planner with KV Cache Optimisation

#### 4.1 Background

Modern LLM agents are given access to tools — functions the model can invoke to search, retrieve, send, or create things. As agent capability grows, the tool count grows with it. BitBit currently exposes 26+ tools across 6 groups. Passing all tool definitions to every inference call has two compounding costs:

**Token cost:** Tool definitions are verbose JSON schemas. 26 tool definitions add thousands of tokens to every prompt, even when 90% of them are irrelevant to the current message.

**Cache invalidation:** Anthropic's prompt caching (and similar provider features) caches the prefix of a prompt. If the tool list changes between calls — because different tools are selected per-query — the cache is invalidated and the full prompt must be re-processed. For an always-on agent handling hundreds of messages per day, cache misses compound into significant latency and cost overhead.

#### 4.2 The Two-Model Pre-Planner

The solution is a two-stage inference architecture:

**Stage 1 — Haiku Planner (fast, cheap)**

Before the main model runs, a lightweight model (Claude Haiku) receives only the user's message and returns a structured plan:

```typescript
{
  stages: PlanStage[],       // 1–4 named execution stages for UI display
  toolGroups: ToolGroup[],   // which groups to activate
  complexity: 'low' | 'medium' | 'high',
  skills: string[]
}
```

The planner's entire input is the message text. No conversation history, no entity context, no system prompt — just the message. This keeps the planner call minimal and fast.

**Stage 2 — Main Model (Claude Sonnet or Opus)**

The main model receives only the tools from the groups the planner selected, plus the always-included `core` group. A query about "send Sezer a WhatsApp" activates `channel` and `comms` groups — roughly 8–10 tools. A web research query activates `web` and `memory` — a different 8–10 tools. The full 26+ tool list never appears in a single prompt.

#### 4.3 Tool Group Taxonomy

Tools are pre-organised into stable, named groups:

| Group | Contents |
|-------|----------|
| `core` | Always included: contacts, tasks, memory, calendar basics |
| `memory` | Deep memory search, fact storage, memory consolidation |
| `channel` | Message find/read, cross-channel search |
| `web` | web_search, fetch_url, browse_website |
| `comms` | send_email, send_sms, send_gmail, send_whatsapp |
| `agentic` | spawn_agent, trigger_swarm, execute_code |
| `creative` | ad script, content generation, image tools |
| `composio` | Third-party integration actions (Xero, Asana, etc.) |

Because groups are pre-defined and stable, the same query category produces the same tool list. The system prompt + tool definitions remain constant across similar queries, producing high KV cache hit rates measured at 90–95%.

#### 4.4 Trivial Message Bypass

Running the planner for every message would add latency for simple interactions like greetings. The system applies a lightweight bypass:

```typescript
const TRIVIAL_PATTERNS = [
  /^(hi|hey|hello|yo|thanks|ok|okay|sure|yep|yeah|...)\b/i,
  /^.{1,12}$/,  // 12 characters or fewer
]
```

Messages matching these patterns skip the planner entirely. The main model runs with core tools only. For a message like "hey" or "thanks", the planner would have returned `toolGroups: []` anyway — the bypass eliminates the round trip.

#### 4.5 Technical Significance

The combination of pre-defined group taxonomy and a fast pre-selector model achieves two goals simultaneously: it keeps the main model's context focused (better reasoning, lower cost) and it keeps the tool list stable enough for KV cache reuse (lower latency, lower cost). These goals are in tension in naive per-query tool selection approaches, where selecting the most relevant tools necessarily produces variable context, destroying cache reuse.

The planner also produces UI-visible execution stages (`PlanStage[]`) that the dashboard renders as a real-time processing pipeline — a user-facing feature that costs nothing extra because the plan data is already generated.

---

## 5. Invention IV

### Tiered Conversation Compression with Cross-Channel Identity Resolution

#### 5.1 Background

An AI that operates continuously across a user's business accumulates substantial conversation history. Left unmanaged, this history exceeds context windows, degrades model performance, and drives token costs to unsustainable levels. Naive truncation (discard old messages) destroys continuity. Full history retention is prohibitively expensive.

Simultaneously, users interact with BitBit across multiple channels — they might send a WhatsApp message on Monday, reply to an email on Wednesday, and open the web dashboard on Friday. Without identity resolution, these interactions appear to the AI as unrelated sessions with three different users.

#### 5.2 Three-Tier Conversation Compression

BitBit applies a three-tier compression scheme to conversation history:

**Tier 1 — Verbatim (last 10 turns)**
The most recent 10 conversation turns are stored and served with full fidelity. Exact wording is preserved.

**Tier 2 — Compressed (turns 11–30)**
Turns 11 through 30 are compressed by Claude Haiku into dense summaries that preserve key information: names, amounts, commitments, dates, and decisions. Free-form prose is discarded; facts are retained.

**Tier 3 — Distilled (turns 31+)**
Turns beyond 30 are distilled into key facts only: commitments made, decisions taken, deadlines established, financial amounts discussed. This tier has minimal token cost but preserves the long-term memory that makes BitBit useful months into a relationship.

#### 5.3 Token Budget Manager

The context assembly pipeline operates under a strict token budget (48,000 tokens for standard queries; 200,000 for workspace operations). The `TokenBudgetManager` allocates this budget across six priority tiers using character-ratio heuristics:

```
Text:  3.5 characters per token
JSON:  3.0 characters per token
Per-message overhead: 4 tokens
```

Tiers are filled in priority order. When the budget is exhausted, lower-priority tiers are compressed or dropped. The budget manager uses heuristics rather than exact token counting (no tiktoken dependency) to keep assembly latency under 200ms — fast enough to run before every inference call without user-perceptible delay.

#### 5.4 Cross-Channel Identity Resolution

The `identity-resolver.ts` module maps inbound channel identifiers to authenticated users:

| Inbound identifier | Resolved to |
|--------------------|-------------|
| Phone number | user_id via `user_phone_numbers` table |
| Email address | user_id via `user_email_addresses` table |
| Slack user ID | user_id via `user_slack_ids` table |
| WhatsApp contact ID | user_id via `whatsapp_contacts` table |

All channels write to the same `conversation_thread` record for a given user. A user who messages BitBit on WhatsApp on Monday and via email on Wednesday has a single continuous thread — the AI remembers Monday's conversation when responding to Wednesday's email.

**Thread archival** runs on a 15-minute cron. Threads inactive for 24 hours are archived, keeping the active thread table compact.

#### 5.5 Technical Significance

The combination of tiered compression and cross-channel identity resolution produces an AI that maintains coherent, long-term memory across months of interactions and multiple platforms, at a token cost that scales logarithmically with conversation length rather than linearly. The three-tier scheme ensures that recent context is high-fidelity while long-term context is cost-efficient.

---

## 6. Invention V

### Per-Agent Confidence Threshold Cascade with Three-Way Action Routing

#### 6.1 Background

An AI that acts autonomously must have a safety model. The naive approach — a single confidence threshold above which the AI acts and below which it asks — fails because different actions carry radically different risk profiles. A confidence score of 0.80 is appropriate for auto-sending an alert. It is dangerously low for auto-sending a $15,000 invoice.

The system must calibrate its autonomy to the stakes of each action type, and must do so in a way that is configurable at multiple levels of specificity without becoming brittle.

#### 6.2 The Three-Way Routing Gate

Every agent action in BitBit passes through a three-way confidence gate:

```
Confidence Score
│
├─ ≥ act_threshold  →  AUTO-EXECUTE
│                      Action is taken immediately, logged to audit trail
│
├─ ≥ ask_threshold  →  APPROVAL QUEUE
│                      Action is drafted, user notified via WhatsApp or email
│                      User approves ("yep, send it") or rejects
│                      Approval matched via fuzzy NLU against pending queue
│
└─ < ask_threshold  →  ESCALATE
                       Immediate alert to user, no action taken
```

The ask-approval flow supports natural language confirmation. The `approve_action` tool lets the AI match a conversational response like "yep, send it" to the correct pending action using fuzzy matching, with expired actions automatically re-queued for reconsideration.

#### 6.3 Per-Agent-Type Risk Calibration

Default thresholds are configured per agent type, reflecting their risk profile:

| Agent | `act` threshold | `ask` threshold | Rationale |
|-------|-----------------|-----------------|-----------|
| `invoice-flow` | 0.92 | 0.60 | Money leaves the business |
| `client-comms` | 0.88 | 0.58 | Sends messages as the user |
| `proposal-bot` | 0.90 | 0.60 | Financial commitment |
| `quote-bot` | 0.90 | 0.58 | Pricing commitment |
| `channel-triage` | 0.80 | 0.50 | Routing decisions, reversible |
| `tender-hunter` | 0.80 | 0.50 | Research, no commitment |
| `sentry` | 0.75 | 0.45 | Alerting only, low stakes |
| `ad-script-gen` | 0.78 | 0.48 | Content, easily revised |

#### 6.4 Threshold Cascade Resolution

Thresholds are resolved through a three-level specificity cascade:

```
1. Agent-instance config (most specific)
   ↓ if not set
2. Organisation-level config
   ↓ if not set
3. Agent-type defaults (above table)
```

The `getEffectiveThresholds()` function applies this cascade for each threshold field independently, then validates that `act > ask` after clamping both values to [0, 1].

#### 6.5 Entity Delegation Mandate Override

For entities the user has explicitly trusted, the system supports a `DelegationMandate` with `mandate_level: 'infinite_autopilot'`. When an active mandate exists for the entity involved in an action, the confidence router short-circuits to `auto_delegated` — bypassing threshold evaluation entirely. This enables a trusted client relationship to function without approval friction while maintaining the safety model for all other entities.

All delegated actions are written to a `delegation_actions` audit trail with financial impact fields, evidence URLs, and a `fiduciary_evaluation` record — providing full accountability for autonomous operation.

#### 6.6 Technical Significance

The cascade model means that sensible defaults are always active, but every level of the system can override them. A conservative organisation can raise all thresholds to require human approval for everything. A power user can lower thresholds for specific agents. And the delegation mandate provides an escape hatch for truly trusted relationships — all without changing the underlying routing logic.

---

## 7. Invention VI

### Tiered Lifecycle Management for Per-User Protocol Bridge Machines

#### 7.1 Background

Each user's WhatsApp and Android Messages connection requires a dedicated Fly.io Machine running a mautrix bridge. Each iMessage connection requires a dedicated Mac VPS. Left running continuously, these instances cost real money — approximately $1.90/month per WhatsApp or Android bridge, and $7.70/month per Mac VPS.

At scale, a platform with thousands of users cannot sustain the cost of running every bridge machine continuously if a significant fraction of users are inactive. At the same time, destroying idle bridges immediately would force users through a re-provisioning and re-authentication flow every time they become active again — an unacceptable user experience.

#### 7.2 The Three-State Lifecycle

BitBit implements a three-state lifecycle for bridge machines:

**Active:** Machine is running and processing messages. Health is monitored on a 5-minute cron.

**Suspended:** Machine is stopped (compute halted, billed at storage rate only). Configuration is fully preserved in the database. Applicable to WhatsApp and Android bridges on Fly.io only.

**Destroyed:** Machine is fully torn down. Configuration is archived. iMessage Mac VPS instances transition here on disconnect rather than to Suspended (see §7.3).

#### 7.3 State Transitions

**Active → Suspended:**  
Triggered by `suspendIdleBridges()`, which runs daily. A bridge is eligible for suspension if:
- It is `status = 'connected'`
- It is not an iMessage bridge (`provider != 'imessage'`)
- `config.last_message_at` is more than 7 days ago

On suspension, `provisioner.suspend(flyMachineId)` stops the Fly.io machine without destroying it.

**Suspended → Active:**  
Triggered by any inbound message. The channel adapter detects the suspended state and calls `provisioner.wake(flyMachineId)` before attempting message delivery. Wake latency on Fly.io is typically under 3 seconds.

**Active → Destroyed:**  
Triggered by the user disconnecting the integration. Full teardown: machine is destroyed, credentials are revoked, config is archived.

**iMessage exception:** Mac VPS instances are excluded from the Suspended state. Mac VPS providers do not support cost-effective stop/start cycles equivalent to Fly.io machine suspension. Instead, iMessage instances either remain Active or are returned to the warm pool (Invention I) and eventually Destroyed.

#### 7.4 Health Monitoring

A 5-minute cron runs `checkBridgeHealth()` across all connected bridges. For each machine:

1. Query `provisioner.checkHealth(flyMachineId)`
2. If running → report healthy to `ConnectionHealthReporter`
3. If not running → attempt `provisioner.wake()`
4. If wake fails → report error, surface to dashboard

Health state is visible in the user's connections dashboard, providing transparency into bridge availability without manual intervention.

#### 7.5 Technical Significance

The tiered lifecycle model achieves a cost profile that scales with actual usage rather than user count. Active users pay the full bridge cost. Inactive users pay only the storage rate during suspension. Churned users pay nothing. The 7-day inactivity window is long enough to avoid spurious suspensions from users who check in weekly, but short enough to recover meaningful cost savings at scale.

The automatic wake-on-inbound-message behaviour means suspension is invisible to users — they send a message and the bridge is live by the time it would be delivered.

---

## 8. System Integration

These six inventions do not operate in isolation. They form an integrated stack where each layer feeds the next:

1. **Warm Pool (I)** ensures iMessage bridges are available instantly when a user connects, eliminating provisioning latency from the onboarding experience.

2. **Context Baseplate (II)** runs at ingestion time so that every message arrives in the agent's context pre-enriched with entity knowledge. When a WhatsApp message arrives via a bridge provisioned by the warm pool, the ingestion pipeline immediately processes it through the entity graph.

3. **Two-Model Planner (III)** runs before each inference call, selecting the right tool groups based on the message and the entity context assembled by the Baseplate. The planner is fast because it operates on the message alone — the Baseplate's pre-computation means entity context is always ready.

4. **Tiered Compression (IV)** assembles the final context window within the token budget, combining the planner's tool selection with compressed conversation history and entity snapshots from the Baseplate.

5. **Confidence Routing (V)** evaluates every action the agent proposes, applying per-agent risk thresholds and entity delegation mandates before any action is taken.

6. **Bridge Lifecycle (VI)** manages the compute infrastructure that brings messages into the system in the first place, ensuring that delivery infrastructure is running when needed and suspended when not — without manual operation.

The result is an AI that can be messaged from WhatsApp while a tradie is on a job site, understand who sent the message and what they need (Baseplate), plan the right set of tools to use (Planner), respond within a pre-assembled token budget (Compression), and execute any resulting actions within appropriate safety boundaries (Confidence Routing) — all while the underlying bridge infrastructure manages itself autonomously (Lifecycle).

---

## 9. Conclusion

The six inventions described in this white paper represent distinct, implementable solutions to concrete technical problems in the deployment of autonomous AI agents for small business operators. Taken individually, each addresses a gap in existing systems. Taken together, they constitute a novel architecture for continuously-running, context-aware, multi-channel autonomous AI that operates within configurable safety boundaries.

The problems solved — iMessage bridge provisioning latency, query-time context retrieval, tool context bloat, conversation history management, action safety calibration, and bridge compute cost — are not hypothetical. They were each encountered and solved during the development and deployment of BitBit. The solutions are live, tested (2,072+ tests across 768 suites), and operating in production.

---

**Document Classification:** Confidential  
**Do not distribute publicly prior to patent filing**  
**For attorney, investor, and internal review only**

*BitBit — built by All Webbed Up*
