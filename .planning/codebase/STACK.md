# Technology Stack

**Analysis Date:** 2026-02-19

## Languages

**Primary:**
- TypeScript 5.x - All application code, type safety across codebase

**Secondary:**
- JavaScript (Node.js native APIs) - HTTP server, file system, cryptographic operations

## Runtime

**Environment:**
- Node.js 20+ - Required via `engines` in root `package.json`

**Package Manager:**
- npm - Monorepo with workspaces (`npm workspaces`)
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- Native Node.js HTTP module (`node:http`) - HTTP server at `src/index.ts`

**CLI & Task Processing:**
- Custom task loop system - `src/agent/index.ts` processes agent tasks asynchronously

**Database:**
- better-sqlite3 - SQLite database client for local database operations

**AI/LLM:**
- @anthropic-ai/sdk 0.74.0 - Claude model API access and tool calling

**Integration Platforms:**
- xero-node - Xero accounting API OAuth 2.0 client (`src/integrations/xero/client.ts`)

**Testing:**
- TypeScript compiler (`tsc`) - Build-time type checking, no runtime test framework detected

**Build/Dev:**
- TypeScript 5 - Compilation target ES2022, module format NodeNext
- ESLint with TypeScript support - `eslint.config.js` with recommended rules

## Key Dependencies

**Critical:**
- @anthropic-ai/sdk 0.74.0 - Core agent intelligence, model routing, tool system
- @supabase/supabase-js 2.95.3 - External data storage integration (defined in `packages/core/package.json`)
- better-sqlite3 - Local SQLite persistence, used for tasks, approvals, key-value store

**Infrastructure:**
- xero-node - OAuth 2.0 token handling, invoice creation, business integration
- node:crypto - AES-256-GCM token encryption, HMAC-SHA256 webhook signatures
- node:http - Native HTTP server routing, no Express/Fastify

## Configuration

**Environment:**
- Environment variables for all external services (see INTEGRATIONS.md for list)
- Production path: `/data/bitbit.db` (Fly.io mounted volume)
- Development path: `./data/bitbit.db` (local)
- Secrets managed via Fly.io `fly secrets set` (see fly.toml)

**Build:**
- `tsconfig.json` - ES2022 target, strict mode enabled, source maps enabled
- `eslint.config.js` - TypeScript ESLint with strict null checks and unused var warnings
- Output directory: `./dist` (not committed, generated during build)

## Platform Requirements

**Development:**
- Node.js 20 or higher
- npm (for workspace management)
- TypeScript 5+ (installed as dev dependency in `packages/core`)

**Production:**
- Node.js 20 runtime
- SQLite database support (included in better-sqlite3)
- Fly.io deployment target with:
  - Shared CPU VM (1x CPU, 512MB RAM default)
  - Sydney region (`syd`) - APAC latency optimization
  - Firecracker MicroVM isolation
  - Health check endpoint: `GET /health` at port 8080
  - Environment variables via `fly secrets set`

## Database Schema

**Primary Store:**
- SQLite with WAL (Write-Ahead Logging) mode
- Foreign key constraints enabled
- Tables:
  - `tasks` - Agent work items
  - `approvals` - Human approval records
  - `decision_traces` - Audit trail of agent decisions
  - `key_value_store` - General storage for tokens (Xero, etc.)

## Deployment Configuration

**Fly.io:**
- Config: `fly.toml` (Sydney region, HTTPS enforced, health checks every 30s)
- Port: 8080 (internal), HTTPS termination by Fly
- Scaling: Min 1 machine, soft limit 200 concurrent requests
- Graceful shutdown: 30-second SIGTERM timeout
- Mounted volume: `/data` for persistent database storage

---

*Stack analysis: 2026-02-19*
