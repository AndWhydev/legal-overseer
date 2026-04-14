# Phase 01: Wire Prompt Cache — RESULT

## Summary

Activated the Living Brain prompt cache so entity_dossiers and domain_profiles compiled by the consolidation pipeline now flow into every agent response. The code in `prompt-cache.ts` and `context-assembler.ts` was already functional but never invoked because `usePromptCache` was never set to `true`.

Three production files changed, one test file created:

1. **TAOR loop** (`taor-loop.ts`): Set `usePromptCache: true` on the ContextAssembler constructor, captured `systemContentBlocks` from the assembled context, rebuilt blocks after dynamic content appended (plan/skills/tools/voice), and forwarded blocks to the gateway call.

2. **Gateway adapter** (`gateway-adapter.ts`): Extended `GatewayCallConfig` with optional `systemContentBlocks` field and `SystemContentBlock` type. When blocks are present, the adapter joins their text for the system string and enables `anthropic.cacheControl: true` in `providerOptions` so the Vercel AI SDK Anthropic provider applies cache breakpoints. Merged `providerOptions` construction so `thinking` and `cacheControl` coexist.

3. **Context assembler** (`context-assembler.ts`): No changes needed — the `assemble()` method already populates `systemContentBlocks` when `usePromptCache` is true and the `AssembledContext` interface already declares the field.

4. **Integration tests** (`prompt-cache-integration.test.ts`): Four tests verifying cache_control markers on dossier-populated prefixes, valid output with empty dossier tables, domain profile inclusion, and Anthropic-compatible block shapes.

## Quality Gates

| Gate    | Status | Evidence                                                    |
|---------|--------|-------------------------------------------------------------|
| Types   | PASS   | `npx tsc --noEmit` — zero errors in changed files           |
| Tests   | PASS   | 23/23 prompt-cache tests pass (19 existing + 4 new)         |
| Gateway | PASS   | 6/6 gateway-adapter tests pass                              |
| Build   | PASS   | No new type errors introduced                               |

## Key Decisions

- **Brain prefix as system text**: The Vercel AI SDK `streamText` accepts `system` as a string only. Rather than bypass the gateway, we join content block texts and enable `anthropic.cacheControl: true` via `providerOptions`, which lets the Anthropic provider apply cache breakpoints automatically.
- **Dynamic content split**: After the assembler returns, the TAOR loop appends plan/skills/tools/voice/traces. We split `systemContentBlocks` into the cached brain prefix (dossiers, profiles, constraints) and an uncached dynamic suffix to preserve cache hits across turns.
- **No assembler changes needed**: The `context-assembler.ts` already had the full implementation gated behind `usePromptCache` — only the caller (TAOR loop) needed the flag set.

## Files Changed

| File | Action |
|------|--------|
| `personal-assistant/src/lib/agent/engine/taor-loop.ts` | Modified |
| `personal-assistant/src/lib/ai/gateway-adapter.ts` | Modified |
| `personal-assistant/src/lib/brain/__tests__/prompt-cache-integration.test.ts` | Created |
| `.forge/phases/01-wire-prompt-cache/RESULT.md` | Created |
