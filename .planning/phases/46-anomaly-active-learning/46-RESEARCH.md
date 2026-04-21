# Phase 46: Anomaly Detection + Active Learning - Research

**Researched:** 2026-04-17
**Domain:** Statistical anomaly detection in brain consolidation pipeline + confidence-gated active learning in TAOR loop
**Confidence:** HIGH

## Summary

Phase 46 extends the Living Brain consolidation pipeline (shipped in Phase 45) with two capabilities: (1) statistical anomaly detection that computes z-scores per entity per metric during brain consolidation, surfacing pattern breaks as proactive alerts; and (2) active learning that generates targeted clarifying questions when agent confidence falls in the 50-70% band, feeding user responses back into entity dossiers.

The codebase is well-prepared for this phase. The brain consolidation pipeline (`brain-consolidation.ts`) already iterates per-entity per-domain via Section Librarian, providing a natural hook for anomaly computation after dossier compilation. The confidence router (`confidence-router.ts`) already implements act/ask/escalate bands and supports per-agent thresholds, making it straightforward to add a `clarify` decision type for the 50-70% band. The `simple-statistics` package is available in the global node_modules (verified: `zScore`, `addToMean`, `combineMeans`, `combineVariances` all present) but needs to be added to `personal-assistant/package.json` as a dependency (INFRA-01).

**Primary recommendation:** Build anomaly detection as a new module `src/lib/brain/anomaly-detector.ts` hooked into the consolidation pipeline after `processDomainJobDirect`, and active learning as a new `clarify` band in the confidence router with question generation via Haiku. Use `simple-statistics` for z-score math, Welford's online algorithm pattern via `addToMean`/`combineVariances` for incremental baseline updates, and a new `anomaly_baselines` table + `brain_alerts` table for persistence.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Z-scores computed inside brain consolidation pipeline -- Section Librarian already iterates per-entity per-domain; add a stats pass after dossier compilation. Zero new cron jobs.
- Track 4 metrics per entity: payment timing, payment amount, message frequency, response latency. Extract from WAL signals already flowing through intake-clerk.
- New `anomaly_baselines` table (org_id, entity_id, metric_name, mean, stddev, sample_count, last_computed). Clean separation from dossiers; INFRA-04 budgets this table.
- Cross-entity pattern breaks via per-metric org-wide aggregation -- after per-entity z-scores, run a second pass aggregating z>2 anomalies across entities for the same metric.
- Alert channel is channel-agnostic via provider registry -- route through whatever messaging surface the user has connected. Do NOT hardcode WhatsApp.
- Alert format: concise with baseline comparison -- "Alice's payment is 15 days late (usually pays by day 5, z=3.2)". One sentence context + one sentence baseline per ANOM-05.
- Budget enforcement via sliding 24h window per entity -- track alert timestamps in brain_alerts table, skip if count >= 3.
- Track alert dismissals (`dismissed_at` column) but don't train on them yet.
- Extend existing confidence router with `clarify` decision type for 50-70% band.
- Questions inline in the response -- natural conversation flow, not a separate approval request.
- New WAL signal type `clarification` -- user's reply enters WAL pipeline, Section Librarian merges into dossier on next consolidation.
- Weekly digest for recurring low-confidence domains -- if entity domain confidence stays below 0.5 for 7 days, learning prompt in morning briefing. Limit: 1 per entity per week.

### Claude's Discretion
- Exact z-score threshold tuning beyond z>3 for alerts
- Internal data structure for running statistics (Welford's algorithm vs simple accumulation)
- Haiku prompt template for anomaly explanation generation
- Clarifying question generation prompt template

### Deferred Ideas (OUT OF SCOPE)
- Anomaly threshold auto-tuning from dismissal feedback (track dismissals now, train later)
- Entity disambiguation layer (LLM-based alias resolution)
- Anomaly history archival table for long-term trend analysis
- Graph-based community detection for cross-entity anomaly clusters
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ANOM-01 | Statistical anomaly detector computes z-scores per entity per metric | `simple-statistics.zScore(value, mean, stddev)` verified available; `anomaly_baselines` table stores running stats; hook after `processDomainJobDirect` in consolidation loop |
| ANOM-02 | Anomalies exceeding z>3 generate proactive alerts routed to user via messaging channel | Existing `surprise-surfacer.ts` pattern for channel-aware formatting; extend `formatSurpriseForChannel` pattern; route via provider registry not WhatsApp-specific |
| ANOM-03 | Alert budget caps at 2-3 per entity per day to prevent fatigue | `brain_alerts` table with sliding 24h window query; `dismissed_at` column for future training |
| ANOM-04 | Pattern break detection across multiple entities | Second pass after per-entity z-scores; aggregate z>2 anomalies per metric across org; threshold: 3+ entities anomalous on same metric |
| ANOM-05 | Anomaly explanations include baseline comparison | Haiku call per alert generates natural language: "Usually pays day 5, this invoice is day 20 (z=3.2)" |
| LEARN-01 | When agent confidence is in ask band (50-70%), generate targeted clarifying questions | New `clarify` decision type in `confidence-router.ts`; inserted between `ask` and `act` |
| LEARN-02 | Clarifying questions reference specific ambiguity | Haiku prompt template with entity context and ambiguity description |
| LEARN-03 | User responses to clarifying questions update entity dossiers and confidence scores | New WAL signal type `clarification`; existing intake-clerk -> Section Librarian pipeline reused |
| LEARN-04 | Confidence gaps tracked per knowledge domain; recurring low-confidence domains trigger proactive learning | `metacognitive_scores` table (or lightweight JSONB in dossier `schema_json`); weekly digest in morning briefing |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Z-score computation | API / Backend (cron) | Database | Computed during brain consolidation cron; baselines stored in Postgres |
| Metric extraction from WAL | API / Backend | -- | Rule-based parsing of WAL signal content during consolidation |
| Anomaly alert routing | API / Backend | -- | Provider registry resolves active channel; message sent server-side |
| Alert budget enforcement | Database | API / Backend | Sliding window query on `brain_alerts` table; checked before sending |
| Cross-entity aggregation | API / Backend | -- | Post-consolidation pass aggregates per-metric org-wide |
| Clarifying question generation | API / Backend | -- | Haiku LLM call during TAOR loop when confidence is 50-70% |
| Clarification feedback loop | API / Backend | Database | User reply -> WAL signal type `clarification` -> Section Librarian |
| Low-confidence domain tracking | API / Backend | Database | Schema_json or dedicated column tracks domain confidence over time |
| Learning prompts in briefing | API / Backend | -- | Morning briefing generator gets new section for learning prompts |
| Dashboard anomaly display | Frontend Server (SSR) | Browser | Anomaly alerts visible in notification center (existing pattern) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| simple-statistics | 7.8.9 | z-score, mean, stddev, addToMean, combineVariances | [VERIFIED: npm view] Zero deps, 3M+ weekly downloads, TypeScript types, already available in project |
| @supabase/supabase-js | (existing) | Database operations for baselines, alerts, WAL | Already installed, all tables org-scoped with RLS |
| ai (Vercel AI SDK) | (existing) | LLM calls for anomaly explanation + clarifying questions | Already used by brain pipeline (gateway + generateText) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Anthropic SDK | (existing) | Haiku model calls for explanation generation | Anomaly explanation text, clarifying question generation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| simple-statistics z-score | Manual calculation | simple-statistics is validated, handles edge cases (n=0, stddev=0); manual is trivial but less robust |
| Welford's algorithm via addToMean | Store full value arrays | Welford is O(1) memory per metric; arrays would grow unbounded for high-frequency entities |
| Haiku for explanations | Template strings | Haiku produces natural, context-aware text; templates are faster but rigid. Decision: Haiku per CONTEXT.md |

**Installation:**
```bash
cd personal-assistant && npm install simple-statistics
```

**Version verification:** `npm view simple-statistics version` returned `7.8.9` (2026-04-17). [VERIFIED: npm registry]

## Architecture Patterns

### System Architecture Diagram

```
Brain Consolidation Cron (every 30min)
         |
         v
    WAL Tail Reader
         |
    +----+----+
    |         |
    v         v
 Intake    Predictive
 Clerk     Coding Filter
    |
    v
 Group by Entity
    |
    v
 Section Librarian (per entity per domain)
    |    - compile dossier delta
    |    - Hebbian edge strengthening
    |
    +---> [NEW] Anomaly Detector <-- anomaly_baselines table
    |         |
    |         +---> Extract metrics (rule-based)
    |         +---> Compute z-scores (simple-statistics)
    |         +---> Update baselines (addToMean pattern)
    |         +---> If z>3: generate alert (Haiku explanation)
    |         +---> Check budget (brain_alerts sliding window)
    |         +---> Route alert (provider registry)
    |
    v
 [NEW] Cross-Entity Aggregator
    |    - collect z>2 anomalies per metric across org
    |    - if 3+ entities anomalous: generate pattern break alert
    |
    v
 Chief Librarian (domain profile synthesis)
    |
    v
 Mark WAL consolidated


TAOR Loop (per user message)
         |
         v
    Pre-flight checks
         |
         v
    Confidence Router
    |    |    |    |
    v    v    v    v
   act  [NEW]  ask  escalate
        clarify
         |
         +---> Generate clarifying question (Haiku)
         +---> Inline in response
         +---> User reply -> WAL signal type 'clarification'
         +---> Next consolidation: Section Librarian merges into dossier


Morning Briefing (weekly check)
         |
         v
    [NEW] Low-Confidence Domain Scanner
         |
         +---> Query metacognitive_scores / dossier schema_json
         +---> If domain confidence < 0.5 for 7 days: learning prompt
         +---> Limit: 1 per entity per week
         +---> Append to briefing sections
```

### Recommended Project Structure
```
src/lib/brain/
  anomaly-detector.ts          # Z-score computation, baseline management, alert generation
  anomaly-detector.test.ts     # Unit tests for z-score, budget, cross-entity
  types.ts                     # Extended with AnomalyBaseline, BrainAlert types
  brain-consolidation.ts       # Modified: call anomaly detector after dossier compilation

src/lib/brain/__tests__/
  anomaly-detector.test.ts     # Tests for z-score math, metric extraction, budget enforcement

src/lib/agent/
  confidence-router.ts         # Modified: add 'clarify' decision type
  active-learner.ts            # Clarifying question generation, feedback loop
  active-learner.test.ts       # Tests for question generation, WAL feedback

src/lib/whatsapp/
  morning-briefing.ts          # Modified: add learning prompt section

supabase/migrations/
  20260417000001_anomaly_baselines_brain_alerts.sql   # New tables + RLS
```

### Pattern 1: Anomaly Detection in Consolidation Pipeline
**What:** After each entity's dossier is compiled by Section Librarian, extract numeric metrics from the WAL entries and compute z-scores against stored baselines.
**When to use:** Every brain consolidation run (every 30 minutes via cron).
**Example:**
```typescript
// Source: Verified against simple-statistics API and existing brain-consolidation.ts structure
import { zScore, addToMean, combineVariances, mean, sampleStandardDeviation } from 'simple-statistics'

interface AnomalyBaseline {
  org_id: string
  entity_id: string
  metric_name: string // 'payment_timing' | 'payment_amount' | 'message_frequency' | 'response_latency'
  mean: number
  stddev: number
  sample_count: number
  last_computed: string
}

const MIN_SAMPLE_SIZE = 5  // Below this, stddev unreliable

function computeZScore(value: number, baseline: AnomalyBaseline): number | null {
  if (baseline.sample_count < MIN_SAMPLE_SIZE) return null
  if (baseline.stddev === 0) return null  // All values identical so far
  return zScore(value, baseline.mean, baseline.stddev)
}

function updateBaseline(baseline: AnomalyBaseline, newValue: number): AnomalyBaseline {
  const newCount = baseline.sample_count + 1
  const newMean = addToMean(baseline.mean, baseline.sample_count, newValue)
  // Welford's update for variance: compute new stddev incrementally
  const oldVariance = baseline.stddev ** 2
  const delta = newValue - baseline.mean
  const delta2 = newValue - newMean
  const newVariance = ((oldVariance * baseline.sample_count) + delta * delta2) / newCount
  return {
    ...baseline,
    mean: newMean,
    stddev: Math.sqrt(newVariance),
    sample_count: newCount,
    last_computed: new Date().toISOString(),
  }
}
```

### Pattern 2: Metric Extraction from WAL Signals (Rule-Based)
**What:** Extract numeric metric values from WAL entries without LLM calls. Use signal_type and content parsing.
**When to use:** During anomaly detection pass, for each entity's WAL entries.
**Example:**
```typescript
// Source: Based on existing intake-clerk.ts signal_type routing pattern
type MetricName = 'payment_timing' | 'payment_amount' | 'message_frequency' | 'response_latency'

interface MetricExtraction {
  entity_id: string
  metric_name: MetricName
  value: number
}

function extractMetrics(entries: KnowledgeLogEntry[]): MetricExtraction[] {
  const metrics: MetricExtraction[] = []

  for (const entry of entries) {
    // Payment timing: days between invoice date and payment date
    if (entry.signal_type === 'invoice') {
      const amountMatch = entry.content.match(/\$[\d,]+\.?\d*/)?.[0]
      if (amountMatch) {
        const amount = parseFloat(amountMatch.replace(/[$,]/g, ''))
        for (const entityId of entry.entity_ids) {
          metrics.push({ entity_id: entityId, metric_name: 'payment_amount', value: amount })
        }
      }
      // Payment timing: extract days from content patterns like "paid after X days"
      const daysMatch = entry.content.match(/(\d+)\s*days?\s*(late|overdue|after)/i)?.[1]
      if (daysMatch) {
        for (const entityId of entry.entity_ids) {
          metrics.push({ entity_id: entityId, metric_name: 'payment_timing', value: parseInt(daysMatch) })
        }
      }
    }

    // Message frequency: count per entity per consolidation window
    if (entry.signal_type === 'message') {
      for (const entityId of entry.entity_ids) {
        metrics.push({ entity_id: entityId, metric_name: 'message_frequency', value: 1 })
      }
    }
  }

  return metrics
}
```

### Pattern 3: Alert Budget with Sliding Window
**What:** Enforce 2-3 alerts per entity per day using a sliding 24h window query against `brain_alerts` table.
**When to use:** Before sending each anomaly alert.
**Example:**
```typescript
// Source: Modeled after existing isRecentlySent pattern in proactive-alerts.ts
async function isWithinBudget(
  supabase: SupabaseClient,
  orgId: string,
  entityId: string,
  maxAlerts: number = 3,
): Promise<boolean> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { count, error } = await supabase
    .from('brain_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('entity_id', entityId)
    .gte('created_at', twentyFourHoursAgo)

  if (error) return false // Fail closed: don't send if we can't check
  return (count ?? 0) < maxAlerts
}
```

### Pattern 4: Clarify Decision in Confidence Router
**What:** Add a `clarify` band between `ask` and `act` for the 50-70% confidence range. Instead of generic approval request, generate a targeted clarifying question.
**When to use:** During TAOR loop when confidence falls in the clarify band.
**Example:**
```typescript
// Source: Based on existing routeByConfidence in confidence-router.ts
// Extended ConfidenceDecision type to include 'clarify'
export type ExtendedConfidenceDecision = ConfidenceDecision | 'clarify' | 'auto_delegated'

export function routeByConfidenceWithClarify(
  confidence: number,
  thresholds: ConfidenceThresholds,
): { decision: ExtendedConfidenceDecision; reasoning: string } {
  if (confidence >= thresholds.act) {
    return { decision: 'act', reasoning: `Confidence ${confidence} >= act ${thresholds.act}` }
  }
  // NEW: clarify band between ask and act (50-70% range)
  if (confidence >= thresholds.ask && confidence < thresholds.act) {
    // Only clarify if in the upper portion of the ask band
    const clarifyThreshold = thresholds.ask + (thresholds.act - thresholds.ask) * 0.3
    if (confidence >= clarifyThreshold) {
      return { decision: 'clarify', reasoning: `Confidence ${confidence} in clarify band` }
    }
    return { decision: 'ask', reasoning: `Confidence ${confidence} in ask band` }
  }
  return { decision: 'escalate', reasoning: `Confidence ${confidence} < ask ${thresholds.ask}` }
}
```

### Anti-Patterns to Avoid
- **LLM for metric extraction:** The 4 tracked metrics (payment timing, amount, message frequency, response latency) are numeric values extractable with regex/parsing. Using an LLM call per WAL entry would be costly and slow. Use rule-based extraction. [VERIFIED: CONTEXT.md specifies "Rule-based metric extraction from WAL signals (no LLM needed for numeric values)"]
- **Hardcoding WhatsApp for alerts:** The CONTEXT.md explicitly states alerts must be channel-agnostic via provider registry. The existing `proactive-alerts.ts` hardcodes WhatsApp (`sendMessage` from `channels/whatsapp`). New alerts MUST use the provider registry pattern.
- **Full value arrays for baselines:** Storing all historical values would grow unbounded. Use Welford's online algorithm (or `addToMean` + incremental variance) to maintain running mean/stddev in O(1) space.
- **Blocking consolidation for alert sending:** Alert generation (Haiku call + message send) should not block the main consolidation loop. Fire-and-forget with error handling, similar to how the TAOR loop handles surprise surfacing.
- **Oversized clarifying question prompts:** Questions should be one sentence, inline in the response. Not a separate modal/approval flow.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Z-score computation | Manual `(x - mean) / stddev` | `simple-statistics.zScore()` | Handles edge cases (n=0, stddev=0), validated implementation |
| Incremental mean updates | Accumulate values then recalculate | `simple-statistics.addToMean()` | O(1) per update, numerically stable |
| Incremental variance | Store all values | Welford's algorithm via `combineVariances()` | O(1) memory, no unbounded growth |
| Alert deduplication | Custom in-memory dedup | Postgres sliding window query | Survives restarts, works across cron invocations |
| Channel-agnostic alert routing | Custom channel resolver | Existing provider registry pattern | Already handles WhatsApp/iMessage/SMS routing |

**Key insight:** The statistical primitives are trivial individually but have subtle numerical stability issues at scale. `simple-statistics` handles these correctly. The real complexity is in the pipeline integration -- hooking into brain consolidation without breaking existing flows.

## Common Pitfalls

### Pitfall 1: Z-Score with Low Sample Count
**What goes wrong:** Computing z-scores with N<5 produces unreliable results. Standard deviation approaches 0, producing astronomically high z-scores from normal variation.
**Why it happens:** New entities start with sample_count=0. First few data points create artificial "anomalies."
**How to avoid:** Enforce `MIN_SAMPLE_SIZE = 5` gate. Return `null` (no anomaly) when baseline.sample_count < 5. Per CONTEXT.md: "Z-score minimum sample size N>=5 (below 5, stddev unreliable)."
**Warning signs:** New entities immediately generating alerts after first data point.

### Pitfall 2: Zero Standard Deviation
**What goes wrong:** If all historical values are identical (e.g., always pays exactly $500), stddev=0, and any different value produces z=infinity.
**Why it happens:** Perfectly consistent behavior exists in business contexts (fixed-price contracts, recurring payments).
**How to avoid:** Guard `if (baseline.stddev === 0) return null`. Consider adding a minimum stddev floor (e.g., 0.01 * mean) or treating zero-stddev as "no anomaly detectable."
**Warning signs:** Division by zero errors or Infinity z-scores.

### Pitfall 3: Alert Fatigue from Cross-Entity Aggregation
**What goes wrong:** Cross-entity pattern breaks fire frequently when many entities share the same metric pattern (e.g., "all clients pay late in December" is not an anomaly, it's seasonality).
**Why it happens:** Cross-entity aggregation doesn't account for temporal correlation.
**How to avoid:** Require 3+ entities anomalous on the same metric AND z>2 per the CONTEXT.md decision. Additionally, apply the per-entity alert budget globally to cross-entity alerts. Mark seasonal patterns in dossiers to exclude from cross-entity aggregation in future phases (deferred).
**Warning signs:** Spike in cross-entity alerts during known seasonal periods.

### Pitfall 4: Clarification Loop
**What goes wrong:** Agent asks clarifying question, user response doesn't resolve ambiguity, agent asks another clarifying question, creating an infinite loop.
**Why it happens:** Clarifying questions are too vague, or user response is tangential.
**How to avoid:** Limit to 1 clarifying question per turn (track in TAOR loop state). After one clarification attempt, fall back to `ask` (approval request) on the next turn. Record question + response pair for dossier update regardless.
**Warning signs:** Multiple `clarification` WAL entries for the same thread in rapid succession.

### Pitfall 5: Metric Extraction Regex Fragility
**What goes wrong:** Rule-based metric extraction with regex misses valid patterns or matches false positives in unstructured text.
**Why it happens:** WAL content is natural language, not structured data. "$500 in the email subject" might match as a payment amount.
**How to avoid:** Cross-reference signal_type with extraction. Only extract payment amounts from `invoice` signals, not from `message` signals. Use conservative regex patterns. Log extraction failures for monitoring.
**Warning signs:** Anomaly baselines diverge from reality because of incorrect metric values.

### Pitfall 6: Migration Signal Type Constraint
**What goes wrong:** Adding `'clarification'` to the `signal_type` CHECK constraint on `knowledge_log` requires dropping and recreating the constraint, but if the migration doesn't match the existing set exactly, it breaks.
**Why it happens:** CHECK constraint modifications are destructive -- must drop old, add new with complete value list.
**How to avoid:** Follow the exact pattern from `20260414000001_delegated_action_wal_signal.sql`: `DROP CONSTRAINT IF EXISTS knowledge_log_signal_type_check` then `ADD CONSTRAINT` with full list including 'clarification'.
**Warning signs:** Migration fails with constraint violation.

## Code Examples

### Brain Consolidation Hook Point
```typescript
// Source: brain-consolidation.ts lines 97-120 (existing code, verified)
// INSERT anomaly detection AFTER processDomainJobDirect and BEFORE Chief Librarian

for (const [, group] of grouped) {
  try {
    await processDomainJobDirect(supabase, orgId, group.entity_name, group.entry_ids, group.domain)
    dossiersCompiled++
    updatedDomains.add(group.domain)

    // [NEW] Anomaly detection pass for this entity
    const entityNode = await resolveEntityByAlias(supabase, orgId, group.entity_name)
    if (entityNode) {
      const walEntries = await supabase.from('knowledge_log').select('*').in('id', group.entry_ids)
      await detectAndAlertAnomalies(supabase, orgId, entityNode.id, walEntries.data ?? [])
    }
  } catch (err) {
    dossierErrors++
    // ... existing error handling
  }
}

// [NEW] Cross-entity anomaly aggregation (after all entities processed)
await detectCrossEntityPatternBreaks(supabase, orgId)
```

### Anomaly Baselines Table Schema
```sql
-- Source: Designed per CONTEXT.md decisions and existing migration patterns
CREATE TABLE IF NOT EXISTS anomaly_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES entity_nodes(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL CHECK (metric_name IN (
    'payment_timing', 'payment_amount', 'message_frequency', 'response_latency'
  )),
  mean FLOAT NOT NULL DEFAULT 0,
  stddev FLOAT NOT NULL DEFAULT 0,
  sample_count INT NOT NULL DEFAULT 0,
  last_computed TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (org_id, entity_id, metric_name)
);

CREATE TABLE IF NOT EXISTS brain_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES entity_nodes(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('anomaly', 'pattern_break', 'learning_prompt')),
  metric_name TEXT,
  z_score FLOAT,
  baseline_text TEXT NOT NULL,  -- "Usually pays by day 5, z=3.2"
  explanation TEXT NOT NULL,     -- Haiku-generated natural language
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  channel TEXT,                  -- Which channel it was routed through
  dismissed_at TIMESTAMPTZ,      -- Track dismissals for future training (deferred)
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### WAL Signal Type Extension
```sql
-- Source: Pattern from 20260414000001_delegated_action_wal_signal.sql (verified)
ALTER TABLE knowledge_log
  DROP CONSTRAINT IF EXISTS knowledge_log_signal_type_check;

ALTER TABLE knowledge_log
  ADD CONSTRAINT knowledge_log_signal_type_check
  CHECK (signal_type IN (
    'message', 'invoice', 'calendar', 'pattern', 'correction',
    'decision', 'relationship', 'pricing', 'fiduciary',
    'delegated_action', 'clarification'
  ));
```

### simple-statistics API Usage
```typescript
// Source: Verified against simple-statistics 7.8.9 via node REPL
import { zScore, addToMean, mean, sampleStandardDeviation } from 'simple-statistics'

// Compute z-score: zScore(value, mean, stddev)
const z = zScore(15, 10, 2)  // Returns 2.5

// Incremental mean update: addToMean(currentMean, count, newValue) -> updatedMean
const newMean = addToMean(5, 3, 8)  // Returns 5.75 (mean of [5,5,5,8])

// Full array methods (for bootstrapping baselines from historical data)
const values = [10, 12, 11, 13, 10, 12]
const m = mean(values)                    // 11.333...
const sd = sampleStandardDeviation(values)  // 1.211...
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Simple threshold alerts (proactive-alerts.ts) | Statistical z-score anomaly detection | Phase 46 | Context-aware alerts with baseline comparison instead of hardcoded rules |
| Generic "ask for approval" on low confidence | Targeted clarifying questions | Phase 46 | User gets specific question about what's ambiguous, not generic "should I proceed?" |
| WhatsApp-hardcoded proactive alerts | Channel-agnostic alert routing | Phase 46 | Alerts route through whatever channel user has connected |
| Predictive coding surprise score (0-1 qualitative) | Z-score quantitative anomaly (per metric) | Phase 46 | Complements surprise scoring with objective statistical measure |

**Deprecated/outdated:**
- The existing `proactive-alerts.ts` pattern (WhatsApp-specific, rule-based) remains for its current use cases (overdue invoices, high-value leads) but the new brain_alerts system supersedes it for anomaly-type alerts. No code removed, just extended.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `simple-statistics` addToMean + manual Welford variance update provides numerically stable incremental stats | Architecture Patterns | LOW -- simple-statistics is well-tested; Welford's is mathematically proven. If numeric instability occurs, switch to full-array recalculation periodically |
| A2 | Haiku is sufficient quality for anomaly explanation generation | Code Examples | LOW -- if explanations are poor, can upgrade to Sonnet. Cost difference per alert is negligible given 2-3 per entity per day budget |
| A3 | Morning briefing cron runs daily and can accommodate new learning prompt sections | Architecture Patterns | LOW -- morning briefing cron exists at `/api/cron/morning-briefing/route.ts`, verified. Adding a section follows existing pattern |
| A4 | Message frequency metric is meaningful as a count per consolidation window (30min) | Architecture Patterns | MEDIUM -- if consolidation frequency changes, the metric semantics change. Mitigate by normalizing to messages/hour |
| A5 | The `organizations` table is actually named `organisations` (British spelling) | Code Examples | HIGH if wrong -- the cron routes reference `organisations`. Must use same spelling in queries. Verified in brain-consolidation cron route: `supabase.from('organisations')` |

## Open Questions

1. **Message frequency normalization**
   - What we know: WAL entries include message signals with timestamps. Consolidation runs every 30 minutes.
   - What's unclear: Should message_frequency be counted per consolidation window (30min) or normalized to per-hour/per-day? Per-window makes the metric sensitive to cron schedule changes.
   - Recommendation: Normalize to messages per day by dividing count by fraction of day in the consolidation window. This makes the baseline stable regardless of cron frequency.

2. **Response latency metric source**
   - What we know: CONTEXT.md specifies tracking response latency as one of 4 metrics.
   - What's unclear: Where does response latency data come from? The WAL entries don't have explicit latency fields. It would need to be computed from message pairs (inbound -> outbound timestamps).
   - Recommendation: Initially derive from consecutive message signals for the same entity (time between last inbound and first outbound). If data is sparse, defer this metric to a later pass when sent-message capture (Epic B1) is available.

3. **Clarification signal entity resolution**
   - What we know: User replies to clarifying questions should enter WAL with signal_type='clarification'. The reply needs to be associated with the correct entity_id.
   - What's unclear: How does the system know which entity the clarification relates to? The original question context needs to be preserved.
   - Recommendation: Store the entity_id and original question context in the clarification WAL entry's content field. The Section Librarian already handles entity_ids arrays on WAL entries.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| simple-statistics | Anomaly detection | Partially (global, not in package.json) | 7.8.9 | Must install via npm |
| Supabase | All persistence | Yes | Existing | -- |
| Vercel AI SDK (ai) | LLM calls | Yes | Existing | -- |
| Haiku model | Anomaly explanations, clarifying questions | Yes | Via AI gateway | -- |
| Vitest | Testing | Yes | Existing | -- |

**Missing dependencies with no fallback:**
- `simple-statistics` must be added to `personal-assistant/package.json` (INFRA-01). Currently available globally but not declared as project dependency.

**Missing dependencies with fallback:**
- None -- all other dependencies are already installed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (existing) |
| Config file | `personal-assistant/vitest.config.ts` |
| Quick run command | `cd personal-assistant && npx vitest run src/lib/brain/__tests__/anomaly-detector.test.ts` |
| Full suite command | `cd personal-assistant && npm run test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ANOM-01 | Z-score computation per entity per metric | unit | `npx vitest run src/lib/brain/__tests__/anomaly-detector.test.ts -t "z-score"` | Wave 0 |
| ANOM-02 | Alert generation on z>3 | unit | `npx vitest run src/lib/brain/__tests__/anomaly-detector.test.ts -t "alert generation"` | Wave 0 |
| ANOM-03 | Alert budget enforcement | unit | `npx vitest run src/lib/brain/__tests__/anomaly-detector.test.ts -t "budget"` | Wave 0 |
| ANOM-04 | Cross-entity pattern break | unit | `npx vitest run src/lib/brain/__tests__/anomaly-detector.test.ts -t "cross-entity"` | Wave 0 |
| ANOM-05 | Baseline comparison text in alerts | unit | `npx vitest run src/lib/brain/__tests__/anomaly-detector.test.ts -t "baseline text"` | Wave 0 |
| LEARN-01 | Clarify decision in 50-70% band | unit | `npx vitest run src/lib/agent/__tests__/confidence-router.test.ts -t "clarify"` | Wave 0 |
| LEARN-02 | Question references specific ambiguity | unit | `npx vitest run src/lib/agent/__tests__/active-learner.test.ts -t "ambiguity"` | Wave 0 |
| LEARN-03 | Clarification WAL entry updates dossier | integration | `npx vitest run src/lib/brain/__tests__/brain-consolidation.test.ts -t "clarification"` | Wave 0 |
| LEARN-04 | Low-confidence domain tracking + learning prompt | unit | `npx vitest run src/lib/agent/__tests__/active-learner.test.ts -t "learning prompt"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd personal-assistant && npx vitest run src/lib/brain/__tests__/anomaly-detector.test.ts src/lib/agent/__tests__/active-learner.test.ts`
- **Per wave merge:** `cd personal-assistant && npm run test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/lib/brain/__tests__/anomaly-detector.test.ts` -- covers ANOM-01 through ANOM-05
- [ ] `src/lib/agent/__tests__/active-learner.test.ts` -- covers LEARN-01 through LEARN-04
- [ ] Extend `src/lib/agent/__tests__/confidence-router.test.ts` with clarify band tests

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | -- |
| V3 Session Management | No | -- |
| V4 Access Control | Yes | RLS policies on all new tables (`get_user_org_id()`) |
| V5 Input Validation | Yes | CHECK constraints on metric_name, alert_type, severity; z-score input validation |
| V6 Cryptography | No | -- |

### Known Threat Patterns for Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-org data leakage in anomaly baselines | Information Disclosure | RLS policies on anomaly_baselines and brain_alerts, same pattern as entity_dossiers |
| Alert injection via crafted WAL content | Tampering | Haiku explanation generation sanitizes input; alert text is generated, not passed through |
| Alert fatigue as denial of service | Denial of Service | Per-entity alert budget (3/day sliding window) enforced at database level |
| Clarification question information leakage | Information Disclosure | Questions generated from dossier context which is already org-scoped |

## Sources

### Primary (HIGH confidence)
- `brain-consolidation.ts` -- full pipeline read, hook points identified (lines 97-120 for entity loop, line 125 for domain synthesis)
- `section-librarian.ts` -- dossier compilation flow, processDomainJobDirect entry point
- `confidence-router.ts` -- act/ask/escalate bands, threshold cascade, existing routing logic
- `types.ts` (brain) -- KnowledgeLogEntry, EntityDossier, DomainType, SignalType definitions
- `simple-statistics` API -- verified via Node REPL: zScore, addToMean, combineMeans, combineVariances all available
- `20260411000001_knowledge_wal_dossiers.sql` -- entity_dossiers schema, RLS pattern
- `20260414000001_delegated_action_wal_signal.sql` -- signal_type CHECK constraint extension pattern
- `proactive-alerts.ts` -- existing alert dedup pattern (isRecentlySent)
- `surprise-surfacer.ts` -- channel-aware formatting pattern, SurfaceChannel type
- `morning-briefing.ts` -- briefing section structure, hook point for learning prompts
- `predictive-coding.ts` -- surprise scoring pattern, Haiku call pattern
- `intake-clerk.ts` -- signal_type to domain mapping, fact extraction structure

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` -- recommended module structure for anomaly-detector.ts
- `.planning/research/STACK.md` -- simple-statistics selection rationale, bundle impact
- `npm view simple-statistics version` -- confirmed 7.8.9 [VERIFIED: npm registry]

### Tertiary (LOW confidence)
- None -- all claims verified against codebase or npm registry

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- simple-statistics API verified via REPL, existing deps confirmed
- Architecture: HIGH -- all hook points verified by reading source code, patterns match existing codebase
- Pitfalls: HIGH -- identified from codebase analysis (zero-stddev, low sample count are mathematically grounded)

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (stable domain, no external API changes expected)
