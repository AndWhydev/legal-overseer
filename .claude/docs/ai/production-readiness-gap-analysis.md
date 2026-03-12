# BitBit Production Readiness Gap Analysis

**Date**: 2026-03-11
**Audience**: Marketing agencies, tradespeople (beta users)
**Stack**: Next.js 16, Anthropic Claude, Supabase, Fly.io workers, Cloudflare edge cron

---

## Executive Summary

BitBit has solid foundations for beta: Sentry error tracking, structured logging, API rate limiting, usage metering scaffolding, RLS-based multi-tenancy, and a privacy policy. However, five critical gaps remain before real users trust the platform with their business data: (1) no LLM-specific observability, (2) no agent guardrails or human-in-the-loop controls, (3) no per-tenant cost metering enforcement, (4) no safe rollout mechanism for agent changes, and (5) incomplete compliance posture for Australian business data.

This report covers each area with current best practices, what BitBit has vs what it is missing, and prioritized recommendations split into quick wins (days) and long-term investments (weeks/months).

---

## 1. AI Agent Observability and Monitoring

### Current Best Practices (2026 SOTA)

The observability landscape for AI agents has matured around four pillars:

**Tracing**: Multi-step agent workflows need hierarchical span capture (not flat request logs). OpenTelemetry semantic conventions for GenAI now define standard attributes. Platforms like Langfuse and Arize Phoenix capture branching decision trees where agents call tools in parallel, retry, or delegate to sub-agents.

**Cost tracking**: Token costs must be attributed per-span, not just per-request. Helicone (gateway proxy) captures 100% of token counts at the API boundary. Langfuse attributes costs to individual spans within multi-step traces. LiteLLM and Portkey provide hierarchical budget enforcement (org > team > user > key) with 11us overhead.

**Latency**: Time-to-first-token (TTFT), inter-token latency (ITL), and end-to-end latency are distinct metrics. P95/P99 matter more than averages. Each agent step (planning, tool execution, reasoning) should be independently measured.

**Quality evaluation**: LLM-as-judge scoring runs continuously on production traces. Braintrust provides 25+ pre-built scorers. Teams combine deterministic checks (schema compliance), statistical anomaly detection, and human review for high-stakes cases.

**Leading platforms**:
| Platform | Strength | Model |
|----------|----------|-------|
| Langfuse | Full tracing + eval, self-hostable, OpenTelemetry native | Open-source / cloud |
| Helicone | Gateway proxy, zero-code cost tracking, budget enforcement | Cloud + OSS |
| Braintrust | Evaluation-first, cost-quality tradeoff analysis | Cloud |
| Arize Phoenix | Enterprise governance, multi-provider, anomaly detection | OSS + enterprise |
| LangSmith | Tight LangChain integration | Cloud |

### What BitBit Has

- Sentry integration (error tracking, DSN configured, Vercel env vars set)
- Structured logger (`logger.ts`) replacing all `console.*` calls
- Basic observability comment in agent engine ("log the late plan for observability only")
- Agent runs table in Supabase (migration 037) with engine columns
- Usage metering scaffolding (`usage-metering.ts`) tracking `token_usage`, `agent_run`, `storage_mb`

### What BitBit is Missing

- **No LLM trace capture**: Agent engine does not emit spans for individual tool calls, planning steps, or reasoning chains
- **No token cost attribution per step**: Usage metering estimates cost but does not break down by agent step or tool
- **No latency instrumentation**: No TTFT, ITL, or per-step duration metrics
- **No quality evaluation**: No LLM-as-judge scoring, no hallucination detection, no accuracy measurement
- **No observability dashboard**: Costs tab exists in UI but has no real data pipeline
- **No budget alerts**: No automated notification when spending exceeds thresholds

### Priority Recommendations

**Quick wins (1-3 days each)**:
1. **Add Langfuse** (open-source, self-hostable). Wrap the Anthropic SDK client with Langfuse's `observeAnthropicSdk()`. This gives you traces, token costs, and latency for every Claude call with ~10 lines of code. Langfuse has a native Anthropic integration.
2. **Log token counts per agent run** to the existing `agent_runs` table. Anthropic responses already include `usage.input_tokens` and `usage.output_tokens` -- persist these.
3. **Add cost estimation to the costs tab**. Use Anthropic's published pricing to compute daily/weekly cost from the token counts already in usage-metering.

**Long-term investments (1-4 weeks)**:
4. Instrument each agent tool call as a Langfuse span (planning, tool execution, observation).
5. Add LLM-as-judge evaluation on a sample of production traces (start with factuality scoring).
6. Build a cost anomaly alerter: flag when daily token spend exceeds 2x the 7-day rolling average.
7. Add Helicone as an API gateway proxy for hard budget enforcement at the API boundary.

---

## 2. AI Agent Safety and Guardrails

### Current Best Practices

Production AI agents need layered guardrails:

**Autonomy levels**: Define what the agent can do autonomously vs what requires human approval. Low-risk (summarization, content tagging) = autonomous. High-risk (financial actions, client commitments, outbound comms) = human-in-the-loop.

**PII handling**: Mask PII in prompts before sending to LLM APIs. Redact PII from logged outputs. Integrate with DLP (Data Loss Prevention) patterns. Never include raw credit card numbers, TFNs, or passwords in LLM context.

**Financial action limits**: Cap the monetary value of actions an agent can take autonomously. Invoices over $X require human approval. No unsupervised payment processing.

**Outbound communication limits**: Rate limit outbound emails, SMS, and messages per org per hour. Require human approval for bulk sends. Never let an agent send to a contact list without explicit user confirmation.

**Preventing unauthorized commitments**: Agents must never confirm delivery dates, agree to pricing, sign contracts, or make legal commitments. System prompts must explicitly prohibit this. Output filters should catch commitment language.

**Audit trails**: Every agent action must be logged with: who triggered it, what the agent decided, what tools it called, what the outcome was, and whether a human approved it. Immutable, queryable, retained for compliance periods.

### What BitBit Has

- API rate limiter (`api-rate-limiter.ts`) with sliding window per IP: auth (10/min), cron (5/min), API (60/min), webhook (200/min)
- Channel-level rate limiter (`rate-limiter.ts`) for outbound messages
- Prompt builder (`prompt-builder.ts`) with system instructions
- Dead letter queue (`dead-letter.ts`) for failed agent actions
- Agent retry logic (`retry.ts`)
- RLS policies on Supabase tables (org-level isolation)
- Middleware auth checks on API routes

### What BitBit is Missing

- **No human-in-the-loop workflow**: No approval queue for high-risk actions. Agents can send emails, SMS without user confirmation
- **No PII detection/masking**: No scanning of LLM inputs or outputs for PII before logging or sending to Anthropic
- **No financial action limits**: No caps on invoice amounts, payment actions, or monetary commitments the agent can make
- **No commitment detection**: No output filter to catch when the agent makes promises, agrees to terms, or commits to deadlines
- **No outbound communication caps per org**: Rate limiter is per-IP, not per-org. No daily send limits per tenant
- **No immutable audit log**: Agent actions are logged but not in an append-only, tamper-evident format
- **No agent kill switch**: No way to instantly disable all agent actions for a specific org without a code deploy

### Priority Recommendations

**Quick wins (1-3 days each)**:
1. **Add human-approval gate for outbound comms**: Before sending email/SMS, queue the action and notify the user in the dashboard. Auto-approve after 5 minutes if no rejection (configurable per org). This is the single most important guardrail for beta.
2. **Add per-org daily send limits**: Cap outbound emails at 50/day and SMS at 20/day per org during beta. Store counts in Supabase, check before send.
3. **Add agent kill switch**: A boolean flag `agents_enabled` on the `organisations` table. Check it at the top of the agent engine. Toggleable from the dashboard.
4. **Add commitment-prevention instructions to system prompt**: Explicit instruction that the agent must never confirm pricing, agree to deadlines, or make contractual commitments. Add an output regex filter for phrases like "I confirm", "we agree", "guaranteed by".

**Long-term investments (2-6 weeks)**:
5. Implement PII detection using regex patterns (AU phone, TFN, credit card, email) and mask before sending to Anthropic.
6. Build an immutable audit log table (append-only, no UPDATE/DELETE RLS policy) capturing every agent decision and action.
7. Add configurable autonomy levels per agent type per org (e.g., "email agent: draft only" vs "email agent: send autonomously").
8. Implement financial action thresholds: agent can create invoices under $500 autonomously, requires approval above that.

---

## 3. Multi-Tenant AI Agent Cost Management

### Current Best Practices

The industry has converged on a gateway-based approach with hierarchical budget enforcement:

**Architecture**: Route all LLM API calls through a metering layer (gateway proxy like LiteLLM, Helicone, Portkey, or custom middleware). Tag every request with `tenant_id`, `feature_id`, `agent_id`. Log to a time-series store.

**Hierarchical budgets**: Org > Team > User > API Key, each with independent limits. When any level exceeds its budget, requests are blocked. In-memory enforcement adds ~11us per request.

**Billing models** for AI SaaS:
- Tiered plans with token allowances (Starter: 200K tokens/mo, Pro: 1M tokens/mo)
- Pay-as-you-go overage at a per-1K-token rate
- Soft caps (alert) vs hard caps (block)
- Usage dashboards showing consumption, forecast, and remaining budget

**Noisy neighbor prevention**: Per-tenant rate limiting (requests/min AND tokens/min). Queue non-critical tasks for off-peak. Route heavy users to separate model deployments if needed.

**Cost attribution**: Track input_tokens, output_tokens, cached_tokens, and model per request. Multiply by published pricing. Aggregate by tenant, feature, and time period. Expose via API for billing system integration.

### What BitBit Has

- Usage metering module (`usage-metering.ts`) tracking `token_usage`, `agent_run`, `storage_mb` event types
- Billing API routes: `/api/billing/usage`, `/api/billing/checkout`, `/api/billing/webhook`
- Stripe integration (webhook configured, signing secret set)
- Multi-tenancy with org-based isolation (RLS)
- Two pricing tiers defined (Personal free, Pro paid via Stripe)

### What BitBit is Missing

- **No per-org token budget enforcement**: Metering records events but does not block when limits are exceeded
- **No real-time cost dashboard for tenants**: Usage API exists but no UI showing "you've used X of Y tokens this month"
- **No per-org rate limiting on LLM calls**: Rate limiter is per-IP, not per-tenant
- **No budget alerts**: No email/webhook when a tenant approaches 80% of their plan allowance
- **No cost attribution by feature/agent**: Token usage is not tagged by which agent or feature consumed them
- **No hard spending caps**: No mechanism to stop LLM calls when a tenant exceeds their plan

### Priority Recommendations

**Quick wins (1-3 days each)**:
1. **Tag every Anthropic API call with org_id and agent_type**. Pass these as metadata; log them alongside token counts in the usage metering table.
2. **Add token budget column to organisations table**. Default: 500K tokens/month for free, 5M for Pro. Check remaining budget before each agent run.
3. **Wire the costs tab UI** to query the existing usage-metering data grouped by day and agent type.

**Long-term investments (2-6 weeks)**:
4. Build an LLM gateway middleware (or adopt LiteLLM proxy) that enforces per-org token budgets and rate limits in-memory before requests reach Anthropic.
5. Implement usage alert emails at 75%, 90%, 100% of plan allowance using Resend.
6. Add a tenant-facing usage dashboard showing daily consumption, projected monthly cost, and remaining allowance.
7. Integrate metered billing with Stripe: report token overages as metered usage items on the subscription.

---

## 4. AI Agent Testing in Production

### Current Best Practices

AI agents need deployment strategies borrowed from DevOps but adapted for non-deterministic systems:

**Shadow mode**: New agent version processes real traffic in parallel with the production version. Shadow output is logged but never shown to the user. Compare shadow vs production outputs for quality regression before promoting.

**Progressive delivery (canary)**: Roll out agent changes to 1% -> 5% -> 25% -> 50% -> 100% of traffic. Monitor quality metrics at each stage. Automated rollback if quality drops below threshold.

**Kill switches**: Instant ability to disable an agent version without a code deploy. Feature flags are the standard mechanism. Treat each agent version as a feature flag.

**Quality gates**: Automated checks that must pass before increasing rollout percentage: latency P95 < threshold, error rate < threshold, LLM-as-judge quality score > threshold, cost per request < threshold.

**A/B testing agent responses**: Split traffic between prompt variants or model versions. Measure user satisfaction (thumbs up/down), task completion rate, and cost. Use statistical significance testing before declaring a winner.

**Human review sampling**: Route a configurable percentage of agent outputs to human reviewers before delivery. Essential during beta. Gradually reduce as confidence grows.

### What BitBit Has

- Vercel deployment (automatic preview deployments per PR)
- Sentry for error detection post-deploy
- Test suite (1462 tests passing)
- Agent engine with tool call architecture that could support routing

### What BitBit is Missing

- **No shadow mode**: No ability to run two agent versions in parallel
- **No feature flags**: No LaunchDarkly, Vercel Feature Flags, or equivalent
- **No agent kill switch** (as noted in guardrails section)
- **No quality gates**: No automated quality checks in the deployment pipeline
- **No A/B testing infrastructure**: No mechanism to split agent traffic
- **No human review sampling**: No way to route a % of agent outputs for human review before delivery
- **No rollback mechanism**: Agent changes deploy with the full Next.js app; no independent agent versioning

### Priority Recommendations

**Quick wins (1-3 days each)**:
1. **Add Vercel Feature Flags** (built into the platform, free tier available). Gate each agent behind a flag. This gives you instant kill switches and % rollout control.
2. **Add thumbs up/down to agent responses in the chat UI**. Store feedback in Supabase. This is your ground truth for quality measurement.
3. **Add a human review queue for beta**: Route 100% of outbound actions (email, SMS, invoice creation) through an approval queue during the first 2 weeks of beta. Reduce to 25% as confidence grows.

**Long-term investments (2-6 weeks)**:
4. Build shadow mode: when a new prompt version is deployed, run both old and new in parallel, log both outputs, compare quality scores.
5. Implement quality gates in CI: run a benchmark suite of 50-100 test cases against the agent before merge. Fail the PR if quality score drops.
6. Add A/B testing: split agent traffic by org (not by request) to avoid inconsistent behavior within a single user session.

---

## 5. Data Privacy for AI Agents Handling Business Data

### Current Best Practices

AI agents handling business emails, invoices, and client communications must comply with multiple frameworks:

**Australian Privacy Act (Privacy Act 1988)**:
- OAIC published specific AI guidance in Oct 2024: APPs apply to all AI use of personal information
- Must update privacy policies to disclose AI use
- Must conduct Privacy Impact Assessments (PIAs) before deploying AI that processes personal data
- Individuals must be informed when AI is used to make decisions about them
- Must implement data minimization: only send necessary data to AI models
- Must have a process for individuals to access, correct, or delete their data

**GDPR** (relevant if any EU/UK users):
- Lawful basis for processing (consent or legitimate interest)
- Data Processing Agreements (DPAs) with sub-processors (Anthropic, Supabase, Vercel)
- Right to explanation for automated decisions
- Data portability and erasure rights
- 72-hour breach notification requirement

**SOC 2 Type II** (expected by agency clients):
- Not legally required but increasingly table-stakes for B2B SaaS
- Covers: security, availability, processing integrity, confidentiality, privacy
- Typical timeline: 6-12 months to achieve

**Data residency**:
- Australian businesses may require data to stay in AU
- Supabase is in Mumbai (closest to AU but not in AU)
- Anthropic API processes data in the US
- Vercel edge functions execute globally

**AI-specific requirements**:
- Anthropic's data policy: API inputs are not used for training (commercial API terms)
- Must disclose to users that their data is processed by AI
- Must implement data retention policies (don't keep business data indefinitely)
- Must have incident response plan for AI-specific failures (hallucinated data leaks, PII in logs)

### What BitBit Has

- Privacy Policy page (`/terms`)
- Terms of Service
- Supabase RLS for tenant isolation
- Auth middleware protecting API routes
- Structured logging (not leaking to third parties beyond Sentry)
- Git history scrubbed of leaked keys
- All API keys rotated
- HTTPS everywhere (Vercel + Cloudflare)

### What BitBit is Missing

- **No Privacy Impact Assessment**: No documented PIA for AI processing of user business data
- **No data processing disclosure for AI**: Privacy policy likely does not explicitly state that business data is sent to Anthropic's API
- **No DPAs with sub-processors**: No formal agreements with Anthropic, Supabase, Vercel regarding data handling
- **No data retention policy**: No automated deletion of old agent runs, messages, or business data
- **No data minimization in LLM context**: Full business context sent to Claude without filtering unnecessary PII
- **No data residency documentation**: No disclosure that data transits US (Anthropic), India (Supabase Mumbai), and global (Vercel edge)
- **No SOC 2 program**: Not started; 6-12 month process
- **No breach notification process**: No documented procedure for notifying users of data incidents
- **No user data export/deletion**: No self-serve mechanism for users to export or delete their data

### Priority Recommendations

**Quick wins (1-3 days each)**:
1. **Update the privacy policy** to explicitly disclose: (a) user data is processed by Anthropic's Claude API, (b) data transits US servers, (c) Anthropic does not use API data for training. This is legally required under the Australian Privacy Act.
2. **Add an AI disclosure banner** in the chat interface: "Responses are generated by AI. Review important information before acting on it."
3. **Document data residency**: Create a security page listing where data is stored and processed (Supabase Mumbai, Anthropic US, Vercel global, Fly.io Sydney).
4. **Add data retention policy**: Auto-delete agent run logs older than 90 days. Keep audit-critical records for 7 years per Australian tax requirements.

**Long-term investments (1-6 months)**:
5. Conduct a formal Privacy Impact Assessment before general availability.
6. Execute DPAs with Anthropic, Supabase, and Vercel.
7. Build self-serve data export (JSON download of all user data) and account deletion.
8. Begin SOC 2 Type II readiness program (Vanta or Drata can accelerate this to 3-4 months).
9. Evaluate Anthropic's AU/APAC endpoints when available for data residency compliance.

---

## Consolidated Priority Matrix

### Must-Have Before Beta (Week 1)

| # | Item | Area | Effort |
|---|------|------|--------|
| 1 | Human-approval gate for outbound comms (email, SMS) | Guardrails | 2 days |
| 2 | Agent kill switch (per-org flag) | Guardrails | 0.5 day |
| 3 | Update privacy policy with AI/Anthropic disclosure | Privacy | 0.5 day |
| 4 | AI disclosure banner in chat UI | Privacy | 0.5 day |
| 5 | Per-org daily send limits (email 50/day, SMS 20/day) | Guardrails | 1 day |
| 6 | Commitment-prevention in system prompt + output filter | Guardrails | 1 day |
| 7 | Vercel Feature Flags for agent kill switches | Testing | 1 day |
| 8 | Thumbs up/down feedback on agent responses | Testing | 1 day |

### Should-Have for Beta (Weeks 2-3)

| # | Item | Area | Effort |
|---|------|------|--------|
| 9 | Langfuse integration (wrap Anthropic SDK) | Observability | 1 day |
| 10 | Log token counts per agent run to Supabase | Observability | 1 day |
| 11 | Tag LLM calls with org_id + agent_type | Cost Mgmt | 1 day |
| 12 | Token budget column + pre-run check | Cost Mgmt | 1 day |
| 13 | Wire costs tab to real usage data | Cost Mgmt | 2 days |
| 14 | Data residency documentation page | Privacy | 0.5 day |
| 15 | Data retention policy (90-day auto-delete) | Privacy | 1 day |
| 16 | Human review queue (100% during first 2 weeks) | Testing | 2 days |

### Should-Have for GA (Months 1-3)

| # | Item | Area | Effort |
|---|------|------|--------|
| 17 | PII detection/masking before LLM calls | Guardrails | 1 week |
| 18 | Immutable audit log table | Guardrails | 1 week |
| 19 | LLM gateway with per-org budget enforcement | Cost Mgmt | 2 weeks |
| 20 | Usage alert emails (75%, 90%, 100%) | Cost Mgmt | 3 days |
| 21 | Shadow mode for agent version testing | Testing | 2 weeks |
| 22 | Quality gates in CI (benchmark suite) | Testing | 1 week |
| 23 | Formal Privacy Impact Assessment | Privacy | 1 week |
| 24 | DPAs with Anthropic, Supabase, Vercel | Privacy | 2 weeks |
| 25 | Self-serve data export + account deletion | Privacy | 1 week |
| 26 | LLM-as-judge evaluation on production traces | Observability | 2 weeks |
| 27 | Cost anomaly alerter | Observability | 3 days |
| 28 | Configurable autonomy levels per agent per org | Guardrails | 2 weeks |

### Nice-to-Have for Scale (Months 3-6)

| # | Item | Area | Effort |
|---|------|------|--------|
| 29 | SOC 2 Type II readiness program | Privacy | 3-6 months |
| 30 | A/B testing infrastructure for agents | Testing | 2 weeks |
| 31 | Helicone gateway proxy for hard budget enforcement | Cost Mgmt | 1 week |
| 32 | Stripe metered billing for token overages | Cost Mgmt | 2 weeks |
| 33 | Per-step latency instrumentation (TTFT, ITL) | Observability | 1 week |
| 34 | Hallucination detection scoring | Observability | 2 weeks |

---

## Key Sources

- Langfuse AI Agent Observability (langfuse.com/blog/2024-07-ai-agent-observability-with-langfuse)
- Braintrust Best AI Agent Observability Tools 2026 (braintrust.dev/articles/best-ai-agent-observability-tools-2026)
- OpenTelemetry AI Agent Observability (opentelemetry.io/blog/2025/ai-agent-observability)
- Reco.ai Guardrails for AI Agents (reco.ai/hub/guardrails-for-ai-agents)
- Fiddler Production-Ready Agent Playbook (fiddler.ai/blog/production-ready-agent-playbook)
- LiteLLM Multi-Tenant Architecture (docs.litellm.ai/docs/proxy/multi_tenant_architecture)
- Portkey Multi-Tenant AI Feature (portkey.ai/docs/guides/use-cases/multi-tenant-ai-feature)
- Safe Rollouts for AI Agents (appropri8-astro.pages.dev/blog/2025/12/08/safe-rollouts-ai-agents)
- OAIC AI Privacy Guidance (twobirds.com/en/insights/2025/australia/australias-privacy-regulator-releases-new-guidance)
- Kinde Billing for AI APIs (kinde.com/learn/billing/pricing/billing-for-ai-and-llm-based-apis)
