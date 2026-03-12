# Agent Frameworks & Tools Research for BitBit

Comprehensive analysis of open-source agent tools, frameworks, and integrations for SaaS AI assistants using Anthropic Claude API.

## 1. WEB BROWSING / SEARCH TOOLS FOR LLM AGENTS

### Browser-use (github.com/browser-use/browser-use)

**What it does**: Python/TypeScript framework wrapping Playwright for LLM agents to automate browser interactions. Agents can click, type, navigate, and extract data.

**Server-side viability**: ✅ YES — Runs in Node.js/Docker/Fly.io with Playwright headless

**Integration effort**: 2-3 days
- Vision API integration (screenshot → Claude vision → next action)
- Main cost: $0.03/screenshot with Claude vision

**GitHub**: ~2.5k stars (actively maintained)

**Verdict**: Good for complex login/form workflows. Vision-heavy (expensive per task).

---

### Stagehand (by Browserbase)

**What it does**: Managed browser automation platform. Cloud-hosted alternative to local Playwright with built-in vision.

**Server-side viability**: ✅ YES — API calls from Fly.io

**Integration effort**: 1-2 days (drop-in Playwright replacement)

**Costs**: $30/mo base + $0.001-0.005/action (cheaper vision than calling Anthropic directly)

**GitHub SDK**: ~500 stars (browserbase/sdk, service is proprietary)

**Verdict**: **BEST for production.** Lower ops burden, integrated vision. Recommended.

---

### Playwright MCP (Model Context Protocol)

**What it does**: Anthropic-compatible MCP server exposing Playwright as Claude-callable tools. Action-based (no vision loop).

**Server-side viability**: ✅ YES — Node.js process on Fly.io

**Integration effort**: 1 day (use Anthropic's MCP examples)

**Costs**: $0 (open source)

**Verdict**: **CHEAPEST & FASTEST.** Best if agents don't need visual feedback.

---

### Search APIs: Tavily vs SerpAPI vs Brave vs Exa

| Tool | Best for | Cost | Stars | Notes |
|------|----------|------|-------|-------|
| **Tavily** | AI agent research | $0 free tier / $100+ pro | ~1.5k | Designed for AI, includes summarization |
| **SerpAPI** | General queries | $0.005-0.02/query | ~2k | Google/Bing results, structured data |
| **Brave Search** | Privacy-focused | Free-$50/mo | ~1k | Real-time, privacy-first |
| **Exa** | Semantic search | $10/mo | ~800 | Neural ranking, finding related pages |

**Winner: TAVILY** — Built for AI agents, free tier sufficient for dev/testing, summarization built-in.

---

### Other Notable: Apify, Crawl4AI

**Apify**: Serverless scraping actors ($5/mo base). Overkill for agent workflows.

**Crawl4AI**: Python library (free, OSS). Good for bulk scraping, not agent loops.

---

## 2. COMPUTER-USE / DESKTOP AUTOMATION

### Anthropic Computer-Use Tool

**What it does**: Official tool for Claude to control desktop (click, type, screenshot).

**Reality**: Anthropic-hosted, can't run locally. Expensive ($0.03/screenshot).

**Server-side viability**: ⚠️ API-only (call via Anthropic API from Fly.io)

**Verdict**: Fallback only for legacy systems with no API. Too expensive for routine automation.

---

### Open Interpreter

**What it does**: Python library for Claude to execute code (Python/shell) sandboxed.

**Server-side viability**: ✅ YES — Docker/Fly.io (Python subprocess)

**Integration effort**: 2 days (Node.js wrapper + sandboxing)

**Costs**: $0 (OSS)

**GitHub**: ~7k stars

**Verdict**: Good for data analysis. Python dependency overhead.

---

### E2B Sandboxes

**What it does**: Serverless sandbox. Spin up Linux on-demand, agents code/execute, teardown.

**Server-side viability**: ✅ YES — API calls from Fly.io

**Integration effort**: 1-2 days (E2B SDK available)

**Costs**: $0.10/hr per sandbox ($0.00084 per 30-sec task). Free tier: 100 hrs/mo.

**Verdict**: Best for "run arbitrary code" workflows. Network latency overhead.

---

### Modal

**What it does**: Serverless compute (GPU-capable). Define functions, Modal scales.

**Best for**: GPU/ML workloads (training, image processing)

**Costs**: $10/mo base + $0.03125/GB-sec

**Verdict**: Overkill for agents unless you need GPUs.

---

### Daytona (Open Source)

**What it does**: Self-hosted E2B alternative. Full control, extra ops burden.

**GitHub**: ~1.2k stars (daytonaio/daytona)

**Verdict**: Not worth it over E2B unless privacy/compliance critical.

---

## 3. CREDENTIAL MANAGEMENT FOR AGENTS

### 1Password CLI + Service Account ⭐ RECOMMENDED

**What it does**: CLI tool to retrieve secrets from 1Password vault safely.

**How in container**:
- Install `op` binary (Linux amd64/arm64)
- Create service account in 1Password dashboard
- Set OP_SERVICE_ACCOUNT_TOKEN env var
- Agent calls: `exec('op item get ...')`

**Server-side viability**: ✅ YES — Fly.io/Docker

**Integration effort**: 1 day

**Costs**: $0 (already have 1Password Business)

**Verdict**: **BEST OPTION.** Simple, secure, no auth prompts needed.

---

### 1Password Connect Server

**What it does**: Self-hosted REST API for 1Password.

**Server-side viability**: ✅ YES — Docker container on Fly.io

**Integration effort**: 2 days (infrastructure setup)

**Verdict**: Overkill vs CLI. Extra ops for marginal benefit.

---

### Alternatives: HashiCorp Vault, AWS Secrets Manager, Fly.io Secrets

**HashiCorp Vault**: Enterprise-grade, 2-3 days to setup. Overkill.

**AWS Secrets Manager**: Only if moving to AWS. $0.40/secret/mo.

**Fly.io Secrets**: Good for static bootstrap creds, not dynamic agent retrieval.

---

## 4. READY-MADE AGENT TOOL KITS ON GITHUB

### Composio ⭐ EXCELLENT

**What it does**: Integration platform wrapping 100+ SaaS APIs (Slack, Notion, HubSpot, GitHub, Linear, Stripe, etc.) as LLM tools.

**Server-side viability**: ✅ YES — TypeScript SDK

**Integration effort**: 1-2 days per integration (pre-built available)

**Costs**: Free tier (50 API calls/mo), Paid: $30-300/mo

**GitHub**: ~3.5k stars (composio-ai/composio)

**Notable integrations**: Slack, HubSpot, Notion, Linear, GitHub, Jira, Stripe, Gmail, Google Calendar, Intercom, Airtable, Twitter/X

**Verdict**: **SAVES WEEKS OF INTEGRATION WORK.** Highly recommended for multi-channel agents.

---

### LangChain Tools

**What it does**: Python library with 50+ pre-built tools (Google Search, Shell, Calculator, Wikipedia).

**For BitBit (Node.js)**:
- LangChain.js exists (~9k stars) but fewer tools than Python
- Integration: 1-2 days per tool

**Verdict**: Use individual tools as reference. Don't adopt framework (incompatible with your Anthropic loop).

---

### Others: Langroid, AutoGPT, Smolagents

**Langroid**: Python agent framework (~1.6k stars). Not applicable to Node.js.

**AutoGPT**: Too heavy/chaotic. ~150k stars but low quality.

**Smolagents** (Hugging Face): Python only. Skip for Node.js.

---

## 5. PER-USER CONTAINER PATTERNS

### Fly Machines (Sleep-to-Zero) ⭐ BEST FOR BITBIT

**What it does**: On-demand compute on Fly.io. Start Machine on request, auto-stop when idle, pay per second.

**Billing**:
- Active: $0.00001947/sec
- Sleeping: $0.0000000137/sec (10x cheaper)
- **Example**: 10 users, 5 min active/day = ~$0.50/mo

**How for per-user agents**:
- User login → POST /machines → creates isolated container
- Agent code runs inside
- On idle → Fly auto-stops
- Next login → warm up from snapshot (3-5s)

**Server-side viability**: ✅ YES — native Fly.io feature, designed for this

**Integration effort**: 2-3 days
- Wrapper for Fly Machines API (create, stop, SSH)
- Deploy agent Dockerfile
- Link Machine to user org

**Verdict**: **PERFECT FOR BITBIT.** Ultra-cheap, already on Fly.io, minimal setup.

---

### E2B Sandboxes

**Costs**: $0.10/hr ($0.000028/sec). Free: 100 hrs/mo.

**Comparison to Fly Machines**:
- E2B: Easier setup, faster cold start (~500ms), pricier per-task
- Fly: Cheaper, more control, slower cold start (3-5s)

**Verdict**: Use E2B if latency critical. Use Fly Machines if cost matters.

---

### Modal

**For GPU workloads**: $10/mo base + compute costs

**Verdict**: Overkill unless you need GPUs.

---

### Daytona

**Open-source E2B**: Extra ops burden. Not worth it.

---

## FINAL RECOMMENDATIONS FOR BITBIT

### Phase 1 (2 weeks) — Minimum Viable Agent Suite

**1. Web Search**: Tavily
- Cost: $0 (free tier)
- Effort: 4 hours
- Impact: Agents can research topics

**2. Browser Automation**: Playwright MCP
- Cost: $0
- Effort: 1 day
- Impact: Agents click, navigate, extract text

**3. Code Execution**: Open Interpreter (Python subprocess)
- Cost: $0
- Effort: 2 days
- Impact: Agents analyze data, run scripts

**4. Secrets Management**: 1Password CLI + service account
- Cost: $0 (already have 1Password)
- Effort: 4 hours
- Impact: Safe API key retrieval

**Total: 4-5 days effort | $0 cost**

---

### Phase 2 (Weeks 3-4) — Production-Ready

**1. Per-user Sandboxes**: Fly Machines
- Cost: $0.50-5/mo (10-100 users)
- Effort: 2-3 days
- Impact: Agent isolation, no crosstalk

**2. SaaS Integrations**: Composio (3-5 tools: Slack, email, docs, CRM)
- Cost: $30/mo base
- Effort: 3-5 days (1 day each)
- Impact: Agents interact with external services

**3. Browser Upgrade** (optional): Stagehand
- Cost: $30/mo + $0.001-0.005/action
- Effort: 1 day
- Impact: Vision support, login flows, forms

**Total: 7-8 days effort | $30-60/mo cost**

---

### Phase 3 (Month 2+) — Advanced

- Computer-use (fallback, expensive)
- E2B Sandboxes (if Fly latency unacceptable)
- Modal (GPU workloads)
- Multi-language agents (Python + Node)

---

## QUICK CHECKLIST

Phase 1:
- [ ] Tavily Search integration
- [ ] Playwright MCP server
- [ ] Open Interpreter wrapper
- [ ] 1Password CLI + service account

Phase 2:
- [ ] Fly Machines per-user sandbox
- [ ] Composio (start with Slack, email)
- [ ] Production hardening (RLS, rate limiting, audit)

Operations:
- [ ] Cost monitoring (Fly.io/Vercel budget alerts)
- [ ] Service account rotation policy
- [ ] Secret scanning in CI/CD

