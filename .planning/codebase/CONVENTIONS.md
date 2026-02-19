# Coding Conventions

**Analysis Date:** 2026-02-19

## Naming Patterns

**Files:**
- Descriptive kebab-case for modules: `circuit-breaker.ts`, `pii-redactor.ts`, `rate-limiter.ts`
- Index files: `index.ts` as barrel exports for modules
- Type definition files: `types.ts` for domain types
- Configuration files: `config.ts` for module-specific configuration
- Service/utility files: `service.ts`, `client.ts`, `webhook.ts`, `scheduler.ts`

**Functions:**
- camelCase for all functions: `createTask`, `getNextPendingTask`, `formatUptime`
- Descriptive verbs as prefixes: `get*`, `create*`, `aggregate*`, `check*`, `format*`
- Internal functions prefixed with underscore rarely (most internal functions have full names)
- Async functions use `async function` keyword and return `Promise<T>`

**Variables:**
- camelCase for all variables and parameters: `skillId`, `clickupId`, `locationCode`
- Constants use SCREAMING_SNAKE_CASE: `VERSION`, `PORT`, `DEFAULT_DATAFORSEO_CONFIG`
- Underscore prefix for unused parameters allowed via eslint rule: `_req`, `_res`

**Types:**
- PascalCase for interfaces: `DataForSEOError`, `HealthResponse`, `SystemHealth`
- PascalCase for type aliases: `AlertSeverity`, `LogLevel`
- Unions and literal types: inline where used

## Code Style

**Formatting:**
- No explicit Prettier config detected; uses default prettier formatting
- TypeScript strict mode enabled in `tsconfig.json`
- Target: ES2022, module resolution: NodeNext
- 2-space indentation (observed in all files)

**Linting:**
- Tool: ESLint with TypeScript support (`typescript-eslint`)
- Config file: `/home/claude/bitbit/eslint.config.js`
- Extends: ESLint recommended + TypeScript recommended configs

**Key ESLint Rules:**
- `@typescript-eslint/no-unused-vars`: warn, allows args/vars prefixed with `_`
- `@typescript-eslint/no-explicit-any`: warn (any is allowed with warning)
- `@typescript-eslint/explicit-function-return-type`: off (return types inferred)
- `@typescript-eslint/no-non-null-assertion`: warn (non-null assertions allowed with warning)

## Import Organization

**Order:**
1. Node.js builtins: `import { ... } from 'node:http'`, `import { randomUUID } from 'node:crypto'`
2. Third-party packages: `import { ... } from '@anthropic-ai/sdk'`, `import { ... } from '@supabase/supabase-js'`
3. Local absolute imports: `import { getDatabase } from '../db/index.js'`
4. Relative imports: `import type { Task } from './types.js'`
5. Type imports separated: `import type { ... } from '...'`

**Path Aliases:**
- Not in use; uses relative paths throughout codebase
- Files import using `from './index.js'`, `from '../db/index.js'` patterns
- Always includes `.js` extension for ES modules

## Error Handling

**Patterns:**
- Custom error classes for domain-specific errors: `DataForSEOError`, `ScraperAPIError`
- Custom error classes extend `Error` and include status codes and retry metadata
- `throw new Error(message)` for generic errors without retry logic
- Error instanceof checks for specific handling (e.g., `if (error instanceof DataForSEOError)`)
- Catch blocks with generic `catch` or `catch (error)` syntax
- Try-catch for synchronous operations; try-catch in async functions

**Error Factory Methods:**
- Custom errors include static factory methods: `DataForSEOError.fromResponse()`, `DataForSEOError.fromAPIError()`
- Stack trace preservation: `Error.captureStackTrace?.(this, ClassName)` in constructors

**Example:**
```typescript
// Custom error class pattern
export class DataForSEOError extends Error {
  public readonly statusCode: number;
  public readonly retryable: boolean;

  constructor(message: string, statusCode: number, retryable: boolean = false) {
    super(message);
    this.name = 'DataForSEOError';
    this.statusCode = statusCode;
    this.retryable = retryable;
    Error.captureStackTrace?.(this, DataForSEOError);
  }

  static fromResponse(response: Response): DataForSEOError {
    const retryable = response.status === 429 || response.status >= 500;
    return new DataForSEOError(`Request failed: ${response.status}`, response.status, retryable);
  }
}
```

## Logging

**Framework:** Custom safe logger using `createSafeLogger()` function from `/home/claude/bitbit/src/governance/logger.ts`

**Patterns:**
- All loggers created via: `const logger = createSafeLogger('ModuleName')`
- Logger methods: `logger.debug()`, `logger.info()`, `logger.warn()`, `logger.error()`
- Log format: `[ISO_TIMESTAMP] [LEVEL] [MODULE_PREFIX] message [data]`
- All logs automatically PII-redacted before output
- Debug logging gated by `process.env.DEBUG` flag

**Logging Guidelines:**
- Use `logger.info()` for significant state changes: `logger.info('Task created: ${id}')`
- Use `logger.debug()` for detailed operation info: `logger.debug('Requesting ${count} keywords')`
- Use `logger.warn()` for non-critical issues: `logger.warn('Task ${id} failed')`
- Use `logger.error()` for critical errors: `logger.error('Database initialization failed')`
- Include context in logs: task IDs, counts, status codes

**Example:**
```typescript
const logger = createSafeLogger('DataForSEO');
logger.info(`Retrying in ${delay}ms...`);
logger.debug(`${method}: ${url.substring(0, 100)}... (attempt ${attempt}/${maxRetries})`);
logger.error('DataForSEO credentials not configured');
```

## Comments

**When to Comment:**
- File-level JSDoc comments explaining module purpose and usage
- Function comments with `@param`, `@returns`, `@throws`, `@see` tags
- Inline comments for non-obvious logic or workarounds
- Comments explain WHY, not WHAT (code should be readable enough for WHAT)
- Comments before complex algorithm sections

**JSDoc/TSDoc:**
- Comprehensive JSDoc on public functions and exported items
- Function documentation includes `@param`, `@returns`, `@throws` tags
- Links to external docs via `@see` tags (e.g., API documentation URLs)
- Type parameters documented
- Optional parameters documented

**Example:**
```typescript
/**
 * Health check endpoint handler
 *
 * Returns system health status for Fly.io health checks
 * and monitoring endpoints.
 *
 * @param _req - Incoming HTTP request (unused)
 * @param res - HTTP response object
 * @throws Error if database query fails
 */
export function healthCheck(_req: IncomingMessage, res: ServerResponse): void {
  // implementation
}
```

## Function Design

**Size:**
- Functions typically 20-60 lines
- Larger functions (100+ lines) broken into smaller helpers
- Example: `getKeywordVolumesInternal()` in client.ts is 150 lines with retry logic, but backed by 6-10 line helper functions

**Parameters:**
- Prefer object parameters for functions with multiple options
- Example: `options: { maxBudgetUsd: number; maxTurns: number; allowedTools: string[] }`
- Use destructuring in function bodies for clarity

**Return Values:**
- Async functions return `Promise<T>`
- Functions return data or null: `Promise<Task | null>`
- Functions returning errors throw rather than return error objects (except in circuit breakers)
- Functions with side effects still return meaningful values

**Example:**
```typescript
export async function executeClickUpQuery(
  prompt: string,
  options?: Partial<QueryOptions>
): Promise<QueryResult> {
  // implementation
}
```

## Module Design

**Exports:**
- Barrel exports in `index.ts` files for modules
- Public APIs exported from barrel files only
- Internal functions kept private (no export)
- Types exported for public use

**Barrel Files:**
- Located at `/home/claude/bitbit/src/governance/index.ts` and similar
- Group related exports logically with comments
- Example: governance module exports PII redaction, logging, rate limiting, control plane, circuit breakers

**Example Barrel File:**
```typescript
// PII Redaction
export { redact, redactObject } from './pii-redactor.js';

// Safe Logging
export { createSafeLogger, logSafe } from './logger.js';

// Rate Limiting
export { checkRateLimit } from './rate-limiter.js';
```

## TypeScript Configuration

**Compiler Options (from `tsconfig.json`):**
- `target`: ES2022
- `module`: NodeNext
- `moduleResolution`: NodeNext
- `strict`: true (all strict checks enabled)
- `esModuleInterop`: true
- `declaration`: true (emit .d.ts files)
- `sourceMap`: true (for debugging)

---

*Convention analysis: 2026-02-19*
