# Phase 28: Intelligence Dashboard Wiring - Research

**Researched:** 2026-03-27
**Domain:** Client-side data fetching, API endpoint integration, React state management
**Confidence:** HIGH

## Summary

The intelligence dashboard wiring problem is well-bounded and entirely within the existing codebase. The `IntelligenceWidgets` component (built in Phase 25) currently fetches from `/api/roles/status` (an unrelated endpoint) and immediately hardcodes all four widget states to `gatheringData: true`, meaning the dashboard permanently displays "Gathering data..." for Revenue Radar, Client Health, Cash Flow, and Capacity widgets.

The solution is straightforward: the `/api/intelligence/[metric]` endpoint already exists and works correctly (built in Phase 24b). It accepts metric names `revenue-radar`, `client-health`, `cash-flow`, and `capacity`, authenticates the user, resolves their org, calls the intelligence module functions, and returns results. The component simply needs to be rewired to fetch from these endpoints instead, parse the response data shapes into the `IntelligenceData` interface, and handle the `gatheringData` flag correctly.

**Primary recommendation:** Replace the single `/api/roles/status` fetch with parallel fetches to `/api/intelligence/revenue-radar`, `/api/intelligence/client-health`, `/api/intelligence/cash-flow`, and `/api/intelligence/capacity`, mapping each response's `data` field to the corresponding widget state.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 19 | 19.x | Component framework | Project standard |
| Next.js 16 | 16.x | App router, API routes | Project standard |
| Supabase JS | 2.x | Backend auth + data | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | current | Widget icons | Already used in component |

### Alternatives Considered
None needed -- this is purely wiring existing infrastructure together.

## Architecture Patterns

### Current State (Broken)

```
IntelligenceWidgets
  -> fetch('/api/roles/status')     # WRONG ENDPOINT
  -> hardcode gatheringData: true   # NEVER SHOWS REAL DATA
  -> display "--" and "Gathering data..." permanently
```

### Target State (Fixed)

```
IntelligenceWidgets
  -> Promise.all([
       fetch('/api/intelligence/revenue-radar'),
       fetch('/api/intelligence/client-health'),
       fetch('/api/intelligence/cash-flow'),
       fetch('/api/intelligence/capacity'),
     ])
  -> Map each response.data to IntelligenceData fields
  -> Display live metrics OR legitimate "Gathering data..." from backend
```

### Pattern 1: Parallel Metric Fetching
**What:** Fetch all 4 intelligence metrics in parallel using Promise.all with individual error handling
**When to use:** Dashboard load and 60s refresh interval (already set up)
**Example:**
```typescript
// Source: Existing codebase patterns (role-detail-view.tsx line 153 uses Promise.all for parallel fetches)
const fetchIntelligence = useCallback(async () => {
  try {
    const [revenueRes, healthRes, cashFlowRes, capacityRes] = await Promise.all([
      fetch('/api/intelligence/revenue-radar').catch(() => null),
      fetch('/api/intelligence/client-health').catch(() => null),
      fetch('/api/intelligence/cash-flow').catch(() => null),
      fetch('/api/intelligence/capacity').catch(() => null),
    ])

    // Parse each individually (one failure shouldn't block others)
    const revenue = revenueRes?.ok ? (await revenueRes.json()).data : null
    const health = healthRes?.ok ? (await healthRes.json()).data : null
    const cashFlow = cashFlowRes?.ok ? (await cashFlowRes.json()).data : null
    const capacity = capacityRes?.ok ? (await capacityRes.json()).data : null

    setData({
      revenueRadar: revenue ? {
        totalEstimatedValue: revenue.totalEstimatedValue,
        opportunities: revenue.opportunities?.length ?? 0,
        clientsAnalyzed: revenue.clientsAnalyzed,
        gatheringData: revenue.gatheringData,
      } : null,
      clientHealth: health ? {
        averageScore: health.averageScore,
        clientsScored: health.clientsScored,
        gatheringData: health.gatheringData,
      } : null,
      cashFlow: cashFlow ? {
        currentNet: cashFlow.currentMonth?.net ?? 0,
        alerts: cashFlow.alerts?.length ?? 0,
        gatheringData: cashFlow.gatheringData,
      } : null,
      capacity: capacity ? {
        utilizationPercent: capacity.utilizationPercent,
        status: capacity.status,
        alerts: capacity.alerts?.length ?? 0,
        gatheringData: capacity.gatheringData,
      } : null,
    })
  } catch {
    // Silently fail (matches existing pattern)
  } finally {
    setLoading(false)
  }
}, [])
```

### Pattern 2: API Response Shape Mapping
**What:** Map API response `data` field to widget `IntelligenceData` interface
**When to use:** Each metric endpoint returns a rich result; the widget only needs summary fields

Key mappings:
| API Endpoint | Response Type | Widget Field | Mapping |
|---|---|---|---|
| `/api/intelligence/revenue-radar` | `RevenueRadarResult` | `revenueRadar` | `totalEstimatedValue`, `opportunities.length` -> `opportunities`, `clientsAnalyzed`, `gatheringData` |
| `/api/intelligence/client-health` | `ClientHealthResult` | `clientHealth` | `averageScore`, `clientsScored`, `gatheringData` |
| `/api/intelligence/cash-flow` | `CashFlowProphetResult` | `cashFlow` | `currentMonth.net` -> `currentNet`, `alerts.length` -> `alerts`, `gatheringData` |
| `/api/intelligence/capacity` | `CapacityAssessment` | `capacity` | `utilizationPercent`, `status`, `alerts.length` -> `alerts`, `gatheringData` |

### Anti-Patterns to Avoid
- **Fetching sequentially:** All 4 endpoints are independent; use Promise.all, not waterfall fetches
- **Blocking on one failure:** If cash-flow endpoint errors, revenue radar should still display. Each fetch must have independent error handling
- **Re-implementing data computation client-side:** The API already computes and caches everything in `bi_snapshots`; the component should only display, never recompute
- **Removing the 60s interval:** The existing refresh interval is correct; the intelligence cron runs every 6 hours and caches with varying TTLs (6h-24h), but the client poll ensures near-realtime display updates

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Intelligence computation | Client-side analytics | `/api/intelligence/[metric]` API | Already built, cached in bi_snapshots with proper TTL |
| Auth context in API | Manual auth checks | Existing `createClient()` + `supabase.auth.getUser()` | Pattern already in route.ts |
| Data caching | Browser-side cache | Server-side bi_snapshots cache | Intelligence cron manages cache lifecycle |

## Common Pitfalls

### Pitfall 1: Response Shape Mismatch
**What goes wrong:** The API returns `{ success: true, metric: "...", data: {...} }` but developer tries to use the response directly instead of extracting `.data`
**Why it happens:** The API wrapper adds a success envelope around the actual intelligence result
**How to avoid:** Always extract `(await res.json()).data` before mapping to widget state
**Warning signs:** All widgets show `NaN` or `undefined` values

### Pitfall 2: Cash Flow `currentNet` vs `alerts` Confusion
**What goes wrong:** The `CashFlowProphetResult` has both `currentMonth.net` (a number) and `alerts` (an array of alert objects). The widget `cashFlow.alerts` expects a count (number), not the array.
**Why it happens:** Type mismatch between API shape and widget interface
**How to avoid:** Map `cashFlow.alerts.length` -> widget `alerts` field, and `cashFlow.currentMonth.net` -> widget `currentNet` field
**Warning signs:** Widget shows `[object Object]` or fails to render

### Pitfall 3: Capacity `status` is a String Enum
**What goes wrong:** The capacity widget compares `data.status` against strings like `'overloaded'` and `'heavy'`. If the API returns a different casing or value, the alert indicator breaks.
**Why it happens:** No runtime validation on the status string
**How to avoid:** Verify that `CapacityAssessment.status` returns one of: `'under' | 'optimal' | 'heavy' | 'overloaded'` (confirmed in capacity-oracle.ts)
**Warning signs:** Capacity widget never shows alert triangle even when overloaded

### Pitfall 4: 401 on First Load (Not Authenticated Yet)
**What goes wrong:** The widget component mounts before auth cookies are fully set, causing a 401 from the API
**Why it happens:** Race condition during dashboard hydration
**How to avoid:** Treat non-OK responses as "no data" (already handled by `if (!res.ok) return` pattern), and rely on the 60s interval to eventually fetch successfully
**Warning signs:** Widgets stuck on loading skeleton permanently (should clear after first successful poll)

## Code Examples

### Existing API Endpoint (Already Working)
```typescript
// Source: personal-assistant/src/app/api/intelligence/[metric]/route.ts
// GET /api/intelligence/revenue-radar returns:
// { success: true, metric: "revenue-radar", data: RevenueRadarResult }

// GET /api/intelligence/client-health returns:
// { success: true, metric: "client-health", data: ClientHealthResult }

// GET /api/intelligence/cash-flow returns:
// { success: true, metric: "cash-flow", data: CashFlowProphetResult }

// GET /api/intelligence/capacity returns:
// { success: true, metric: "capacity", data: CapacityAssessment }
```

### Existing Widget Interface (Keep As-Is)
```typescript
// Source: personal-assistant/src/components/roles/intelligence-widgets.tsx
interface IntelligenceData {
  revenueRadar: {
    totalEstimatedValue: number
    opportunities: number          // Count, not array
    clientsAnalyzed: number
    gatheringData: boolean
  } | null
  clientHealth: {
    averageScore: number
    clientsScored: number
    gatheringData: boolean
  } | null
  cashFlow: {
    currentNet: number
    alerts: number                 // Count, not array
    gatheringData: boolean
  } | null
  capacity: {
    utilizationPercent: number
    status: string
    alerts: number                 // Count, not array
    gatheringData: boolean
  } | null
}
```

### Existing Fetch Pattern in Codebase
```typescript
// Source: personal-assistant/src/components/roles/role-status-cards.tsx
// This is the established pattern: fetch, check ok, parse, setState
const fetchStatus = useCallback(async () => {
  try {
    const res = await fetch('/api/roles/status')
    if (!res.ok) return
    const data = await res.json()
    setRoles(data.roles ?? [])
  } catch {
    // Silently fail
  } finally {
    setLoading(false)
  }
}, [])
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Placeholder fetch to /api/roles/status | Will fetch from /api/intelligence/[metric] | Phase 28 | Widgets display real BI data |
| Hardcoded gatheringData: true | Backend-computed gatheringData flag | Phase 28 | Shows real data when available, legitimate "gathering" when not |

**The gap:** Phase 24b built the backend intelligence modules + API routes + cron. Phase 25 built the widget UI. But Phase 25 shipped with a placeholder fetch that never calls the real API. Phase 28 closes this gap.

## Open Questions

1. **Should we add a loading/error state per-widget?**
   - What we know: Currently there's a single `loading` boolean for all 4 widgets. Individual fetches may succeed or fail independently.
   - What's unclear: Whether per-widget loading/error states improve UX enough to justify the complexity.
   - Recommendation: Keep simple -- null data renders skeleton, non-null data renders values. The `gatheringData` flag from the backend handles the legitimate "not enough data" case.

2. **Should the polling interval be different per metric?**
   - What we know: Cache TTLs vary (Revenue Radar: 24h, Client Health: 24h, Cash Flow: 12h, Capacity: 6h)
   - What's unclear: Whether a single 60s poll is wasteful for 24h-cached data
   - Recommendation: Keep the single 60s interval. The API returns cached data (zero compute cost), and the simplicity is worth more than micro-optimizing poll frequency.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (latest, bundled with project) |
| Config file | `personal-assistant/vitest.config.ts` |
| Quick run command | `cd personal-assistant && npx vitest run src/lib/intelligence` |
| Full suite command | `cd personal-assistant && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INT-WIRE-01 | Widget fetches from /api/intelligence/[metric] endpoints | unit | `cd personal-assistant && npx vitest run src/components/roles/__tests__/intelligence-widgets.test.ts -x` | No - Wave 0 |
| INT-WIRE-02 | Revenue Radar data maps correctly to widget | unit | `cd personal-assistant && npx vitest run src/lib/intelligence/__tests__/intelligence.test.ts -x` | Yes (backend) |
| INT-WIRE-03 | Individual endpoint failures don't block other widgets | unit | `cd personal-assistant && npx vitest run src/components/roles/__tests__/intelligence-widgets.test.ts -x` | No - Wave 0 |
| INT-WIRE-04 | Widget shows real data when gatheringData is false | manual-only | Manual: load dashboard with seeded BI data | N/A |

### Sampling Rate
- **Per task commit:** `cd personal-assistant && npx vitest run src/lib/intelligence`
- **Per wave merge:** `cd personal-assistant && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `personal-assistant/src/components/roles/__tests__/intelligence-widgets.test.ts` -- covers INT-WIRE-01, INT-WIRE-03
- [ ] Mock `fetch` for parallel API call testing with individual success/failure scenarios

*(Note: Backend intelligence tests already exist and are comprehensive at `personal-assistant/src/lib/intelligence/__tests__/intelligence.test.ts`. The gap is only on the client-side widget integration.)*

## Sources

### Primary (HIGH confidence)
- `personal-assistant/src/components/roles/intelligence-widgets.tsx` -- current broken implementation (hardcoded gatheringData)
- `personal-assistant/src/app/api/intelligence/[metric]/route.ts` -- existing working API endpoint
- `personal-assistant/src/lib/intelligence/index.ts` -- barrel export of all 4 intelligence modules
- `personal-assistant/src/lib/intelligence/revenue-radar.ts` -- RevenueRadarResult type definition
- `personal-assistant/src/lib/intelligence/client-health.ts` -- ClientHealthResult type definition
- `personal-assistant/src/lib/intelligence/cash-flow-prophet.ts` -- CashFlowProphetResult type definition
- `personal-assistant/src/lib/intelligence/capacity-oracle.ts` -- CapacityAssessment type definition
- `personal-assistant/supabase/migrations/092_role_engine_tables.sql` -- bi_snapshots schema
- `personal-assistant/src/app/api/cron/intelligence/route.ts` -- cron that populates bi_snapshots

### Secondary (MEDIUM confidence)
- `.planning/phases/25-role-dashboard/25-03-SUMMARY.md` -- confirms widgets were shipped with placeholder
- `.planning/phases/24-intelligence-layer/24-01-SUMMARY.md` -- confirms backend intelligence modules

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, pure wiring
- Architecture: HIGH -- both sides (API + widget) exist and are well-documented in code
- Pitfalls: HIGH -- all pitfalls identified from reading actual source code, not speculation

**Research date:** 2026-03-27
**Valid until:** Indefinite -- this is internal wiring research, not dependent on external libraries
