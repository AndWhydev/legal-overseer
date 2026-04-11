# Testing

## Framework

- **Vitest** 4.0.18 with `globals: true`
- **Config**: `vitest.config.ts`
- **Excludes**: `e2e/`, `.next/`, `tests/` directories

## Test Organization

### Unit Tests
- **Location**: Colocated alongside source files as `*.test.ts`
- **Pattern**: `src/lib/some-module/thing.ts` → `src/lib/some-module/thing.test.ts`
- **Mocking**: `vi.mock()` for isolating units from dependencies

### Integration Tests
- **Location**: `src/lib/__tests__/integration/`
- **Database**: Real Supabase connection (not mocked)
- **Helpers**: `src/lib/__test-helpers__/supabase-integration.ts`

### End-to-End Tests
- **Framework**: Playwright
- **Location**: `e2e/` directory (excluded from Vitest)

## Commands

| Command | Description |
|---------|-------------|
| `npm test` | Run all unit/integration tests (`vitest run`) |
| `npm run preflight` | Full check: `test` + `tsc` + `build` |

## Coverage

- **Source files**: ~819
- **Test files**: ~220
- **Coverage**: ~27% (estimated from file ratio)

## Assertion Patterns

Common assertion methods used across the codebase:

- `expect(x).toBe(y)` — strict equality
- `expect(x).toEqual(y)` — deep equality
- `expect(arr).toHaveLength(n)` — array/string length
- `expect(fn).toHaveBeenCalledWith(args)` — mock call verification

## Testing Gaps

Critical modules with zero test coverage:

- `src/lib/agent/taor-loop.ts` — core agent engine
- `src/lib/agent/tool-executor.ts` — tool invocation
- `src/lib/proactive/` — entire proactive intelligence module
- `src/lib/intelligence/` — only 2 of 21 files have tests

See CONCERNS.md for full details on testing debt.
