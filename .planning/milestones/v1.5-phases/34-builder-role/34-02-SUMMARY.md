---
phase: 34-builder-role
plan: 02
subsystem: agent-tools, builder, ui
tags: [builder, website-generation, anthropic-sdk, iframe-sandbox, chat-tools, artifact-panel]

# Dependency graph
requires:
  - phase: 34-builder-role-01
    provides: WebsiteProject types, GenerationRequest interface, template library (getTemplate, listTemplates), website_projects/website_revisions tables
  - phase: 22-cost-controls-ad-script
    provides: Tool group registration pattern, AgentToolHandler type, JIT_INSTRUCTIONS pattern
provides:
  - AI-powered website generation engine (generateWebsite, reviseWebsite, getProjectHtml)
  - 3 builder chat tools (generate_website, list_website_templates, revise_website)
  - Builder tool group registered in agent tool system with JIT instructions
  - Hardened iframe sandbox (allow-scripts without allow-same-origin) on artifact panel
  - Builder module barrel export (index.ts)
affects: [34-03 deploy, 34-04 wordpress-export, chat-interface artifact rendering]

# Tech tracking
tech-stack:
  added: []
  patterns: [ai-website-generation, template-variable-substitution, iframe-sandbox-hardening, artifact-data-in-tool-results]

key-files:
  created:
    - personal-assistant/src/lib/builder/generator.ts
    - personal-assistant/src/lib/builder/index.ts
    - personal-assistant/src/lib/agent/tools/builder-tools.ts
  modified:
    - personal-assistant/src/components/chat/artifact-panel.tsx
    - personal-assistant/src/lib/agent/tools.ts

key-decisions:
  - "Claude Sonnet for generation (claude-sonnet-4-20250514) -- creative task, speed over reasoning depth"
  - "Artifact data embedded in tool result for chat engine pickup (data.artifact: {type, title, content})"
  - "sandbox=allow-scripts without allow-same-origin -- browser-level isolation for AI-generated HTML"
  - "stripMarkdownFences post-processing on LLM output for clean HTML extraction"

patterns-established:
  - "Builder tool result pattern: include artifact object in data for ArtifactPanel rendering"
  - "Template variable substitution via {{mustache}} regex replacement on HTML + CSS variables"

requirements-completed: [BUILD-01, BUILD-02]

# Metrics
duration: 9min
completed: 2026-03-27
---

# Phase 34 Plan 02: Website Generation Engine Summary

**AI-powered website generation with Claude Sonnet, 3 chat tools for generate/browse/revise workflow, and iframe sandbox hardening (allow-scripts only)**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-27T13:27:01Z
- **Completed:** 2026-03-27T13:36:01Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Website generation engine with template-based and AI-powered (Claude Sonnet) generation paths, both persisting to website_projects with revision history
- 3 builder tools registered in chat tool system with JIT instructions for agent response guidance
- Artifact panel iframe hardened with sandbox="allow-scripts" (no allow-same-origin) preventing generated code from accessing parent page
- Builder module barrel index.ts for clean imports

## Task Commits

Each task was committed atomically:

1. **Task 1: Website generation engine and iframe sandbox hardening** - `c0748d73` (feat)
2. **Task 2: Chat tools and tool registration** - `fe0ea1fb` (feat)

## Files Created/Modified
- `src/lib/builder/generator.ts` - generateWebsite(), reviseWebsite(), getProjectHtml() with Anthropic SDK integration
- `src/lib/builder/index.ts` - Barrel re-exports for types, templates, generator
- `src/lib/agent/tools/builder-tools.ts` - 3 tool definitions + handlers (generate_website, list_website_templates, revise_website)
- `src/lib/agent/tools.ts` - Builder tool group, handlers, definitions, and JIT instructions registered
- `src/components/chat/artifact-panel.tsx` - iframe sandbox="allow-scripts" added (BUILD-02 security requirement)

## Decisions Made
- Used Claude Sonnet (claude-sonnet-4-20250514) for website generation -- creative task where speed matters more than reasoning depth
- Tool results include `data.artifact` object with type/title/content for the existing chat artifact detection to pick up
- sandbox="allow-scripts" without allow-same-origin on ALL HTML artifact previews (not just builder) -- correct security posture per research pitfall #1
- stripMarkdownFences() post-processing handles LLM output that may include markdown code fences

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. ANTHROPIC_API_KEY already configured in the project.

## Next Phase Readiness
- Builder tools are live in the chat tool system -- users can generate, browse templates, and revise websites
- Artifact panel securely sandboxes all HTML previews
- Ready for Plan 03 (deployment) and Plan 04 (WordPress export)

## Self-Check: PASSED

All 5 created/modified files verified on disk. Both task commits (c0748d73, fe0ea1fb) verified in git log.

---
*Phase: 34-builder-role*
*Completed: 2026-03-27*
