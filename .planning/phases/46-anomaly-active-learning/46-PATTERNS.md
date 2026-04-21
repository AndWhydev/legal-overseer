# Phase 46: Anomaly Detection + Active Learning - Pattern Map

**Mapped:** 2026-04-17
**Files analyzed:** 8 new/modified files
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/brain/anomaly-detector.ts` | service | batch/transform | `src/lib/brain/predictive-coding.ts` | exact |
| `src/lib/brain/types.ts` | model | -- | `src/lib/brain/types.ts` (self) | exact |
| `src/lib/brain/brain-consolidation.ts` | service | batch | `src/lib/brain/brain-consolidation.ts` (self) | exact |
| `src/lib/agent/confidence-router.ts` | service | request-response | `src/lib/agent/confidence-router.ts` (self) | exact |
| `src/lib/agent/active-learner.ts` | service | request-response | `src/lib/brain/predictive-coding.ts` | role-match |
| `src/lib/whatsapp/morning-briefing.ts` | service | batch | `src/lib/whatsapp/morning-briefing.ts` (self) | exact |
| `supabase/migrations/20260417000001_anomaly_baselines_brain_alerts.sql` | migration | -- | `20260411000001_knowledge_wal_dossiers.sql` | exact |
| `src/lib/brain/__tests__/anomaly-detector.test.ts` | test | -- | `src/lib/brain/__tests__/predictive-coding.test.ts` | exact |

## Pattern Assignments

### `src/lib/brain/anomaly-detector.ts` (service, batch/transform)

**Analog:** `src/lib/brain/predictive-coding.ts`

**Imports pattern** (predictive-coding.ts lines 1-7):
```typescript
import { gateway, generateText } from 'ai'

import { models } from '@/lib/ai'
import { logger } from '@/lib/core/logger'
import type { KnowledgeLogEntry } from './types'
```

Additional imports for anomaly-detector:
```typescript
import { zScore, addToMean } from 'simple-statistics'
import type { SupabaseClient } from '@supabase/supabase-js'
```

**Core pattern — LLM call for explanation generation** (predictive-coding.ts lines 54-99):
```typescript
// Pattern: async function with fallback, LLM via gateway(models.fast), try/catch returning fallback
export async function scoreSurprise(
  fact: KnowledgeLogEntry,
  schema: Record<string, unknown>,
): Promise<SurpriseScore> {
  const fallback: SurpriseScore = {
    fact_id: fact.id,
    score: 0.5,
    deviation_type: 'novel_dimension',
  }

  if (isEmptySchema(schema)) {
    return fallback
  }

  try {
    const { text } = await generateText({
      model: gateway(models.fast),
      system: `...prompt template...`,
      prompt: `...context...`,
    })

    const parsed = JSON.parse(text.trim())
    // ... validate and return
  } catch (err) {
    logger.warn('predictive-coding: scoreSurprise failed, using fallback', {
      fact_id: fact.id,
      error: err instanceof Error ? err.message : String(err),
    })
    return fallback
  }
}
```

**Note:** For anomaly explanations, use `gateway(models.fast)` (Gemini Flash) not Haiku directly. The `models.fast` constant resolves to `'google/gemini-3-flash'` via AI Gateway. The CONTEXT.md mentions Haiku but the codebase convention routes all "cheap/fast" LLM calls through `models.fast`.

**Error handling pattern** (predictive-coding.ts lines 93-98):
```typescript
// Pattern: warn-and-return-fallback, never throw from non-critical functions
} catch (err) {
  logger.warn('predictive-coding: scoreSurprise failed, using fallback', {
    fact_id: fact.id,
    error: err instanceof Error ? err.message : String(err),
  })
  return fallback
}
```

**Supabase query pattern — sliding window** (proactive-alerts.ts lines 141-160):
```typescript
// Pattern: count query with time window for dedup/budget checking
async function isRecentlySent(
  supabase: SupabaseClient,
  orgId: string,
  alert: ProactiveAlert
): Promise<boolean> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const { count } = await supabase
      .from('activity_feed')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('action', `proactive_alert:${alert.type}`)
      .gte('created_at', oneHourAgo)

    return (count ?? 0) > 0
  } catch {
    return false  // Fail closed
  }
}
```

**Supabase upsert pattern** (section-librarian.ts lines 124-149):
```typescript
// Pattern: upsert with onConflict for idempotent baseline updates
const { error: upsertError } = await supabase
  .from('entity_dossiers')
  .upsert(
    {
      org_id,
      entity_id: entityId,
      // ... fields
    },
    { onConflict: 'org_id,entity_id' },
  )

if (upsertError) {
  logger.error('[section-librarian] Failed to upsert dossier', {
    error: upsertError,
    entity_id: entityId,
  })
  throw new Error('Failed to upsert entity dossier')
}
```

---

### `src/lib/brain/brain-consolidation.ts` (modified — hook anomaly detection)

**Analog:** Self — modify the existing entity loop.

**Hook point** (brain-consolidation.ts lines 101-121):
```typescript
// INSERT anomaly detection after processDomainJobDirect and before Chief Librarian
for (const [, group] of grouped) {
  try {
    await processDomainJobDirect(
      supabase,
      orgId,
      group.entity_name,
      group.entry_ids,
      group.domain,
    )
    dossiersCompiled++
    updatedDomains.add(group.domain)

    // [NEW] Anomaly detection hook goes HERE
    // Pattern: fire-and-forget with error catch, same as existing error handling
  } catch (err) {
    dossierErrors++
    logger.error('[brain-consolidation] Dossier compilation failed', {
      org_id: orgId,
      entity_name: group.entity_name,
      domain: group.domain,
      error: err instanceof Error ? err.message : String(err),
    })
    // Continue with remaining entities -- don't abort pipeline
  }
}
```

**Cross-entity aggregation hook point** (brain-consolidation.ts lines 124-139):
```typescript
// INSERT cross-entity aggregation AFTER the domain profile synthesis loop
// and BEFORE marking WAL entries as consolidated (line 142)
// 6. Synthesize domain profiles (only for domains that had updates)
let domainsUpdated = 0
for (const domain of ALL_DOMAINS) {
  // ... existing domain synthesis
}

// [NEW] Cross-entity anomaly aggregation goes HERE
// Pattern: wrap in try/catch, log errors, don't abort pipeline

// 7. Mark ALL WAL entries as consolidated (line 142)
```

**Report type extension** (brain-consolidation.ts lines 25-35):
```typescript
// Pattern: extend the existing report interface with anomaly stats
export interface BrainConsolidationReport {
  orgId: string
  walEntriesProcessed: number
  // ... existing fields
  // [NEW] Add:
  // anomaliesDetected: number
  // alertsSent: number
  // crossEntityBreaks: number
}
```

---

### `src/lib/agent/confidence-router.ts` (modified — add clarify band)

**Analog:** Self.

**Existing routing function** (confidence-router.ts lines 92-122):
```typescript
// Pattern: sequential threshold comparison returning typed result
export function routeByConfidence(
  confidence: number,
  thresholds?: ConfidenceThresholds,
): ConfidenceRoutingResult {
  const effective = thresholds ?? DEFAULT_THRESHOLDS

  if (confidence >= effective.act) {
    return {
      decision: 'act',
      confidence,
      thresholds: effective,
      reasoning: `Confidence ${confidence} >= act threshold ${effective.act}`,
    }
  }

  if (confidence >= effective.ask) {
    return {
      decision: 'ask',
      confidence,
      thresholds: effective,
      reasoning: `Confidence ${confidence} between ask (${effective.ask}) and act (${effective.act}) thresholds`,
    }
  }

  return {
    decision: 'escalate',
    confidence,
    thresholds: effective,
    reasoning: `Confidence ${confidence} < ask threshold ${effective.ask}`,
  }
}
```

**Type extension needed** (bitbit-core/types.ts line 37):
```typescript
// Current type:
export type ConfidenceDecision = 'act' | 'ask' | 'escalate' | 'auto_delegated'
// Must add 'clarify' to this union type
```

**Entity delegation pattern for short-circuit** (confidence-router.ts lines 141-151):
```typescript
// Pattern: early return for special decision types, before threshold evaluation
if (entityDelegation?.mandate === 'infinite_autopilot') {
  return {
    decision: 'auto_delegated',
    confidence,
    thresholds: DEFAULT_THRESHOLDS,
    reasoning: `Entity ${entityDelegation.entityId ?? 'unknown'} has infinite_autopilot mandate -- auto-delegated`,
    thresholdSource: 'defaults',
  }
}
```

---

### `src/lib/agent/active-learner.ts` (service, request-response)

**Analog:** `src/lib/brain/predictive-coding.ts` (LLM-call pattern) + `src/lib/brain/surprise-surfacer.ts` (Supabase query + format pattern)

**Imports pattern** (combine from both analogs):
```typescript
import { gateway, generateText } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'

import { models } from '@/lib/ai'
import { logger } from '@/lib/core/logger'
```

**LLM question generation pattern** (predictive-coding.ts lines 68-98):
```typescript
// Pattern: generateText with system+prompt, JSON parse, fallback on error
try {
  const { text } = await generateText({
    model: gateway(models.fast),
    system: `...question generation prompt template...`,
    prompt: `...entity context + ambiguity description...`,
  })
  // Parse and validate response
} catch (err) {
  logger.warn('[active-learner] Question generation failed', {
    error: err instanceof Error ? err.message : String(err),
  })
  return null // Fallback: don't ask, let confidence router fall through to 'ask'
}
```

**Supabase query for low-confidence domains** (surprise-surfacer.ts lines 58-81):
```typescript
// Pattern: query with org_id filter, time window, ordered + limited
const lookbackSince = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString()

const { data, error } = await supabase
  .from('entity_dossiers')
  .select('entity_id, schema_json')
  .eq('org_id', orgId)
  .in('entity_id', entityIds)
```

**WAL entry creation for clarification feedback** (follows intake-clerk.ts signal routing, brain-consolidation.ts WAL tail pattern):
```typescript
// Pattern: insert into knowledge_log with new signal_type 'clarification'
// The existing intake-clerk SIGNAL_DOMAIN_MAP pattern should be extended:
const SIGNAL_DOMAIN_MAP: Record<SignalType, DomainType> = {
  // ... existing entries ...
  clarification: 'operational',  // or derive from original question context
}
```

---

### `src/lib/whatsapp/morning-briefing.ts` (modified — add learning prompt section)

**Analog:** Self.

**Section addition pattern** (morning-briefing.ts lines 30-62):
```typescript
// Pattern: conditional section with fetchXxx helper function
// Pending approvals
if (includeAll || config.includeApprovals) {
  const items = await fetchPendingApprovalItems(supabase, orgId)
  sections.push({ emoji: '...', title: 'Pending Approvals', items, showEmpty: false })
}

// [NEW] Learning prompts section follows identical pattern:
// if (includeAll || config.includeLearningPrompts) {
//   const items = await fetchLearningPromptItems(supabase, orgId)
//   sections.push({ emoji: '...', title: 'What I Need to Learn', items, showEmpty: false })
// }
```

**Fetch helper pattern** (morning-briefing.ts lines 81-94):
```typescript
// Pattern: async function returning string[], wrapped in try/catch returning []
async function fetchPendingApprovalItems(
  supabase: SupabaseClient,
  orgId: string
): Promise<string[]> {
  try {
    // ... Supabase query
    return results.map(/* format */)
  } catch {
    return []
  }
}
```

---

### `supabase/migrations/20260417000001_anomaly_baselines_brain_alerts.sql` (migration)

**Analog:** `20260411000001_knowledge_wal_dossiers.sql` (table creation + RLS + indexes)

**Table creation pattern** (20260411000001 lines 12-26):
```sql
CREATE TABLE IF NOT EXISTS knowledge_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- ... columns with CHECK constraints ...
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**RLS policy pattern** (20260411000001 lines 100-111):
```sql
ALTER TABLE knowledge_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "knowledge_log_select" ON knowledge_log FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "knowledge_log_insert" ON knowledge_log FOR INSERT WITH CHECK (org_id = get_user_org_id());
CREATE POLICY "knowledge_log_update" ON knowledge_log FOR UPDATE USING (org_id = get_user_org_id());
CREATE POLICY "knowledge_log_delete" ON knowledge_log FOR DELETE USING (org_id = get_user_org_id());
```

**updated_at trigger pattern** (20260411000001 lines 128-131):
```sql
CREATE TRIGGER trg_entity_dossiers_updated_at
  BEFORE UPDATE ON entity_dossiers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

**CHECK constraint extension pattern** (20260414000001 full file):
```sql
-- Pattern: DROP old constraint, ADD new with complete value list
ALTER TABLE knowledge_log
  DROP CONSTRAINT IF EXISTS knowledge_log_signal_type_check;

ALTER TABLE knowledge_log
  ADD CONSTRAINT knowledge_log_signal_type_check
  CHECK (signal_type IN (
    'message', 'invoice', 'calendar', 'pattern', 'correction',
    'decision', 'relationship', 'pricing', 'fiduciary',
    'delegated_action', 'clarification'  -- NEW value added
  ));
```

**Index pattern** (20260411000001 lines 78-95):
```sql
CREATE INDEX IF NOT EXISTS idx_klog_unconsolidated
  ON knowledge_log (org_id, created_at DESC)
  WHERE consolidated_at IS NULL;
```

**UNIQUE constraint pattern** (20260411000001 line 49):
```sql
UNIQUE (org_id, entity_id)
```

---

### `src/lib/brain/__tests__/anomaly-detector.test.ts` (test)

**Analog:** `src/lib/brain/__tests__/predictive-coding.test.ts`

**Test file structure** (predictive-coding.test.ts lines 1-28):
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { KnowledgeLogEntry, SurpriseScore } from '../types'

// Mock the AI SDK before importing the module under test
vi.mock('ai', () => ({
  generateText: vi.fn(),
  gateway: vi.fn((modelId: string) => modelId),
}))

import { generateText } from 'ai'
import { /* functions under test */ } from '../anomaly-detector'

const mockedGenerateText = vi.mocked(generateText)
```

**Helper factory pattern** (predictive-coding.test.ts lines 31-45):
```typescript
function makeFact(overrides: Partial<KnowledgeLogEntry> = {}): KnowledgeLogEntry {
  return {
    id: overrides.id ?? 'fact-1',
    org_id: 'org-1',
    entity_ids: ['entity-1'],
    signal_type: 'message',
    content: 'Alice sent a payment of $500',
    confidence: 0.9,
    source_memory_id: null,
    source_thread_id: null,
    consolidated_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}
```

**Supabase mock pattern** (brain-consolidation.test.ts lines 64-74):
```typescript
function makeSupabase() {
  const updateMock = {
    in: vi.fn().mockResolvedValue({ error: null }),
  }
  return {
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue(updateMock),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          // chain as needed
        }),
      }),
    }),
    _updateMock: updateMock,
  }
}
```

**Test organization pattern** (predictive-coding.test.ts):
```typescript
// Pattern: describe blocks per exported function, beforeEach clears mocks
describe('functionName', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('handles happy path', async () => { /* ... */ })
  it('handles edge case', async () => { /* ... */ })
  it('returns fallback on error', async () => { /* ... */ })
})
```

---

### `src/lib/agent/__tests__/confidence-router.test.ts` (modified — extend)

**Analog:** Self — existing test file.

**Test for new decision type** (confidence-router.test.ts lines 166-223):
```typescript
// Pattern: describe block for the new feature, testing decision routing
describe('entity delegation', () => {
  it('returns auto_delegated for infinite_autopilot mandate regardless of confidence', () => {
    const result = routeAgentAction(
      0.3,
      undefined, undefined, undefined, undefined,
      { mandate: 'infinite_autopilot', entityId: 'test-entity-1' },
    )
    expect(result.decision).toBe('auto_delegated')
    expect(result.reasoning).toContain('infinite_autopilot')
  })
})

// [NEW] Add equivalent describe block for 'clarify' decision:
// describe('clarify band', () => {
//   it('returns clarify when confidence in upper ask band', () => { ... })
//   it('returns ask when confidence in lower ask band', () => { ... })
//   it('does not clarify when above act threshold', () => { ... })
// })
```

---

## Shared Patterns

### Logger
**Source:** All files import from `@/lib/core/logger`
**Apply to:** All new TypeScript files
```typescript
import { logger } from '@/lib/core/logger'

// Convention: prefix with module name in brackets
logger.info('[anomaly-detector] Alert generated', { org_id: orgId, entity_id: entityId })
logger.warn('[active-learner] Question generation failed', { error: err instanceof Error ? err.message : String(err) })
logger.error('[brain-consolidation] Dossier compilation failed', { error: err instanceof Error ? err.message : String(err) })
```

### LLM Calls via AI Gateway
**Source:** `src/lib/brain/predictive-coding.ts` lines 68-71, `src/lib/ai/provider.ts` lines 12-19
**Apply to:** `anomaly-detector.ts` (explanation generation), `active-learner.ts` (question generation)
```typescript
import { gateway, generateText } from 'ai'
import { models } from '@/lib/ai'

// Convention: use models.fast for cheap/fast calls (Gemini Flash)
// models.balanced for conversation (Claude Sonnet)
// models.heavy for deep analysis (Claude Opus)
const { text } = await generateText({
  model: gateway(models.fast),  // NOT Anthropic Haiku directly
  system: `...`,
  prompt: `...`,
})
```

### Supabase RLS
**Source:** `20260411000001_knowledge_wal_dossiers.sql` lines 100-122
**Apply to:** All new tables (`anomaly_baselines`, `brain_alerts`)
```sql
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

CREATE POLICY "table_name_select" ON table_name FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "table_name_insert" ON table_name FOR INSERT WITH CHECK (org_id = get_user_org_id());
CREATE POLICY "table_name_update" ON table_name FOR UPDATE USING (org_id = get_user_org_id());
CREATE POLICY "table_name_delete" ON table_name FOR DELETE USING (org_id = get_user_org_id());
```

### Non-Critical Error Handling
**Source:** `src/lib/agent/engine/taor-loop.ts` lines 986-1009, `src/lib/brain/surprise-surfacer.ts` lines 130-138
**Apply to:** Alert routing, cross-entity aggregation, learning prompt generation
```typescript
// Pattern: wrap in try/catch, log warning, return gracefully
// Used for all non-critical features that should not break the parent pipeline
try {
  // ... feature code
} catch (err) {
  logger.warn('[module] Non-critical failure', {
    error: err instanceof Error ? err.message : String(err),
    org_id: orgId,
  })
  // Return empty/null/continue -- don't throw
}
```

### Entity Resolution
**Source:** `src/lib/knowledge-graph/graph-queries.ts` line 470, used by `section-librarian.ts` lines 48-75
**Apply to:** `anomaly-detector.ts` (needs entity_id from entity_name for baseline lookup)
```typescript
import { resolveEntityByAlias } from '@/lib/knowledge-graph/graph-queries'

const entity = await resolveEntityByAlias(supabase, orgId, entityName)
if (!entity) {
  // Handle missing entity -- skip or create
}
const entityId = entity.id
```

### Channel-Agnostic Alert Formatting
**Source:** `src/lib/brain/surprise-surfacer.ts` lines 151-183
**Apply to:** `anomaly-detector.ts` (alert formatting before routing)
```typescript
// Pattern: format based on channel type (compact for messaging, rich for web)
export type SurfaceChannel = 'web' | 'sendblue' | 'telegram' | 'whatsapp'

export function formatSurpriseForChannel(
  facts: SurfacedFact[],
  channel: SurfaceChannel,
): string {
  const isCompact = channel === 'sendblue' || channel === 'whatsapp'
  if (isCompact) {
    // Brief one-liners
  }
  // Richer format for web
}
```

### Test Mock Pattern (Vitest + AI SDK)
**Source:** `src/lib/brain/__tests__/predictive-coding.test.ts` lines 12-28
**Apply to:** All new test files
```typescript
// Pattern: mock AI SDK BEFORE importing module under test
vi.mock('ai', () => ({
  generateText: vi.fn(),
  gateway: vi.fn((modelId: string) => modelId),
}))

import { generateText } from 'ai'
const mockedGenerateText = vi.mocked(generateText)

// For Supabase mocks: use the chain-mock pattern from brain-consolidation.test.ts
```

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | -- | -- | All files have close analogs in the existing codebase |

## Metadata

**Analog search scope:** `personal-assistant/src/lib/brain/`, `personal-assistant/src/lib/agent/`, `personal-assistant/src/lib/whatsapp/`, `personal-assistant/src/lib/intelligence/`, `personal-assistant/supabase/migrations/`
**Files scanned:** 25+ source files, 3 migration files, 4 test files
**Pattern extraction date:** 2026-04-17

### Critical Codebase Observations

1. **Model routing:** The codebase does NOT use Anthropic Haiku directly. All LLM calls go through Vercel AI Gateway with `models.fast` (Gemini Flash), `models.balanced` (Claude Sonnet), or `models.heavy` (Claude Opus). Anomaly explanations and clarifying questions should use `gateway(models.fast)` per the established pattern, despite CONTEXT.md mentioning "Haiku."

2. **Migration numbering:** Latest migration is `20260415000005_memory_patterns_index.sql`. New migration should be `20260417000001_anomaly_baselines_brain_alerts.sql`.

3. **Table name spelling:** The `organizations` table is spelled with British `organisations` in some cron routes (per RESEARCH.md Assumption A5). Verify before writing FK references.

4. **ConfidenceDecision type:** Lives in `src/lib/bitbit-core/types.ts` (line 37) and `src/lib/core/types.ts` (line 37). Adding `'clarify'` requires updating both locations.

5. **Signal type in intake-clerk:** The `SIGNAL_DOMAIN_MAP` in `src/lib/brain/intake-clerk.ts` (lines 22-33) needs a `clarification` entry added to route clarification WAL entries to the correct domain queue.

6. **Provider registry for alerts:** The existing `proactive-alerts.ts` hardcodes WhatsApp via `import { sendMessage } from '../channels/whatsapp'`. New anomaly alerts must NOT follow this pattern -- use the provider registry instead per CONTEXT.md decision.
