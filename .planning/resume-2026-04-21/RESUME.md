# BitBit — Resume Work (2026-04-21 consolidation)

State of play after the 2026-04-21 full-repo consolidation sweep + 2026-04-21 follow-up session. Each section is self-contained for pickup in fresh Claude Code sessions.

---

## Snapshot: what happened

### 2026-04-21 session 1 (initial sweep)
**Merged:** PR #82 (Phase 51 streaming tests), #85 (onboarding reorder), #52 (iMessage Mac VPS pool).
**Opened:** #86 (strip dead auth code), #87 (design-system cleanup -2216 LOC), #88 draft (Phase 46 anomaly detection).
**Cleanup:** 13 worktrees → 5, 20+ local branches → 8, 16 stashes → 4.

### 2026-04-21 session 2 (this session — follow-up execution)
**Migrations applied to production:**
- `20260417000001_anomaly_baselines_brain_alerts.sql` — already applied (Phase 46 tables exist)
- `20260417000001_bridge_pool_instances.sql` — applied fresh via Management API

**Merged (all admin-merged past CI billing outage):**
- **PR #88** Phase 46 anomaly detection + active learning — v3.0 cognitive omniscience (28 commits squashed, 6,211 LOC added)
- **PR #87** Design-system cleanup (-2216 LOC, Aurora theme removed, 8 dead UI primitives)
- **PR #71** TAOR assess stage + test-utterance short-circuit (WS1 + WS5)
- **PR #86** Strip dead returnTo path and hosts.ts

**Test regression fixes (phase 46 fallout, landed as commit `27987926`):**
- `adversarial-confidence.test.ts` — allow 'clarify' as safe boundary decision (new route)
- `composio-integration.test.ts` — accept group size 2 (composio_connect_app + disconnect_connector)

**Cleanup after merges:**
- 5 worktrees → 2 (only main + abandoned `agent-abb1e4ab`)
- 8 local branches → 4 (main + autonomous/v3.0-phases-47-49 + fix/voice-endpoints + worktree-agent-abb1e4ab)

---

## Current state (end of session 2)

**Main:** `6e9ef85c` (after 4 PR merges + 2 test fixes)

**Open PRs (2):**

| # | Title | Status | Action |
|---|---|---|---|
| #78 | Voice 7-phase UX roadmap | NEEDS-WORK + DEFER | Priority 2 below |
| #81 | Chat polish megaPR (markdown, thinking rose, entity chips, genUI) | DIRTY, SPLIT REQUIRED | Priority 1 below |

**Local branches remaining:**
- `main`
- `autonomous/v3.0-phases-47-49` — starting point for Phase 47 (ToM + temporal). 29 commits, local-only.
- `fix/voice-endpoints` → PR #78 (DEFER)
- `worktree-agent-abb1e4ab` → no PR (Priority 3)

**Worktrees:** `/home/claude/bitbit` (main), `.claude/worktrees/agent-abb1e4ab` (50-03 LivingBrainAdapter).

**Still parked in `.planning/resume-2026-04-21/`:**
- `stash-15.patch` (1673 lines, Composio tool-provider — **likely live-broken fixes**)
- `stash-16.patch` (Brain intake-clerk extensions)
- `stash-11.patch` (iMessage channel-tools)
- `stash-3.patch` (Skill-router / skill-rag)

---

## Priority 1 — Split PR #81 (chat polish megaPR)

**Status:** OPEN, DIRTY merge state (now ~30 behind main after session 2 merges), SPLIT + REBASE required.

**Split plan (5 focused PRs):**

1. **Critical chat bugfixes** (ship first, safest)
   - `personal-assistant/src/lib/attachments/constants.ts` — add `text/markdown` to whitelist
   - `personal-assistant/src/lib/attachments/content-blocks.ts` — corresponding changes
   - `personal-assistant/src/app/api/agent/chat/route.ts` — raise message limit 10K → 50K
   - `personal-assistant/src/app/api/agent/chat-legacy/route.ts` — same limit
   - Error propagation via `humanizeError`
   - `personal-assistant/src/lib/agent/engine/taor-loop.ts` — `findLastIndex` fallback for image-block push

2. **UI polish wave**
   - `personal-assistant/src/components/ai-elements/thinking-rose.tsx` (new, 134 LOC, 7-petal SVG + RAF)
   - `personal-assistant/src/components/ai-elements/reasoning.tsx` (swap spinner for ThinkingRose)
   - Entity chips in assembler → SSE → MessageBubble
   - CitationBadge favicon + truncated title
   - SourcesFooter CSS grid

3. **GenerativeUI feature** (new capability)
   - `personal-assistant/src/lib/agent/tools/builder-tools.ts` — `render_ui` agent tool with 16KB cap
   - `personal-assistant/src/components/ai-elements/generative-ui.tsx` — sandboxed iframe, auto-resize, source toggle
   - Wire into chat tool result handler

4. **tool-ui registry install**
   - Entire `personal-assistant/src/components/tool-ui/` directory
   - `approval-card`, `data-table` (936 LOC), `message-draft` (511 LOC), `order-summary`, `shared`

5. **lib/ai DI scaffolding** (~1800 LOC)
   - `personal-assistant/src/lib/ai/` — ports, adapters, ask, roles, runtime, tests

**Pitfalls:**
- Commit `2d98923a` on the branch is already on main as squash-merge `0f3a7a9a` (PR #83) — drop during rebase.
- 5 files conflict with PR #78 voice (chat-interface.tsx, message-bubble.tsx, use-voice-input.ts, voice-pill.tsx, voice-pill.test.tsx). Land #81 splits first.

**Starter prompt for fresh session:**
> Split PR #81 (chat-polish-bugfixes-genui) into 5 focused PRs per the plan in `.planning/resume-2026-04-21/RESUME.md`. Start with chunk 1 (chat bugfixes) — create branch `fix/chat-bugfixes-markdown-limit` off main, cherry-pick only the critical bug fix files, verify typecheck + test, open PR. Then proceed to chunk 2.

---

## Priority 2 — Voice PR #78: decide and execute

**Status:** OPEN, NEEDS-WORK + DEFER.

**Blockers:**
- Typecheck red:
  - `personal-assistant/src/lib/voice/session.ts:238` — Supabase `never` typing
  - `personal-assistant/src/lib/voice/__tests__/voice-commands.test.ts` — 7 errors on discriminated union
  - `personal-assistant/src/components/chat/__tests__/use-voice-input.test.tsx:67` — unused `@ts-expect-error`
- Uncommitted tool-adapter wiring in `personal-assistant/src/hooks/use-realtime-session.ts` — P1 doesn't reach TAOR tools without it
- 5-file conflict with #81
- 4293 LOC monolith vs. current v3.0 cognitive omniscience milestone — scope detour

**Recommended path:**
1. Land P1 only (realtime backbone + tool-adapter wiring + green typecheck) as standalone PR after #81 splits land
2. Defer P5 (persona settings), P6 (offline queue + read-aloud), P7 (analytics) until voice is dogfooded
3. Drop P2–P4 (turn-taking, VAD, streaming-transcribe, voice-commands) — speculative

**Decision to make:** Close + reopen as focused P1 PR, or rebase + amputate in place?

---

## Priority 3 — `autonomous/v3.0-phases-47-49` & `worktree-agent-abb1e4ab`

### `autonomous/v3.0-phases-47-49` (local, 29 commits)

After #88 merged in this session, rebase onto main — only phase 47/48/49 research + planning docs will remain.

```bash
git checkout autonomous/v3.0-phases-47-49
git rebase origin/main   # phase/46 commits drop out
git push -u origin autonomous/v3.0-phases-47-49
```

Optionally rename to `docs/phase-47-49-research` for clarity. This is the starting branch for Phase 47 (ToM + temporal reasoning).

### `worktree-agent-abb1e4ab` (local, 13 commits + uncommitted wire-production.ts edit)

**Finding:** `LivingBrainAdapter` / `BrainPort` architecture is NOT on main. Phase 50 shipped via docs-portal extractor path — a different 50-03 than this branch's BrainPort DI layer.

**This worktree is an abandoned parallel implementation.**

**Decision:**
- If the BrainPort/LivingBrainAdapter DI layer is still desired → commit the `wire-production.ts` edit, open PR
- If not → `git worktree remove .claude/worktrees/agent-abb1e4ab && git branch -D worktree-agent-abb1e4ab`

---

## Priority 4 — Salvaged stash patches (review + selectively apply)

Three high-value stashes in `.planning/resume-2026-04-21/` as patch files. Review each, apply what's still relevant, discard the rest.

### `stash-15.patch` — Composio tool-provider (1673 insertions, **LIKELY LIVE FIXES**)

Project memory flags Composio as having live broken parts (callback upsert SDK bundling crash, agent awareness, legacy coexistence). Stash contains 409 new lines in `tool-provider.ts`, 296 lines of tests, major refactors of `auth.ts` (+310) and `adapter.ts` (+135). Almost certainly unlanded fixes.

```bash
git checkout -b fix/composio-tool-provider-salvage main
git apply .planning/resume-2026-04-21/stash-15.patch
# Expect conflicts — resolve per-file, then build + test
```

### `stash-16.patch` — Brain intake-clerk extensions (201 insertions)

Extensions to `intake-clerk.ts` (+73) and `section-librarian.ts` (+23) with 92-line test file. Assess if extensions are still needed now that phase 46 anomaly detection has landed.

### `stash-11.patch` — iMessage channel-tools (192 insertions)

`channel-tools.ts` +75, `send-limits.ts`, `inbox/[id]/reply/route.ts`. Lower priority — iMessage stable, may be fully superseded.

### `stash-3.patch` — Intelligent skill-router / skill-rag (246 insertions)

Skills RAG + registry. Memory notes `feature/intelligent-skill-router` PR #49 was CLOSED. Aligns with current Composio skill-cards direction — revive if skill-cards planning accelerates.

---

## Priority 5 — Verify Phase 51/52 production configs

PR #52 (iMessage warm pool) merged but the cron stays empty without these Vercel env vars:
- `IMESSAGE_VPS_API_URL`
- `IMESSAGE_VPS_API_KEY`
- `IMESSAGE_VPS_IMAGE_ID`
- `IMESSAGE_VPS_REGION`
- `IMESSAGE_VPS_SSH_PRIVATE_KEY`
- `IMESSAGE_VPS_SSH_USER`

Without these, `/api/cron/bridge-pool` throws. Confirm status via Vercel project env inspection, set if missing.

---

## Priority 6 — Minor cleanups

- **docs-portal submodule** still shows as `M` on main (tracked as subproject, no `.gitmodules` entry). Either add proper submodule config or convert to nested dir.
- **Starter branch hygiene:** rename `autonomous/v3.0-phases-47-49` → `docs/phase-47-49-research` after rebase.
