---
phase: 23-seo-monitor-tender-hunter
plan: 01
subsystem: agent-tools
tags: [seo, ai-search, schema-markup, visibility-audit, anthropic-tools]

requires:
  - phase: 22-cost-controls-ad-script-generator
    provides: "Tool registration pattern, plan gating, autonomy levels, cost controls"
provides:
  - "4 SEO agent tools: audit_visibility, generate_seo_content, generate_schema_markup, visibility_report"
  - "'seo' tool group registered in TOOL_GROUPS with JIT instructions"
  - "Autonomy mappings for SEO tools (L3/L4)"
affects: [24-content-creator, agent-chat, billing]

tech-stack:
  added: []
  patterns: ["SEO tool handler pattern wrapping ai-search-optimizer.ts library"]

key-files:
  created:
    - "personal-assistant/src/lib/agent/tools/seo-tools.ts"
    - "personal-assistant/src/lib/agent/tools/seo-tools.test.ts"
  modified:
    - "personal-assistant/src/lib/agent/tools.ts"
    - "personal-assistant/src/lib/intelligence/autonomy-levels.ts"

key-decisions:
  - "Autonomy: audit=L3_notify, content=L3_notify (DB writes), schema=L4_silent, report=L4_silent (read-only/pure)"
  - "Followed ad-tools.ts pattern exactly for consistency across growth role tool groups"

patterns-established:
  - "SEO tool handler pattern: snake_case input -> camelCase params -> ai-search-optimizer function -> ToolResult"

requirements-completed: [SEO-01, SEO-02, SEO-03, SEO-04, SEO-05]

duration: 8min
completed: 2026-03-18
---

# Phase 23 Plan 01: SEO Monitor Tool Wiring Summary

**4 SEO agent tools (audit, content, schema, report) wrapping ai-search-optimizer.ts, registered as 'seo' tool group with L3/L4 autonomy and growth plan gating**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-18T19:54:04Z
- **Completed:** 2026-03-18T20:02:30Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created seo-tools.ts with 4 Anthropic.Tool definitions and 4 handlers wrapping ai-search-optimizer.ts
- Registered 'seo' tool group in tools.ts with JIT instructions for all 4 tools
- Mapped autonomy levels: audit/content=L3_notify, schema/report=L4_silent
- Confirmed pre-existing wiring: plan-gates (growth), engine (seo role), scheduler (tick)
- 14 tests written and passing (TDD: RED then GREEN)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create seo-tools.ts with tool definitions and handlers (TDD)**
   - `63f6dea4` (test): add failing tests for SEO tool definitions and handlers
   - `e6b30e3d` (feat): implement SEO tool definitions and handlers
2. **Task 2: Register seo tool group, wire autonomy and JIT instructions** - `72338ee7` (feat)

## Files Created/Modified
- `personal-assistant/src/lib/agent/tools/seo-tools.ts` - 4 tool definitions + 4 handlers wrapping ai-search-optimizer.ts
- `personal-assistant/src/lib/agent/tools/seo-tools.test.ts` - 14 tests covering definitions, handlers, error cases
- `personal-assistant/src/lib/agent/tools.ts` - Added 'seo' to ToolGroup, TOOL_GROUPS, allHandlers, getAgentTools, JIT instructions
- `personal-assistant/src/lib/intelligence/autonomy-levels.ts` - Added autonomy mappings for 4 SEO tools

## Decisions Made
- Autonomy: audit=L3_notify, content=L3_notify (may persist to DB), schema=L4_silent (pure generation), report=L4_silent (read-only)
- Followed ad-tools.ts pattern exactly for consistency across growth role tool groups

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- SEO tools fully invokable via chat ("check my keyword rankings", "generate SEO content about web design")
- Plan gating ensures free/starter users get upgrade prompt
- Ready for 23-02 (Tender Hunter tool wiring)

---
*Phase: 23-seo-monitor-tender-hunter*
*Completed: 2026-03-18*
