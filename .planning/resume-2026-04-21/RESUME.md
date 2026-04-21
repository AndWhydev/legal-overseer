# BitBit — Resume Work (2026-04-21 consolidation)

State of play after the 2026-04-21 full-repo consolidation sweep. Everything here is ready to pick up in a fresh Claude Code session — each section is self-contained.

---

## Snapshot: what just happened

**Merged to main (this session):**
- PR #82 — Phase 51 gateway streaming integration tests (13/13 pass)
- PR #85 — Onboarding reorder (email-first, chat-surface-last) — admin-merged past CI billing outage
- PR #52 — iMessage Mac VPS warm pool (proprietary provider + replenishment) — admin-merged

**PRs opened (this session):**
- **PR #86** `fix/pr45-strip-dead-code` — small auth cleanup, ready to merge
- **PR #87** `feature/ui-ux` — design-system cleanup (-2216 lines, Aurora theme removed, 8 dead UI primitives)
- **PR #88** `phase/46-omniscience` — **DRAFT** — v3.0 anomaly detection + active learning (28 commits, blocked on migration apply)

**PR updated (this session):**
- PR #71 TAOR assess — pushed review follow-up commit `5e58ec0e` relocating assess hedge past prompt-cache rebuild. Ready for merge.

**Cleanup done:**
- 13 worktrees → 5
- 20+ local branches → 8
- 16 stashes → 4 (3 high-value ones preserved as patches in `.planning/resume-2026-04-21/`)
- Orphan commit on `fix/auth-error-copy` was already superseded on main — branch deleted

---

## Priority 1 — Apply migrations (blocks PR merges)

**#88 phase/46-omniscience blocker:** migration must be applied to Supabase before PR can be undrafted.

```bash
# PAT in 1Password: "Supabase Management API PAT" (id msse7p72qertsf2fllmgok45my)
SUPABASE_ACCESS_TOKEN=<pat> curl -X POST \
  "https://api.supabase.com/v1/projects/johvduasrhmufrfdxjus/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data "@<(jq -Rs '{query: .}' < personal-assistant/supabase/migrations/20260417000001_anomaly_baselines_brain_alerts.sql)"
```

After apply: `gh pr ready 88 --repo torkay/BitBit && gh pr merge 88 --squash --admin`.

**#52 iMessage VPS pool already merged, but its migration also needs applying + env vars set before the cron becomes functional:**

- Migration: `personal-assistant/supabase/migrations/20260417000001_bridge_pool_instances.sql`
- Env vars needed in Vercel (personal-assistant project):
  - `IMESSAGE_VPS_API_URL`
  - `IMESSAGE_VPS_API_KEY`
  - `IMESSAGE_VPS_IMAGE_ID`
  - `IMESSAGE_VPS_REGION`
  - `IMESSAGE_VPS_SSH_PRIVATE_KEY`
  - `IMESSAGE_VPS_SSH_USER`

Without these, `/api/cron/bridge-pool` throws and warm-pool stays empty.

---

## Priority 2 — Split PR #81 (chat polish megaPR)

**Status:** OPEN, DIRTY merge state (28 behind main), SPLIT + REBASE required.

**The PR is really 5 stapled-together changes.** Don't merge as-is — split into focused PRs:

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

**Pitfalls to watch:**
- Commit `2d98923a` on the branch is already on main as squash-merge `0f3a7a9a` (PR #83) — drop it during rebase.
- 5 files conflict with PR #78 voice (chat-interface.tsx, message-bubble.tsx, use-voice-input.ts, voice-pill.tsx, voice-pill.test.tsx). Land #81's splits first.

**Starter prompt for a fresh session:**
> Split PR #81 (chat-polish-bugfixes-genui) into 5 focused PRs per the plan in `.planning/resume-2026-04-21/RESUME.md`. Start with chunk 1 (chat bugfixes) — create branch `fix/chat-bugfixes-markdown-limit` off main, cherry-pick only the critical bug fix files, verify typecheck + test, open PR. Then proceed to chunk 2.

---

## Priority 3 — Voice PR #78: decide and execute

**Status:** OPEN, NEEDS-WORK + DEFER.

**Blockers found:**
- Typecheck red (PR-introduced errors):
  - `personal-assistant/src/lib/voice/session.ts:238` — Supabase `never` typing
  - `personal-assistant/src/lib/voice/__tests__/voice-commands.test.ts` — 7 errors on discriminated union
  - `personal-assistant/src/components/chat/__tests__/use-voice-input.test.tsx:67` — unused `@ts-expect-error`
- Uncommitted tool-adapter wiring in `personal-assistant/src/hooks/use-realtime-session.ts` — P1 doesn't actually reach TAOR tools without it
- 5-file conflict with #81 (listed above)
- 4293 LOC monolith against current v3.0 cognitive omniscience milestone — scope detour

**Recommended path:**
1. Land P1 only (realtime backbone + tool-adapter wiring + green typecheck) as a standalone PR after #81 splits land
2. Defer P5 (persona settings), P6 (offline queue + read-aloud), P7 (analytics dashboard) until voice is actually dogfooded
3. Drop P2–P4 (turn-taking, VAD, streaming-transcribe, voice-commands) — speculative surface area

**Decision to make in fresh session:** Close + reopen as focused P1 PR, or rebase + amputate in place?

---

## Priority 4 — Promote `autonomous/v3.0-phases-47-49`

**Status:** local-only branch, 29 commits (superset of phase/46).

After #88 phase/46 merges: rebase this branch onto main — only the phase 47/48/49 research + planning docs will remain. This is the **starting branch for Phase 47** (ToM + temporal reasoning).

```bash
git checkout autonomous/v3.0-phases-47-49
git rebase origin/main     # phase/46 commits drop out
git push -u origin autonomous/v3.0-phases-47-49
```

Optionally rename to `docs/phase-47-49-research` for clarity.

---

## Priority 5 — Decide fate of `worktree-agent-abb1e4ab` (50-03 LivingBrainAdapter)

**Status:** local-only worktree at `.claude/worktrees/agent-abb1e4ab`, 13 commits + uncommitted `wire-production.ts` edit.

**Finding:** `LivingBrainAdapter` is NOT on main, despite project memory saying Phase 50-03 shipped. Phase 50 shipped via the **docs-portal extractor path** (Zod env schema + 7 components + MDX wiring) — a different 50-03 than this branch's BrainPort architecture.

**This worktree is an abandoned parallel implementation.**

**Decision path:**
- If the BrainPort/LivingBrainAdapter DI layer is still desired → commit the wire-production.ts edit, open PR
- If not → `git worktree remove .claude/worktrees/agent-abb1e4ab && git branch -D worktree-agent-abb1e4ab`

**Starter prompt for fresh session:**
> Review `.claude/worktrees/agent-abb1e4ab` — a 13-commit branch building a `LivingBrainAdapter` implementing `BrainPort` with three tiers (DI layer for the Living Brain). Decide whether this architecture still belongs in the v3.0 roadmap given phase 50 shipped via a different path. If yes, commit the uncommitted `wire-production.ts` edit and open PR; if no, tear down.

---

## Priority 6 — Salvaged stash patches (review + selectively apply)

Three high-value stashes were exported as patch files in `.planning/resume-2026-04-21/`. Review each, apply what's still relevant, discard the rest.

### `stash-15.patch` — Composio tool-provider (1673 insertions, **LIKELY LIVE FIXES**)

**Why this matters:** Project memory flags Composio as having **live broken parts** (callback upsert SDK bundling crash, agent awareness, legacy coexistence). This stash contains 409 new lines in `personal-assistant/src/lib/composio/tool-provider.ts`, 296 lines of tests, and major refactors of `auth.ts` (+310) and `adapter.ts` (+135). These are almost certainly the fixes that were never landed.

**Next step:** In a fresh session, apply the patch on a new branch, run tests, verify against current Composio state on main, open PR per component.

```bash
git checkout -b fix/composio-tool-provider-salvage main
git apply .planning/resume-2026-04-21/stash-15.patch
# Expect conflicts — resolve per-file, then build + test
```

### `stash-16.patch` — Brain intake-clerk extensions (201 insertions)

Extensions to `intake-clerk.ts` (+73) and `section-librarian.ts` (+23), with a 92-line test file. Living Brain was shipped but this looks like follow-up hardening.

**Next step:** Apply on branch, assess if extensions are still needed given phase 46 (anomaly detection) is landing.

### `stash-11.patch` — iMessage channel-tools (192 insertions)

`channel-tools.ts` +75 with unique tooling. Also touches `send-limits.ts`, `inbox/[id]/reply/route.ts`.

**Next step:** Lower priority. iMessage is stable; may be fully superseded. Inspect before applying.

### `stash-3.patch` — Intelligent skill-router / skill-rag (246 insertions)

Skills RAG + registry work. Memory notes `feature/intelligent-skill-router` PR #49 was CLOSED (not merged). Aligns with current Composio skill-cards direction.

**Next step:** Decide if skill-router work should be revived. Feeds into Composio skill-cards thinking.

---

## Priority 7 — Minor cleanups

**Orphan submodule:** `docs-portal` shows as `M` on main because it's tracked as a subproject but has no `.gitmodules` entry. Either add proper submodule config or convert to regular nested directory. Cosmetic but confusing.

**Workspace drift stash:** `stash@{0}` contains `docs-portal` submodule pointer bump + `package-lock.json` + `personal-assistant/package.json` ts-morph/tsx/zod deps from phase 50 drift. If phase 50 docs extractor work is truly done, drop this stash.

---

## Reference — current remaining worktrees (5)

| Path | Branch | Purpose |
|---|---|---|
| `/home/claude/bitbit` | main | primary |
| `.claude/worktrees/agent-abb1e4ab` | worktree-agent-abb1e4ab | 50-03 LivingBrainAdapter (decide fate — Priority 5) |
| `.claude/worktrees/phase-46-omniscience` | phase/46-omniscience | PR #88 draft (blocked on migration) |
| `.claude/worktrees/ws1-ws5-assess-and-test-utterance` | worktree-ws1-ws5 (tracks feat/taor-assess-and-test-utterance) | PR #71 (ready to merge) |
| `.worktrees/ui-ux` | feature/ui-ux | PR #87 (ready to merge) |

## Reference — current remaining local branches (8)

- `main` — behind 3 (post-merge drift, harmless)
- `feature/ui-ux` → PR #87 open
- `fix/pr45-strip-dead-code` → PR #86 open
- `fix/voice-endpoints` → PR #78 open (DEFER)
- `phase/46-omniscience` → PR #88 draft
- `worktree-ws1-ws5-assess-and-test-utterance` → PR #71 open
- `worktree-agent-abb1e4ab` → no PR (Priority 5)
- `autonomous/v3.0-phases-47-49` → no PR (Priority 4)

## Reference — open PRs (6)

| # | Title | Status | Action |
|---|---|---|---|
| #71 | TAOR assess + test-utterance short-circuit | Ready (WIP committed) | Merge |
| #78 | Voice 7-phase UX roadmap | NEEDS-WORK + DEFER | Priority 3 |
| #81 | Chat polish megaPR (markdown, thinking rose, entity chips, genUI) | DIRTY, SPLIT REQUIRED | Priority 2 |
| #86 | Strip dead returnTo path | Ready | Merge |
| #87 | Design-system cleanup (-2216 LOC) | Ready | Merge (careful — 45 files) |
| #88 | Phase 46 anomaly detection + active learning | DRAFT | Priority 1 (apply migration first) |
