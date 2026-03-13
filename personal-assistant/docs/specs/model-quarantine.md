# Model Quarantine Feature Spec

**Feature**: Model ID Quarantine + Response Sanitization
**Plan Phases**: 1, 2
**Status**: Spec
**Date**: 2026-03-13

---

## 1. Overview

Centralize all AI model IDs into a single sealed module (`model-registry.ts`) and strip all model/tier/provider metadata from client-facing responses. After this feature, zero hardcoded model IDs exist outside the registry, zero model metadata reaches the client, and the `ModelTier` type is removed from the codebase.

---

## 2. Acceptance Criteria

### AC-1: model-registry.ts Created (Phase 1.1)
- **MUST** create `src/lib/agent/model-registry.ts` as the ONLY file containing real model IDs
- **MUST** export `resolveModel(purpose: ModelPurpose): string` — returns opaque model ID string
- **MUST** export `resolveTokenLimit(purpose: ModelPurpose): number` — returns max tokens for purpose
- **MUST** export `computeCost(purpose: ModelPurpose, inputTokens: number, outputTokens: number): number` — returns USD cost
- **MUST** export `classifyPurpose(task: string, wordCount?: number): ModelPurpose` — maps task description to purpose
- **MUST** export type `ModelPurpose = 'classification' | 'conversation' | 'synthesis'`
- **MUST** support env var overrides: `MODEL_CLASSIFY`, `MODEL_CONVERSE`, `MODEL_SYNTH`
- Default model IDs:
  - classification: `claude-haiku-4-5-20251001`
  - conversation: `claude-sonnet-4-5-20250929`
  - synthesis: `claude-opus-4-20250514`
- Token limits: classification=4096, conversation=8192, synthesis=16384
- Cost per million tokens: classification=0.25/1.25, conversation=3.00/15.00, synthesis=15.00/75.00

### AC-2: All 20 Files Updated to Use resolveModel (Phase 1.2)
Every file below **MUST** replace hardcoded model IDs with `resolveModel(purpose)` calls:

| # | File | Current Model | Purpose |
|---|------|--------------|---------|
| 1 | `src/lib/agent/model-router.ts` | opus/sonnet/haiku IDs + tier config | Gut internals, delegate to registry |
| 2 | `src/app/api/ai/text/route.ts:62` | `claude-sonnet-4-20250514` | `resolveModel('conversation')` |
| 3 | `src/app/api/ai/voice/route.ts:112` | `claude-sonnet-4-20250514` | `resolveModel('conversation')` |
| 4 | `src/lib/agent/planner.ts:103` | `claude-haiku-4-5-20251001` | `resolveModel('classification')` |
| 5 | `src/lib/agent/classifier.ts:404,426` | `claude-3-5-haiku-latest` + `classification_model: 'claude-3-5-haiku-latest'` | `resolveModel('classification')` |
| 6 | `src/lib/admin/health-check.ts:48` | `claude-sonnet-4-20250514` | `resolveModel('conversation')` |
| 7 | `src/lib/agent/sentiment.ts` | Haiku ID | `resolveModel('classification')` |
| 8 | `src/lib/agent/memory-consolidation.ts:106` | `claude-haiku-4-5-20251001` | `resolveModel('classification')` |
| 9 | `src/lib/memory/memory-consolidator.ts:223,326` | `claude-haiku-4-5-20251001` | `resolveModel('classification')` |
| 10 | `src/lib/agent/reflection.ts:111` | `claude-haiku-4-5-20251001` | `resolveModel('classification')` |
| 11 | `src/lib/agent/ad-script-gen.ts:355` | `claude-opus-4-20250514` | `resolveModel('synthesis')` |
| 12 | `src/lib/agent/ad-script-gen.ts:409` | `claude-sonnet-4-20250514` | `resolveModel('conversation')` |
| 13 | `src/lib/memory/thread-archiver.ts:78,108` | `claude-haiku-4-5-20251001` | `resolveModel('classification')` |
| 14 | `src/lib/whatsapp/command-parser.ts:122` | `claude-3-5-haiku-latest` | `resolveModel('classification')` |
| 15 | `src/lib/agent/daily-digest.ts:177,258` | `claude-3-5-haiku-latest` + `model_used: 'haiku'` | `resolveModel('classification')` |
| 16 | `src/lib/agent/client-comms.ts:328,450` | `claude-sonnet-4-20250514` | `resolveModel('conversation')` |
| 17 | `src/lib/agent/engine.ts:146` | `claude-sonnet-4-5-20250929` fallback | `resolveModel('conversation')` |
| 18 | `src/lib/conversation/types.ts:177` | `claude-haiku-4-5-20251001` summarizationModel | `resolveModel('classification')` |
| 19 | `src/lib/agent/run-logger.ts:8-12` | `MODEL_COSTS` dict | Use `computeCost()` from registry |
| 20 | `src/lib/billing/usage-metering.ts:8-12` | `MODEL_COSTS` dict | Use `computeCost()` from registry |
| 21 | `src/lib/monitoring/cost-tracker.ts:11-22` | `MODEL_PRICING` dict | Use `computeCost()` from registry |

- After changes, the following grep returns empty (covers full model IDs, `*-latest` variants, and bare tier-name keys):
  ```
  grep -rn -E "claude-(opus|sonnet|haiku)|haiku-latest|'haiku'|'sonnet'|'opus'" \
    personal-assistant/src/ --include="*.ts" --include="*.tsx" \
    | grep -v model-registry.ts | grep -v node_modules | grep -v '\.test\.'
  ```

### AC-3: ModelTier Type Removed (Phase 1.4)
- **MUST** delete `ModelTier` type from `src/lib/core/types.ts:32`
- **MUST** delete `ModelTier` type from `src/lib/bitbit-core/types.ts:32`
- **MUST** remove `ModelTier` re-export from `src/lib/bitbit-core/index.ts` and `src/lib/bitbit-core.ts`
- **MUST** update all files importing `ModelTier` to use `ModelPurpose` instead (or remove the import if no longer needed)
- Affected importers: `engine.ts`, `run-logger.ts`, `agent-registry.ts`, `confidence-harness.ts`, `model-tier-confidence.test.ts`
- **MUST** update dependent type fields that use `ModelTier`:
  - `OrgSettings.default_model_tier?: ModelTier` (`core/types.ts:19`, `bitbit-core/types.ts:19`) — remove field entirely (routing is automatic, not user-configurable)
  - `AgentConfig.model_tier_override?: ModelTier` (`core/types.ts:188`, `bitbit-core/types.ts:187`) — change to `model_purpose_override?: ModelPurpose`
  - `AgentRun.model_used: ModelTier` (`bitbit-core/types.ts:217`) — change to `model_purpose: ModelPurpose`
  - `AgentDefinition.default_model_tier: ModelTier` (`core/agent-registry.ts:26`, `bitbit-core/agent-registry.ts:26`) — change to `default_purpose: ModelPurpose`
  - `agent-registry.ts:127` assignment `model_tier_override: definition.default_model_tier` — update to use new field names

### AC-4: model-router.ts Refactored (Phase 1.5)
- **MUST** remove `ModelConfig` and `ModelSelection` interfaces (leak tier names)
- **MUST** remove `getModel()` and `getAllModels()` exports
- **MUST** remove the deprecated `routeToModel()` export
- **MUST** refactor `selectModel()` to return `{ model: string; purpose: ModelPurpose; reasoning: string }` (no `tier` field)
- `selectModel()` internally uses `classifyPurpose()` from model-registry, then `resolveModel()` to get the ID
- The `models` record, `opusTriggers`, `haikuTriggers` constants are removed — classification logic moves to `classifyPurpose()` in model-registry

### AC-5: Engine Stream Events Stripped (Phase 2.1)
- **MUST** change `engine.ts:389` from `yield { type: 'done', data: { tokens: response.usage, model, tier: selection?.tier } }` to `yield { type: 'done', data: { tokens: response.usage } }`
- **MUST** change `engine.ts:149` model_routing stage meta to exclude `tier` and `model` fields — only emit `{ stage: 'model_routing', status: 'done' }`
- **MUST** add server-side `logger.info('ai_response_complete', { model, purpose, tokens })` for internal tracking
- The `model` variable in engine.ts remains for the Anthropic SDK call but is never yielded to the client

### AC-6: sanitizeForClient Helper Created (Phase 2.3)
- **MUST** create `src/lib/api/sanitize-response.ts`
- **MUST** export `sanitizeForClient<T>(data: T): Partial<T>` — strips keys: `model`, `tier`, `provider`, `model_id`
- **MUST** be applied in cost API route (`/api/monitoring/costs`) response
- The helper is generic and can be applied to any API response object

### AC-7: Cost API Aggregation (Phase 2.2)
- The cost tracking files (`run-logger.ts`, `usage-metering.ts`, `cost-tracker.ts`) **MUST** use `computeCost()` from model-registry instead of local `MODEL_COSTS`/`MODEL_PRICING` dicts
- `cost-tracker.ts` `CostSummary.by_model` field: **MUST** aggregate by purpose (classification/conversation/synthesis), not by model name
- Cost API responses **MUST NOT** contain model names — only purpose categories or date-based aggregation

### AC-8: TypeScript Compiles Clean
- `npx tsc --noEmit` **MUST** exit 0 with zero errors after all changes
- No `any` type assertions used to silence model-related type errors

---

## 3. Files Modified

| File | Change |
|------|--------|
| `src/lib/agent/model-router.ts` | Remove ModelConfig/ModelSelection/ModelTier, gut model records, delegate to registry |
| `src/lib/agent/engine.ts` | Import from registry, strip model/tier from stream events |
| `src/lib/core/types.ts` | Remove `ModelTier` type definition |
| `src/lib/bitbit-core/types.ts` | Remove `ModelTier` type definition |
| `src/lib/bitbit-core/index.ts` | Remove `ModelTier` re-export |
| `src/lib/bitbit-core.ts` | Remove `ModelTier` re-export |
| `src/app/api/ai/text/route.ts` | Replace hardcoded model ID with `resolveModel('conversation')` |
| `src/app/api/ai/voice/route.ts` | Replace hardcoded model ID with `resolveModel('conversation')` |
| `src/lib/agent/planner.ts` | Replace hardcoded model ID with `resolveModel('classification')` |
| `src/lib/agent/classifier.ts` | Replace hardcoded model ID with `resolveModel('classification')` |
| `src/lib/admin/health-check.ts` | Replace hardcoded model ID with `resolveModel('conversation')` |
| `src/lib/agent/sentiment.ts` | Replace hardcoded model ID with `resolveModel('classification')` |
| `src/lib/agent/memory-consolidation.ts` | Replace hardcoded model ID with `resolveModel('classification')` |
| `src/lib/memory/memory-consolidator.ts` | Replace hardcoded model IDs with `resolveModel('classification')` |
| `src/lib/agent/reflection.ts` | Replace hardcoded model ID with `resolveModel('classification')` |
| `src/lib/agent/ad-script-gen.ts` | Replace opus+sonnet model IDs with `resolveModel('synthesis')`/`resolveModel('conversation')` |
| `src/lib/memory/thread-archiver.ts` | Replace hardcoded model IDs with `resolveModel('classification')` |
| `src/lib/whatsapp/command-parser.ts` | Replace hardcoded model ID with `resolveModel('classification')` |
| `src/lib/agent/daily-digest.ts` | Replace hardcoded model ID with `resolveModel('classification')` |
| `src/lib/agent/client-comms.ts` | Replace hardcoded model IDs with `resolveModel('conversation')` |
| `src/lib/conversation/types.ts` | Replace hardcoded summarizationModel with `resolveModel('classification')` |
| `src/lib/agent/run-logger.ts` | Remove `MODEL_COSTS`, use `computeCost()` from registry |
| `src/lib/billing/usage-metering.ts` | Remove `MODEL_COSTS`, use `computeCost()` from registry |
| `src/lib/monitoring/cost-tracker.ts` | Remove `MODEL_PRICING`, use `computeCost()` from registry |
| `src/lib/core/agent-registry.ts` | Remove `ModelTier` import/usage |
| `src/lib/bitbit-core/agent-registry.ts` | Remove `ModelTier` import/usage |
| `src/lib/testing/confidence-harness.ts` | Remove `ModelTier` import/usage |
| `src/lib/agent/model-router.test.ts` | Update to test new registry-based interface |
| `src/lib/testing/model-tier-confidence.test.ts` | Update to use `ModelPurpose` |

## 4. Files Created (New)

### `src/lib/agent/model-registry.ts`
```typescript
// Purpose-based model resolution — no tier names exported
export type ModelPurpose =
  | 'classification'   // fast, cheap: triage, sentiment, parsing
  | 'conversation'     // balanced: chat, comms, general tasks
  | 'synthesis'        // heavy: planning, ad scripts, complex analysis

const MODELS: Record<ModelPurpose, string> = {
  classification: process.env.MODEL_CLASSIFY || 'claude-haiku-4-5-20251001',
  conversation:   process.env.MODEL_CONVERSE || 'claude-sonnet-4-5-20250929',
  synthesis:      process.env.MODEL_SYNTH    || 'claude-opus-4-20250514',
};

const TOKEN_LIMITS: Record<ModelPurpose, number> = {
  classification: 4096,
  conversation:   8192,
  synthesis:      16384,
};

const COST_PER_MILLION: Record<ModelPurpose, { input: number; output: number }> = {
  classification: { input: 0.25,  output: 1.25  },
  conversation:   { input: 3.00,  output: 15.00 },
  synthesis:      { input: 15.00, output: 75.00 },
};

export function resolveModel(purpose: ModelPurpose): string {
  return MODELS[purpose];
}

export function resolveTokenLimit(purpose: ModelPurpose): number {
  return TOKEN_LIMITS[purpose];
}

export function computeCost(purpose: ModelPurpose, inputTokens: number, outputTokens: number): number {
  const rates = COST_PER_MILLION[purpose];
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}

export function classifyPurpose(task: string, wordCount?: number): ModelPurpose {
  const lower = task.toLowerCase();
  const heavySignals = ['plan', 'strateg', 'complex', 'analy', 'script', 'synthe'];
  const lightSignals = ['classif', 'triage', 'sentiment', 'extract', 'parse', 'label'];

  if (lightSignals.some(s => lower.includes(s))) return 'classification';
  if (heavySignals.some(s => lower.includes(s))) return 'synthesis';
  if (wordCount && wordCount > 2000) return 'synthesis';
  return 'conversation';
}
```

### `src/lib/api/sanitize-response.ts`
```typescript
const FORBIDDEN_KEYS = ['model', 'tier', 'provider', 'model_id'];

export function sanitizeForClient<T extends Record<string, unknown>>(data: T): Partial<T> {
  const clean = { ...data };
  for (const key of FORBIDDEN_KEYS) {
    delete clean[key];
  }
  return clean;
}
```

---

## 5. Test Plan

Tests go in `src/lib/agent/__tests__/model-registry.test.ts` and `src/lib/api/__tests__/sanitize-response.test.ts`.

### Test Group 1: resolveModel
- `resolveModel('classification') returns a valid model ID string`
- `resolveModel('conversation') returns a valid model ID string`
- `resolveModel('synthesis') returns a valid model ID string`
- All three return different model IDs

### Test Group 2: computeCost
- `computeCost('classification', 1_000_000, 1_000_000) returns 1.50` (0.25+1.25)
- `computeCost('conversation', 1_000_000, 1_000_000) returns 18.00` (3.00+15.00)
- `computeCost('synthesis', 1_000_000, 1_000_000) returns 90.00` (15.00+75.00)
- `computeCost with 0 tokens returns 0`

### Test Group 3: classifyPurpose
- `classifyPurpose('classify this email') returns 'classification'`
- `classifyPurpose('triage these tickets') returns 'classification'`
- `classifyPurpose('plan a marketing strategy') returns 'synthesis'`
- `classifyPurpose('analyze this data') returns 'synthesis'`
- `classifyPurpose('send a message') returns 'conversation'` (default)
- `classifyPurpose('short task', 3000) returns 'synthesis'` (wordCount override)

### Test Group 4: sanitizeForClient
- `sanitizeForClient strips model key`
- `sanitizeForClient strips tier key`
- `sanitizeForClient strips provider key`
- `sanitizeForClient strips model_id key`
- `sanitizeForClient preserves non-forbidden keys`
- `sanitizeForClient handles empty objects`

### Test Group 5: Engine Stream Events (integration)
- `engine done event does NOT contain model field`
- `engine done event does NOT contain tier field`
- `engine done event contains tokens field`
- `engine model_routing stage meta does NOT contain tier or model`

### Test Group 6: No Hardcoded Model IDs
- `grep scan: zero claude-* model IDs outside model-registry.ts` (file scan test)

---

## 6. Non-Goals

- **Not modifying system prompts** — that's Phase 3 (prompt hardening), handled by prompt-defense feature
- **Not adding injection detection** — that's Phase 4 (injection guard), handled by prompt-defense feature
- **Not modifying HTTP headers or error messages** — that's Phase 5 (surface hardening)
- **Not scrubbing frontend UI text** — that's Phase 6 (frontend scrub), handled by surface-hardening feature
- **Not creating CI hooks** — that's Phase 7, handled by surface-hardening feature
- **Not adding timing jitter** — that's Phase 5.3, handled by surface-hardening feature
- **OrgSettings `default_model_tier` field**: Remove from type but don't migrate existing DB rows (dead field)

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `estimateRunCost` in run-logger.ts currently takes `ModelTier` — changing to `ModelPurpose` breaks callers | Update all callers in engine.ts and agent-run logging to pass purpose instead of tier |
| `conversation/types.ts` uses model ID as a static default — `resolveModel()` is a function call | Change `summarizationModel` default from string literal to a getter or call `resolveModel()` at usage site |
| Te