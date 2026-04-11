# Phase 37: Engine Flexibility — Research

**Researched:** 2026-04-08
**Status:** Complete

## Codebase Analysis

### 1. TAOR Loop (`src/lib/agent/engine/taor-loop.ts`)

**Current state:** `SAFETY_CEILING = 50` hardcoded at line 83. Used as `while (iterationCount < SAFETY_CEILING)` at line 413. When hit, yields `status: 'max_iterations'` at line 883.

**Integration points:**
- `EngineConfig` (types.ts) already has `maxIterations?: number` field but it's NOT used by the loop — the loop only checks SAFETY_CEILING
- Config is passed through `runTAORLoop(message, config)` — easy to thread entity overrides through config
- Pre-flight checks run before the loop — good place to resolve entity delegation mandates

**Change approach:** Add `iterationCap` to EngineConfig, resolve from delegation mandate in pre-flight, default to SAFETY_CEILING when absent. The while loop reads `config.iterationCap ?? SAFETY_CEILING`.

### 2. Confidence Router (`src/lib/agent/confidence-router.ts`)

**Current state:** 5-level cascade: calibrated → agent_config → agent_type → org_settings → defaults. Returns `act | ask | escalate` decisions. No entity concept at all.

**Key function:** `routeAgentAction(confidence, agentConfig?, orgSettings?, agentType?, calibratedThresholds?)` — this is the main entry point called from tools.ts and approval-queue.ts.

**ConfidenceDecision type** (from bitbit-core): `'act' | 'ask' | 'escalate'` — needs `'auto_delegated'` added.

**Change approach:** Add optional `entityDelegation?: { mandate: 'infinite_autopilot' | 'supervised' | 'standard' }` parameter to `routeAgentAction`. When mandate is `infinite_autopilot`, short-circuit to return `auto_delegated` decision. This preserves the existing cascade for all other paths.

### 3. Cost Guard (`src/lib/agent/cost-guard.ts`)

**Current state:**
- `canProceed(supabase, orgId)` — org-level daily USD limit from `org_settings.daily_cost_limit`, default $10
- `ROLE_BUDGET_CONFIG` — hardcoded per-role token budgets (ads: 500K, seo: 300K, content: 800K, tenders: 600K)
- `checkRoleBudget(supabase, orgId, role)` — per-role daily token budget enforcement
- `getExecutionTokenCap(role)` — per-execution cap from ROLE_BUDGET_CONFIG

**Integration points:**
- Pre-flight calls `canProceed` for org-level check
- Tool executor calls `checkRoleBudget` per tool execution
- Role runtime calls both org and role guards

**Change approach:** Add optional `ltvMultiplier?: number` to `checkRoleBudget`. When present, multiply `dailyTokenBudget` and `maxTokensPerExecution` by the multiplier. LTV multiplier resolved at pre-flight from entity context. Default multiplier: 1.0 (no change).

### 4. Token Budget Manager (`src/lib/context-assembly/token-budget-manager.ts`)

**Current state:**
- `TokenBudgetManager` class with configurable budget (default 48000)
- `AssemblerConfig.tokenBudget` in context-assembler.ts (default 48000)
- Priority-based allocation across tiers: systemPrompt, entityContext, recentTurns, compressedHistory, keyFacts, pendingActions, retrievedContext, skillPrompts
- No concept of a "workspace" tier or expanded budget

**Change approach:** Add a `dynamic_workspace` budget preset (200K+ tokens). When EngineConfig signals workspace mode, ContextAssembler uses the expanded budget. New tier allocation redistributes extra tokens to entityContext, retrievedContext, and a new executionContext tier for AOM trees/logs.

### 5. EngineConfig (`src/lib/agent/engine/types.ts`)

**Current state:** 18 fields covering org, model, agent config, history, user identity, channel, content blocks, sub-agent support.

**New fields needed:**
- `entityId?: string` — target entity for delegation lookup
- `delegationMandate?: 'infinite_autopilot' | 'supervised' | 'standard'` — resolved from entity
- `ltvMultiplier?: number` — resolved from entity LTV score
- `budgetPreset?: 'standard' | 'dynamic_workspace'` — controls token budget tier

### 6. Delegation Mandate Storage

**No existing schema.** Need new table or column.

**Option A — New column on contacts table:** `delegation_mandate` enum on `contacts` table. Simple, but contacts are the entity table and this is org-scoped.

**Option B — New `entity_overrides` table:** `entity_id, org_id, delegation_mandate, ltv_score, budget_multiplier, iteration_cap`. More flexible, cleanly separated.

**Recommended: Option B** — `entity_overrides` table. Reasons:
1. Separation of concerns — override config separate from entity data
2. Easy to extend for Phase 38 (fiduciary memory) and Phase 43 (infinite delegation)
3. Can store computed LTV alongside manual overrides
4. RLS scoped to org_id naturally

### 7. LTV Score Resolution

**No existing LTV concept.** Need to define what LTV means.

**Practical approach for Phase 37:** LTV is a simple multiplier stored in `entity_overrides.ltv_multiplier` (default 1.0). Phase 38 (Fiduciary Memory) will add game theory LTV computation. For now, the score can be:
- Manually set by user via dashboard
- Auto-computed from invoice history (sum of paid invoices / months active)
- Default 1.0 for all entities without overrides

**Budget scaling:** `effective_budget = base_budget * ltv_multiplier`. A multiplier of 2.0 doubles all budgets for that entity. Capped at 10x to prevent runaway.

## Validation Architecture

### Test Surface

| Requirement | Test Type | What to Verify |
|-------------|-----------|----------------|
| ENGINE-01 | Unit + Integration | TAOR loop respects entity-specific cap; default cap unchanged |
| ENGINE-02 | Unit | Confidence router returns `auto_delegated` for infinite_autopilot entities; standard path unchanged |
| ENGINE-03 | Unit + Integration | Cost guard scales budgets by LTV multiplier; default behavior unchanged |
| ENGINE-04 | Unit | TokenBudgetManager allocates 200K+ in workspace mode; standard 48K unchanged |
| ENGINE-05 | Regression suite | All existing confidence-router, cost-guard, and token-budget tests pass without modification |

### Critical Regression Risk

Every change MUST be backward-compatible. The primary risk is breaking the hot path for standard chat messages. Mitigation:
- All new parameters are optional with defaults matching current behavior
- Existing test suites must pass without modification
- New code paths only activate when entity overrides are present

## Migration Plan

### New Migration: `entity_overrides` table

```sql
CREATE TABLE IF NOT EXISTS entity_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  delegation_mandate TEXT NOT NULL DEFAULT 'standard'
    CHECK (delegation_mandate IN ('standard', 'supervised', 'infinite_autopilot')),
  ltv_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.00
    CHECK (ltv_multiplier >= 0.1 AND ltv_multiplier <= 10.0),
  iteration_cap INTEGER,
  budget_preset TEXT NOT NULL DEFAULT 'standard'
    CHECK (budget_preset IN ('standard', 'dynamic_workspace')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_id, org_id)
);

ALTER TABLE entity_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entity_overrides_org" ON entity_overrides
  FOR ALL USING (org_id = (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
```

## Dependencies

- **Downstream:** Phase 38 (Fiduciary Memory) extends `entity_overrides` with fiduciary constraints
- **Downstream:** Phase 39 (Async Tasks) uses `budgetPreset: 'dynamic_workspace'` for long-running tasks
- **Downstream:** Phase 43 (Infinite Delegation) uses `delegation_mandate` and confidence router's `auto_delegated` path

## Key Decisions for Planner

1. **entity_overrides table** as the single source of truth for per-entity configuration
2. **LTV as a simple multiplier** (1.0 default, max 10x) — game theory computation deferred to Phase 38
3. **All new EngineConfig fields optional** — zero regression for standard paths
4. **`auto_delegated` as new ConfidenceDecision value** — short-circuits the entire routing cascade
5. **Pre-flight as the resolution point** — delegation mandates and LTV loaded once before loop starts
6. **200K workspace budget** as a named preset, not arbitrary numbers

## RESEARCH COMPLETE
