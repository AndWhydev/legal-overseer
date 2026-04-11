# Codebase Concerns

**Analysis Date:** 2026-02-19

## Tech Debt

**Unimplemented DataForSEO Balance Checking:**
- Issue: `getAccountBalance()` function is stubbed and returns null
- Files: `src/integrations/dataforseo/client.ts` (line 375-383)
- Impact: Cannot monitor API cost consumption or detect budget exhaustion, leading to unexpected service disruptions
- Fix approach: Implement the DataForSEO `/v3/appendix/user_data` endpoint integration to query account balance and remaining credits

**macOS File Artifacts in Source Tree:**
- Issue: Numerous `._*` and `.*` hidden files (macOS metadata) committed to repository
- Files:
  - `src/integrations/xero/._draft.ts`
  - `src/integrations/xero/._client.ts`
  - `src/briefing/._alerts.ts`
  - `src/briefing/._scheduler.ts`
  - `src/db/migrations/._*.ts` (6+ files)
  - `src/db/._migrations/`, `src/db/._repositories/`
  - `src/agent/._executor.ts`, `src/agent/._coordinator.ts`
- Impact: Pollutes repository with system files, complicates version control diffs, adds ~40KB of junk
- Fix approach: Add to .gitignore (`._*`, `.AppleDouble`, `.DS_Store`), then remove from git history with BFG or interactive rebase

## Missing Critical Features

**DataForSEO Cost Monitoring:**
- Problem: No mechanism to track or limit API spending on DataForSEO calls
- Blocks: Cost-sensitive operations, budget compliance, preventing runaway expenses
- Files: `src/integrations/dataforseo/client.ts`
- Risk: Unlimited API calls could rapidly consume allocated budget without visibility

**Graceful Degradation for Optional Integrations:**
- Problem: Webhook endpoints fail with 503 when secrets aren't configured (lines 115-121, 101-105)
- Blocks: Running in degraded mode with some integrations disabled
- Files:
  - `src/integrations/clickup/webhook.ts` (line 115-121)
  - `src/telegram/webhook.ts` (line 101-105)
- Risk: Service becomes unavailable instead of accepting requests with reduced functionality

## Test Coverage Gaps

**No Unit Tests for Core Logic:**
- What's not tested:
  - `src/agent/processor.ts` (348 lines) - Task processing loop and risk classification
  - `src/skills/rd-scout/pipeline.ts` (389 lines) - Research pipeline orchestration
  - `src/governance/control-plane.ts` (386 lines) - Governance gate and decision logic
  - `src/db/repositories/trustScores.ts` (353 lines) - Trust calculation algorithm
- Files: Zero test files found in `src/` directory (0 `.test.ts` or `.spec.ts` files)
- Risk: Critical agent decision-making untested; bugs in task processing, model selection, and trust scoring could propagate to production
- Priority: HIGH - Agent autonomy decisions are irreversible

**No Integration Tests:**
- What's not tested: DataForSEO API interactions, ClickUp webhooks, Telegram command handling
- Risk: External service integration failures only caught at runtime
- Priority: HIGH - External API failures could cascade through system

**No E2E Tests:**
- What's not tested: Full task execution workflow from webhook through skill execution to completion
- Risk: Unknown failure modes when systems interact

## Fragile Areas

**Large Monolithic Files Without Clear Separation:**
- Files:
  - `src/skills/rd-scout/reports/template.ts` (589 lines) - Single file with all HTML generation
  - `src/skills/rd-scout/scrapers/alibaba.ts` (442 lines) - Mixed scraping logic and data mapping
  - `src/skills/rd-scout/scrapers/amazon.ts` (329 lines) - Amazon scraper logic
  - `src/integrations/dataforseo/client.ts` (383 lines) - Client + auth + retry logic bundled
- Why fragile: Changes to one aspect (e.g., HTML styling) require understanding entire file; hard to unit test; difficult to reuse logic
- Safe modification: Extract concerns into separate modules (e.g., `template-renderer.ts`, `scraper-base.ts`) before making changes
- Test coverage: No tests to verify refactoring doesn't break behavior

**Xero Draft Bill Creation with Hardcoded Defaults:**
- Files: `src/integrations/xero/draft.ts` (line 74)
- Issue: `XERO_DEFAULT_ACCOUNT_CODE` hardcoded to '400' (purchases) with no validation that account exists or is appropriate
- Why fragile: If Xero chart of accounts differs between tenants, bills silently post to wrong account
- Safe modification:
  1. Add validation that account code exists in target Xero organization
  2. Make account code configurable per supplier or organization
  3. Add audit logging of account code used
- Test coverage: No validation tests for account code handling

**Webhook Signature Verification Timing:**
- Files: `src/integrations/clickup/webhook.ts` (line 65-75)
- Issue: Uses constant-time comparison but still has length check first (timing side-channel possible)
- Why fragile: Signature bypass possible if timing correlates with signature length
- Safe modification: Remove length check; constant-time comparison handles mismatched lengths
- Current code still has safety but not optimal

**Task Retry Logic Missing Exponential Backoff:**
- Files: `src/db/repositories/tasks.ts` (line 82-112)
- Issue: `getNextPendingTask()` will re-try failed tasks immediately without delay
- Impact: Failed tasks hammer external services, cause cascading failures
- Fix approach: Add `retry_delay_until` column to defer task retry; implement exponential backoff in task selection

## Scaling Limits

**Database Connection Pool Not Visible:**
- Files: `src/db/connection.ts`
- Current capacity: Unknown (using better-sqlite3 default)
- Limit: better-sqlite3 is single-threaded; no connection pooling
- Scaling path: For high-concurrency workloads, migrate to SQL.js or pooled connection via `sql.js` + worker threads, or switch to libsql (Turso) with connection pooling

**Circuit Breaker Config Not Tunable Per-Service:**
- Files: `src/governance/circuit-breaker.ts` (line 84)
- Current: Hardcoded defaults (3s timeout, 50% error threshold, 5 request minimum)
- Limit: DataForSEO (slow) and Xero (fast) both use same timeout; inappropriate thresholds cause premature circuit opens
- Scaling path: Make circuit breaker config env-var per service name; add metrics for tuning

**In-Memory Circuit Breaker Registry:**
- Files: `src/governance/circuit-breaker.ts` (line 63)
- Issue: `BREAKERS` map stored in memory; lost on process restart
- Limit: Stats and recovery history not persisted across restarts
- Scaling path: Persist breaker state to database or Redis; replay state on startup

## Performance Bottlenecks

**Alibaba Scraper Sequential Requests:**
- Problem: Alibaba scraper (`src/skills/rd-scout/scrapers/alibaba.ts`) appears to fetch products sequentially
- Files: `src/skills/rd-scout/scrapers/alibaba.ts`
- Cause: No visible parallelization; each product requires separate request
- Improvement path: Batch requests or use concurrent request queuing with rate limiting

**Template Generation With String Concatenation:**
- Problem: Report HTML generated via massive string template in `src/skills/rd-scout/reports/template.ts` (589 lines)
- Files: `src/skills/rd-scout/reports/template.ts`
- Cause: Inline styles + dynamic data + hardcoded HTML structure all in one function
- Improvement path: Use template engine (handlebars, EJS) or move to React Server Components for better maintainability and reuse

**No Caching of SEO Trend Analysis:**
- Problem: SEO keyword trends fetched every time pipeline runs, even if data is fresh
- Files: `src/skills/rd-scout/trends/seo.ts`
- Impact: Unnecessary DataForSEO API calls consuming budget and adding latency
- Improvement path: Cache results for 24-48 hours; invalidate on manual trigger

## Dependencies at Risk

**@anthropic-ai/sdk Version Pinning:**
- Risk: Using `^0.74.0` (allows up to < 1.0.0); breaking changes possible with minor version bumps
- Impact: Unexpected API changes in model selection, tool definitions, or response formats
- Migration plan: Pin to exact version `0.74.0`, test new versions in separate branch before upgrading

**Xero Node SDK Version Unknown:**
- Risk: Version not visible in provided package.json
- Impact: Could have security vulnerabilities or deprecated endpoints
- Recommendation: Audit current version, consider pinning to tested version

## Security Considerations

**Webhook Secret Verification Graceful Degradation Risk:**
- Risk: Service returns 503 instead of rejecting unsigned webhooks
- Files: `src/integrations/clickup/webhook.ts` (line 116-119), `src/telegram/webhook.ts` (line 101-105)
- Current mitigation: Logs warning, returns 503 to prevent retries
- Recommendations:
  1. Add configuration validation on startup to fail early if secrets missing in production
  2. Add environment-specific checks (e.g., require secrets in production only)
  3. Add metrics for unconfigured webhooks to alert ops

**No Rate Limiting on Public Endpoints:**
- Files: `src/index.ts` (line 27-64) - Simple router with no rate limiting
- Risk: Webhook endpoints (`/clickup/webhook`, `/telegram/*`) vulnerable to DoS
- Recommendations:
  1. Add rate limiter middleware using `src/governance/rate-limiter.ts`
  2. Implement per-endpoint limits (e.g., 100 req/min per webhook)
  3. Add backpressure handling for overload scenarios

**PII Redaction in Logs Missing Coverage:**
- Files: `src/governance/pii-redactor.ts`
- Risk: Email addresses, phone numbers, bank details logged in plaintext if not caught by redactor
- Coverage gaps:
  - Australian phone number pattern regex on line 60 only matches landlines (0X XXXX XXXX), misses mobiles
  - No regex for Australian ABN/ACN numbers
  - No regex for credit card patterns
- Recommendations: Expand redaction patterns, add tests for common Australian financial data formats

**Trust Score Calculation No Input Validation:**
- Files: `src/db/repositories/trustScores.ts`
- Risk: Division by zero or negative counts could cause calculation errors leading to incorrect autonomy levels
- Recommendations: Add assertions for non-negative counts and valid reliability scores before calculation

## Known Bugs

**Timezone Handling Inconsistent:**
- Symptoms: Created timestamps stored in UTC (ISO 8601) but displayed in local time without conversion
- Files: `src/db/repositories/tasks.ts`, `src/governance/logger.ts` - timestamp generation
- Trigger: Check logs at different timezones; timestamps appear to jump
- Workaround: Always interpret timestamps as UTC

**Task Status Transitions Not Validated:**
- Symptoms: Tasks could be marked as failed then later marked as completed, overwriting error state
- Files: `src/db/repositories/tasks.ts`
- Trigger: Concurrent updates to same task ID (though transactions prevent most race conditions)
- Cause: No check that new status is valid given current status
- Fix: Add status transition validation function before updates

