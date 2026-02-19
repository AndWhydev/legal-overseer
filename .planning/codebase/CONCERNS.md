# Codebase Concerns

**Analysis Date:** 2026-02-19

## Tech Debt

**Unimplemented API Features:**
- Issue: DataForSEO balance checking endpoint is stubbed but not implemented
- Files: `src/integrations/dataforseo/client.ts` (line 379)
- Impact: Cannot monitor API credit usage or predict when credits will run out. Risk of silent failures when balance reaches zero.
- Fix approach: Implement the `getAccountBalance()` function to call `GET https://api.dataforseo.com/v3/appendix/user_data` and expose balance monitoring in the control plane or alerts system.

**Orphaned Backup Files in Codebase:**
- Issue: Multiple `._*.ts` files present in `src/skills/rd-scout/` directory (e.g., `._types.ts`, `._index.ts`, `._cross-reference.ts`)
- Files: `src/skills/rd-scout/scrapers/._types.ts`, `src/skills/rd-scout/analysis/._index.ts`, `src/skills/rd-scout/reports/._types.ts`, and others
- Impact: File bloat, potential confusion about which files are active. These appear to be Mac OS resource forks or backup files.
- Fix approach: Remove all `._*.ts` files from the repository. These are likely generated artifacts from file operations on macOS and should not be committed.

**Large Monolithic Files:**
- Issue: Several files exceed 380+ lines, suggesting consolidated responsibilities
- Files affected:
  - `src/skills/rd-scout/reports/template.ts` (589 lines) - Report template generation
  - `src/skills/rd-scout/scrapers/alibaba.ts` (442 lines) - Alibaba scraping logic
  - `src/skills/rd-scout/pipeline.ts` (389 lines) - Pipeline orchestration
  - `src/governance/control-plane.ts` (386 lines) - Governance logic
  - `src/telegram/notifications.ts` (384 lines) - Notification system
- Impact: Difficult to test, reason about, and maintain. High risk of introducing bugs during refactoring.
- Fix approach: Break down largest files into smaller modules by concern (e.g., split template.ts by report section type, split control-plane.ts by responsibility domain).

---

## Known Bugs

**Unhandled JSON Parsing in Task Processor:**
- Issue: `processNextTask()` parses `task.input_json` without try-catch
- Files: `src/agent/processor.ts` (line 88)
- Code: `const input = task.input_json ? JSON.parse(task.input_json) : {};`
- Trigger: Malformed JSON in `input_json` column of tasks table
- Impact: Crashes task processor loop, stops all task processing until restart
- Workaround: Ensure database constraints or validation before inserting tasks. Monitor error logs.
- Fix approach: Wrap JSON.parse in try-catch, mark task as failed with error message if parsing fails.

**Alibaba HTML Parsing Relies on Fragile Regex Patterns:**
- Issue: Alibaba scraper uses regex fallback after JSON-LD parsing fails
- Files: `src/skills/rd-scout/scrapers/alibaba.ts` (lines 165-200+)
- Pattern: `/div[^>]*class="[^"]*organic-list[^"]*"` and similar patterns
- Trigger: Alibaba changes HTML structure or class names
- Impact: Scraper silently returns empty results when patterns don't match. No error raised, just silent failure.
- Workaround: Monitor scraping results; if many tasks return zero Alibaba products, HTML structure likely changed.
- Fix approach: Add logging when regex patterns fail to match. Implement fallback to alternative selectors or page structure detection.

**Missing Error Handling in Skill Execution Default Path:**
- Issue: `classifyTask()` defaults to 'general' skill when classification fails
- Files: `src/agent/coordinator.ts` (lines 97-105)
- Code: Returns hardcoded general task without escalating the error
- Trigger: Invalid JSON from classifier, API timeout, or classifier response format change
- Impact: Tasks are silently downgraded to 'general' skill even if they require specialized handling. No audit trail of the failure.
- Workaround: Monitor task success rates by skill type. 'general' skill tasks with high error rates indicate classifier issues.
- Fix approach: Log the original error and returned default explicitly. Consider failing the task instead of silently downgrading.

---

## Security Considerations

**Environment Variable Exposure Risk:**
- Risk: Multiple environment variables read throughout codebase without centralized validation
- Files affected: 76 occurrences across 28 files including:
  - `src/index.ts` - `PORT`, `ENABLE_TASK_PROCESSOR`, `ANTHROPIC_API_KEY`, `TASK_POLL_INTERVAL`
  - `src/integrations/dataforseo/client.ts` - `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`
  - `src/integrations/scraperapi/client.ts` - `SCRAPERAPI_KEY`
  - `src/governance/circuit-breaker.ts` - `TELEGRAM_ADMIN_CHAT_ID`
- Current mitigation: Logging module has PII redaction (`src/governance/logger.ts`), but PII redaction only covers known patterns (emails, phones, SSNs, IPs)
- Recommendations:
  - Centralize all environment variable reading into a single `src/config/env.ts` file with validation
  - Use schema validation (zod) to ensure all required vars are present and type-correct
  - Ensure all API keys default to safe values or throw early if missing
  - Audit PII redaction patterns to include API key formats (base64, sk-*, etc.)

**Credentials in Error Messages:**
- Risk: API error messages may leak credentials or sensitive data
- Files affected: All external API clients (`src/integrations/`)
- Mitigation needed: Redact error messages before logging
- Fix approach: Implement `sanitizeErrorMessage()` utility that redacts common secret patterns before error logging.

**Control Plane Singleton Not Thread-Safe:**
- Risk: Agent control plane is a singleton with mutable state that could be accessed concurrently
- Files: `src/governance/control-plane.ts` (lines 69-77)
- State: `globalKillSwitch`, `agentEnabled`, `recentActions` maps
- Trigger: Multiple concurrent task processors or API requests
- Impact: Race conditions on state checks could allow blocked actions to execute
- Current mitigation: better-sqlite3 uses WAL mode and foreign keys enabled, but JavaScript is single-threaded. Node.js event loop may not guarantee atomicity.
- Recommendations: Add explicit locking mechanism or ensure all state mutations are atomic database operations rather than in-memory.

---

## Performance Bottlenecks

**Blocking JSON Parsing in Scrapers:**
- Problem: Alibaba scraper uses synchronous JSON parsing in a loop during HTML parsing
- Files: `src/skills/rd-scout/scrapers/alibaba.ts` (line 133)
- Code: `const data = JSON.parse(jsonLdMatch[1])` inside while loop
- Current capacity: Can handle ~100-200 products per scrape, but performance degrades with larger pages
- Cause: JSON parsing happens on every JSON-LD block found in HTML, and malformed JSON is silently caught
- Improvement path:
  - Cache parsed JSON-LD results to avoid reparsing
  - Use streaming JSON parser for large documents
  - Profile actual parsing time with real Alibaba HTML

**API Rate Limiting Not Coordinated Across Skills:**
- Problem: Rate limiter is per-action, but multiple skills may hit same external API simultaneously
- Files: `src/governance/rate-limiter.ts`, multiple skill implementations
- Current capacity: 20 high-risk requests/hour, but no request pooling or batching
- Cause: Each skill independently calls external APIs without coordinating on shared rate limits
- Scaling path:
  - Implement request queue per external API with adaptive rate limiting
  - Track actual API response times to predict failures earlier
  - Add API credit/cost estimation before executing requests

**Circuit Breaker Timeout Too Long for Some Endpoints:**
- Problem: ScraperAPI circuit breaker has 30 second timeout
- Files: `src/integrations/scraperapi/client.ts` (line 192)
- Current threshold: 30000ms, but this may cause cascading failures if many concurrent scrapes timeout
- Improvement path: Reduce timeout to 15-20 seconds and implement request queuing instead of parallel scraping

---

## Fragile Areas

**HTML Parsing Architecture:**
- Files: `src/skills/rd-scout/scrapers/alibaba.ts`, `src/skills/rd-scout/scrapers/amazon.ts`
- Why fragile: Relies on regex patterns and JSON-LD extraction from HTML. No parsing library used. Direct dependency on external site structure.
- Safe modification:
  - Add comprehensive logging when patterns fail to match
  - Implement version detection or hash-based structure validation
  - Create test fixtures with real HTML samples from target sites
  - Add fallback detection that alerts on structure changes
- Test coverage: No unit tests found for scraper logic. Integration tests would need live site access.

**Price Parsing Logic:**
- Files: `src/skills/rd-scout/scrapers/alibaba.ts` (line 74), `src/skills/rd-scout/scrapers/amazon.ts` (line 153)
- Why fragile: Hardcoded currency symbol stripping and regex patterns. Different currencies/formats not handled.
- Example: `priceText.replace(/[^\d.\-–]/g, ' ')` assumes Western numerals and specific dash types
- Safe modification:
  - Add explicit currency detection before parsing
  - Handle international number formats (e.g., European 1.000,00)
  - Create comprehensive test suite with real pricing data from multiple regions
  - Log when price parsing fails instead of silently returning 0

**Database Transaction Race Condition in Task Pickup:**
- Files: `src/db/repositories/tasks.ts` (line 81+)
- Why fragile: `getNextPendingTask()` marks tasks as 'running' in a transaction, but if two processors call simultaneously, one succeeds and one gets null silently
- Safe modification:
  - Verify transaction isolation level is SERIALIZABLE
  - Add retry logic with exponential backoff for failed pickups
  - Add audit trail of task pickup attempts
  - Monitor for tasks that stay 'running' forever (hung processors)

---

## Scaling Limits

**SQLite Concurrency Bottleneck:**
- Current capacity: SQLite WAL mode allows multiple readers and one concurrent writer
- Limit: If multiple task processors run simultaneously, write contention will create slowdown at ~10+ writers
- Scaling path:
  - Migrate to PostgreSQL or similar for true concurrent writes (at 50+ task processors)
  - Implement connection pooling and prepared statement caching
  - Add indexes on frequently queried columns (status, skill_id, created_at)

**External API Credit Depletion Unmonitored:**
- Current capacity: ScraperAPI and DataForSEO are quota-based. No cost tracking or alerts.
- Limit: Unimplemented `getAccountBalance()` means no proactive warning before hitting limits
- Scaling path:
  - Implement cost tracking per skill and per request
  - Add predictive alerts when burn rate suggests depleting quota within N days
  - Implement request budgeting per skill (e.g., max 100 Amazon scrapes/day)
  - Add cost comparison to decide when to use cached vs. fresh data

**In-Memory Rate Limiter State Not Persistent:**
- Current capacity: `rate-limiter-flexible` stores state in-memory only
- Limit: If process restarts, all rate limit state is lost. No way to coordinate rate limits across multiple instances.
- Scaling path:
  - Migrate rate limiter state to Redis or database
  - Implement distributed rate limiting for multi-instance deployments
  - Add metrics export to monitor limit consumption

---

## Dependencies at Risk

**Unspecified Node.js Version:**
- Risk: No `.nvmrc` file and `package.json` engines field not visible in package contents
- Impact: Developers may use incompatible Node versions, causing build failures or runtime issues
- Migration plan: Add `.nvmrc` file pinning to specific LTS version (e.g., 20.11.0). Add `engines` field to `package.json`.

**Stale Model Versions in Coordinator:**
- Risk: Hardcoded model IDs may become outdated
- Files: `src/agent/coordinator.ts` (lines 44-48)
- Models:
  - `claude-haiku-3-5-20241022` (October 2024)
  - `claude-sonnet-4-20250514` (May 2025)
  - `claude-opus-4-5-20250514` (May 2025)
- Impact: If models are deprecated/removed, all task classification and execution fails
- Migration plan: Externalize model selection to environment variables. Implement model availability fallback logic.

---

## Test Coverage Gaps

**No Unit Tests for Core Scrapers:**
- Untested functionality: HTML parsing logic, price extraction, product matching
- Files: `src/skills/rd-scout/scrapers/alibaba.ts`, `src/skills/rd-scout/scrapers/amazon.ts`
- Risk: Regex pattern failures, malformed price data, missing fields cause silent data loss
- Priority: High - These are critical external data sources
- Approach: Create fixture-based tests with real HTML samples. Mock ScraperAPI responses.

**No Tests for Control Plane Decision Logic:**
- Untested functionality: Governance gate checks, rate limiting, anomaly detection
- Files: `src/governance/control-plane.ts`, `src/governance/rate-limiter.ts`, `src/governance/anomaly-detector.ts`
- Risk: Incorrect permission checks could allow unauthorized actions. Rate limits could be bypassed.
- Priority: Critical - Security-critical code path
- Approach: Unit tests for each check function. Integration tests verifying kill switch blocks all actions.

**No Tests for Task State Transitions:**
- Untested functionality: Task pickup, completion, failure, retry logic
- Files: `src/db/repositories/tasks.ts`, `src/agent/processor.ts`
- Risk: Tasks could get stuck in invalid states (running forever, duplicate processing, orphaned tasks)
- Priority: High - Affects system reliability
- Approach: State machine tests covering all valid transitions and rejecting invalid ones.

**No Tests for PII Redaction:**
- Untested functionality: Pattern-based redaction of sensitive data
- Files: `src/governance/pii-redactor.ts`
- Risk: Sensitive patterns not in regex list could leak to logs (API keys, tokens, new PII types)
- Priority: Critical - Security and compliance
- Approach: Unit tests with comprehensive test data (emails, phones, SSNs, IPs, API keys, credit cards). Regression tests for any new patterns added.

**No Integration Tests for End-to-End Pipeline:**
- Untested flows: Full task from input → classification → execution → result storage
- Risk: Failures in integration points (database writes after skill execution, concurrent access) only caught in production
- Priority: High
- Approach: Integration tests with real database and mocked external APIs. Test both success and failure paths.

**No Load/Stress Tests:**
- Untested capacity: System behavior under sustained high request load
- Risk: Discover bottlenecks, race conditions, and resource leaks only in production
- Priority: Medium - Important before scaling
- Approach: Load tests targeting 100+ concurrent tasks, 10+ simultaneous scrapers, sustained API calls over 24 hours.

---

## Missing Critical Features

**No Cost Monitoring or Budget Alerts:**
- Problem: DataForSEO, ScraperAPI, and Anthropic API charges are not tracked or budgeted
- Blocks: Cannot prevent accidental spending spikes. No way to enforce daily/monthly spending limits.
- Priority: High
- Approach:
  - Implement cost tracking per skill and per request
  - Add cost estimation before execution (e.g., "This scrape will cost $0.12")
  - Implement request budget per skill with daily resets
  - Send alerts when cumulative costs exceed threshold

**No Dead Letter Queue for Failed Tasks:**
- Problem: Tasks that fail are marked as failed but never retried. No human inspection queue.
- Blocks: Cannot recover from transient failures. Cannot debug failed tasks.
- Priority: Medium
- Approach:
  - Implement exponential backoff retry with configurable max attempts
  - Create manual review queue for failed tasks with detailed error context
  - Add task re-submission API for ops team

**No Request Validation Before Execution:**
- Problem: Task inputs are JSON.parse'd without validation against task schema
- Blocks: Invalid inputs can cause skill execution errors. No clear error feedback to submitter.
- Priority: Medium
- Approach:
  - Define input schema per skill using Zod
  - Validate task input before marking as running
  - Return validation errors to task submitter if possible

**No Observability Dashboard:**
- Problem: No centralized view of agent health, request rates, error rates, cost
- Blocks: Cannot quickly diagnose issues in production. No metrics for performance optimization.
- Priority: Medium-High
- Approach:
  - Export metrics to Prometheus (request counts, error rates, latencies, cost)
  - Build Grafana dashboards for real-time monitoring
  - Set up alerts for error rate spikes, slow requests, cost overruns

---

*Concerns audit: 2026-02-19*
