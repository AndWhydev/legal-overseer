# Technology Stack & Architecture Analysis - AWU Landing

## Executive Summary

**Application Type:** Hybrid Multi-Tenant AI Agent Platform
- Primary: Next.js web applications (landing pages, demos)
- Secondary: Autonomous AI agent microservices
- Tertiary: WhatsApp/Telegram bridge services

**Architecture Pattern:** Monorepo with Multi-Deployment Strategy
- Monolithic Next.js apps for frontend/API
- Containerized microservices for agent workers
- Serverless/Edge deployment via Vercel
- VPS deployment via Fly.io and Docker Compose

**Security Posture:** Medium - Limited Built-in Security Controls
- No WAF, API gateway, or comprehensive rate limiting in core apps
- Basic rate limiting in personal-assistant package only
- No CORS configuration detected in demo apps
- Authentication via Supabase (personal-assistant only)
- Container security: non-root users, health checks

---

## 1. Primary Programming Languages & Frameworks

### Core Stack
- **TypeScript 5.x** - Primary language across all packages
  - Strict mode enabled
  - ES2022/ES2017 target
  - Location: `/repos/awu-landing/demo-1/tsconfig.json`, `/repos/awu-landing/packages/core/tsconfig.json`

### Web Framework
- **Next.js 16.1.6** (App Router)
  - React 19.2.3
  - React Server Components
  - API Routes (App Router pattern)
  - Static site generation + server-side rendering
  - Locations:
    - `/repos/awu-landing/demo-1/package.json`
    - `/repos/awu-landing/landing-page/package.json`
    - `/repos/awu-landing/personal-assistant/package.json`

### UI/Styling
- **Tailwind CSS v4** - Utility-first CSS framework
  - PostCSS v4
  - Oxide engine (native Rust CSS parser)
  - `@tailwindcss/postcss`, `@tailwindcss/oxide-linux-x64-gnu`
  - Location: `/repos/awu-landing/demo-1/package.json`

- **Radix UI** - Headless component primitives
  - `@radix-ui/react-icons`
  - Location: `/repos/awu-landing/demo-1/package.json`

- **Motion v12.33.0** - Animation library (formerly Framer Motion)
  - Location: `/repos/awu-landing/demo-1/package.json`

---

## 2. Architectural Patterns

### Monorepo Structure
```
/repos/awu-landing/
├── demo-1/              # BitBit demo app (Next.js)
├── landing-page/        # Marketing landing page (Next.js)
├── personal-assistant/  # Full production app (Next.js + Supabase)
├── packages/
│   ├── core/           # Shared types, agent registry
│   └── agents/         # Individual agent modules
│       ├── lead-swarm/
│       ├── invoice-flow/
│       ├── channel-triage/
│       ├── client-comms/
│       ├── proposal-bot/
│       ├── ad-script-gen/
│       ├── client-onboarding/
│       ├── ai-search-optimizer/
│       ├── tender-hunter/
│       └── sentry/
└── deployments/
    ├── vps/            # Hetzner CX22 deployment (Docker Compose)
    ├── fly/            # Fly.io deployment
    ├── whatsapp-bridge/ # WhatsApp integration service
    ├── awu/            # All Webbed Up deployment
    ├── torkay/         # Torkay deployment
    └── demo/           # Demo deployment
```

### Pattern: Hybrid Architecture

**1. Monolithic Next.js Apps**
- All UI, API routes, and business logic in single app
- Server-side rendering + API routes in same process
- Pattern: `/repos/awu-landing/demo-1/app/api/*/route.ts`

**2. Agentic Microservices**
- Autonomous AI agents as separate deployable units
- Each agent: independent package with handler + definition
- Pattern: `/repos/awu-landing/packages/agents/*/index.ts`

**3. Bridge Services**
- Dedicated services for external integrations (WhatsApp)
- Separate deployment lifecycle
- Pattern: `/repos/awu-landing/deployments/whatsapp-bridge/`

### Agent System Architecture

**BitBit Engine** - Custom AI orchestration framework
- File: `/repos/awu-landing/demo-1/lib/bitbit/engine.ts`
- Tool-calling agentic loop with Claude SDK
- Confidence-based routing (ACT/ASK/ESCALATE)
- Session management and audit logging

**Agent Registry Pattern**
- Declarative agent definitions with metadata
- Runtime registration via `@bitbit/core`
- Example: `/repos/awu-landing/packages/agents/lead-swarm/index.ts`

```typescript
const definition: AgentDefinition = {
  type: 'lead-swarm',
  required_channels: ['gmail', 'outlook'],
  required_tools: ['search_messages', 'create_task'],
  default_model_tier: 'haiku',
  default_confidence_thresholds: { act: 0.85, ask: 0.55 },
  handler: '@bitbit/agent-lead-swarm/handler',
}
```

### Deployment Patterns

**Pattern 1: Serverless (Vercel)**
- Next.js apps deployed to Vercel edge network
- Middleware functions as Edge Functions
- Cron jobs via vercel.json
- Location: `/repos/awu-landing/personal-assistant/vercel.json`

**Pattern 2: Containerized Workers (VPS/Fly.io)**
- Docker multi-stage builds
- Health checks, non-root users
- Auto-scaling via Fly.io
- Locations:
  - `/repos/awu-landing/deployments/vps/docker-compose.yml`
  - `/repos/awu-landing/deployments/fly/fly.toml`

**Pattern 3: Persistent Bridge (WhatsApp)**
- Long-running Node.js service
- Volume mounts for auth state
- Location: `/repos/awu-landing/deployments/whatsapp-bridge/Dockerfile`

---

## 3. Database Systems & Data Storage

### SQLite (better-sqlite3 v12.6.2)
**Used in:** demo-1, landing-page
- Embedded database for demos
- WAL mode for concurrent access
- Foreign key enforcement
- Schema: `/repos/awu-landing/demo-1/lib/schema.sql`

**Tables:**
- `approval_items` - Unified inbox
- `tasks` - Generated from approvals
- `audit_log` - Action tracking
- `customers`, `products`, `orders` - E-commerce data
- `agent_actions` - Agent operation audit

**Security Implications:**
- ✅ Enables foreign keys
- ✅ WAL mode for concurrency
- ⚠️ File-based storage - no encryption at rest by default
- ⚠️ No connection pooling (single-threaded writes)

### PostgreSQL (via Supabase)
**Used in:** personal-assistant
- Primary database for production app
- 128+ references to `@supabase/supabase-js`
- Row-level security (RLS) policies
- Real-time subscriptions

**Key Features:**
- Multi-tenant organization structure
- Rate limiting tables (`rate_limit_buckets.sql`)
- Authentication via Supabase Auth
- Service role key for privileged operations

**Files:**
- `/repos/awu-landing/personal-assistant/src/lib/supabase/client.ts`
- `/repos/awu-landing/personal-assistant/src/lib/supabase/middleware.ts`
- `/repos/awu-landing/personal-assistant/supabase/migrations/042_rate_limit_buckets.sql`

**Security Implications:**
- ✅ Row-level security (RLS)
- ✅ Separate anon and service role keys
- ✅ Auth middleware for protected routes
- ⚠️ Service role key exposure risk in environment variables

---

## 4. Build Systems & Dependency Management

### Package Management
- **npm** - Primary package manager
- **workspaces** - Likely used for monorepo (inferred from structure)
- Lock files: `package-lock.json` present

### Build Tools
- **Next.js Build System**
  - Webpack 5 (bundled with Next.js)
  - Turbopack (Next.js 16 default)
  - SWC compiler for TypeScript/JSX

- **TypeScript Compiler (tsc)**
  - Standalone builds for core package
  - Declaration files generated
  - Source maps enabled

### Build Scripts
**demo-1 package:**
```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "db:init": "npx tsx scripts/init-db.ts",
  "db:seed": "npm run db:seed:products && npm run db:seed:orders"
}
```

### Development Tools
- **tsx** - TypeScript execution for scripts
- **ESLint 9** - Linting (eslint-config-next)
- **dotenv 17.2.3** - Environment variable management

**Security Implications:**
- ✅ TypeScript strict mode reduces runtime errors
- ✅ ESLint for code quality
- ⚠️ No evidence of dependency scanning (Snyk, Dependabot)
- ⚠️ No lock file verification in CI

---

## 5. AI & External Service Dependencies

### Anthropic Claude SDK (@anthropic-ai/sdk)
- **Version:** 0.71.2 (demo), 0.74.0 (core)
- **Usage:** Core LLM for all agent operations
- **Location:** All packages

**Key Features:**
- Tool calling (function calling)
- Streaming responses
- Multi-turn conversations
- Model selection: `claude-sonnet-4-20250514`

**Files:**
- `/repos/awu-landing/demo-1/lib/claude.ts`
- `/repos/awu-landing/demo-1/lib/bitbit/engine.ts`

### Tool System
**Declarative YAML-based tools:**
- File: `/repos/awu-landing/demo-1/config/tools.yaml`
- 7 tools: lookup_order, get_shipping_status, get_customer_history, send_reply, create_task, check_inventory, escalate

**Dynamic Tool Loading:**
- Runtime tool registration
- Handler mapping to TypeScript functions
- Location: `/repos/awu-landing/demo-1/lib/bitbit/tool-loader.ts`

### Integration Points
**Identified from .env.example:**
- Outlook (OAuth + SMTP)
- Asana (access token)
- Calendly (API key)
- Stripe (secret key)
- WhatsApp (Meta Business API)
- Google Search Console
- Sentry (monitoring)

**Security Implications:**
- ⚠️ API keys in environment variables (no secrets manager)
- ⚠️ No evidence of key rotation automation
- ⚠️ Anthropic API key = full LLM access (no rate limiting on key)

---

## 6. Container Orchestration & Cloud Platform

### Docker
**Dockerfile Patterns:**

**1. VPS Worker (Multi-worker)**
```dockerfile
FROM node:22-slim
# Chromium installation (conditional)
# Non-root user: bitbit:bitbit
# Health check: node process exit
# Exposed port: 3001
```
Location: `/repos/awu-landing/deployments/vps/Dockerfile`

**2. Fly.io Worker**
```dockerfile
FROM node:22-slim (multi-stage)
# Builder stage: npm ci, tsc build
# Runner stage: production dependencies only
# Non-root user
# Exposed port: 3000
```
Location: `/repos/awu-landing/deployments/fly/Dockerfile`

**3. WhatsApp Bridge**
```dockerfile
FROM node:20-slim
# TypeScript compilation
# Data directory for auth state
# Exposed port: 3000
```
Location: `/repos/awu-landing/deployments/whatsapp-bridge/Dockerfile`

### Docker Compose
**VPS Deployment (Hetzner CX22):**
```yaml
services:
  agent-worker:
    memory: 1536M
    cpus: "1.0"
  chrome-worker:
    memory: 2048M
    cpus: "1.0"
    security_opt: no-new-privileges
  watchtower:
    auto-update containers
```
Location: `/repos/awu-landing/deployments/vps/docker-compose.yml`

**Security Features:**
- ✅ Resource limits (memory/CPU)
- ✅ Health checks every 30s
- ✅ no-new-privileges security option
- ✅ Non-root users in all containers
- ✅ Watchtower for auto-updates
- ⚠️ No network isolation between containers
- ⚠️ Docker socket mounted (Watchtower)

### Fly.io Platform
**Configuration:** `/repos/awu-landing/deployments/fly/fly.toml`
- Primary region: Sydney (syd)
- VM size: shared-cpu-1x, 1024MB RAM
- Auto-scaling: 2 instances minimum
- Concurrency: 50 hard limit, 25 soft limit
- Force HTTPS enabled
- Health checks: HTTP GET /api/monitoring/health (30s interval)

**WhatsApp Bridge:**
- VM size: shared-cpu-1x, 512MB RAM
- Concurrency: 25 hard limit, 10 soft limit
- Persistent volume: `/data` mount

**Security Implications:**
- ✅ Force HTTPS
- ✅ Health monitoring
- ✅ Auto-scaling for availability
- ⚠️ No mention of DDoS protection
- ⚠️ Shared CPU instances (noisy neighbor risk)

### Vercel Platform
**personal-assistant deployment:**
- Next.js framework detection
- 10 cron jobs scheduled
- Edge middleware deployment
- Location: `/repos/awu-landing/personal-assistant/vercel.json`

**Cron Schedule:**
- Every minute: /api/cron/scheduler
- Every 5 minutes: channel-sync, triage, sentry
- Daily: morning-briefing (9pm), daily-digest (7am)
- Weekly: weekly-report (Mondays 8am)
- Monthly: monthly-report (1st day 9am)
- Hourly: token-refresh

**Security Implications:**
- ✅ Vercel handles TLS/SSL
- ✅ Edge network DDoS protection
- ⚠️ Cron endpoints exposed (no auth mentioned)
- ⚠️ No rate limiting on cron endpoints

---

## 7. Critical Security Components

### Rate Limiting
**Implementation:** personal-assistant only
- File: `/repos/awu-landing/personal-assistant/src/lib/channels/rate-limiter.ts`
- Algorithm: Token bucket
- Backend: Supabase (persistent), in-memory fallback
- Per-channel limits:
  - Gmail: 60 req/min
  - Outlook: 120 req/min
  - Asana: 150 req/min
  - WhatsApp: 80 req/min
  - Calendly: 60 req/min
  - Stripe: 100 req/min
  - Google Search Console: 30 req/min

**Coverage:**
- ✅ Channel-specific rate limiting
- ✅ Persistent state across cold starts
- ⚠️ Not implemented in demo-1 or landing-page
- ⚠️ No global API rate limiting
- ⚠️ No IP-based rate limiting

### Authentication & Authorization

**Supabase Auth (personal-assistant):**
- Magic link authentication
- Session-based auth with cookies
- Middleware: `/repos/awu-landing/personal-assistant/src/middleware.ts`
- Redirects to /login if unauthenticated
- Row-level security (RLS) on database

**No Auth (demo-1, landing-page):**
- ⚠️ API endpoints are publicly accessible
- ⚠️ No authentication on /api/agent, /api/analyze, /api/telegram/webhook

**Security Implications:**
- ✅ Secure auth in production app
- ⚠️ Demo apps expose agent endpoints publicly
- ⚠️ Telegram webhook has no signature verification (visible in code)
- ⚠️ No API key validation for agent endpoints

### CORS Configuration
**Status:** Not detected
- No CORS middleware found in demo apps
- Next.js default: same-origin policy
- ⚠️ No explicit CORS headers in API routes
- ⚠️ Could allow unauthorized cross-origin requests

### Input Validation & Sanitization
**Minimal validation detected:**
- API route validation:
  ```typescript
  if (!message || !channel || !sender?.type) {
    return NextResponse.json({ error: '...' }, { status: 400 })
  }
  ```
- ⚠️ No schema validation library (Zod installed but unused)
- ⚠️ No SQL injection protection (parameterized queries used in better-sqlite3 by default)
- ⚠️ No XSS sanitization in message handling

### Secrets Management
**Current approach:** Environment variables
- `.env.local` files (gitignored)
- `.env.example` templates
- No secrets manager integration (AWS Secrets Manager, HashiCorp Vault)

**Exposed in environment:**
- `ANTHROPIC_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OUTLOOK_CLIENT_SECRET`
- `SMTP_PASS`
- `WHATSAPP_TOKEN`
- `STRIPE_SECRET_KEY`

**Security Implications:**
- ⚠️ Secrets in plaintext environment variables
- ⚠️ No secret rotation automation
- ⚠️ Dockerfile COPY may include .env files
- ⚠️ Server-side only (not in client bundles)

### Audit Logging
**Comprehensive audit system:**
- Agent actions: `/repos/awu-landing/demo-1/lib/schema.sql` (agent_actions table)
- Session tracking with unique IDs
- Input/output logging
- Confidence scores recorded
- Error tracking

**Files:**
- `/repos/awu-landing/demo-1/lib/agent/audit.ts`
- `/repos/awu-landing/personal-assistant/src/lib/audit/logger.ts`

**Security Implications:**
- ✅ Complete audit trail for agent actions
- ✅ Session tracking for forensics
- ⚠️ No log aggregation/SIEM integration
- ⚠️ SQLite logs may be lost if container crashes

### Content Security Policy (CSP)
**Status:** Not detected
- No CSP headers in Next.js config
- No helmet.js or security middleware
- ⚠️ Missing XSS protection headers

---

## 8. Communication Channels & Message Handling

### Implemented Channels
1. **Telegram**
   - Webhook: `/repos/awu-landing/demo-1/app/api/telegram/webhook/route.ts`
   - Bot token authentication
   - Message parsing and response

2. **WhatsApp**
   - Dedicated bridge service
   - Meta Business API integration
   - Persistent auth state

3. **Email (Outlook/Gmail)**
   - OAuth2 client credentials
   - SMTP fallback
   - Integration in personal-assistant

4. **Asana, Calendly, Stripe**
   - API token-based integrations
   - Task/event/payment webhooks

### Message Flow
```
External Channel → API Route/Webhook → BitBit Agent
                                      ↓
                              Tool Calls (DB, APIs)
                                      ↓
                              Response Generation
                                      ↓
                              Send via Channel
```

**Security Implications:**
- ⚠️ Telegram webhook lacks signature verification
- ⚠️ WhatsApp bridge has single point of failure
- ⚠️ No message encryption in transit (within app)
- ✅ HTTPS enforced on all deployments

---

## 9. Security Risk Summary

### High Priority
1. **No API authentication on demo apps** - Agent endpoints publicly accessible
2. **Missing webhook signature verification** - Telegram/WhatsApp spoofing risk
3. **Secrets in environment variables** - No secrets manager
4. **No WAF or DDoS protection** - Application layer attacks possible
5. **Missing input validation** - Injection attack vectors

### Medium Priority
6. **No CORS policy** - Cross-origin attack risk
7. **SQLite data encryption** - Data at rest unencrypted
8. **Service role key exposure** - Supabase full database access
9. **No rate limiting on core apps** - Resource exhaustion possible
10. **Missing CSP headers** - XSS attack surface

### Low Priority
11. **No dependency scanning** - Vulnerable packages undetected
12. **Docker socket exposure** - Watchtower privilege escalation risk
13. **Shared CPU instances** - Noisy neighbor attacks
14. **No log aggregation** - Security event visibility limited

---

## 10. Technology Stack Summary Table

| Category | Technology | Version | Location | Security Notes |
|----------|-----------|---------|----------|----------------|
| **Runtime** | Node.js | 20-22 | All | Maintained versions |
| **Language** | TypeScript | 5.x | All | Strict mode ✅ |
| **Framework** | Next.js | 16.1.6 | Frontend/API | App Router, SSR |
| **UI** | React | 19.2.3 | Frontend | Latest stable |
| **Styling** | Tailwind CSS | 4.x | Frontend | PostCSS pipeline |
| **Database (Demo)** | SQLite | - | demo-1, landing-page | No encryption ⚠️ |
| **Database (Prod)** | PostgreSQL | - | personal-assistant | Supabase, RLS ✅ |
| **ORM/Client** | better-sqlite3 | 12.6.2 | Demo apps | Parameterized queries ✅ |
| **Auth** | Supabase Auth | - | personal-assistant | Magic links, sessions ✅ |
| **LLM** | Anthropic Claude | SDK 0.74.0 | All | Sonnet 4, tool calling |
| **Containerization** | Docker | - | VPS, Fly.io | Multi-stage builds ✅ |
| **Orchestration** | Docker Compose | 3.9 | VPS | Resource limits ✅ |
| **Cloud (Serverless)** | Vercel | - | personal-assistant | Edge network, HTTPS ✅ |
| **Cloud (Containers)** | Fly.io | - | Workers | Sydney region, auto-scale |
| **Rate Limiting** | Custom | - | personal-assistant | Token bucket, Supabase ✅ |
| **Monitoring** | Sentry | - | Production | Error tracking |
| **CI/CD** | - | - | - | Not detected ⚠️ |
| **Secrets Mgmt** | Environment Vars | - | All | No vault ⚠️ |
| **WAF** | None | - | - | Missing ⚠️ |
| **API Gateway** | None | - | - | Missing ⚠️ |

---

## 11. Deployment Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         EDGE LAYER                          │
│  Vercel CDN (personal-assistant)                           │
│  - Edge Functions (middleware)                             │
│  - Static Assets (landing-page)                            │
│  - Cron Jobs (10 scheduled tasks)                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      API/APPLICATION LAYER                   │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   demo-1     │  │ landing-page │  │ personal-    │     │
│  │  (Next.js)   │  │  (Next.js)   │  │ assistant    │     │
│  │  Port: 3000  │  │  Port: 3000  │  │ (Next.js)    │     │
│  │              │  │              │  │              │     │
│  │  No Auth ⚠️  │  │  Static ✅   │  │  Supabase    │     │
│  │              │  │              │  │  Auth ✅     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    WORKER/AGENT LAYER                        │
│                                                              │
│  ┌──────────────────────────────────────────────┐          │
│  │  Fly.io (bitbit-workers) - Sydney            │          │
│  │  - 2x shared-cpu-1x instances                │          │
│  │  - Auto-scaling, Force HTTPS ✅              │          │
│  │  - Health checks ✅                          │          │
│  └──────────────────────────────────────────────┘          │
│                                                              │
│  ┌──────────────────────────────────────────────┐          │
│  │  Hetzner VPS (docker-compose)                │          │
│  │  - agent-worker (1.5GB, 1 CPU)               │          │
│  │  - chrome-worker (2GB, 1 CPU, Chromium)      │          │
│  │  - watchtower (auto-updates)                 │          │
│  └──────────────────────────────────────────────┘          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    INTEGRATION/BRIDGE LAYER                  │
│                                                              │
│  ┌──────────────────────────────────────────────┐          │
│  │  WhatsApp Bridge (Fly.io)                    │          │
│  │  - Node.js long-running service              │          │
│  │  - Persistent volume: /data                  │          │
│  │  - 512MB RAM, shared-cpu-1x                  │          │
│  └──────────────────────────────────────────────┘          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                        DATA LAYER                            │
│                                                              │
│  ┌──────────────┐  ┌────────────────────────────┐          │
│  │  SQLite      │  │  Supabase PostgreSQL       │          │
│  │  (demo-1,    │  │  (personal-assistant)      │          │
│  │  landing)    │  │                            │          │
│  │              │  │  - Row-Level Security ✅   │          │
│  │  WAL mode ✅ │  │  - Real-time subscriptions │          │
│  │  No encrypt  │  │  - Rate limit tables       │          │
│  │  ⚠️          │  │  - Multi-tenant orgs       │          │
│  └──────────────┘  └────────────────────────────┘          │
└─────────────────────────────────────────────────────────────┘

                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    EXTERNAL SERVICES                         │
│                                                              │
│  Anthropic Claude API  │  Telegram Bot API                  │
│  Gmail/Outlook OAuth   │  Meta WhatsApp API                 │
│  Asana API             │  Calendly API                       │
│  Stripe API            │  Google Search Console              │
│  Sentry (monitoring)   │                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 12. Recommendations

### Immediate Actions (P0)
1. **Implement webhook signature verification** for Telegram/WhatsApp
2. **Add API authentication** to demo-1 agent endpoints
3. **Enable rate limiting** on all public API routes
4. **Implement CSP headers** via Next.js middleware
5. **Add input validation** using Zod schemas

### Short-term (P1)
6. **Migrate secrets** to Vercel Environment Variables (encrypted) or secrets manager
7. **Add CORS policy** with explicit allowed origins
8. **Implement SQL query logging** for audit trail
9. **Add dependency scanning** to CI/CD pipeline
10. **Enable SQLite encryption** via SQLCipher for demo apps

### Medium-term (P2)
11. **Deploy WAF** (Cloudflare, AWS WAF) in front of applications
12. **Implement API gateway** for unified auth, rate limiting, logging
13. **Add automated secret rotation** for service keys
14. **Deploy SIEM** for centralized log analysis
15. **Implement network segmentation** in Docker Compose

### Long-term (P3)
16. **Multi-region deployment** for high availability
17. **Implement circuit breakers** for external API calls
18. **Add anomaly detection** for unusual agent behavior
19. **Implement end-to-end encryption** for message handling
20. **Deploy Kubernetes** for advanced orchestration (if scale warrants)

---

## 13. File Path Reference

### Critical Configuration Files
- **Next.js Config:** `/repos/awu-landing/demo-1/next.config.ts`
- **Database Schema:** `/repos/awu-landing/demo-1/lib/schema.sql`
- **Tool Definitions:** `/repos/awu-landing/demo-1/config/tools.yaml`
- **BitBit Engine:** `/repos/awu-landing/demo-1/lib/bitbit/engine.ts`
- **Agent Registry:** `/repos/awu-landing/packages/core/src/index.ts`
- **Docker Compose:** `/repos/awu-landing/deployments/vps/docker-compose.yml`
- **Fly.io Config:** `/repos/awu-landing/deployments/fly/fly.toml`
- **Vercel Config:** `/repos/awu-landing/personal-assistant/vercel.json`
- **Supabase Middleware:** `/repos/awu-landing/personal-assistant/src/lib/supabase/middleware.ts`
- **Rate Limiter:** `/repos/awu-landing/personal-assistant/src/lib/channels/rate-limiter.ts`

### API Endpoints (demo-1)
- **Agent Handler:** `/repos/awu-landing/demo-1/app/api/agent/route.ts`
- **Telegram Webhook:** `/repos/awu-landing/demo-1/app/api/telegram/webhook/route.ts`
- **Analysis:** `/repos/awu-landing/demo-1/app/api/analyze/route.ts`
- **Items CRUD:** `/repos/awu-landing/demo-1/app/api/items/route.ts`
- **Agent Audit:** `/repos/awu-landing/demo-1/app/api/agent/audit/route.ts`

### Environment Templates
- `/repos/awu-landing/demo-1/.env.example`
- `/repos/awu-landing/deployments/vps/.env.example`

---

**Report Generated:** 2026-03-02  
**Methodology:** Static code analysis, configuration review, architecture inference  
**Confidence Level:** High (direct file access, comprehensive codebase coverage)