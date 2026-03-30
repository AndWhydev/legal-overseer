# Phase 30: Onboarding E2E & First-Run Experience - Research

**Researched:** 2026-03-27
**Domain:** Onboarding wizard hardening, empty state UX, first-run channel discovery, E2E testing
**Confidence:** HIGH

## Summary

Phase 30 is primarily a verification, gap-closure, and UX polish phase rather than a greenfield build. The core onboarding infrastructure is already substantial: a 5-stage wizard (workspace > connections > sync > agents > value), first-run discovery pipeline, welcome conversation generator, analytics instrumentation, and profile state management all exist. Plan 03 (first-run discovery + welcome conversation) is already completed. The remaining work is Plan 01 (T010 FR verification, wizard hardening, E2E test update) and Plan 02 (contextual empty states for all dashboard tabs).

The E2E test at `e2e/onboarding.spec.ts` is outdated -- it references old page copy ("meet your bitbit", "start with bitbit", "let bitbit learn", "bitbit is taking the first pass", "your bitbit is awake") while the current implementation uses different headings ("Set up your workspace", "Connect a source", "Scanning your history", "Recommended agents", "You're all set"). The EmptyState component already supports `secondaryAction` props, and 7 of ~30 dashboard tabs already use EmptyState. The remaining tabs need contextual empty states added.

**Primary recommendation:** Execute remaining Plans 01 and 02 against the existing codebase. Plan 01 is a systematic audit of 12 T010 FRs plus E2E test rewrite. Plan 02 is a tab-by-tab empty state sweep. Both are well-scoped and the existing plans at `.planning/phases/30-onboarding-e2e/` are accurate and actionable.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ONBD-01 | Onboarding flow passes E2E (all 12 T010 FRs) | T010 spec defines all 12 FRs. Current E2E test uses outdated copy. Wizard has all 5 stages implemented but needs FR-by-FR audit. |
| ONBD-02 | First-run channel discovery (30-day scan, identity+contacts+threads in 60s) | COMPLETED in Plan 03. `first-run-discovery.ts` and `/api/onboarding/discovery` route exist and work. |
| ONBD-03 | Contextual empty states on every dashboard page | EmptyState component exists with `secondaryAction`. 7/30 tabs already have it. ~10 tabs need new empty states added. |
| ONBD-04 | Connection wizard persists progress across browser refresh | `persistOnboardingStage()` function exists in onboard page. Bootstrap effect reads `preferences.onboarding_stage`. Needs verification it works correctly across all stages. |
| ONBD-05 | Welcome conversation uses real user data from discovery scan | COMPLETED in Plan 03. `welcome-conversation.ts` and `/api/chat/welcome` route exist. Template-based, no LLM call. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.1.6 | App framework | Already in use -- all routes, pages, API handlers |
| React | 19.2.3 | UI components | Already in use -- onboarding page is a client component |
| Supabase SSR | 0.8.0 | Auth + DB access | Already in use -- profile, preferences, conversation tables |
| motion/react | 12.36.0 | Animations | Already in use -- onboarding stage transitions |
| lucide-react | 0.567.0 | Icons | Already in use -- EmptyState icons for dashboard tabs |

### Testing
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Playwright | 1.58.2 | E2E tests | Onboarding flow E2E -- route mocking, stage navigation |
| Vitest | 4.0.18 | Unit tests | State routing logic, welcome message generation |

### Alternatives Considered
None -- this phase uses the existing stack exclusively. No new dependencies required.

## Architecture Patterns

### Existing Onboarding Architecture
```
src/
  app/(auth)/onboard/page.tsx          # 5-stage wizard (client component)
  app/api/onboarding/
    route.ts                            # POST: workspace creation
    discovery/route.ts                  # POST: first-run 30-day scan
    first-value/route.ts                # GET: personalized first-value artifact
    synthesize/route.ts                 # POST: full Opus synthesis (background)
  app/api/chat/welcome/route.ts         # POST: welcome conversation creation
  app/api/profile/preferences/route.ts  # PATCH/GET: preference persistence
  lib/onboarding/
    state.ts                            # Routing logic (hasCompletedFirstRunOnboarding, etc.)
    analytics.ts                        # Funnel event tracking
    first-run-discovery.ts              # Lightweight 30-day scan
    welcome-conversation.ts             # Template-based welcome message
    intelligence-crawl.ts               # Multi-channel crawl engine
    onboarding-pipeline.ts              # Full Opus synthesis pipeline
    profile.ts                          # Profile loading for onboarding state
    multi-tenant.ts                     # Org creation, channel setup
    beta-flow.ts                        # Beta-specific onboarding
  components/onboarding/
    stage-progress.tsx                  # Stage indicator with backtracking
    aurora-character.tsx                # Animated mascot
    sky-video-backdrop.tsx              # Background visual
    agent-recommendations.tsx           # Industry-specific agent suggestions
    first-run-guide.tsx                 # Post-onboarding contextual tooltips
    help-tooltip.tsx                    # Tooltip component
  components/ui/empty-state.tsx         # Shared EmptyState component
  components/dashboard/tabs/*-tab.tsx   # ~30 dashboard tabs (7 already use EmptyState)
e2e/
  onboarding.spec.ts                   # E2E test (OUTDATED copy assertions)
```

### Pattern 1: Onboarding Stage Persistence (ONBD-04)
**What:** Best-effort server persistence of current wizard stage on each transition
**When to use:** Every `setStage()` call in the wizard
**Example:**
```typescript
// Already implemented in onboard/page.tsx
function persistOnboardingStage(newStage: string) {
  fetch('/api/profile/preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ onboarding_stage: newStage }),
  }).catch(() => {}) // best effort
}

// On load, resume from saved stage
const savedStage = profile?.preferences?.onboarding_stage
if (savedStage && validStages.includes(savedStage)) {
  setStage(savedStage)
}
```

### Pattern 2: EmptyState with Navigation Actions
**What:** Dashboard tabs check if data array is empty, show EmptyState with action callback
**When to use:** Every dashboard tab that displays a data collection
**Example:**
```typescript
// Source: src/components/ui/empty-state.tsx
import { EmptyState } from '@/components/ui/empty-state'
import { Target } from 'lucide-react'

// In the tab component, when data is empty:
if (!leads || leads.length === 0) {
  return (
    <EmptyState
      icon={<Target size={24} />}
      title="No leads yet"
      description="BitBit captures leads from your connected email and web forms. New inquiries appear here automatically."
      action={{ label: "Connect a channel", onClick: () => navigateToConnections() }}
    />
  )
}
```

### Pattern 3: Playwright Route Mocking for Onboarding E2E
**What:** Mock all API routes the onboarding wizard calls to test the full flow without real backend
**When to use:** E2E test for onboarding flow
**Example:**
```typescript
// Source: e2e/onboarding.spec.ts (needs updating)
await page.route('**/api/onboarding', async (route) => {
  await route.fulfill({
    status: 201,
    contentType: 'application/json',
    body: JSON.stringify({ orgId: 'test', ownerId: 'test', rlsConfigured: true }),
  })
})

await page.route('**/api/onboarding/discovery', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      result: {
        userIdentity: { name: 'Test User', email: 'test@example.com', company: 'Test Co' },
        topContacts: [{ name: 'Dave', email: 'dave@example.com', messageCount: 14, lastContact: '2026-03-27', relationship: 'frequent' }],
        activeThreads: [{ subject: 'Website Redesign', participants: ['dave@example.com'], lastActivity: '2026-03-27', needsReply: true }],
        stats: { totalMessages: 47, channelBreakdown: { gmail: 47 }, scanDurationMs: 3200 },
        insights: { emailsNeedingReply: 3, overdueFollowUps: 1, staleContacts: 0, upcomingDeadlines: [] },
      },
    }),
  })
})
```

### Anti-Patterns to Avoid
- **Hardcoded page copy in E2E tests:** The current test has this problem. Use `data-testid` attributes or flexible text matchers that survive copy changes.
- **Tab-specific empty state styling:** All empty states MUST use the shared `EmptyState` component with the existing design system, not custom empty state implementations.
- **Blocking on discovery failure:** Discovery errors must be non-blocking. The 90-second timeout with "Skip and finish setup" already handles this.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Empty state component | Custom per-tab empty views | `EmptyState` from `@/components/ui/empty-state` | Consistent styling, already has icon/title/description/action/secondaryAction |
| Stage persistence | Custom localStorage solution | Profile preferences PATCH API | Already persists server-side, survives device changes |
| Welcome message | LLM-generated welcome | Template-based `generateWelcomeMessage()` | Speed (instant), deterministic, already references real data |
| E2E auth setup | Custom auth handling | `ensureAuthenticated()` from `e2e/helpers.ts` | Established pattern with `persistOnboardingComplete` and `dismissOnboarding` options |
| Channel discovery | Full Opus synthesis at onboarding | Lightweight `runFirstRunDiscovery()` | 60-second target vs multi-minute synthesis. Full synthesis fires in background. |

**Key insight:** Almost everything needed for this phase already exists. The work is verification, gap-filling, and E2E testing -- not building new systems.

## Common Pitfalls

### Pitfall 1: Outdated E2E Test Copy
**What goes wrong:** E2E test assertions fail because they check for old page headings ("meet your bitbit", "start with bitbit") instead of current ones ("Set up your workspace", "Connect a source").
**Why it happens:** The E2E test was written against an earlier version of the onboarding page and never updated.
**How to avoid:** Rewrite test to match current headings. Consider adding `data-testid` attributes for stability.
**Warning signs:** Any E2E test that uses `getByRole('heading', { name: /meet your bitbit/i })` is outdated.

### Pitfall 2: Missing API Route Mocks in E2E
**What goes wrong:** E2E test tries to hit real API routes and fails due to missing auth, no Supabase connection, or no connected channels.
**Why it happens:** The onboarding flow calls 6+ API routes: `/api/onboarding`, `/api/channels/status`, `/api/channels/sync`, `/api/onboarding/discovery`, `/api/onboarding/first-value`, `/api/profile/preferences`, `/api/chat/welcome`.
**How to avoid:** Mock ALL API routes in the E2E test. The current test only mocks `/api/channels/status` and `/api/channels/sync`.
**Warning signs:** E2E test times out or gets 401/500 errors from unmocked routes.

### Pitfall 3: Empty State Navigation
**What goes wrong:** EmptyState action buttons try to navigate to other tabs but the navigation mechanism varies across dashboard components.
**Why it happens:** Some tabs use URL params, some use callback props, some use router.push. No single navigation pattern.
**How to avoid:** Check how existing tabs handle navigation. Use the established pattern for the dashboard tab switching mechanism.
**Warning signs:** EmptyState action clicks do nothing or navigate to wrong page.

### Pitfall 4: Stage Persistence Race Condition
**What goes wrong:** User completes workspace, browser sends PATCH to persist `onboarding_stage: 'connections'`, but the PATCH hasn't resolved before the user refreshes. On reload, user starts back at workspace.
**Why it happens:** `persistOnboardingStage()` is fire-and-forget with `.catch(() => {})`.
**How to avoid:** This is acceptable behavior -- the persistence is best-effort. The bootstrap effect in `useEffect` checks for saved stage. The real fix is to also set `workspace_setup_completed: true` during workspace submission (which is already done).
**Warning signs:** Users report losing progress after refresh. Check that both workspace_setup_completed AND onboarding_stage are set.

### Pitfall 5: Discovery API Returns Empty for New Users
**What goes wrong:** Discovery scan finds 0 messages because the user just connected and Gmail hasn't synced yet.
**Why it happens:** Channel connection (OAuth) and actual message availability have a timing gap. Gmail adapter needs to pull messages before discovery can scan them.
**How to avoid:** The fallback path already handles this -- `SYNC_LINES_FALLBACK` and `generateFallbackWelcomeMessage()` exist. Verify the fallback UX is acceptable.
**Warning signs:** Welcome conversation says "Connect your email from Settings" even though user already connected.

## Code Examples

### Current Onboarding Page Headings (Ground Truth for E2E)
```typescript
// Source: src/app/(auth)/onboard/page.tsx
// Workspace stage:  "Set up your workspace"
// Connections stage: "Connect a source"
// Sync stage:       "Scanning your history"
// Agents stage:     "Recommended agents"
// Value stage:      "You're all set"
```

### EmptyState Component Interface
```typescript
// Source: src/components/ui/empty-state.tsx
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
}
```

### Dashboard Tabs Already Using EmptyState
```
// Source: grep results
- command-center-tab.tsx (5 EmptyState usages)
- tenders-tab.tsx
- inbox-tab.tsx
- jobs-tab.tsx
- analytics-tab.tsx
- proposals-tab.tsx
- approval-queue.tsx (shared component)
```

### Dashboard Tabs Needing EmptyState (from Plan 02)
```
- leads-tab.tsx
- invoices-tab.tsx
- approvals-tab.tsx
- sentry-tab.tsx
- swarm-tab.tsx
- meetings-tab.tsx
- creator-studio-tab.tsx
- ai-search-tab.tsx
- dashboard-tab.tsx (verify)
```

### Analytics Events Already Implemented
```typescript
// Source: src/lib/onboarding/analytics.ts
type OnboardingEvent =
  | 'onboarding_started'
  | 'workspace_completed'
  | 'connections_entered'
  | 'connection_succeeded'
  | 'connections_skipped'
  | 'sync_started'
  | 'discovery_completed'
  | 'discovery_skipped'
  | 'agents_viewed'
  | 'agents_completed'
  | 'value_viewed'
  | 'onboarding_completed'
  | 'onboarding_abandoned'
  | 'onboarding_error'
```

### API Routes Used by Onboarding (Must All Be Mocked in E2E)
```
POST /api/onboarding                 -- workspace creation
GET  /api/channels/status            -- check connected channels
POST /api/channels/sync              -- legacy channel sync
POST /api/onboarding/discovery       -- first-run discovery scan
GET  /api/onboarding/first-value     -- personalized first-value artifact
PATCH /api/profile/preferences       -- persist stage progress, onboarding_completed
POST /api/chat/welcome               -- create welcome conversation
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fake timed sync progress | Real discovery progress from API | Plan 03 (2026-03-27) | Sync stage shows actual messages/contacts/threads found |
| Generic welcome message | Template-based with real data | Plan 03 (2026-03-27) | Welcome conversation references specific contacts and threads |
| No mid-wizard persistence | `onboarding_stage` in preferences | Plan 01 (defined, not yet executed) | Users can resume after browser refresh |
| Blank dashboard pages | EmptyState with contextual guidance | Plan 02 (defined, not yet executed) | First-run users see actionable guidance |

**Deprecated/outdated:**
- Old E2E test copy ("meet your bitbit", "start with bitbit") -- must be updated to match current page
- Legacy `SYNC_LINES` constant -- replaced by dynamic `discoveryLines` driven by API response

## Open Questions

1. **E2E test auth strategy**
   - What we know: `ensureAuthenticated()` helper exists with options for `persistOnboardingComplete` and `dismissOnboarding`
   - What's unclear: Whether the helper can create a fresh user who hasn't completed onboarding, or if it only works with the pre-seeded e2e test user
   - Recommendation: Test with the existing helper first. If it doesn't support first-time user scenario, the E2E test may need to use route mocking to simulate first-time routing.

2. **Tab navigation mechanism for EmptyState actions**
   - What we know: Dashboard tabs exist as separate components. Some tabs navigate via URL params, some via callbacks.
   - What's unclear: The exact mechanism for switching tabs from within a tab component
   - Recommendation: Inspect how existing EmptyState action callbacks navigate in `command-center-tab.tsx` and follow that pattern.

3. **Completeness of Plan 01 scope post-Plan-03**
   - What we know: Plan 03 completed discovery + welcome conversation. Plan 01 was written before Plan 03 executed.
   - What's unclear: Whether Plan 01's tasks need adjustment given Plan 03's changes to the onboard page
   - Recommendation: Plan 01 should still be executable as-is since it focuses on FR verification and E2E tests, which are independent of Plan 03's API changes.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright 1.58.2 (E2E) + Vitest 4.0.18 (unit) |
| Config file | `playwright.config.ts` (E2E), `vitest.config.ts` (unit) |
| Quick run command | `npx vitest run src/lib/onboarding/ --reporter=verbose` |
| Full suite command | `npx playwright test e2e/onboarding.spec.ts --reporter=list` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ONBD-01 | Full 5-stage wizard happy path passes | E2E | `npx playwright test e2e/onboarding.spec.ts --reporter=list` | Yes (OUTDATED) |
| ONBD-01 | State routing logic (first-time vs returning) | unit | `npx vitest run src/lib/onboarding/state.test.ts` | Yes |
| ONBD-02 | Discovery pipeline extracts contacts/threads | unit | `npx vitest run src/lib/onboarding/first-run-discovery.test.ts` | No - Wave 0 |
| ONBD-03 | Empty states render on empty data tabs | E2E/manual | Manual verification: load each tab with empty data | manual-only (checking visual rendering) |
| ONBD-04 | Stage persists across browser refresh | E2E | `npx playwright test e2e/onboarding.spec.ts -g "progress persistence"` | No - needs adding to spec |
| ONBD-05 | Welcome message references real data | unit | `npx vitest run src/lib/onboarding/welcome-conversation.test.ts` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/lib/onboarding/ --reporter=verbose && npx tsc --noEmit --project tsconfig.json 2>&1 | head -30`
- **Per wave merge:** `npx playwright test e2e/onboarding.spec.ts --reporter=list`
- **Phase gate:** Full E2E suite green + TypeScript compilation clean

### Wave 0 Gaps
- [ ] `e2e/onboarding.spec.ts` -- REWRITE needed (assertions use outdated page copy, missing API route mocks for discovery/welcome/preferences)
- [ ] `src/lib/onboarding/first-run-discovery.test.ts` -- unit tests for discovery pipeline (ONBD-02 verification, already completed but no unit test)
- [ ] `src/lib/onboarding/welcome-conversation.test.ts` -- unit tests for welcome message generation (ONBD-05 verification)

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `src/app/(auth)/onboard/page.tsx` (958 lines) -- full onboarding wizard implementation
- Codebase inspection: `src/lib/onboarding/first-run-discovery.ts` (444 lines) -- discovery pipeline
- Codebase inspection: `src/lib/onboarding/welcome-conversation.ts` (151 lines) -- welcome message generator
- Codebase inspection: `src/components/ui/empty-state.tsx` (159 lines) -- shared EmptyState component
- Codebase inspection: `e2e/onboarding.spec.ts` (99 lines) -- current E2E test (outdated)
- T010 spec: `conductor/tracks/T010/spec.md` (462 lines) -- canonical onboarding requirements

### Secondary (HIGH confidence)
- Existing plans: `.planning/phases/30-onboarding-e2e/30-01-PLAN.md`, `30-02-PLAN.md`, `30-03-PLAN.md`
- Completed summary: `30-03-SUMMARY.md` -- Plan 03 already executed (discovery + welcome)
- v1.5 requirements: `.planning/milestones/v1.5-REQUIREMENTS.md` -- ONBD-01 through ONBD-05 definitions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, all existing
- Architecture: HIGH - extensive codebase inspection, all patterns documented from source
- Pitfalls: HIGH - identified from actual code analysis (outdated E2E, missing route mocks, navigation patterns)

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable -- this is a verification phase on existing code)
