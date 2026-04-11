# Phase 27: Role Runtime Import Fix - Research

**Researched:** 2026-03-27
**Domain:** Next.js cron runtime / TypeScript module side-effect registration
**Confidence:** HIGH

## Summary

Phase 27 addresses a critical integration bug identified in the v1.4 milestone audit: the role-tick cron endpoint fires every 5 minutes but silently skips all role execution because domain role modules (finance, comms, sales) are never imported in the cron runtime path. This means `registerRole()` side effects never fire, so `getRole()` returns `undefined` for all role types.

The fix is surgical: three import statements in one file, plus adding the `/api/cron/revenue-intelligence` endpoint to vercel.json. The codebase already has the correct architecture -- the roles barrel (`src/lib/roles/index.ts`) already imports all three domain modules at lines 87-89. The problem is simply that the cron route bypasses this barrel by importing `role-scheduler` directly.

**Primary recommendation:** Add side-effect imports of the three domain role modules to `role-tick/route.ts` (or `role-scheduler.ts`), and add the missing `/api/cron/revenue-intelligence` entry to `vercel.json`.

## Standard Stack

This phase involves no new libraries. All changes are within the existing codebase.

### Core (existing, no changes)
| Library | Version | Purpose | Relevance |
|---------|---------|---------|-----------|
| Next.js | 16 | App Router cron endpoints | Cron routes are `/api/cron/*/route.ts` GET handlers |
| Supabase | latest | DB for role_configs, role_states | Queried by role-scheduler |
| Vitest | latest | Test framework | Tests exist in `__tests__/role-engine.test.ts` |

## Architecture Patterns

### The Side-Effect Registration Pattern

The role system uses a module-level side-effect pattern where importing a domain role module triggers `registerRole()` which populates an in-memory `Map<RoleType, RoleImplementation>`.

**How it works:**
1. `role-registry.ts` exports `registerRole()` and `getRole()` backed by a module-scoped `Map`
2. Each domain role file (e.g., `finance-role.ts`) calls `registerRole(financeRole)` at module scope
3. Any code path that calls `getRole()` must have transitively imported the domain role files first
4. The barrel `src/lib/roles/index.ts` (lines 87-89) has the side-effect imports, but not all consumers use the barrel

### The Import Chain (Current -- Broken)

```
api/cron/role-tick/route.ts
  -> imports runScheduledRoles from role-scheduler.ts
    -> imports executeRoleTick from role-runtime.ts
      -> imports getRole from role-registry.ts
        -> Map is EMPTY (no domain modules imported)
          -> getRole() returns undefined for all types
```

### The Import Chain (Fixed)

```
api/cron/role-tick/route.ts
  -> import '@/lib/roles/finance/finance-role'  // triggers registerRole()
  -> import '@/lib/roles/comms/comms-role'      // triggers registerRole()
  -> import '@/lib/roles/sales/sales-role'      // triggers registerRole()
  -> imports runScheduledRoles from role-scheduler.ts
    -> imports executeRoleTick from role-runtime.ts
      -> imports getRole from role-registry.ts
        -> Map has finance, comms, sales entries
          -> getRole() returns valid implementations
```

### Where to Place the Imports

Two viable locations:

**Option A: `role-tick/route.ts`** (recommended)
- Pros: Explicit at the entry point; clear why imports exist
- Cons: If another consumer of role-scheduler appears, they'd need the same imports

**Option B: `role-scheduler.ts`**
- Pros: Any consumer of the scheduler automatically gets registrations
- Cons: Side-effect imports in a library file feel less explicit

**Recommendation: Option A** -- the route file is the entry point. Add a clear comment explaining the side-effect purpose.

### vercel.json Cron Configuration

The `/api/cron/revenue-intelligence` route exists and is fully implemented but is missing from `vercel.json`. The audit doc notes this as tech debt. The route runs a comprehensive revenue intelligence pipeline (snapshots, client scoring, unbilled detection, collections, cash flow, retainers, weekly digest).

Current `vercel.json` has 22 cron entries. Revenue-intelligence should be added with a daily schedule (per the route's own documentation: "Recommended schedule: daily at 06:00 AEST").

06:00 AEST = 20:00 UTC = `0 20 * * *`

### Anti-Patterns to Avoid

- **Do NOT import from the barrel (`@/lib/roles`)** in the route file. The barrel re-exports dozens of symbols that would unnecessarily increase the cold-start bundle. Instead, import the specific domain role files directly for their side effects only.
- **Do NOT restructure the registry pattern.** The Map-based registration is standard and works correctly. The only issue is a missing import.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Role registration | Custom dependency injection | Existing `registerRole()` + side-effect imports | Pattern already works; just needs correct import chain |
| Cron scheduling | Custom cron scheduler | Vercel cron via `vercel.json` | Already configured for 22 endpoints |

## Common Pitfalls

### Pitfall 1: Circular Import Risk
**What goes wrong:** Adding imports could create circular dependencies if the domain role files transitively import from the route or scheduler.
**Why it happens:** Domain role files import from `role-registry` and `role-runtime`, but those don't import back from domain files.
**How to avoid:** The existing architecture is clean -- domain files import UP (to registry/runtime), never DOWN. Side-effect imports at the route level cannot create cycles.
**Warning signs:** TypeScript compilation errors or runtime `undefined` values after adding imports.

### Pitfall 2: Tree-Shaking Removes Side-Effect Imports
**What goes wrong:** Bundler removes `import './finance-role'` because no exported symbol is used.
**Why it happens:** Modern bundlers tree-shake unused imports by default.
**How to avoid:** Next.js App Router server components preserve side-effect imports. Vercel's build respects side-effect-only imports in route files. This is NOT an issue for Next.js API routes.
**Warning signs:** Imports present in source but roles still not registering in production.

### Pitfall 3: Testing Mock Interference
**What goes wrong:** Existing tests mock `role-registry` and manually call `registerRole()`. Adding automatic registration could conflict.
**Why it happens:** The test file `role-engine.test.ts` already uses `vi.mock()` patterns.
**How to avoid:** The test already calls `registerRole(makeFinanceImpl())` in `beforeEach`. Side-effect imports in the route file don't affect the test file's mock boundaries.
**Warning signs:** Unexpected test failures in existing role-engine tests.

## Code Examples

### Fix 1: Side-Effect Imports in role-tick Route

```typescript
// Source: personal-assistant/src/app/api/cron/role-tick/route.ts
// BEFORE (broken):
import { withCronGuard } from '@/lib/cron/cron-guard'
import { runScheduledRoles } from '@/lib/roles/role-scheduler'

// AFTER (fixed):
import { withCronGuard } from '@/lib/cron/cron-guard'
import { runScheduledRoles } from '@/lib/roles/role-scheduler'

// Domain role modules -- import for registerRole() side effects.
// Without these, getRole() returns undefined and all role ticks silently skip.
import '@/lib/roles/finance/finance-role'
import '@/lib/roles/comms/comms-role'
import '@/lib/roles/sales/sales-role'
```

### Fix 2: Add revenue-intelligence to vercel.json

```json
// Add to crons array in personal-assistant/vercel.json:
{ "path": "/api/cron/revenue-intelligence", "schedule": "0 20 * * *" }
```

### Verification: getRole() Returns Valid Implementation

The key assertion: after imports fire, `getRole('finance')`, `getRole('comms')`, and `getRole('sales')` must return non-undefined `RoleImplementation` objects.

```typescript
// Test pattern:
import '@/lib/roles/finance/finance-role'
import '@/lib/roles/comms/comms-role'
import '@/lib/roles/sales/sales-role'
import { getRole, getRegisteredRoleTypes } from '@/lib/roles/role-registry'

// All three must be registered
expect(getRole('finance')).toBeDefined()
expect(getRole('comms')).toBeDefined()
expect(getRole('sales')).toBeDefined()
expect(getRegisteredRoleTypes()).toEqual(expect.arrayContaining(['finance', 'comms', 'sales']))
```

## State of the Art

No changes to patterns or libraries. This is a bugfix within an existing, sound architecture.

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct import from barrel `@/lib/roles` | Direct import from `role-scheduler` | Phase 20 | Barrel has side-effect imports; direct import bypasses them |

## Open Questions

1. **Should the intelligence cron route also import domain roles?**
   - What we know: `/api/cron/intelligence/route.ts` exists and runs intelligence computations. It does NOT call role ticks directly.
   - What's unclear: Whether the intelligence route has its own import gap.
   - Recommendation: Out of scope for Phase 27. The intelligence route uses its own direct imports to intelligence modules.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (latest) |
| Config file | `personal-assistant/vitest.config.ts` |
| Quick run command | `cd personal-assistant && npx vitest run src/lib/roles/__tests__/role-engine.test.ts` |
| Full suite command | `cd personal-assistant && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SC-1 | role-tick cron imports all domain role modules triggering registerRole() side effects | unit | `cd personal-assistant && npx vitest run src/lib/roles/__tests__/role-registration.test.ts -x` | No -- Wave 0 |
| SC-2 | getRole() returns a valid role implementation for finance, comms, and sales at cron runtime | unit | `cd personal-assistant && npx vitest run src/lib/roles/__tests__/role-registration.test.ts -x` | No -- Wave 0 |
| SC-3 | /api/cron/revenue-intelligence added to vercel.json cron configuration | unit/smoke | `grep "revenue-intelligence" personal-assistant/vercel.json` | N/A -- grep check |

### Sampling Rate
- **Per task commit:** `cd personal-assistant && npx vitest run src/lib/roles/__tests__/ -x`
- **Per wave merge:** `cd personal-assistant && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/roles/__tests__/role-registration.test.ts` -- verifies side-effect imports populate the registry for all three role types
- [ ] Smoke test: verify `vercel.json` contains `revenue-intelligence` path

## Sources

### Primary (HIGH confidence)
- **Codebase inspection** -- All findings verified by reading actual source files:
  - `personal-assistant/src/app/api/cron/role-tick/route.ts` (17 lines)
  - `personal-assistant/src/lib/roles/role-scheduler.ts` (141 lines)
  - `personal-assistant/src/lib/roles/role-runtime.ts` (496 lines)
  - `personal-assistant/src/lib/roles/role-registry.ts` (107 lines)
  - `personal-assistant/src/lib/roles/index.ts` (89 lines, contains side-effect imports)
  - `personal-assistant/src/lib/roles/finance/finance-role.ts` (line 582: `registerRole(financeRole)`)
  - `personal-assistant/src/lib/roles/comms/comms-role.ts` (line 400: `registerRole(commsRole)`)
  - `personal-assistant/src/lib/roles/sales/sales-role.ts` (line 547: `registerRole(salesRole)`)
  - `personal-assistant/vercel.json` (22 crons, no revenue-intelligence entry)
  - `personal-assistant/src/app/api/cron/revenue-intelligence/route.ts` (exists, fully implemented)
- **v1.4 Milestone Audit** -- `.planning/v1.4-MILESTONE-AUDIT.md` documents this exact bug with root cause and fix recommendation

### Secondary (MEDIUM confidence)
- None needed -- all findings are from direct codebase inspection

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, pure codebase fix
- Architecture: HIGH -- import chain traced end-to-end through source
- Pitfalls: HIGH -- verified tree-shaking behavior is non-issue for Next.js API routes; circular dependency risk ruled out by reviewing actual import graph

**Research date:** 2026-03-27
**Valid until:** Indefinite -- this is a bugfix, not version-dependent
