---
phase: 02-ai-policy-engine
plan: 01
subsystem: api
tags: [claude-sdk, anthropic, ai, llm, api-endpoint]

# Dependency graph
requires:
  - phase: 01-foundation-inbox
    provides: Database schema, types, queries
provides:
  - Claude SDK client singleton
  - Analysis types (AnalysisResult, RiskFlag, SuggestedTask)
  - Policy loader for CLIENT-PACK.md
  - /api/analyze endpoint
affects: [02-02, 02-03, xixi-lane, allen-lane]

# Tech tracking
tech-stack:
  added: [@anthropic-ai/sdk]
  patterns: [lazy-client-initialization, json-schema-prompting]

key-files:
  created: [lib/claude.ts, lib/policies.ts, lib/analyze.ts, app/api/analyze/route.ts, .env.example]
  modified: [lib/types.ts, package.json, .gitignore]

key-decisions:
  - "Lazy client initialization for Next.js build compatibility"
  - "JSON schema in system prompt for structured output"
  - "Policy context injected via system prompt suffix"

patterns-established:
  - "Lazy SDK initialization: getAnthropicClient() pattern for build-time safety"
  - "Analysis flow: item -> prompt construction -> Claude -> JSON parse -> typed result"

issues-created: []

# Metrics
duration: 3min
completed: 2026-01-29
---

# Phase 2 Plan 1: Claude SDK + Analysis API Summary

**Claude SDK integrated with lazy initialization, analysis API endpoint returning structured recommendations from item content + policy context**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-29T05:38:42Z
- **Completed:** 2026-01-29T05:41:40Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Installed @anthropic-ai/sdk with lazy client initialization for Next.js build compatibility
- Created analysis types (AnalysisResult, RiskFlag, SuggestedTask, AnalysisRecord) matching PROJECT.md requirements
- Built policy loader that reads CLIENT-PACK.md as context for Claude
- Implemented /api/analyze endpoint that accepts itemId and returns structured AI analysis

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Claude SDK and configure environment** - `59969f5` (feat)
2. **Task 2: Add analysis types and policy loader** - `944f2b8` (feat)
3. **Task 3: Create analysis API endpoint** - `0863de8` (feat)

**Plan metadata:** (pending)

## Files Created/Modified

- `lib/claude.ts` - Claude client singleton with lazy initialization
- `lib/policies.ts` - Policy loader for CLIENT-PACK.md
- `lib/analyze.ts` - Core analyzeItem() function with prompt construction
- `app/api/analyze/route.ts` - POST endpoint accepting itemId
- `lib/types.ts` - Added AnalysisResult, RiskFlag, SuggestedTask, AnalysisRecord
- `.env.example` - ANTHROPIC_API_KEY placeholder
- `package.json` - Added @anthropic-ai/sdk dependency
- `.gitignore` - Added !.env.example exception

## Decisions Made

- **Lazy client initialization:** Original plan had client instantiated at module load, but this fails during `npm run build` when ANTHROPIC_API_KEY isn't set. Changed to `getAnthropicClient()` function that initializes on first use.
- **JSON schema in system prompt:** Using explicit JSON schema definition in system prompt to enforce structured output format.
- **Policy injection:** CLIENT-PACK.md loaded and appended to system prompt for policy-aware recommendations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Changed to lazy client initialization**
- **Found during:** Task 1 (Claude SDK setup)
- **Issue:** Direct client instantiation at module load caused build failure - ANTHROPIC_API_KEY not available during Next.js build
- **Fix:** Changed to getAnthropicClient() function with lazy initialization
- **Files modified:** lib/claude.ts
- **Verification:** npm run build succeeds
- **Committed in:** 59969f5

**2. [Rule 3 - Blocking] Added .env.example exception to .gitignore**
- **Found during:** Task 1 (environment configuration)
- **Issue:** Existing `.env*` pattern blocked .env.example from being committed
- **Fix:** Added `!.env.example` exception
- **Files modified:** .gitignore
- **Verification:** git add .env.example succeeds
- **Committed in:** 59969f5

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary for build compatibility and proper gitignore handling. No scope creep.

## Issues Encountered

None

## Next Phase Readiness

- Analysis API foundation complete, ready for 02-02 (analysis storage and versioning)
- /api/analyze endpoint works but needs ANTHROPIC_API_KEY in .env.local to function
- Will fail gracefully with error message if key is missing

---
*Phase: 02-ai-policy-engine*
*Completed: 2026-01-29*
