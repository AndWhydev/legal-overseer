# External Integrations

**Analysis Date:** 2026-02-19

## APIs & External Services

**Agentic & LLM:**
- Claude API (Anthropic) - Agent loop, tool calling, model decisions
  - SDK: @anthropic-ai/sdk 0.74.0
  - Auth: `ANTHROPIC_API_KEY` environment variable
  - Used in: `src/agent/index.ts`, task processor

**Workflow & Task Management:**
- ClickUp - Project management, task tracking, workflow automation
  - MCP Server: @taazkareem/clickup-mcp-server (spawned as subprocess)
  - Auth: `CLICKUP_API_KEY`, `CLICKUP_TEAM_ID`, `CLICKUP_MCP_LICENSE_KEY`
  - Implementation: `src/integrations/clickup/`
  - Tools enabled: task CRUD, comments, workspace hierarchy queries
  - Webhook: `POST /clickup/webhook` receives task status updates
  - Webhook secret verification: `CLICKUP_WEBHOOK_SECRET` (HMAC-SHA256)

**Accounting & Invoicing:**
- Xero - Accounting, invoice creation, financial data
  - SDK: xero-node (OAuth 2.0 client)
  - Auth: `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI`
  - Token encryption: `XERO_TOKEN_ENCRYPTION_KEY` (AES-256-GCM, optional)
  - Token storage: SQLite `key_value_store` table (encrypted at rest when key set)
  - Scopes: `openid profile email accounting.transactions accounting.contacts offline_access`
  - Implementation: `src/integrations/xero/client.ts`
  - Capability: Draft invoice creation (NEVER AUTHORISED per spec)
  - Circuit breaker: 10s timeout, 50% error threshold, 30s reset
  - Handles token refresh automatically

**SEO & Research:**
- DataForSEO - Keyword research, search volume analysis, SEO trends
  - Client: HTTP Basic Auth (login:password base64 encoded)
  - Auth: `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`
  - Endpoint: `https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live/`
  - Implementation: `src/integrations/dataforseo/client.ts`
  - Rate limiting: Max 1000 keywords per request
  - Circuit breaker: 10s timeout, 50% error threshold, 30s reset
  - Retry logic: Exponential backoff (1s, 2s, 4s, ...) up to 3 attempts
  - Used by: R&D Scout skill (`src/skills/rd-scout/`)

**Web Scraping:**
- ScraperAPI - HTML scraping with proxy rotation, JavaScript rendering
  - Auth: `SCRAPERAPI_KEY` (API key in query params)
  - Endpoint: `https://api.scraperapi.com/structured/` and base endpoint
  - Implementation: `src/integrations/scraperapi/client.ts`
  - Features: Proxy rotation, render flag, country selection, session management
  - Circuit breaker: 30s timeout, 50% error threshold, 60s reset
  - Retry logic: Exponential backoff up to 3 attempts
  - Supports Structured Data Endpoints (Amazon, Google, etc.)

**Messaging & Notifications:**
- Telegram - User notifications, approvals, command interface
  - SDK: Custom bot implementation (Telegram Bot API via HTTP)
  - Auth: `TELEGRAM_BOT_TOKEN` (HTTP API token)
  - Webhook: `POST /telegram/*` receives Telegram updates
  - Webhook secret: `TELEGRAM_WEBHOOK_SECRET` (header validation)
  - Implementation: `src/telegram/bot.ts`, `src/telegram/webhook.ts`
  - Commands: `/emergency`, approval callbacks in `src/telegram/callbacks/`
  - Rate limiting: 10-second processing timeout per update

## Data Storage

**Databases:**
- SQLite (local file-based)
  - Connection: `better-sqlite3` package
  - Location: `/data/bitbit.db` (production via Fly.io mount), `./data/bitbit.db` (dev)
  - Environment variable: `DATABASE_PATH` (optional override)
  - Modes: WAL enabled for concurrency, foreign keys enabled
  - Client: `src/db/connection.ts` (singleton pattern)

**External Database:**
- Supabase (referenced in @bitbit/core dependencies)
  - SDK: @supabase/supabase-js 2.95.3
  - Usage pattern: Not yet fully integrated (likely future feature)
  - Connection: To be configured via environment variables (not yet documented)

**File Storage:**
- Local filesystem only
  - Database file: `/data` (Fly.io mounted volume)
  - No S3, GCS, or cloud storage integration

**Caching:**
- Redis: Not used
- In-memory: Circuit breaker state tracking only
- Persistent: SQLite key-value store for tokens and session data

## Authentication & Identity

**Auth Provider:**
- Custom implementation with service-specific OAuth:
  - Xero: OAuth 2.0 (authorization code flow with token refresh)
  - ClickUp: API key based
  - DataForSEO: HTTP Basic Auth
  - ScraperAPI: API key in query params
  - Telegram: Token-based (bot token)

**Approval Workflow:**
- Telegram-based human approvals
  - Environment: `AUTHORIZED_APPROVERS` list for command access
  - Admin notifications: `TELEGRAM_ADMIN_CHAT_ID` (integer chat ID)
  - Callbacks: `src/telegram/callbacks/approval.ts`
  - Use case: Operations officer approval for sensitive agent actions

## Monitoring & Observability

**Error Tracking:**
- Circuit breaker system - Custom implementation for external API resilience
  - Used for: Xero, DataForSEO, ScraperAPI
  - Metrics tracked: State (closed/open/half-open), failure count, request count
  - Exported in health check: `src/api/health.ts`

**Logs:**
- Custom safe logger (`src/governance/logger.ts`)
  - Debug mode: Enabled via `DEBUG` environment variable
  - Output: stderr with timestamps
  - No external logging service (local only)

**Health Checks:**
- Endpoint: `GET /health` (HTTP 200/503)
- Checks:
  - Database connectivity
  - ClickUp configuration status
  - Governance system state (kill switch, disabled agents)
  - Circuit breaker states for all external APIs
  - Uptime and version info

## CI/CD & Deployment

**Hosting:**
- Fly.io - Docker-based deployment
  - App: `bitbit-cheekyglo`
  - Region: Sydney (syd)
  - Build: Dockerfile required (not in repo, may be in fly.toml)

**CI Pipeline:**
- None configured - Manual deployment via `fly deploy`

**Build Commands:**
- `npm run build` - Compiles TypeScript in core and dashboard workspaces
- `npm run lint` - Runs eslint across all workspaces
- `npm run db:migrate` - Runs database migrations
- `npm run db:seed` - Seeds initial data

## Environment Configuration

**Required env vars (for basic operation):**
- `NODE_ENV` - Environment mode (development/production)
- `PORT` - HTTP server port (default: 8080)
- `DATABASE_PATH` - SQLite database path (optional, defaults by environment)

**Optional but recommended:**
- `ENABLE_TASK_PROCESSOR` - Set to 'true' to enable agent task processing
- `TASK_POLL_INTERVAL` - Milliseconds between task polls (default: 5000)
- `DEBUG` - Set to enable debug logging

**ClickUp Integration:**
- `CLICKUP_API_KEY` - ClickUp API token
- `CLICKUP_TEAM_ID` - ClickUp team identifier
- `CLICKUP_MCP_LICENSE_KEY` - License for MCP server
- `CLICKUP_WEBHOOK_SECRET` - Webhook HMAC secret
- `RD_SCOUT_CLICKUP_TASK_ID` - Optional specific task for R&D results

**Xero Integration:**
- `XERO_CLIENT_ID` - OAuth client ID
- `XERO_CLIENT_SECRET` - OAuth client secret
- `XERO_REDIRECT_URI` - OAuth callback (default: http://localhost:3000/xero/callback)
- `XERO_TOKEN_ENCRYPTION_KEY` - Optional AES-256-GCM key (hex-encoded, 64 chars for 256-bit)

**DataForSEO Integration:**
- `DATAFORSEO_LOGIN` - Account email/login
- `DATAFORSEO_PASSWORD` - API password (not account password)
- `RD_SCOUT_CRON` - Cron expression for R&D Scout runs (see `src/skills/rd-scout/scheduler.ts`)
- `RD_SCOUT_CATEGORIES` - Research categories (comma-separated)
- `RD_SCOUT_SEARCH_QUERY` - Primary search query
- `RD_SCOUT_KEYWORDS` - Additional keywords (comma-separated)
- `RD_SCOUT_MAX_PRODUCTS` - Max products per category (default: varies)
- `RD_SCOUT_MIN_SCORE` - Minimum confidence score filter
- `ENABLE_RD_SCOUT` - Set to 'true' to enable scheduled runs

**ScraperAPI Integration:**
- `SCRAPERAPI_KEY` - API key for ScraperAPI

**Telegram Integration:**
- `TELEGRAM_BOT_TOKEN` - Bot API token from BotFather
- `TELEGRAM_WEBHOOK_SECRET` - Secret for webhook header validation
- `TELEGRAM_CHAT_ID` - Main notification channel
- `TELEGRAM_ADMIN_CHAT_ID` - Admin command channel (integer)

**Briefing System:**
- `BRIEFING_ENABLED` - Set to 'true' to enable
- `BRIEFING_CRON` - Cron expression for briefing generation
- `BRIEFING_CHAT_ID` - Where to send briefings (defaults to TELEGRAM_CHAT_ID)

**Other:**
- `FFMPEG_PATH` - Path to ffmpeg binary (default: 'ffmpeg')
- `FFPROBE_PATH` - Path to ffprobe binary (default: 'ffprobe')
- `BANK_HASH_SECRET` - Hash secret for supplier verification

**Secrets location:**
- Fly.io: `fly secrets set VAR_NAME=value`
- Development: `.env` file (not committed)
- Production: Managed via Fly.io secret management

## Webhooks & Callbacks

**Incoming Webhooks:**
- `POST /clickup/webhook` - ClickUp task status updates
  - Signature verification: HMAC-SHA256 in `X-Signature` header
  - Handler: `src/integrations/clickup/webhook.ts`
  - Triggers: Creates gatekeeper tasks when status moves to "Review"
  - Max payload: 1MB

- `POST /telegram/*` - Telegram bot updates
  - Secret verification: `X-Telegram-Bot-Api-Secret-Token` header
  - Handler: `src/telegram/webhook.ts`
  - Processing timeout: 10 seconds per update
  - Response requirement: Must respond with 200 within 60s (Telegram requirement)
  - Max payload: 1MB

**Outgoing Webhooks:**
- Telegram messages sent via Bot API (HTTP POST)
  - Used for: Notifications, approval requests, command responses
  - No retry mechanism documented (relies on Telegram API reliability)

---

*Integration audit: 2026-02-19*
