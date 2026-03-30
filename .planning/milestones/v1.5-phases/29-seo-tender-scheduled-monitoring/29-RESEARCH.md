# Phase 29: SEO/Tender Scheduled Monitoring - Research

**Researched:** 2026-03-27
**Domain:** Scheduled role execution / growth tool monitoring / proactive alerting
**Confidence:** HIGH

## Summary

Phase 29 closes the final 4 pending requirements in the v1.4 milestone (SEO-03, SEO-04, TNDR-03, TNDR-04) by wiring SEO visibility monitoring and Tender Hunter scanning into the existing role-tick cron infrastructure. The core challenge is architectural integration, not new library adoption -- all underlying tool implementations already exist and have been tested.

The codebase already contains `runAISearchTick()` (in `ai-search-optimizer.ts`, lines 748-821) and `runTenderHunterTick()` (in `tender-hunter.ts`, lines 725-775) which are complete scheduled-tick functions. Neither is currently invoked by any cron or role system. The role runtime (Phase 27) handles `finance`, `comms`, and `sales` roles via a `RoleType` union type and `registerRole()` side-effect pattern. SEO and Tender monitoring must either (a) be registered as new role types in this same system, or (b) use a lighter-weight approach that hooks directly into existing cron infrastructure without full role registration.

**Primary recommendation:** Create a dedicated `growth` role implementation that wraps both SEO monitoring and Tender Hunter scheduled ticks, following the exact same pattern as `finance-role.ts`. This role evaluates on each tick, runs `runAISearchTick()` and `runTenderHunterTick()` using org config from `role_configs`, and produces `RoleAction[]` / `RoleInsight[]` that flow through the existing autonomy gate, activity logging, and notification dispatcher. The `RoleType` union must be extended to include `'growth'`, and the role-tick cron route must import the growth role module for side-effect registration.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SEO-03 | SEO monitor runs on scheduled tick to detect ranking changes | Existing `runAISearchTick()` handles full audit cycle; `runVisibilityAudit()` + `checkVisibilityChanges()` detects changes and creates notifications. Needs wiring into role tick via growth role. |
| SEO-04 | Ranking drops trigger alert with diagnosis and suggested fixes | `detectVisibilityChanges()` already produces `VisibilityChange[]` with severity levels; `checkVisibilityChanges()` already inserts into `notifications` table for significant changes. Growth role must surface these as `RoleInsight[]` with diagnosis from `recommendations`. |
| TNDR-03 | Tender Hunter runs on scheduled tick to find new matching opportunities | Existing `runTenderHunterTick()` scrapes all sources, upserts new tenders, and auto-evaluates fit. Needs wiring into role tick via growth role. |
| TNDR-04 | New tender matches trigger notification with qualification assessment | `filterTenders()` returns scored tenders; `scoreTenderFit()` produces `TenderFitScore` with `recommendation` and `reasoning`. Growth role must surface high-fit tenders as `RoleAction[]` / `RoleInsight[]`. |
</phase_requirements>

## Standard Stack

### Core (existing, no new libraries)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16 | App Router cron endpoints | Existing `/api/cron/role-tick` fires every 5 minutes |
| Supabase | latest | DB for role_configs, role_states, notifications, tenders, agent_runs | All persistence already wired |
| Vitest | latest | Test framework | Existing test patterns for role implementations |

### Supporting (existing infrastructure)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Resend | latest | Email notifications | Via `dispatchNotification()` for ranking drop alerts |
| WhatsApp bridge | n/a | WhatsApp notifications | Via `dispatchNotification()` for critical alerts |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Growth role in role system | Separate cron endpoint | Separate endpoint would bypass autonomy gate, cost guard, activity logging, and dashboard integration. Role system is the right choice. |
| Single growth role for both SEO+Tender | Two separate role types (seo, tender) | Two types adds overhead -- both are growth monitoring with similar tick patterns. One `growth` role with sub-task routing is simpler. |

## Architecture Patterns

### Recommended Project Structure

```
src/lib/roles/growth/
  growth-role.ts           # RoleImplementation with registerRole() side effect
  seo-monitor.ts           # Wraps runAISearchTick() + change detection -> RoleInsight[]
  tender-monitor.ts        # Wraps runTenderHunterTick() + fit scoring -> RoleInsight[] + RoleAction[]
  __tests__/
    growth-role.test.ts    # Unit tests for evaluate() and hasChanges()
```

### Pattern: Growth Role as Unified Monitor

**What:** A single `growth` role implementation that orchestrates both SEO and Tender monitoring during each tick, following the exact pattern established by `finance-role.ts`.

**When to use:** When multiple growth tools need scheduled execution with shared infrastructure (cost guard, autonomy gate, activity logging).

**Example structure:**

```typescript
// growth-role.ts
import { registerRole } from '../role-registry'
import type { RoleImplementation, RoleEvaluation, RoleAction, RoleInsight } from '../role-registry'
import type { RoleContext } from '../role-runtime'
import { runSeoMonitorTick } from './seo-monitor'
import { runTenderMonitorTick } from './tender-monitor'

interface GrowthState {
  last_seo_audit_at: string | null
  last_tender_scan_at: string | null
  seo_audit_interval_hours: number
  tender_scan_interval_hours: number
}

const growthRole: RoleImplementation = {
  type: 'growth',
  name: 'Growth',
  description: 'SEO monitoring, tender hunting, and growth opportunity detection',

  async evaluate(ctx: RoleContext): Promise<RoleEvaluation> {
    const actions: RoleAction[] = []
    const insights: RoleInsight[] = []
    const state = getGrowthState(ctx.state.state ?? {})
    const now = new Date()

    // SEO monitoring (default: daily)
    if (shouldRunSeo(state, now)) {
      const seoResult = await runSeoMonitorTick(ctx)
      actions.push(...seoResult.actions)
      insights.push(...seoResult.insights)
      state.last_seo_audit_at = now.toISOString()
    }

    // Tender scanning (default: daily)
    if (shouldRunTender(state, now)) {
      const tenderResult = await runTenderMonitorTick(ctx)
      actions.push(...tenderResult.actions)
      insights.push(...tenderResult.insights)
      state.last_tender_scan_at = now.toISOString()
    }

    return { actions, insights, stateUpdates: { ...state }, workflowsToStart: [] }
  },

  async hasChanges(ctx: RoleContext): Promise<boolean> {
    // Check if enough time has elapsed since last SEO audit or tender scan
    const state = getGrowthState(ctx.state.state ?? {})
    const now = Date.now()

    const seoAge = state.last_seo_audit_at
      ? now - new Date(state.last_seo_audit_at).getTime()
      : Infinity
    const tenderAge = state.last_tender_scan_at
      ? now - new Date(state.last_tender_scan_at).getTime()
      : Infinity

    const seoInterval = (state.seo_audit_interval_hours ?? 24) * 3600000
    const tenderInterval = (state.tender_scan_interval_hours ?? 24) * 3600000

    return seoAge >= seoInterval || tenderAge >= tenderInterval
  },

  defaultConfig() {
    return {
      tick_interval_seconds: 3600,    // Check hourly (actual work is gated by sub-intervals)
      daily_budget_cents: 200,         // $2/day
      autonomy_level: 'copilot',
      config: {
        seo_enabled: true,
        tender_enabled: true,
        seo_audit_interval_hours: 24,  // Daily SEO audit
        tender_scan_interval_hours: 24, // Daily tender scan
      },
    }
  },
}

registerRole(growthRole)
export { growthRole }
```

### Pattern: SEO Monitor Wrapper

**What:** Wraps existing `runAISearchTick()` and `checkVisibilityChanges()` into `RoleInsight[]` and `RoleAction[]`.

**Key detail:** The SEO audit config (brand_name, domain, queries, competitors) must come from somewhere. Two options:
1. Store in `role_configs.config` JSONB field (recommended -- aligns with how finance role stores `auto_invoice_enabled`)
2. Store in `agent_configs.policy_rules` (existing pattern from `runAISearchTick()`)

**Recommendation:** Use `role_configs.config` since growth role owns this. The existing `runAISearchTick()` reads from `agent_configs`, but a new `runSeoMonitorTick()` wrapper should read from `role_configs.config` directly and call `runVisibilityAudit()` + `checkVisibilityChanges()` directly (not through the legacy `runAISearchTick()`).

```typescript
// seo-monitor.ts
export async function runSeoMonitorTick(ctx: RoleContext): Promise<{
  actions: RoleAction[]
  insights: RoleInsight[]
}> {
  const config = ctx.config.config as GrowthConfig
  if (!config.seo_enabled || !config.seo_brand_name || !config.seo_queries?.length) {
    return { actions: [], insights: [] }
  }

  // Run audit using existing infrastructure
  const audit = await runVisibilityAudit(ctx.supabase, ctx.orgId, {
    domain: config.seo_domain ?? '',
    brandName: config.seo_brand_name,
    queries: config.seo_queries,
    competitors: config.seo_competitors,
  })

  // Check for changes against previous
  const changes = await checkVisibilityChanges(ctx.supabase, ctx.orgId, audit)

  const insights: RoleInsight[] = []
  const actions: RoleAction[] = []

  // Score change -> insight
  if (audit.overallScore < 30) {
    insights.push({
      summary: `AI visibility critically low: ${audit.overallScore}/100`,
      details: { score: audit.overallScore, recommendations: audit.recommendations },
      priority: 'high',
    })
  }

  // Ranking drops -> actions (with diagnosis)
  for (const change of changes.filter(c => c.severity !== 'info')) {
    if (change.type === 'lost_mention' || change.type === 'score_change') {
      actions.push({
        type: 'seo_ranking_drop',
        summary: change.detail,
        payload: { change, recommendations: audit.recommendations.slice(0, 3) },
        confidence: 0.85,
        reversible: false,
      })
    } else {
      insights.push({
        summary: change.detail,
        details: { change },
        priority: change.severity === 'critical' ? 'high' : 'medium',
      })
    }
  }

  return { actions, insights }
}
```

### Pattern: Tender Monitor Wrapper

**What:** Wraps existing `runTenderHunterTick()` and surfaces new high-fit tenders as notifications.

```typescript
// tender-monitor.ts
export async function runTenderMonitorTick(ctx: RoleContext): Promise<{
  actions: RoleAction[]
  insights: RoleInsight[]
}> {
  const config = ctx.config.config as GrowthConfig
  if (!config.tender_enabled) {
    return { actions: [], insights: [] }
  }

  // Run tender scan using existing infrastructure
  const result = await runTenderHunterTick(ctx.supabase, ctx.orgId, ctx.config.id)

  const insights: RoleInsight[] = []
  const actions: RoleAction[] = []

  if (result.newTenders > 0) {
    // Fetch newly scored tenders to surface as notifications
    const filtered = await filterTenders(ctx.supabase, ctx.orgId)
    const highFit = filtered.filter(t => (t.fit_score ?? 0) >= 50)

    for (const tender of highFit.slice(0, 5)) {
      actions.push({
        type: 'tender_match',
        summary: `New matching tender: ${tender.title} (fit ${tender.fit_score}/100)`,
        payload: {
          tenderId: tender.id,
          title: tender.title,
          source: tender.source,
          value: tender.value,
          deadline: tender.deadline,
          fitScore: tender.fit_score,
        },
        confidence: (tender.fit_score ?? 0) / 100,
        reversible: false,
      })
    }

    // Summary insight
    insights.push({
      summary: `Tender scan: ${result.newTenders} new tenders found, ${result.evaluated} evaluated, ${highFit.length} high-fit matches`,
      details: { ...result, highFitCount: highFit.length },
      priority: highFit.length > 0 ? 'high' : 'low',
    })
  }

  return { actions, insights }
}
```

### Integration Points (3 Changes to Existing Files)

1. **`src/lib/bitbit-core/types.ts` line 342**: Extend `RoleType` union

```typescript
// Before:
export type RoleType = 'finance' | 'comms' | 'sales'

// After:
export type RoleType = 'finance' | 'comms' | 'sales' | 'growth'
```

2. **`src/app/api/cron/role-tick/route.ts`**: Add growth role import

```typescript
// Add alongside existing imports:
import '@/lib/roles/growth/growth-role'
```

3. **`src/lib/roles/index.ts` line 89**: Add growth role barrel import

```typescript
// Add alongside existing imports:
import './growth/growth-role'
```

### Anti-Patterns to Avoid

- **Do NOT create separate cron endpoints for SEO and Tender monitoring.** The role-tick system already runs every 5 minutes with cost guards, advisory locks, and autonomy gating. Use it.
- **Do NOT call `runAISearchTick()` directly.** It reads config from `agent_configs` (a legacy pattern). Instead, call `runVisibilityAudit()` and `checkVisibilityChanges()` directly with config from `role_configs.config`.
- **Do NOT duplicate notification logic.** The `checkVisibilityChanges()` function already inserts into the `notifications` table. The growth role should use the role activity system (`RoleInsight[]` / `RoleAction[]`) which flows through `dispatchNotification()`. Be careful not to double-notify.
- **Do NOT run SEO audits on every 5-minute tick.** Use sub-interval tracking in role state (default: 24 hours). The role tick fires every 5 minutes, but `hasChanges()` should only return true when the audit interval has elapsed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Scheduled execution | Custom cron/timer | Role-tick system (`role-scheduler.ts` + `role-runtime.ts`) | Already handles locking, cost guards, state persistence, activity logging |
| Visibility auditing | New audit logic | `runVisibilityAudit()` + `checkVisibilityChanges()` | 400+ LOC already implemented and tested |
| Tender scraping | New scraper | `runTenderHunterTick()` + `scrapeAllSources()` | 800+ LOC with AusTender, QTenders, NSW support |
| Notification delivery | Custom notification sender | `dispatchNotification()` from `notifications/dispatcher.ts` | Multi-channel (dashboard, email, WhatsApp) with user preference support |
| Cost guarding | Custom budget check | `canRoleProceed()` from `role-cost-guard.ts` | Already wired into `executeRoleTick()` |
| Concurrency control | Custom locking | `acquireRoleLock()` / `releaseRoleLock()` | Advisory lock pattern in `role-runtime.ts` |

**Key insight:** This phase is almost entirely integration work. Every piece of functionality exists -- the gap is that SEO and Tender tools have only been wirable via chat (tool handlers) but not via the scheduled role system. The growth role bridges this gap.

## Common Pitfalls

### Pitfall 1: Double Notification
**What goes wrong:** `checkVisibilityChanges()` (line 413-428 of `ai-visibility-audit.ts`) already inserts into the `notifications` table directly. If the growth role ALSO dispatches notifications for the same changes, users get duplicates.
**Why it happens:** The existing function was designed for standalone use before the role system existed.
**How to avoid:** The growth role wrapper (`seo-monitor.ts`) should call `runVisibilityAudit()` and `detectVisibilityChanges()` (the pure function) directly, NOT `checkVisibilityChanges()` (which has the notification side effect). Let the role system handle notifications via `RoleAction[]` -> autonomy gate -> `dispatchNotification()`.
**Warning signs:** Users receiving two notifications for the same ranking drop.

### Pitfall 2: RoleType Not Extended
**What goes wrong:** `role_configs` rows with `role_type = 'growth'` exist in the DB but TypeScript type `RoleType` only includes `'finance' | 'comms' | 'sales'`. This causes type errors when the scheduler queries configs.
**Why it happens:** The union type is defined in `bitbit-core/types.ts` and must be manually extended.
**How to avoid:** Add `'growth'` to the `RoleType` union before writing any growth role code. Also check if the DB column has a CHECK constraint that needs updating.
**Warning signs:** TypeScript compilation errors on `roleConfig.role_type`.

### Pitfall 3: Missing Config for First Tick
**What goes wrong:** Growth role is registered but no `role_configs` row exists for any org, so `runScheduledRoles()` never picks it up.
**Why it happens:** Roles must be explicitly enabled per-org. The finance/comms/sales roles were initialized during earlier phases.
**How to avoid:** Either (a) add a migration or seed script that creates growth role_configs for existing orgs with growth/scale plans, or (b) add an initialization endpoint/function callable from the settings page. The `initializeRole()` function in `role-init.ts` already handles this.
**Warning signs:** Growth role registered, cron fires, but 0 roles triggered.

### Pitfall 4: SEO Config Missing Required Fields
**What goes wrong:** `runVisibilityAudit()` requires `domain`, `brandName`, and `queries`. If `role_configs.config` is empty or missing these, the audit silently returns no results.
**Why it happens:** Growth role config must be populated with brand-specific SEO parameters.
**How to avoid:** Add sensible defaults in `defaultConfig()` and validate config fields in the evaluate function. Return a meaningful insight when config is incomplete ("SEO monitoring needs configuration: set brand name, domain, and target queries").
**Warning signs:** SEO tick runs but produces 0 insights/actions every time.

### Pitfall 5: Cost Guard Starvation
**What goes wrong:** SEO audit + Tender scrape both run on the same tick, consuming the entire daily budget in one cycle.
**Why it happens:** Both operations involve external API calls (simulated currently, but designed for real API integration).
**How to avoid:** Set reasonable daily_budget_cents (200c = $2/day) and stagger SEO and Tender ticks by using separate interval tracking in state (e.g., SEO at 06:00 AEST, Tender at 12:00 AEST).
**Warning signs:** One tick consumes daily budget, subsequent ticks blocked.

## Code Examples

### Extending RoleType

```typescript
// Source: personal-assistant/src/lib/bitbit-core/types.ts line 342
// Before:
export type RoleType = 'finance' | 'comms' | 'sales'

// After:
export type RoleType = 'finance' | 'comms' | 'sales' | 'growth'
```

### Side-Effect Import in Cron Route

```typescript
// Source: personal-assistant/src/app/api/cron/role-tick/route.ts
import { withCronGuard } from '@/lib/cron/cron-guard'
import { runScheduledRoles } from '@/lib/roles/role-scheduler'

// Domain role modules -- import for registerRole() side effects.
import '@/lib/roles/finance/finance-role'
import '@/lib/roles/comms/comms-role'
import '@/lib/roles/sales/sales-role'
import '@/lib/roles/growth/growth-role'  // NEW: SEO + Tender monitoring
```

### Using detectVisibilityChanges (NOT checkVisibilityChanges)

```typescript
// CORRECT: Use the pure function, let role system handle notifications
import { runVisibilityAudit, detectVisibilityChanges, getPreviousAudits } from '@/lib/agent/ai-visibility-audit'

const audit = await runVisibilityAudit(supabase, orgId, params)
const previous = await getPreviousAudits(supabase, orgId, 1)
const changes = previous.length > 0
  ? detectVisibilityChanges(audit, previous[0])
  : []

// WRONG: This function inserts into notifications directly -> double-notify
// const changes = await checkVisibilityChanges(supabase, orgId, audit)
```

### Role Cost Guard Pre-Check Pattern (from role-cost-guard.ts)

```typescript
// Source: personal-assistant/src/lib/roles/role-cost-guard.ts
// The role-tick runtime already calls canRoleProceed() before evaluate().
// Growth role gets this for free -- no additional cost guard code needed.
```

### Notification Flow via Role System

```typescript
// When growth role returns actions/insights from evaluate():
// 1. role-runtime.ts logs them to role_activity table
// 2. Optionally, dispatchNotification() can be called for high-priority items:

import { dispatchNotification } from '@/lib/notifications/dispatcher'

// Inside seo-monitor.ts, for critical drops:
await dispatchNotification(ctx.supabase, {
  orgId: ctx.orgId,
  type: 'alert_escalation',
  title: 'SEO Visibility Drop Detected',
  body: `Score dropped from ${previous.overallScore} to ${current.overallScore}. ${recommendations[0]}`,
  urgency: 'high',
  channels: ['dashboard', 'email'],
  metadata: { changes, recommendations },
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SEO/Tender only via chat tools | Chat tools + scheduled monitoring via role system | Phase 29 | Proactive detection without user invocation |
| `runAISearchTick()` designed for `agent_configs` | Growth role reads config from `role_configs` | Phase 29 | Unified configuration with other roles |
| Direct notification insert | Notifications via role activity + dispatchNotification | Phase 29 | Multi-channel, preference-aware alerting |

**Deprecated/outdated:**
- `runAISearchTick()`: Still functional but its config-from-agent_configs pattern is legacy. New code should use `runVisibilityAudit()` + `detectVisibilityChanges()` directly.

## Open Questions

1. **Should growth role initialization happen automatically for orgs on growth/scale plans?**
   - What we know: `initializeRole()` in `role-init.ts` creates role_configs rows. Finance/comms/sales were initialized during their respective phases.
   - What's unclear: Whether to auto-init on plan upgrade or require explicit enablement via settings.
   - Recommendation: Auto-init when org upgrades to growth/scale plan (add to billing webhook handler). Also provide manual init via settings page. For Phase 29, a one-time seed for existing growth/scale orgs is sufficient.

2. **Should there be a DB CHECK constraint on role_type?**
   - What we know: The `role_configs.role_type` column may have a CHECK constraint limiting values to `finance`, `comms`, `sales`.
   - What's unclear: Cannot verify without DB access. The Supabase migration files were not found locally.
   - Recommendation: If a CHECK constraint exists, add a migration to extend it. If not, the TypeScript union extension is sufficient. Test by attempting to insert a `growth` row.

3. **Real API integration for SEO audits?**
   - What we know: Current implementation uses heuristic simulation (`simulateQueryCheck()`). Production would call Perplexity, ChatGPT Search, Gemini, Copilot APIs.
   - What's unclear: Whether real API integration is in scope for Phase 29.
   - Recommendation: Out of scope. Phase 29 wires the scheduling infrastructure. Real API integration is a future enhancement. The simulation is sufficient for demonstrating the monitoring pipeline.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (latest) |
| Config file | `personal-assistant/vitest.config.ts` |
| Quick run command | `cd personal-assistant && npx vitest run src/lib/roles/growth/ -x` |
| Full suite command | `cd personal-assistant && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEO-03 | Growth role evaluate() calls SEO audit when interval elapsed | unit | `cd personal-assistant && npx vitest run src/lib/roles/growth/__tests__/growth-role.test.ts -x` | No -- Wave 0 |
| SEO-04 | SEO monitor surfaces ranking drops as RoleAction with recommendations | unit | `cd personal-assistant && npx vitest run src/lib/roles/growth/__tests__/growth-role.test.ts -x` | No -- Wave 0 |
| TNDR-03 | Growth role evaluate() calls tender scan when interval elapsed | unit | `cd personal-assistant && npx vitest run src/lib/roles/growth/__tests__/growth-role.test.ts -x` | No -- Wave 0 |
| TNDR-04 | Tender monitor surfaces high-fit matches as RoleAction with qualification | unit | `cd personal-assistant && npx vitest run src/lib/roles/growth/__tests__/growth-role.test.ts -x` | No -- Wave 0 |
| INT-01 | Growth role registered and discoverable via getRole('growth') | unit | `cd personal-assistant && npx vitest run src/lib/roles/__tests__/role-registration.test.ts -x` | Partial -- extend existing |
| INT-02 | hasChanges() returns false when interval not elapsed | unit | `cd personal-assistant && npx vitest run src/lib/roles/growth/__tests__/growth-role.test.ts -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd personal-assistant && npx vitest run src/lib/roles/growth/ -x`
- **Per wave merge:** `cd personal-assistant && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/roles/growth/__tests__/growth-role.test.ts` -- covers SEO-03, SEO-04, TNDR-03, TNDR-04
- [ ] Extend `src/lib/roles/__tests__/role-registration.test.ts` -- verify growth role is registered
- [ ] Possibly: DB migration to extend role_type CHECK constraint if one exists

## Sources

### Primary (HIGH confidence)
- **Codebase inspection** -- All findings verified by reading actual source files:
  - `personal-assistant/src/lib/agent/ai-search-optimizer.ts` (822 lines) -- `runAISearchTick()` at line 748
  - `personal-assistant/src/lib/agent/ai-visibility-audit.ts` (431 lines) -- `runVisibilityAudit()`, `detectVisibilityChanges()`, `checkVisibilityChanges()`
  - `personal-assistant/src/lib/agent/tender-hunter.ts` (790 lines) -- `runTenderHunterTick()` at line 725
  - `personal-assistant/src/lib/agent/tender-sources.ts` -- scraping infrastructure
  - `personal-assistant/src/lib/agent/tools/seo-tools.ts` (207 lines) -- tool definitions and handlers
  - `personal-assistant/src/lib/agent/tools/tender-tools.ts` (137 lines) -- tool definitions and handlers
  - `personal-assistant/src/lib/roles/role-runtime.ts` (496 lines) -- `executeRoleTick()` flow
  - `personal-assistant/src/lib/roles/role-scheduler.ts` (141 lines) -- `runScheduledRoles()`
  - `personal-assistant/src/lib/roles/role-registry.ts` (107 lines) -- `RoleImplementation` interface
  - `personal-assistant/src/lib/roles/finance/finance-role.ts` (584 lines) -- reference implementation
  - `personal-assistant/src/lib/roles/role-cost-guard.ts` (217 lines) -- cost guard pattern
  - `personal-assistant/src/lib/bitbit-core/types.ts` (lines 340-398) -- `RoleType`, `RoleConfig`, `RoleState`
  - `personal-assistant/src/app/api/cron/role-tick/route.ts` (23 lines) -- cron entry point
  - `personal-assistant/src/lib/notifications/dispatcher.ts` (153 lines) -- multi-channel notification dispatch
  - `personal-assistant/vercel.json` -- cron schedules (role-tick runs `*/5 * * * *`)

### Secondary (MEDIUM confidence)
- `.planning/phases/27-role-runtime-fix/27-RESEARCH.md` -- Documents role registration side-effect pattern
- `.planning/REQUIREMENTS.md` -- SEO-03, SEO-04, TNDR-03, TNDR-04 definitions
- `.planning/STATE.md` -- Phase 23 decisions on SEO/Tender tool implementation patterns

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, pure integration of existing code
- Architecture: HIGH -- follows exact same pattern as finance-role.ts, all building blocks verified in source
- Pitfalls: HIGH -- double-notification trap identified by reading `checkVisibilityChanges()` source; RoleType extension need verified by reading types.ts; config propagation pattern verified across multiple role implementations

**Research date:** 2026-03-27
**Valid until:** 60 days (stable codebase patterns, no external dependency version concerns)
