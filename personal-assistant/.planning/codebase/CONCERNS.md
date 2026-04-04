# Concerns

## Critical

### Security Vulnerabilities
- **15 high-severity npm vulnerabilities** — includes `lodash-es` (transitive via `mermaid`, unresolvable without replacing mermaid)
- **Next.js 16 beta security issues** — HTTP request smuggling, unbounded cache growth (monitor for patches)

### Test Coverage Gaps
- **0 tests** for agent engine (`src/lib/agent/taor-loop.ts`, `src/lib/agent/tool-executor.ts`)
- **0 tests** for entire proactive module (`src/lib/proactive/`)
- **2 of 21** intelligence files have tests (`src/lib/intelligence/`)
- **~27% overall coverage** — 220 test files for 819 source files

## High

### Type Safety
- **1,346 instances of `any` type** across the codebase
- **3 files** use `@ts-ignore` or `@ts-nocheck` to suppress type checking
- Undermines TypeScript's value for catching bugs at compile time

### Error Handling
- **340+ bare catch blocks** with no error handling (swallow errors silently)
- Risk of silent failures in production, especially in agent engine and integrations

### File Size / Complexity
- **12 files exceed 800 lines of code**:
  - `chat-interface.tsx` — 2,270 LOC (highest)
  - `invoice-list.tsx` — 1,641 LOC
  - These files are candidates for decomposition

## Medium

### Console Logging
- **69 `console.log`/`console.error` statements** in production code
- Should use structured logger (`src/lib/core/logger.ts`) instead for consistency and observability

### Dependency Risk
- `lodash-es` vulnerability chain: `mermaid` → `lodash-es` (no fix available without replacing mermaid)
- Next.js 16 is in beta — may have undiscovered issues

## Recommended Actions

1. **Add tests for agent engine** — `taor-loop.ts` and `tool-executor.ts` are the most critical untested code paths
2. **Audit bare catch blocks** — add logging or re-throwing to the 340+ empty catches
3. **Reduce `any` usage** — prioritize files in `src/lib/agent/` and `src/lib/intelligence/`
4. **Split large files** — decompose `chat-interface.tsx` and `invoice-list.tsx` into smaller components
5. **Replace console.log** — migrate to structured logger
6. **Monitor Next.js 16 patches** — upgrade when HTTP smuggling and cache issues are fixed
7. **Evaluate mermaid dependency** — consider lighter alternative to resolve lodash-es vulnerability chain
