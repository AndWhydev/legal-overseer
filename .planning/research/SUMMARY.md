# Research Summary: v1.3 Agent Roles & Autonomy Engine

## Key Findings

### Stack: Zero New Dependencies
Everything needed can be built on existing Supabase + Fly.io + Vercel. Custom FSM (no XState), Supabase task queue (no Inngest), Postgres RPCs for BI (no external analytics), extended semantic memory for roles. **Total new infra cost: $0.**

### Architecture: Event-Driven Roles, Not Long-Running Processes
Roles are activated by events and cron ticks, not running continuously. Fits within existing serverless + worker architecture. Fly.io handles heavy role execution, Vercel handles dashboard and chat, Cloudflare handles cron triggers.

### Features: 3 Roles + Autonomy Gate + Intelligence Layer
- **Table stakes**: Role engine, autonomy spectrum (Observer/Co-pilot/Autopilot), state persistence, multi-step workflows, role dashboard
- **Differentiators**: Revenue Radar, Client Health Score, Cash Flow Prophet, Capacity Oracle
- **Anti-features**: Role-to-role chat, granular permission matrix, custom role builder, model selection per role

### Critical Pitfalls to Prevent
1. **P1**: Roles that analyze but don't act → ship 3+ autonomous actions per role
2. **P3**: Cost explosion from always-on LLM calls → Haiku pre-screen + event-driven over polling
3. **P4**: State corruption from concurrent execution → Postgres advisory locks
4. **P7**: Subsumption breaks existing agents → wrap, don't rewrite
5. **P8**: Autopilot without audit trail → every action logs reasoning chain

## Recommended Build Order

1. Role Engine Foundation (state, autonomy gate, audit log, cost guards, concurrency)
2. Finance Role (wraps invoice agent + proactive behaviors)
3. Comms Role (wraps channel triage + drafting + relationship management)
4. Sales Role (wraps lead swarm + proposals + onboarding)
5. Intelligence Layer (Revenue Radar, Client Health, Cash Flow, Capacity)
6. Role Dashboard & Polish (unified activity feed, autonomy controls)

## Cost Projection
$17-40/mo per org incremental. Haiku pre-screening is the key cost lever.
