# Salvage from `worktree-agent-abb1e4ab` (2026-04-21)

Source branch: `worktree-agent-abb1e4ab` — removed 2026-04-21 during session-3 cleanup.

## What this is

Two files copied from the abandoned worktree before it was deleted:

- `living-brain.ts` (243 LOC) — `LivingBrainAdapter` class implementing the `BrainPort` interface with three-tier cognitive layers.
- `living-brain.test.ts` (401 LOC) — accompanying unit tests.

The worktree branch was 13 commits ahead of main with a destructive diff (272 files changed, -22843/+7395). The rest of its work is already captured on `origin/chore/chat-polish-bugfixes-genui` (#81 branch): `null-brain.ts`, `wire-production.ts`, `ports.ts`, `ask.ts`, `runtime.ts`, `roles.ts`, `vercel-anthropic-model.ts`, etc.

The *only* unique value was `LivingBrainAdapter` + its tests.

## Why preserved (not deleted)

Phase 50 "Generative Docs" shipped via a different path (docs-portal extractor), so `LivingBrainAdapter` was never wired into production. But the 644 LOC of implementation + tests is a potential starting point if the user ever wants to revive the BrainPort DI layer on a clean branch.

## Why NOT resurrected as a PR

- Main has Phase 45 (brain activation) and Phase 46 (anomaly detection + active learning) already live via a different architecture (cron-based consolidation, no BrainPort seam).
- `null-brain.ts` already fills the null-object slot on #81.
- Reviving would require rebase against 22k lines of divergence and reconciliation with the current Living Brain wiring — out of scope for session-3.

## To revive later

```bash
cp .planning/salvage/worktree-abb1e4ab/living-brain.ts \
   personal-assistant/src/lib/ai/adapters/living-brain.ts
cp .planning/salvage/worktree-abb1e4ab/living-brain.test.ts \
   personal-assistant/src/lib/ai/__tests__/living-brain.test.ts
```

Then wire into `wire-production.ts` (already on main via #81 chunk 5 or similar) and run typecheck.
