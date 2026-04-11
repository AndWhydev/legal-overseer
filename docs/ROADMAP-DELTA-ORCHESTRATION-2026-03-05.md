# Roadmap Delta Orchestration (2026-03-05)

Reference: `docs/comprehensive-roadmap.md`

Scope rule applied:
- Human verification / external credentials / legal-signoff tasks are excluded.
- This document tracks code-only deltas and swarm execution.

## Newly Incorporated Change

- `landing-page/app/page.tsx` now uses real legal links:
  - Privacy -> `https://app.bitbit.chat/privacy`
  - Terms -> `https://app.bitbit.chat/terms`
- This aligns with roadmap legal/public-surface expectations (E1.5/E1.6 adjacency) and reduces launch-risk drift on public pages.

## Fresh Delta Snapshot (Code-Only)

## Completed or materially complete

- E3.4 self-serve onboarding:
  - Commit `7cf1834c` adds onboarding path and callback routing updates.
  - Related code exists in:
    - `personal-assistant/src/app/(auth)/onboard/page.tsx`
    - `personal-assistant/src/app/api/onboarding/route.ts`
    - `personal-assistant/src/lib/onboarding/multi-tenant.ts`
- D3 Playwright baseline and stability:
  - Latest full run: `60 passed`, `2 skipped`, `0 failed` (local, credentialed).
- B-stream onboarding/mobile/progressive-disclosure work:
  - Implemented and recently hardened in Wave 2 commits.
- C1 partial channel completion:
  - ClickUp + GA4 + WordPress adapters present.
- E3.3 pricing + checkout wiring:
  - Pricing page and checkout endpoint exist (`/pricing`, `/api/billing/checkout`).
- E4 analytics data wiring:
  - `/api/analytics` and analytics tab wired to MRR/usage/churn services.

## Inspection Update (Pass 2)

After swarm integration and verification, the previously-prioritized deltas are now implemented:

1. D1.5 Add CI E2E workflow (Playwright in GitHub Actions) — implemented via `.github/workflows/e2e.yml`
2. C1.3 Add Cluely channel adapter — implemented via `src/lib/channels/cluely.ts` + registry/type wiring
3. C3.1 Extract reusable conversation interface from WhatsApp parser — implemented via `src/lib/conversation/**` + parser integration
4. E4.5 Add monthly revenue reporting email automation — implemented via `src/lib/reports/monthly-revenue-email.ts` + cron route wiring

Verification snapshot:
- TypeScript compile: `npx tsc --noEmit` ✅
- Targeted tests: monthly report + conversation adapter + synthesizer + integration pipelines ✅

## Deviations / Derailments vs `comprehensive-roadmap.md`

1. Team 4 (A1 stream) is partially complete, not fully complete:
   - Added strong integration coverage (entity resolution, memory consolidation, multi-tenant isolation, invoice flow).
   - Still not equivalent to full load/perf scope (A1.11/A1.12 style production-like load cycles).

2. Team 7 (D3 stream) now has CI workflow coverage, but execution still depends on CI secrets:
   - Requires `E2E_USER_EMAIL`, `E2E_USER_PASSWORD` (and optional `PLAYWRIGHT_BASE_URL`) in GitHub Actions.

3. Roadmap sequence shifted forward in practice:
   - E4.5 (Wave 3 reporting automation) was pulled earlier and is now code-complete to reduce launch delta risk.

## Residual Swarm (Wave 2) — Completed

Additional code-only deltas closed by the residual swarm:

1. C1.5 Gmail migration hardening:
   - Added API-first transport gating with explicit modes (`auto` / `api` / `imap`) and IMAP fallback preservation.
   - Added adapter tests for token selection, API-only behavior, and fallback behavior.

2. A1.11/A1.12 infra load-style integration coverage:
   - Added deterministic integration suite for 50 relay cycles and 10 scheduled agent runs (no network).
   - Kept runtime lightweight and CI-safe.

3. D3 Playwright reliability hardening:
   - Added auth bootstrap setup project + shared storage state.
   - Hardened config timeouts/retries/workers via deterministic env controls.
   - Replaced several brittle sleep waits with condition-based synchronization.

Verification snapshot after residual swarm:
- `npx tsc --noEmit` ✅
- Targeted Vitest suites (gmail + infra load + multi-tenant + memory) ✅
- `npx playwright test --list` ✅
- Targeted ESLint on touched Playwright/channel/infra files ✅

## Remaining Code Deltas (Non-Human)

1. Optional further Playwright de-flake pass:
   - `workflows.spec.ts` still has some legacy timeout-based waits outside the hardened paths.
2. Optional broader load realism:
   - Current infra tests simulate load deterministically; production-like stress profiling remains separate.

## Deferred (code, but lower priority or cross-system heavy)

- C2.* P2 channels (FB/IG/Slack/accounting adapters)
- C3.2/C3.3 email and SMS conversation interfaces (after C3.1 baseline lands)
- A1.11/A1.12 load tests at production-like scale

## Swarm Execution (Active)

Spawned worker teams with isolated ownership:

- Team 2d CI/E2E pipeline specialist
  - Ownership: `.github/workflows/e2e.yml`
  - Goal: D1.5

- Team 6e Cluely adapter specialist
  - Ownership: `src/lib/channels/cluely.ts` + minimal registry/type wiring + tests
  - Goal: C1.3

- Team 10c conversation interface specialist
  - Ownership: `src/lib/conversation/**` + minimal WhatsApp parser integration + tests
  - Goal: C3.1

- Team 9c revenue reporting automation specialist
  - Ownership: `src/lib/reports/**`, `src/app/api/cron/**` (as needed), minimal mail glue
  - Goal: E4.5

All teams were instructed:
- They are not alone in the codebase.
- Ignore unrelated edits from parallel teams.
- Do not revert non-owned files.

## Gate-Oriented Target

When the active swarm merges cleanly:
- Wave 2/3 code readiness improves without waiting on human-only dependencies.
- Remaining blockers become primarily external/human verification tasks.
