# BitBit - Investor Feature Showcase

> **Verified**: 25 March 2026
> **Method**: Automated source code audit (every numerical claim cross-referenced against actual files in the codebase)
> **Caveats**: Fly.io uptime figure (37 days) was last confirmed 24 Mar 2026 and will drift. Stripe Price IDs are resolved from environment variables at runtime, not hardcoded.

**Date**: 24 March 2026
**Version**: 1.5 (Production)
**Status**: Live on Vercel with active Supabase backend

---

## Executive Summary

BitBit is a full-stack agentic AI operations platform for digital agencies. It ingests messages from 20 channel types, classifies them using a 3-tier AI model router (Haiku/Sonnet/Opus), dispatches to specialized AI agents, and routes actions through a confidence-based approval flow. The platform includes a complete client portal, revenue intelligence, and multi-tenant billing.

**Key numbers:**
- 204 API endpoints
- 272 React components
- 22 scheduled cron jobs
- 27 dashboard tabs/sub-pages
- 20 channel types (17 with unified inbox adapters)
- 3 industry packs (agency, tradie, content creator)
- 118 database migrations (Supabase/Postgres)
- Multi-tenant with org-level isolation and RLS

---

## 1. Architecture Overview

```
Frontend:    Next.js 16.1.6 + React 19.2.3 (SPA Shell, lazy-loaded tabs)
Backend:     204 API routes (Next.js serverless)
Database:    Supabase (Postgres) with 118 migrations, full RLS
AI:          Anthropic Claude (3-tier model routing)
Search:      Pinecone (RAG) + Voyage AI (embeddings)
Email:       Resend API
Payments:    Stripe (4-tier: Free/Starter/Growth/Scale)
Monitoring:  Sentry (error tracking + source maps)
Hosting:     Vercel (dashboard) + Fly.io (workers) + Cloudflare (edge cron)
```

### Deployment Topology

| Service | Platform | Status |
|---------|----------|--------|
| Dashboard + API | Vercel (AWU team) | Deployed |
| Background Workers | Fly.io | LIVE (DB connected) |
| Edge Cron Scheduler | Cloudflare Workers | Configured |
| Demo Instance | Vercel | Deployed (auth protected) |
| Landing Page | Vercel | Configured |

---

## 2. AI Engine: 3-Tier Model Router

BitBit automatically routes every AI task to the optimal model based on complexity analysis.

| Tier | Model | Use Case | Token Limit | Cost/1M Input |
|------|-------|----------|-------------|---------------|
| Classification | Claude Haiku 4.5 | Triage, sentiment, parsing, labelling | 4,096 | $0.25 |
| Conversation | Claude Sonnet 4.5 | Chat, client comms, general tasks | 8,192 | $3.00 |
| Synthesis | Claude Opus 4 | Strategy, planning, complex analysis, ad scripts | 16,384 | $15.00 |

**Automatic routing logic:**
- Keyword signals (plan/strategy/analyze = synthesis; classify/triage/label = classification)
- Word count thresholds (>500 words = synthesis tier)
- Multi-question detection (>100 words + 2+ questions = synthesis)
- Configurable via environment variables (MODEL_CLASSIFY, MODEL_CONVERSE, MODEL_SYNTH)

---

## 3. Dashboard (27 Tabs/Sub-Pages)

The dashboard is a full SPA shell with lazy-loaded tabs, keyboard shortcuts, global search, and a notification center. All tabs are defined in the SPA shell and lazy-loaded on demand.

### Core Operations
| Tab | Description | Status |
|-----|-------------|--------|
| **Dashboard** | KPI cards with sparklines, Kanban board, inbox feed, role status cards, attention view, daily brief | BUILT |
| **Chat** | Full conversation interface with the AI agent, threaded history, injection guard, timing jitter | BUILT |
| **Inbox** | Unified inbox from all channels, classification badges, read/archive actions | BUILT |
| **Activity** | Real-time activity feed across all agent actions | BUILT |
| **Approvals** | Confidence-based approval queue (agent drafts await human sign-off above threshold) | BUILT |

### Business Operations
| Tab | Description | Status |
|-----|-------------|--------|
| **Contacts** | Full CRM with entity profiles, relationship health scores, optimal contact timing, avatar resolution | BUILT |
| **Leads** | Lead discovery engine, analytics dashboard, scoring, acknowledgment flows, import/export | BUILT |
| **Invoices** | Invoice generation, PDF rendering, email delivery, template system | BUILT |
| **Creator Studio** | Content generation, scheduling, template library, content history | BUILT |
| **Meetings** | Meeting intelligence, transcription, action item extraction, follow-up automation | BUILT |
| **Reports** | Revenue reports, weekly/monthly digests, cohort analytics | BUILT |

### AI/Intelligence
| Tab | Description | Status |
|-----|-------------|--------|
| **Sentry** | Autonomous monitoring agent with escalation rules and alert watches | BUILT |
| **Swarm** | Multi-agent orchestration: trigger parallel agent swarms with templates and rollback | BUILT |
| **Knowledge** | Knowledge graph visualization and management | BUILT |
| **AI Search** | AI-powered search optimizer with visibility audit | BUILT |
| **Ad Scripts** | AI-generated advertising scripts with offer packages | BUILT |

### Administration
| Tab | Description | Status |
|-----|-------------|--------|
| **Settings** | 4 sub-tabs: Connections, Automations, Appearance (dark/light theme), Billing | BUILT |
| **Channels** | Channel status, sync, connect/disconnect | BUILT |
| **Analytics** | Event tracking, cohort analysis, trend visualization | BUILT |
| **Costs** | AI cost monitoring and budget tracking | BUILT |
| **Admin** | Dead letter queue, data export/import, RLS audit | BUILT |

### Industry-Specific
| Tab | Description | Status |
|-----|-------------|--------|
| **Tenders** | Government tender hunting with capability matching (AusTender) | BUILT |
| **Jobs** | Job tracking and management | BUILT |
| **Quotes** | Quote generation bot | BUILT |
| **Medications** | Health tracking (personal vertical) | BUILT |

---

## 4. Specialized AI Agents (11 Agents)

Each agent operates autonomously within confidence thresholds and uses the model router for cost-optimal inference.

| Agent | Function | Trigger |
|-------|----------|---------|
| **Channel Triage** | Classifies incoming messages, routes to correct agent/human | Every 5 min (cron) |
| **Client Comms** | Drafts client responses using contact context + relationship history | On message classification |
| **Lead Swarm** | Discovers leads, scores them, runs enrichment, sends acknowledgments | On demand + cron |
| **Invoice Flow** | Generates invoices, renders PDFs, dispatches via email | On demand |
| **Proposal Bot** | Creates proposals from brief context | On demand |
| **Ad Script Gen** | Generates advertising scripts using industry packs | On demand |
| **AI Search Optimizer** | Audits SEO visibility, suggests improvements | On demand |
| **Tender Hunter** | Scrapes government tender sites, matches against capabilities | Cron (every 6 hours) |
| **Sentry Monitor** | Watches for alerts, escalates based on severity | Every 5 min (cron) |
| **Client Onboarding** | Automated onboarding emails and first-value delivery | On new user signup |
| **Scheduler** | Orchestrates all agent execution, manages the task queue | Every minute (cron) |

---

## 5. Channel Integrations (20 Channel Types)

BitBit defines 20 channel types. 17 are registered in the unified inbox synthesizer with deduplication. Slack, SMS, and Google Calendar have standalone adapter modules.

| Channel | Integration Type | Unified Inbox | Status |
|---------|-----------------|---------------|--------|
| **Gmail** | OAuth + API | Yes | BUILT |
| **Outlook** | OAuth + Graph API | Yes | BUILT |
| **WhatsApp** | Cloud API + Baileys Bridge | Yes | BUILT |
| **Slack** | Bot + Events API | Standalone | BUILT |
| **Telegram** | Bot API | Yes | BUILT |
| **Asana** | Webhook + API | Yes | BUILT |
| **Calendly** | Webhook + API | Yes | BUILT |
| **Stripe** | Webhook + API | Yes | BUILT |
| **Google Calendar** | API | Standalone | BUILT |
| **Google Search Console** | API | Yes | BUILT |
| **Google Analytics (GA4)** | API | Yes | BUILT |
| **ClickUp** | API | Yes | BUILT |
| **Xero** | OAuth + API | Yes | BUILT |
| **Facebook Messenger** | API | Yes | BUILT |
| **Instagram** | API | Yes | BUILT |
| **iMessage** | MacBook Bridge | Yes | BUILT |
| **WordPress** | API | Yes | BUILT |
| **SMS** | API | Standalone | BUILT |
| **Apple Calendar** | macOS Bridge | Yes | BUILT |
| **Apple Reminders** | macOS Bridge | Yes | BUILT |

---

## 6. Semantic Memory System (Memory Palace)

A full semantic memory layer that stores, recalls, consolidates, and forgets context.

**Capabilities:**
- **Store**: Save memories with automatic embedding generation (Voyage AI + Pinecone)
- **Recall**: Context-aware retrieval during conversations
- **Search**: Semantic search across all stored memories
- **Consolidation**: Automatic daily consolidation of fragmented memories into coherent narratives
- **Archaeology**: Deep pattern detection across historical data
- **Forget**: GDPR-compliant memory deletion
- **Pricing Intelligence**: Learns and recalls pricing patterns per client

**9 API endpoints:**
`/memory-palace` (root), `/store`, `/recall`, `/search`, `/consolidate`, `/archaeology`, `/forget`, `/pricing`, `/stats`

---

## 7. Revenue Intelligence

A complete revenue analytics suite built for agencies.

| Feature | Description |
|---------|-------------|
| Cash Flow Forecasting | Predicts cash flow based on invoice patterns and client history |
| Client Scoring | Scores clients by revenue, payment speed, engagement |
| Collection Accelerator | Identifies overdue invoices and suggests collection strategies |
| Revenue Radar | Real-time pipeline visualization |
| Scenario Modeling | What-if analysis for revenue projections |
| Weekly Digest | Automated revenue summaries |

---

## 8. Client Portal

A white-label client portal where agency clients can log in and interact.

**Portal pages (5 client-facing + login):**
- Dashboard (client-facing project overview)
- Projects (scoped to their org)
- Invoices (view and pay)
- Files (upload/download)
- Requests (submit new requests)

**Portal API coverage:** 11 endpoints (auth, dashboard, projects, invoices, files, requests, activity, branding, notifications, invite, download)

**Authentication:** Magic link login (no passwords for clients)

---

## 9. Role Engine

An autonomous role-based agent system where each role operates independently.

**Core components (10):**
- Role Registry (defines available roles: Sales, Finance, Comms)
- Role Runtime (executes role-specific workflows)
- Role Scheduler (manages role tick intervals)
- Role Init (bootstraps role system on startup)
- Autonomy Gate (controls what each role can do without approval)
- Role Activity Logger (audit trail for all role actions)
- Role Cost Guard (prevents runaway AI spend per role)
- Workflow Executor (multi-step workflow orchestration)
- Action Dispatcher (routes role outputs to channels)
- Output Formatter (adapts output for each channel/context)

**Sub-roles built:**
- `sales/` - Lead management, proposals, pipeline tracking, client onboarding, win/loss learning (7 modules)
- `finance/` - Invoicing, revenue tracking, collections, cash flow monitoring, proactive invoicing (9 modules)
- `comms/` - Client communication, channel routing, tone adaptation, escalation, follow-up tracking (8 modules)

---

## 10. Scheduled Automation (22 Cron Jobs)

All 22 jobs are scheduled via Vercel cron configuration (`vercel.json`) with secret-guarded endpoints.

| Job | Schedule | Function |
|-----|----------|----------|
| Scheduler | Every minute | Orchestrates agent task queue |
| Channel Sync | Every 5 min | Syncs messages from all channels |
| Triage | Every 5 min | Classifies incoming messages |
| Sentry | Every 5 min | Checks for monitoring alerts |
| Process Embeddings | Every 5 min | Generates vector embeddings for new content |
| Role Tick | Every 5 min | Runs autonomous role actions |
| Archive Threads | Every 15 min | Archives old conversation threads |
| Proactive Alerts | Every 15 min | Generates proactive business alerts |
| Token Refresh | Hourly | Refreshes OAuth tokens for all integrations |
| Sleep Compute | Every 2 hours | Background computation during low-activity |
| Entity Profile Refresh | Every 2 hours | Updates contact/entity profiles |
| Intelligence | Every 6 hours | Runs intelligence analysis |
| Morning Briefing | Daily 7am AEST | Generates daily operational briefing |
| Daily Digest | Daily 5pm AEST | End-of-day summary |
| Consolidation | Daily 1pm AEST | Memory and data consolidation |
| Relationship Health | Daily | Scores and updates relationship health |
| Calibrate Confidence | Daily | Recalibrates confidence thresholds |
| Billing | Daily midnight | Processes billing and usage tracking |
| Contact Timing | Weekly (Sat) | Optimizes contact timing per entity |
| Weekly Report | Monday 6pm AEST | Weekly business report |
| Monday Briefing | Sunday 6am AEST | Week-ahead briefing |
| Monthly Report | 1st of month | Monthly business analytics |

*Note: A Revenue Intelligence cron route also exists in the codebase but is not yet registered in the Vercel cron schedule.*

---

## 11. Multi-Tenant Architecture

BitBit supports full multi-tenancy with organization-level isolation.

**Tenancy model:**
- Dual-tier: Personal orgs (free) + Business orgs (paid)
- Every database table has `org_id` with Row Level Security (RLS)
- Team invitations with role-based access
- Org switching in the UI
- Module system: orgs can enable/disable features

**Billing tiers (Stripe integrated):**
| Tier | Features |
|------|----------|
| Free | 1 channel, basic sentry agent, 50 leads |
| Starter | 3 channels, core agents, 500 leads |
| Growth | 10 channels, advanced agents + roles, proposals, multi-user (5 seats) |
| Scale | Unlimited channels, all agents/roles, unlimited leads, 99 seats |

Stripe Price IDs are configured via environment variables (`STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_SCALE`).

---

## 12. Industry Packs

BitBit adapts its personality, KPIs, and features per industry vertical.

| Pack | Persona | Target |
|------|---------|--------|
| **Agency** | Operations assistant for digital agencies | Default |
| **Tradie** | Operations assistant for trades businesses | AU market |
| **Content Creator** | Operations assistant for content creators | Creator economy |

Each pack customizes:
- AI persona name and system prompt
- KPI dashboard widgets
- Feature module defaults
- Industry-specific terminology

---

## 13. Security and Compliance

| Feature | Implementation |
|---------|---------------|
| Row Level Security | Every table has org-scoped RLS policies |
| CRON_SECRET | All cron endpoints require bearer token auth |
| WORKER_AUTH_TOKEN | Worker-to-worker auth between Fly.io and Cloudflare |
| Injection Guard | AI prompt injection detection and neutralization |
| Timing Jitter | Anti-timing-attack protection on auth flows |
| GDPR Soft Delete | Account deletion with data anonymization |
| Audit Log | Full audit trail of all actions |
| Rate Limiting | Per-endpoint rate limiting with bucket system |
| Circuit Breaker | Prevents cascading failures in agent chains |
| Cost Guard | Per-agent and per-role AI spending limits |
| Response Guard | Validates all AI outputs before delivery |
| API Keys | User-managed API key system |

---

## 14. Data Visualization

Custom data visualization component library (no third-party charting dependency):

- **StatCard** - KPI cards with animated transitions
- **MiniSparkline** - Inline trend lines
- **MiniBarChart** - Compact bar charts
- **MiniDonut** - Donut/ring charts
- **MiniGauge** - Progress gauges
- **KPI Widget** - Configurable KPI display
- **Process Pipeline** - Multi-step process visualization
- **Progress Ring Icon** - Circular progress indicators
- **Timeline Bar** - Temporal data bars
- **Status Badge** - Status indicator badges
- **Chart Tooltip** - Interactive data tooltips
- **Glow Indicator** - Animated status glows
- **DataViz Showcase** - Interactive component gallery at `/showcase`

---

## 15. Infrastructure Details

### Database (Supabase)
- **118 migrations** covering core schema, channels, agents, leads, invoices, memory palace, revenue intelligence, meeting intelligence, client portal, swarm orchestration, billing, medications, knowledge graph, and more
- **Full RLS**: Every table scoped to org_id

### RAG Pipeline
- **Pinecone**: Vector store for semantic search
- **Voyage AI**: Embedding generation
- **Embedding Queue**: Async processing via cron (every 5 min)
- **Backfill**: Bulk embedding generation for historical data

### Error Monitoring
- **Sentry**: Full integration with source map upload

### Background Processing
- **Fly.io Workers**: Agent execution
- **Cloudflare Workers**: Edge cron dispatcher
- **Docker (VPS option)**: Chrome worker for web scraping (AusTender, etc.)

---

## 16. Public Pages

| Page | Route | Purpose |
|------|-------|---------|
| Pricing | `/pricing` | Tier comparison |
| Demo | `/demo` | Interactive demo |
| Waitlist | `/waitlist` | Email signup |
| Blog | `/blog` | Content marketing |
| Privacy Policy | `/privacy` | Legal |
| Terms of Service | `/terms` | Legal |

---

## 17. Technical Stats Summary

| Metric | Count |
|--------|-------|
| API Endpoints | 204 |
| React Components | 272 |
| Dashboard Tabs | 27 (23 tabs + 4 settings sub-tabs) |
| Cron Jobs (scheduled) | 22 |
| AI Agents | 11 |
| Channel Types | 20 (17 in unified inbox) |
| Database Migrations | 118 |
| Industry Packs | 3 |
| Billing Tiers | 4 (Free + 3 paid) |
| Client Portal Pages | 5 + login |
| Portal API Endpoints | 11 |
| Memory Palace Endpoints | 9 |
| Revenue Intelligence Modules | 6 |
| Role Engine Core Components | 10 |
| Role Sub-Modules | 24 (Sales 7, Finance 9, Comms 8) |
| Data Viz Components | 13 |

---

## 18. Demo Deployment

A standalone demo instance exists with:
- SQLite backend (no Supabase dependency)
- Self-contained demo data
- Deployed on Vercel

This can be used as an investor demo without affecting production data.

---

## 19. Competitive Position

BitBit combines capabilities typically found in 5+ separate SaaS products:

| Capability | Typical SaaS | BitBit |
|------------|-------------|--------|
| CRM | HubSpot ($45/mo) | Built-in Contacts + Lead Scoring |
| Inbox | Front ($19/seat/mo) | Unified Inbox (20 channel types) |
| AI Assistant | Lindy.ai ($49/mo) | 3-tier AI with 11 specialized agents |
| Project Management | Asana ($10.99/seat/mo) | Kanban + Task Management |
| Revenue Intelligence | Clari ($$$) | Cash flow, scoring, collection |
| Client Portal | Copilot ($29/mo) | White-label portal |
| Memory/Knowledge | Mem.ai ($14.99/mo) | Memory Palace (semantic) |

**Combined value replaced: $200+/seat/month in SaaS costs**

---

*This document was verified against the live codebase on 25 March 2026. All feature counts are confirmed from source code.*
