# Revenue Intelligence Engine — Roadmap

## Phase 26: Data Foundation & Core Engine
**Requirements**: REV-01, REV-02, REV-06
**Deliverables**:
- Database migration 110: revenue_snapshots, revenue_insights, client_scores, scope_tracking, cash_flow_projections, scenarios tables with RLS
- Revenue snapshot engine: batch compute from invoices table
- Client revenue scoring: weighted multi-factor scoring algorithm
- Core TypeScript types and interfaces

## Phase 27: Detection & Analysis Modules
**Requirements**: REV-03, REV-04, REV-05, REV-11
**Deliverables**:
- Unbilled work detector: task-to-invoice cross-reference with recovery proposals
- Scope creep monitor: deliverable tracking and change-order generation
- Collection acceleration: payment pattern analysis and reminder scheduling
- Retainer monitoring: renewal tracking and utilization alerts

## Phase 28: Projections & Scenarios
**Requirements**: REV-07, REV-08, REV-10
**Deliverables**:
- Cash flow projection engine: 30/60/90 day forecasting with exponential smoothing
- Scenario planner: Monte Carlo simulation for what-if analysis
- Weekly revenue digest generator: cron-ready summary builder

## Phase 29: API & Agent Integration
**Requirements**: REV-12, REV-13, REV-14
**Deliverables**:
- REST API routes at /api/revenue/*
- Revenue agent tool for chat integration
- Natural language query handler for business digital twin

## Phase 30: Dashboard & UI
**Requirements**: REV-09
**Deliverables**:
- Revenue radar dashboard component (glassmorphic design)
- Recoverable revenue cards with one-click actions
- Cash flow visualization
- Client scoring leaderboard
- Scenario comparison view
