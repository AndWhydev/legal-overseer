# Testing Patterns

**Analysis Date:** 2026-02-19

## Test Framework

**Status:** Not detected

No test framework detected in codebase. No test files found (no `*.test.ts`, `*.spec.ts` files in `/home/claude/bitbit/src`). No vitest, Jest, or other test runner configuration detected in project files or package.json.

**Framework:** None configured
**Assertion Library:** None detected
**Test Runner:** None configured

## Current Testing Approach

**Manual Testing Only:**
- Development relies on manual testing
- No automated unit tests in repository
- No integration tests
- No E2E test suite

## Why This Matters

The absence of tests creates risk in several areas:
- Circuit breaker functionality (`src/governance/circuit-breaker.ts`) untested
- Error retry logic in API clients (`src/integrations/dataforseo/client.ts`) untested
- Data aggregation logic (`src/briefing/aggregator.ts`) untested
- Task pickup race condition prevention (`src/db/repositories/tasks.ts` uses transactions) untested

## Recommended Testing Strategy

**Quick Start:**
1. Set up Vitest (lightweight, ESM-native, fast)
2. Add test runner to package scripts
3. Start with high-value unit tests for error handling and retry logic

**Setup Steps:**
```bash
# Install vitest and assertions
npm install --save-dev vitest chai @vitest/ui

# Add scripts to package.json
"test": "vitest",
"test:ui": "vitest --ui",
"test:coverage": "vitest --coverage"
```

**Configuration File (vitest.config.ts):**
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
```

## Testing Architecture (When Implemented)

**Test File Organization:**
- Co-locate tests with source files
- Naming: `*.test.ts` for unit tests
- Location: `src/path/to/module.test.ts` next to `src/path/to/module.ts`
- Or separate `test/` directory mirroring src structure

**Directory Structure:**
```
src/
├── integrations/
│   ├── dataforseo/
│   │   ├── client.ts
│   │   ├── client.test.ts    (co-located)
│   │   ├── types.ts
│   │   └── types.test.ts
├── governance/
│   ├── circuit-breaker.ts
│   └── circuit-breaker.test.ts
```

## Patterns for Testing (Once Implemented)

### Test Structure

**Basic Suite Pattern:**
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DataForSEOError } from './types.js';

describe('DataForSEOError', () => {
  it('should create error with status code', () => {
    const error = new DataForSEOError('Test error', 400, false);
    expect(error.statusCode).toBe(400);
    expect(error.retryable).toBe(false);
  });

  describe('fromResponse', () => {
    it('should mark 429 as retryable', () => {
      const response = new Response('', { status: 429 });
      const error = DataForSEOError.fromResponse(response);
      expect(error.retryable).toBe(true);
    });
  });
});
```

### Async Testing Pattern

```typescript
describe('DataForSEO Client', () => {
  it('should handle retryable errors with backoff', async () => {
    // Mock fetch to simulate transient failure
    const attempts: number[] = [];

    // Test implementation
    await expect(getKeywordVolumes(['test'], { retries: 3 }))
      .rejects.toThrow(DataForSEOError);
  });

  it('should return keyword data on success', async () => {
    // Mock successful fetch response
    const result = await getKeywordVolumes(['test keyword']);

    expect(result).toHaveLength(1);
    expect(result[0].keyword).toBe('test keyword');
    expect(result[0].searchVolume).toBeGreaterThanOrEqual(0);
  });
});
```

### Error Testing Pattern

```typescript
describe('Error handling', () => {
  it('should distinguish retryable from non-retryable errors', () => {
    const retryable = DataForSEOError.fromAPIError(50000, 'Server error');
    const nonRetryable = DataForSEOError.fromAPIError(40000, 'Client error');

    expect(retryable.retryable).toBe(true);
    expect(nonRetryable.retryable).toBe(false);
  });

  it('should preserve stack trace', () => {
    const error = new DataForSEOError('Test', 400, false);
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('DataForSEOError');
  });
});
```

## Mocking Strategy (Once Implemented)

**Framework:** Vitest has built-in mocking via `vi` object

**Patterns:**
```typescript
import { vi, describe, it, beforeEach } from 'vitest';

// Mock fetch globally
global.fetch = vi.fn();

describe('API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should retry on 429 status', async () => {
    const fetchMock = vi.mocked(global.fetch);

    // First call: rate limited
    fetchMock.mockResolvedValueOnce(
      new Response('', { status: 429 })
    );

    // Second call: success
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ status_code: 20000 }))
    );

    // Should succeed after retry
    const result = await getKeywordVolumes(['test']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
```

**What to Mock:**
- External API calls (fetch)
- Database operations (getDatabase() returns mocked db)
- Environment variables (process.env)
- Timers (setTimeout, Date.now())

**What NOT to Mock:**
- Error classes (test actual error behavior)
- Data transformation functions (test actual logic)
- Validation logic (test actual constraints)

## Test Coverage Expectations

**Target:** 70% for critical modules

**High-Priority Coverage Areas:**
1. `/home/claude/bitbit/src/integrations/*/client.ts` - API retry logic, error handling
2. `/home/claude/bitbit/src/governance/circuit-breaker.ts` - Circuit breaker state transitions
3. `/home/claude/bitbit/src/db/repositories/tasks.ts` - Race condition prevention
4. `/home/claude/bitbit/src/briefing/aggregator.ts` - Data aggregation logic

**Lower-Priority (can be lower coverage):**
- Configuration files
- Data type definitions
- Logging utilities (manual verification acceptable)

## Running Tests

**Commands (once framework added):**
```bash
npm run test              # Run all tests
npm run test -- --watch  # Watch mode
npm run test:coverage    # Generate coverage report
npm run test -- src/integration/dataforseo  # Test specific module
```

## Integration Testing Opportunities

**Key Integration Points:**
- Database transactions (task pickup race condition)
- Circuit breaker + actual API client integration
- Multi-skill task aggregation in daily briefing
- Health check status calculation

**Example Integration Test:**
```typescript
describe('Task Processing Integration', () => {
  it('should prevent task race conditions', async () => {
    // Insert test task
    const task = createTask('rd_scout', 'test', '{}');

    // Simulate concurrent pickup attempts
    const [result1, result2] = await Promise.all([
      getNextPendingTask(),
      getNextPendingTask(),
    ]);

    // Only one should succeed
    expect((result1 === null) !== (result2 === null)).toBe(true);
  });
});
```

## Test Data / Fixtures

**Location (when needed):** `test/fixtures/` or `src/test-utils/`

**Pattern:**
```typescript
// src/integrations/dataforseo/fixtures.ts
export const mockKeywordResponse = {
  version: '1.0',
  status_code: 20000,
  tasks: [{
    status_code: 20000,
    result: [{
      keyword: 'test',
      keyword_info: {
        search_volume: 1000,
        competition: 0.5,
        competition_level: 'MEDIUM',
      },
    }],
  }],
};
```

## Pre-Commit Hooks (Recommended)

**Tool:** husky + lint-staged

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged",
      "pre-push": "npm run test"
    }
  },
  "lint-staged": {
    "src/**/*.ts": ["eslint --fix", "prettier --write"]
  }
}
```

---

*Testing analysis: 2026-02-19*

**Note:** This document describes recommended testing practices and patterns. Currently, the codebase has no automated tests. Implementing a test suite would significantly improve code quality and prevent regressions.
