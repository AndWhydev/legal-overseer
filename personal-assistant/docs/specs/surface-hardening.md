# Surface Hardening Feature Spec

**Feature**: HTTP & Error Sanitization, Timing Jitter, Frontend Scrub, CI Guards
**Plan Phases**: 5, 6, 7
**Status**: Spec
**Date**: 2026-03-13

---

## 1. Overview

Eliminate provider-identifying fingerprints from HTTP responses, error messages, frontend UI, and client-side bundles. Add timing jitter to defeat latency-based model fingerprinting. Create CI guards to prevent regression.

---

## 2. Acceptance Criteria

### AC-1: HTTP Header Sanitization (Phase 5.1)
- **MUST** strip `x-powered-by` header from all responses
- **MUST** strip `server` header from all responses
- **MUST** set `x-powered-by: BitBit` on all responses
- Applied in `src/middleware.ts` via the existing `applySecurityHeaders()` function

### AC-2: Error Message Sanitization (Phase 5.2)
- **MUST** return generic error `"Something went wrong. Try again in a moment."` from all AI API route catch blocks
- Affected routes:
  - `src/app/api/ai/text/route.ts` — line 79: currently leaks `err.message`
  - `src/app/api/ai/voice/route.ts` — lines 58, 128: already generic but should use standard message
  - `src/app/api/agent/chat/route.ts` — line 62: currently leaks `String(error)`
  - `src/app/api/agent/classify/route.ts` — line 128: calls AI classifier, leaks `err.message`
  - `src/app/api/agent/ad-scripts/route.ts` — line 24: calls AI ad-script generator, leaks `err.message`
- **MUST NOT** return stack traces, SDK error codes, or model names in any error response
- Server-side logging of full error details **MUST** be preserved (logger calls remain)

### AC-3: Timing Jitter (Phase 5.3)
- **MUST** add 50–200ms random delay before streaming the first chunk in the chat stream endpoint
- Implemented as a utility function `addTimingJitter()` in `src/lib/security/timing-jitter.ts`
- **Call site**: `src/app/api/agent/chat/route.ts` — call `await addTimingJitter()` inside the `ReadableStream.start()` callback, before the first `controller.enqueue()` (line 55)
- Jitter applied only once per request (before first byte), not between chunks
- Range: `50 + Math.random() * 150` milliseconds

### AC-4: Frontend Model Reference Removal (Phase 6.1)
- **MUST** remove "Cost by Model" section from `costs-tab.tsx` (lines 367–383)
- **MUST** remove `entry.model` display — the `CostEntry.model` field stays in the interface for API compat but is never rendered
- **MUST** remove "Powered by Claude AI" from `landing-page/app/demo/page.tsx` line 333
- **MUST** remove "Haiku planner" comment from `chat-interface.tsx` line 187
- After changes, zero strings matching `claude`, `anthropic`, `haiku`, `sonnet`, `opus`, `Powered by` (case-insensitive) appear in any `.tsx` component file under `src/components/`, `src/app/`, or `landing-page/`
- Exception: legal pages (`terms/page.tsx`, `privacy/page.tsx`) — these are required disclosures and are exempt

### AC-5: Pre-commit Hook Script (Phase 7.1)
- **MUST** create `scripts/scan-model-leaks.sh` that:
  - Scans `personal-assistant/src/` for hardcoded model IDs (`claude-(opus|sonnet|haiku)`)
  - Excludes `model-registry.ts` (the one allowed file — will exist after Phase 1)
  - Excludes `node_modules`, `.test.ts`, `.test.tsx` files
  - Exits non-zero if any leaks found, printing the offending lines
  - Exits zero if clean
- Script is standalone (not wired into `.husky/` — that's a separate concern)

### AC-6: Bundle Scan Script (Phase 7.2)
- **MUST** create `scripts/scan-bundle-leaks.sh` that:
  - Scans `.next/static/` directory for forbidden strings: `claude`, `anthropic`, `openai`, `haiku`, `sonnet`, `opus`
  - Exits non-zero if any matches found
  - Exits zero if clean
  - Designed to run post-build in CI

---

## 3. Files Modified

| File | Change |
|------|--------|
| `src/middleware.ts` | Add header stripping/setting in `applySecurityHeaders()` |
| `src/app/api/ai/text/route.ts` | Sanitize catch block error message |
| `src/app/api/ai/voice/route.ts` | Sanitize catch block error messages |
| `src/app/api/agent/chat/route.ts` | Sanitize stream error event + add `addTimingJitter()` call before first enqueue |
| `src/app/api/agent/classify/route.ts` | Sanitize catch block error message |
| `src/app/api/agent/ad-scripts/route.ts` | Sanitize catch block error message |
| `src/components/dashboard/tabs/costs-tab.tsx` | Remove "Cost by Model" section |
| `src/components/chat/chat-interface.tsx` | Remove "Haiku planner" comment |
| `landing-page/app/demo/page.tsx` | Remove "Powered by Claude AI" |
| `src/lib/security/timing-jitter.ts` | **NEW** — timing jitter utility |
| `scripts/scan-model-leaks.sh` | **NEW** — pre-commit model ID scanner |
| `scripts/scan-bundle-leaks.sh` | **NEW** — bundle leak scanner |

## 4. Files Created (New)

### `src/lib/security/timing-jitter.ts`
```typescript
/**
 * Adds random delay (50-200ms) before first stream token
 * to defeat latency-based model fingerprinting.
 */
export async function addTimingJitter(): Promise<void> {
  const jitter = 50 + Math.random() * 150;
  await new Promise(resolve => setTimeout(resolve, jitter));
}
```

### `scripts/scan-model-leaks.sh`
```bash
#!/bin/bash
# Scan source for hardcoded model IDs outside model-registry.ts
LEAKS=$(grep -rn "claude-\(opus\|sonnet\|haiku\)" personal-assistant/src/ \
  --include="*.ts" --include="*.tsx" \
  | grep -v "model-registry.ts" \
  | grep -v "node_modules" \
  | grep -v "\.test\.")

if [ -n "$LEAKS" ]; then
  echo "BLOCKED: Hardcoded model ID found outside model-registry.ts:"
  echo "$LEAKS"
  exit 1
fi
echo "CLEAN: No hardcoded model IDs found."
exit 0
```

### `scripts/scan-bundle-leaks.sh`
```bash
#!/bin/bash
# Scan production bundle for leaked provider strings
FORBIDDEN="claude\|anthropic\|openai\|haiku\|sonnet\|opus"
LEAKS=$(grep -rl "$FORBIDDEN" .next/static/ 2>/dev/null)

if [ -n "$LEAKS" ]; then
  echo "LEAK: Forbidden strings found in bundle:"
  echo "$LEAKS"
  exit 1
fi
echo "CLEAN: No provider strings in bundle."
exit 0
```

---

## 5. Test Plan

Tests go in `src/lib/security/__tests__/surface-hardening.test.ts`.

### Test Group 1: Header Middleware
- `applySecurityHeaders deletes x-powered-by header`
- `applySecurityHeaders deletes server header`
- `applySecurityHeaders sets x-powered-by to BitBit`

### Test Group 2: Error Sanitization
- `AI text route returns generic error message on failure`
- `AI voice route returns generic error message on failure`
- `Chat stream error events contain generic message, not raw error`

### Test Group 3: Timing Jitter
- `addTimingJitter delays between 50-200ms`
- `addTimingJitter produces variable delays (not constant)`

### Test Group 4: Frontend Model References
- `costs-tab does not render entry.model`
- `no .tsx files under src/components/ contain model/provider strings` (excluding legal pages)

### Test Group 5: Pre-commit Script
- `scan-model-leaks.sh exits 0 on clean source`
- `scan-model-leaks.sh exits 1 when model ID found outside registry`

### Test Group 6: Bundle Scan Script
- `scan-bundle-leaks.sh exits 0 on clean bundle`
- `scan-bundle-leaks.sh exits 1 when forbidden string found in bundle`

---

## 6. Non-Goals

- **Not modifying API response payloads** (e.g., stripping `model` from JSON) — that's Phase 2 (response sanitization), handled by model-quarantine feature
- **Not modifying system prompts** — that's Phase 3 (prompt hardening), handled by prompt-defense feature
- **Not modifying model-router.ts or other backend model references** — that's Phase 1 (model quarantine)
- **Not wiring pre-commit hook into .husky/** — script is standalone, CI integration is separate
- **Legal/privacy pages are exempt** from model string removal (required disclosures)

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Timing jitter could slow down non-AI routes | Only applied in chat stream endpoint, not middleware |
| Removing "Cost by Model" reduces admin visibility | Cost data still available server-side in logs; aggregate view preserved |
| Pre-commit script may have false positives on test files | Test files explicitly excluded from scan |
| Bundle scan depends on `.next/static/` existing | Script handles missing directory gracefully (grep -r exits cleanly) |
