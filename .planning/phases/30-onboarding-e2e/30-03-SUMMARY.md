---
phase: 30-onboarding-e2e
plan: 03
subsystem: onboarding
tags: [email-scanning, contacts, discovery, welcome-conversation, real-time-progress]

requires:
  - phase: 30-onboarding-e2e
    provides: "Onboarding wizard flow with sync stage, intelligence crawl infrastructure"
provides:
  - "First-run discovery pipeline (30-day scan, identity/contacts/threads extraction)"
  - "Discovery API endpoint (/api/onboarding/discovery)"
  - "Welcome conversation generator with template-based personalization"
  - "Welcome conversation API endpoint (/api/chat/welcome)"
  - "Real progress sync stage driven by discovery data (not fake timers)"
affects: [dashboard-chat, onboarding-flow, contacts]

tech-stack:
  added: []
  patterns:
    - "Template-based message generation for speed (no LLM call)"
    - "Fire-and-forget background synthesis after lightweight scan"
    - "Progressive UI updates from async discovery pipeline"

key-files:
  created:
    - personal-assistant/src/lib/onboarding/first-run-discovery.ts
    - personal-assistant/src/app/api/onboarding/discovery/route.ts
    - personal-assistant/src/lib/onboarding/welcome-conversation.ts
    - personal-assistant/src/app/api/chat/welcome/route.ts
  modified:
    - personal-assistant/src/app/(auth)/onboard/page.tsx
    - personal-assistant/src/lib/onboarding/analytics.ts

key-decisions:
  - "Pure data extraction for discovery (no LLM) -- speed over depth, target <60s"
  - "Template-based welcome message (no LLM) -- instant generation, references real data"
  - "Contact frequency map with top 10 sorted by message count for first-run contact identification"
  - "Thread grouping by normalized subject (strip Re:/Fwd: prefixes) for active thread detection"
  - "Fire-and-forget background Opus synthesis after discovery completes (expensive work deferred)"
  - "90-second safety timeout with skip button for discovery that runs long"
  - "Welcome conversation created via conversation_threads + conversation_messages (reuses Total Recall)"

patterns-established:
  - "Lightweight discovery before heavy synthesis: scan fast, defer expensive work"
  - "Real progress in onboarding UI driven by actual data, not timers"

requirements-completed: [ONBD-02, ONBD-05]

duration: 25min
completed: 2026-03-27
---

# Phase 30 Plan 03: First-Run Discovery + Welcome Conversation Summary

**Lightweight 30-day email scan extracts identity, contacts, and threads in <60s; template-based welcome message references specific people and issues from user's real data**

## Performance

- **Duration:** 25 min
- **Started:** 2026-03-27T03:09:23Z
- **Completed:** 2026-03-27T03:34:03Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- First-run discovery pipeline scans last 30 days across connected channels, extracting user identity (name/email/company from sent headers), top 10 contacts by frequency, active threads by subject grouping, and actionable insights (emails needing reply, overdue follow-ups)
- Welcome conversation generator creates a personalized, data-grounded first message mentioning specific contacts by name, thread subjects, and reply counts -- no generic "Welcome to BitBit"
- Onboarding sync stage shows real progress from actual discovery data (messages found, contacts identified, threads mapped) instead of fake timed intervals
- Discovery results stored in profile preferences and contacts table, immediately available for dashboard and welcome conversation
- Full Opus synthesis fires in background after lightweight scan completes

## Task Commits

Each task was committed atomically:

1. **Task 1: Build first-run discovery pipeline** - `0f3d8cae` (feat)
2. **Task 2: Build welcome conversation** - `ffd6e54a` (feat)

**Note:** Both commits were absorbed into broader commits by concurrent background processes -- the files and content are correct but commit messages don't match the task names.

## Files Created/Modified
- `personal-assistant/src/lib/onboarding/first-run-discovery.ts` - Lightweight 30-day scan: identity extraction, contact frequency mapping, thread grouping, insights computation
- `personal-assistant/src/app/api/onboarding/discovery/route.ts` - API endpoint triggering discovery and firing background Opus synthesis
- `personal-assistant/src/lib/onboarding/welcome-conversation.ts` - Template-based welcome message generator with data interpolation
- `personal-assistant/src/app/api/chat/welcome/route.ts` - API endpoint creating welcome conversation thread + assistant message
- `personal-assistant/src/app/(auth)/onboard/page.tsx` - Updated sync stage with real discovery progress, value stage with discovery data, completeOnboarding with welcome conversation redirect
- `personal-assistant/src/lib/onboarding/analytics.ts` - Added discovery_completed and discovery_skipped event types

## Decisions Made
- Used pure data extraction (no LLM) for discovery to hit <60s target -- contact frequency maps, subject-line grouping, direction-based reply detection
- Template-based welcome message instead of LLM-generated -- instant, deterministic, and references real data (contact names, thread subjects, reply counts)
- Top 10 contacts sorted by message count with relationship classification (frequent/recent/important)
- Thread detection by stripping Re:/Fwd: prefixes and grouping by normalized subject
- needsReply detection: last message in thread from someone else = needs reply
- Overdue follow-ups: threads where user was last sender with no reply in 7+ days
- Contacts upserted into contacts table during discovery for immediate dashboard population
- 90-second safety timeout with "Skip and finish setup" button for slow/failed discovery
- Welcome conversation uses Total Recall's conversation_threads + conversation_messages tables
- Redirect to `/dashboard?tab=chat&conversation={id}` so user lands in the welcome conversation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added discovery event types to OnboardingEvent union**
- **Found during:** Task 1
- **Issue:** TypeScript error -- 'discovery_completed' and 'discovery_skipped' not assignable to OnboardingEvent type
- **Fix:** Added both event types to the union in analytics.ts
- **Files modified:** personal-assistant/src/lib/onboarding/analytics.ts
- **Verification:** TypeScript compiles cleanly

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minimal -- standard type extension for new event tracking. No scope creep.

## Issues Encountered
- Concurrent background processes from other agents staged and committed files into wrong commits. Task 1 files landed in commit 0f3d8cae (labeled "feat(31-03)") and Task 2 files in ffd6e54a (labeled "docs(28)"). Code content is correct; commit attribution is inaccurate.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Discovery pipeline ready for use -- triggers automatically during onboarding sync stage
- Welcome conversation API available for any post-onboarding flow
- Full Opus synthesis fires in background after discovery completes
- Dashboard contacts populated immediately after first-run scan
- The discovery result stored in profile.preferences.first_run_discovery is available for any future use

## Self-Check: PASSED

All 6 files verified present on disk. Both commit hashes (0f3d8cae, ffd6e54a) verified in git log.

---
*Phase: 30-onboarding-e2e*
*Completed: 2026-03-27*
