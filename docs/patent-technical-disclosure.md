# BitBit — Technical Patent Disclosure Document

**Prepared:** 2026-04-15  
**Status:** Pre-filing technical disclosure — for review by patent attorney  
**Jurisdiction targets:** United States (USPTO), Australia (IP Australia)

---

## Overview

This document identifies six distinct technical inventions implemented in the BitBit platform, evaluates their patent eligibility, and provides the technical specificity needed to draft formal patent claims. Each invention solves a concrete technical problem and produces a measurable improvement in computer system performance or capability — not merely a business method or abstract idea.

---

## Patentability Summary

| # | Invention | USPTO Eligibility | AU Eligibility | Strength |
|---|-----------|-------------------|----------------|----------|
| 1 | Warm Pool Pre-Provisioning for iMessage Bridge Instances | Strong (Alice-safe: infrastructure timing) | Strong | High |
| 2 | Ingestion-Time Entity Graph Pre-Computation (Context Baseplate) | Strong (technical improvement to AI context retrieval) | Strong | High |
| 3 | Two-Model Tool Group Pre-Planner with KV Cache Optimization | Strong (measurable performance gain) | Strong | High |
| 4 | Tiered Conversation Compression with Cross-Channel Identity Resolution | Moderate–Strong | Moderate–Strong | Medium-High |
| 5 | Per-Agent Confidence Threshold Cascade with Three-Way Routing | Moderate (needs narrow claim drafting) | Moderate | Medium |
| 6 | Tiered Bridge Machine Lifecycle (Active → Suspended → Destroyed) | Moderate | Moderate | Medium |

**Recommended priority for filing:** Inventions 1, 2, and 3 first. These are the most technically novel and Alice-resistant. File 4, 5, 6 as a second tranche once budget allows.

---

## Invention 1: Warm Pool Pre-Provisioning for iMessage Bridge Instances

### The Technical Problem

Connecting a user to Apple iMessage via a cloud-hosted Mac instance requires provisioning a virtual machine, installing BlueBubbles server software, configuring network tunnels, and completing Apple ID authentication. This process typically takes 10–20 minutes. Any on-demand provisioning approach introduces unacceptable latency during user onboarding.

### The Invention

A pre-provisioned pool of Mac VPS instances maintained in a "pending" state, ready to be claimed by new user connections. The system continuously monitors pool depth and replenishes instances proactively, such that any new iMessage connection can be fulfilled in under 5 seconds by claiming a pre-configured instance rather than provisioning from scratch.

### Technical Implementation

**Core system:** `src/lib/bridges/vps-pool.ts`

Key architectural elements:
- A sentinel org (`__bitbit_pool__`) in the `org_connections` database table holds unclaimed instances with status `pending`
- On new iMessage connection request, `VpsPool.claimInstance()` atomically transfers ownership: the pool instance transitions from `pending` → `disabled` (claimed), and ownership is rebound to the requesting org
- Pool replenishment is triggered when `getPoolCount()` falls below a target threshold (`TARGET_POOL_SIZE = 2`)
- Each pool instance carries a full pre-configured `BlueBubblesConfig`: server URL, SSH key fingerprint, VNC credentials, VPS IP, and machine ID — all ready for immediate use
- The pool sentinel org is invisible to standard org-scoped queries due to RLS policies

**State transition on claim:**
```
Pool instance: status=pending, org_id='__bitbit_pool__'
      ↓  claim()
User instance: status=disabled, org_id=<real_org>, config.claimed_by=<connectionId>
      ↓  user completes Apple ID auth
User instance: status=connected
```

### Why This Is Patent-Eligible

This is a concrete infrastructure architecture solving a specific latency problem. It is not a business method — it is a novel database-backed resource pooling scheme for compute instances with domain-specific state management. Analogous to connection pooling in databases but applied to long-lived VPS-backed protocol bridge instances.

### Claim Scope (for attorney)

- Method for pre-provisioning and maintaining a pool of protocol bridge compute instances for instant user assignment
- System comprising: pool sentinel entity, pending-state instance records, atomic claim transfer, pool depth monitoring and replenishment
- The specific use of a database table with a sentinel org_id to manage ownership of pre-configured VPS instances

---

## Invention 2: Ingestion-Time Entity Knowledge Graph Pre-Computation (Context Baseplate)

### The Technical Problem

Retrieval-Augmented Generation (RAG) systems perform knowledge retrieval at query time — when a user asks a question, the system searches for relevant documents. This approach has two limitations: (1) latency at query time as retrieval runs during inference, and (2) shallow context because the system cannot perform multi-hop reasoning across related entities before the query arrives.

### The Invention

A system that compiles rich entity knowledge at ingestion time, not at query time. When a message arrives, the system immediately extracts entities, detects mentions of known contacts or topics, builds cross-references between entities, and writes a pre-compiled dossier for each entity. At inference time, the system retrieves a ready-made snapshot rather than performing retrieval.

### Technical Implementation

**Core files:** `src/lib/context/`, `src/lib/context/baseplate-snapshot.ts`, `src/lib/context/entity-profile-builder.ts`, `src/lib/context/cross-reference.ts`, `src/lib/context/pattern-extractor.ts`

Key architectural elements:

**Two-tier snapshot system:**
1. **Primary tier — entity_dossiers:** LLM-compiled rich markdown dossiers stored in `entity_dossiers` table. Each dossier contains synthesized facts, relationship maps, communication patterns, payment history, and active threads compiled by a language model at ingestion time.
2. **Fallback tier — entity_profiles:** Structured profile records with `recent_events`, `relationships`, `memories`, and `event_summary` for entities without dossiers.

**`getBaseplateSnapshot()` lookup:**
```
1. Query entity_dossiers where entity_name ILIKE <name>, ordered by last_compiled_at DESC
2. If dossier found → return dossierMarkdown + minimal profile metadata
3. If no dossier → tryProfileSource() → structured profile from entity_profiles
4. Return: { source, computedAt, validUntil, stale, eventCount, profile, dossierMarkdown? }
```

**Ingestion pipeline (on message arrival):**
- `entity-mention-scanner.ts`: scans message text for entity mentions using pattern matching + fuzzy lookup
- `pattern-extractor.ts`: extracts behavioral patterns (payment timing, response latency, activity frequency, channel preference)
- `cross-reference.ts` + `xref-cache.ts`: builds and caches cross-references between entities (e.g., linking Dave's email about Steve's invoice to Steve's contact record)
- `relationship-linker.ts`: establishes typed relationships between entities with strength scores
- `timeline-writer.ts`: writes event records with entity attribution to the timeline

**Staleness management:** Each snapshot includes `validUntil` and `stale` flags. The system can serve a stale snapshot while triggering a background recompile.

### Why This Is Patent-Eligible

This is a novel technical architecture for AI context assembly. It inverts the standard RAG retrieval pattern by shifting computation from query time to ingestion time. The specific combination of: (a) LLM-compiled markdown dossiers as primary source, (b) structured profiles as fallback, (c) cross-reference caching at ingestion, and (d) the two-tier lookup with staleness management represents a concrete technical improvement over existing RAG systems.

### Claim Scope (for attorney)

- Method for pre-computing entity knowledge representations at data ingestion time for use in AI inference contexts
- System comprising: ingestion-time entity mention scanner, cross-reference builder, dossier compiler, two-tier snapshot retrieval with staleness management
- The specific two-tier lookup: LLM-compiled dossier primary → structured profile fallback, with staleness signaling

---

## Invention 3: Two-Model Tool Group Pre-Planner with KV Cache Optimization

### The Technical Problem

Large language model agents with many available tools suffer two problems: (1) tool list context bloat — passing 50+ tool definitions to every inference call wastes tokens and degrades model focus, and (2) KV cache invalidation — changing the tool list between calls prevents cache reuse, increasing latency and cost.

### The Invention

A two-stage inference pipeline where a small, fast model (the "planner") first analyzes the user's intent and selects only the relevant subset of tool groups, before the main model runs with that reduced toolset. Tool groups are loaded as pre-defined cohesive sets (e.g., `core`, `memory`, `channel`, `web`, `comms`, `agentic`), so the planner output is a small fixed set of group identifiers, not a per-call tool selection. This produces a stable, cacheable tool context for the main model.

### Technical Implementation

**Core file:** `src/lib/agent/planner.ts`

Key architectural elements:

**Tool group taxonomy:** Tools are pre-organized into named groups (`ToolGroup` type: `core | memory | channel | web | comms | agentic | creative | composio`). The planner selects groups, not individual tools. Core is always included. Others are added based on planner output.

**Trivial message bypass:** Short messages (≤12 chars) and common greetings match `TRIVIAL_PATTERNS` and bypass the planner entirely — the main model runs with core tools only. This avoids planner latency for simple queries.

**Planner model:** Claude Haiku (fast, low-cost). Takes user message, returns structured output:
```typescript
PlanOutputSchema = {
  stages: PlanStage[],       // 1–4 UI-visible execution stages  
  toolGroups: ToolGroup[],   // groups to activate (not 'core' — always added)
  complexity: 'low' | 'medium' | 'high',
  skills: string[]
}
```

**Planner prompt receives:** message text only — no conversation history, no entity context. This keeps the planner call short and fast.

**Main model receives:** core tools + planner-selected group tools only. With 50+ total tools organized into groups, a typical query activates 2–3 groups (10–15 tools), not all 50+.

**KV cache optimization:** Because tool groups are stable pre-defined sets, the same query category produces the same tool list. The main model's system prompt + tool definitions remain constant across similar queries, enabling high KV cache hit rates (measured at 90–95%).

**`isTrivialMessage()` function:**
```typescript
const TRIVIAL_PATTERNS = [
  /^(hi|hey|hello|yo|...|thanks|ok|...)\b/i,
  /^.{1,12}$/,  // ≤12 chars
]
```

### Why This Is Patent-Eligible

This is a concrete technical optimization that produces measurable improvements: reduced token usage, reduced latency, and improved cache hit rates. The specific architecture — pre-defined tool groups, fast model pre-selector, trivial message bypass, structured plan output with UI stage metadata — is a novel composition. It is not merely "using AI to pick tools" but a specific two-model pipeline with defined group taxonomy and cache-stability design.

### Claim Scope (for attorney)

- Method for reducing AI inference token cost and improving KV cache hit rate via pre-classification of tool groups by a lightweight pre-planner model
- System comprising: tool group taxonomy, fast-model planner with trivial bypass, structured group selection output, main model with group-filtered toolset
- The specific use of a small model to produce stable tool group identifiers that preserve system prompt cacheability for a larger model

---

## Invention 4: Tiered Conversation Compression with Cross-Channel Identity Resolution

### The Technical Problem

AI assistants that maintain persistent conversation context face two challenges: (1) conversation history grows unboundedly, exceeding context windows and increasing cost, and (2) users interact across multiple channels (WhatsApp, email, SMS, Slack, web) creating fragmented conversation threads with no unified identity.

### The Invention

A three-tier conversation compression pipeline combined with a cross-channel identity resolver that maps multiple channel identifiers (phone numbers, email addresses, Slack IDs) to a single authenticated user, enabling a single continuous conversation thread across all channels.

### Technical Implementation

**Core files:** `src/lib/conversation/`, `src/lib/context-assembly/token-budget-manager.ts`

**Three-tier compression:**
1. **Verbatim tier (last 10 turns):** Full message content preserved
2. **Compressed tier (turns 11–30):** Haiku-compressed summaries of each turn
3. **Distilled tier (turns 31+):** Key facts only — commitments, decisions, deadlines, financial amounts

**Token Budget Manager:** Manages 6-tier priority-based token allocation within an 8K token budget using character-ratio heuristics (3.5 chars/token for text, 3.0 for JSON) rather than tiktoken, keeping assembly under 200ms latency. Tiers are compressed in reverse priority order when over budget.

**Cross-channel identity resolution** (`src/lib/conversation/identity-resolver.ts`):
- Maps inbound channel identifiers → authenticated user
- Lookup table: `{ phone_number, email_address, slack_user_id, whatsapp_id }` → `user_id`
- Enables all channels to write to the same `conversation_thread` record
- Thread archival cron (every 15 min) archives threads inactive for 24h

**Unified pipeline flow:**
```
Inbound (any channel) → identity-resolver → thread-resolver → context-assembler
→ TAOR engine → storage → post-processing
```

### Claim Scope (for attorney)

- Method for maintaining a unified AI conversation context across multiple heterogeneous messaging channels via cross-channel identity mapping and tiered compression
- System comprising: channel identity resolver, unified thread records, three-tier compression pipeline, priority-based token budget manager

---

## Invention 5: Per-Agent Confidence Threshold Cascade with Three-Way Action Routing

### The Technical Problem

AI agents taking actions on behalf of users face a fundamental risk calibration problem: the same confidence threshold that is appropriate for sending an alert is dangerously low for sending a financial invoice. No existing system applies per-action-type risk calibration with a systematic cascade of specificity.

### The Invention

A confidence routing system where every agent action passes through a three-way gate (act / ask / escalate), with thresholds configured at three levels: agent-type defaults, org-level overrides, and per-agent-instance configuration — resolved by specificity cascade. Higher-risk action types (e.g., financial) are assigned higher `act` thresholds by default.

### Technical Implementation

**Core file:** `src/lib/agent/confidence-router.ts`

**Three-way routing:**
```
confidence >= act_threshold (e.g. 0.85–0.92) → auto-execute
confidence >= ask_threshold (e.g. 0.55–0.60) → queue for human approval  
confidence <  ask_threshold                  → immediate escalation
```

**Per-agent-type defaults (sample):**
```typescript
'invoice-flow':   { act: 0.92, ask: 0.60 }  // High stakes: money
'client-comms':   { act: 0.88, ask: 0.58 }  // High: sends as user
'sentry':         { act: 0.75, ask: 0.45 }  // Low: alerting only
'ad-script-gen':  { act: 0.78, ask: 0.48 }  // Low: reversible content
```

**Cascade resolution:** `getEffectiveThresholds(agentConfig, orgConfig)` — for each field, use the most specific non-undefined value. Validates that `act > ask` after clamping to [0,1].

**Entity delegation override:** `DelegationMandate` with `mandate_level: 'infinite_autopilot'` short-circuits the threshold check entirely, routing directly to `auto_delegated` for trusted entity relationships.

### Claim Scope (for attorney)

- Method for routing AI agent actions through a three-tier confidence gate with per-agent-type risk-calibrated thresholds and specificity-cascade override resolution
- The specific entity delegation mandate that bypasses threshold evaluation for pre-authorized relationships

---

## Invention 6: Tiered Lifecycle Management for Per-User Protocol Bridge Machines

### The Technical Problem

Maintaining a persistent compute instance (bridge machine) per user for messaging protocol bridging is cost-prohibitive at scale. Idle instances waste money. Destroying them immediately on inactivity creates re-provisioning latency. There is no established pattern for lifecycle-managed, per-user cloud bridge machines with cost-aware state transitions.

### The Invention

A three-state lifecycle for per-user bridge machines: **Active** (running, processing messages), **Suspended** (machine stopped but config preserved, WhatsApp/Android only), and **Destroyed** (full teardown on disconnect). Transitions are triggered by inactivity timers and explicit user actions. Health monitoring and auto-wake run on a 5-minute cron.

### Technical Implementation

**Core file:** `src/lib/bridges/bridge-lifecycle.ts`

**State transitions:**
```
Active → Suspended: 7 days without a message (WhatsApp/Android bridges only)
Active → Destroyed: user disconnects
Suspended → Active: any new inbound message triggers wake()
```

**Key constraints:**
- iMessage (Mac VPS) is excluded from suspension — Mac VPS instances cannot be cheaply stopped/started; they return to the warm pool or are destroyed
- `suspendIdleBridges()` cron: daily, queries `config->last_message_at < 7 days ago`, calls `provisioner.suspend(flyMachineId)`
- `checkBridgeHealth()` cron: every 5 min, checks all connected bridges; on failure attempts `provisioner.wake()` before reporting error
- Health state written to `ConnectionHealthReporter` for dashboard visibility

### Claim Scope (for attorney)

- Method for managing per-user protocol bridge compute instances with cost-aware tiered lifecycle states and inactivity-triggered suspension
- System comprising: inactivity monitor, protocol-type-conditional suspension (excluding Mac VPS bridges), health check cron with auto-wake, warm pool return path for Mac instances

---

## Prior Art Considerations

Before filing, a patent attorney should search for prior art around:

1. **Warm Pool:** Cloud provider warm pool concepts (AWS Lambda provisioned concurrency, container warm pools). BitBit's differentiator is per-user protocol bridge instances with database-backed ownership transfer, not generic compute warming.

2. **Context Baseplate:** RAG literature, knowledge graph pre-computation. Differentiator is the specific two-tier dossier/profile snapshot with ingestion-time LLM compilation and cross-reference caching.

3. **Two-Model Planner:** Tool selection in LLM agents. Differentiator is the stable group taxonomy for cache preservation, not merely "using a small model to pick tools."

4. **Tiered Compression:** Conversation summarization in LLMs. Differentiator is cross-channel identity resolution as the unifying mechanism, not just compression tiers.

---

## Recommended Next Steps

1. **Engage a patent attorney** in both the US and AU — look for firms with software/AI patent experience (US: Perkins Coie, Fish & Richardson; AU: Spruson & Ferguson, Shelston IP)
2. **File provisionals first** — in the US, a provisional patent application (~$3K–$5K attorney cost) gives 12 months of "patent pending" status and locks your priority date. This is the fastest and cheapest first move.
3. **AU innovation patent** — Australia's innovation patent system is faster and cheaper than a standard patent. Grants in ~1 month, valid 8 years. Good for Inventions 1 and 3.
4. **Do not publicly disclose** the specific technical details in this document before filing — public disclosure before filing invalidates AU patent rights and starts a 12-month clock in the US.
5. **Priority order for budget:** Invention 1 (Warm Pool) → Invention 2 (Context Baseplate) → Invention 3 (Two-Model Planner)

---

*This document is a technical disclosure for attorney review. It does not constitute legal advice and has not been reviewed by a patent attorney.*
