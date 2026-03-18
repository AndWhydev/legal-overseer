# Revenue Intelligence Engine — Requirements

## Overview
Proactive revenue intelligence system that finds money being left on the table, models the business as a digital twin, and enables what-if scenario planning.

## Requirements

### REV-01: Revenue Intelligence Data Model
Create core database tables for revenue insights, scope tracking, cash flow projections, client scoring, and scenarios. All tables must have RLS policies scoped to org_id. Monetary values stored as integers (cents).

### REV-02: Revenue Snapshot Engine
Compute and cache periodic revenue snapshots — total invoiced, collected, outstanding, overdue — per org. Powers all downstream analysis. Uses batch queries against invoices table, no LLM calls needed.

### REV-03: Unbilled Work Detection
Cross-reference tasks (completed, with time estimates) against invoices to find work that was never billed. Produce structured "recovery proposals" with evidence, suggested invoice amount, and confidence score.

### REV-04: Scope Creep Monitor
Track project deliverable count vs original scope. Flag projects where deliverable delta exceeds 20%. Generate change-order recommendations with itemized extra work.

### REV-05: Collection Acceleration
Track payment patterns per client (avg days to pay, overdue frequency). Trigger escalating reminder sequences for overdue invoices: gentle (3 days), firm (7 days), urgent (14 days).

### REV-06: Client Revenue Scoring
Score clients on weighted factors: invoice frequency, payment speed, project value, revenue trend, consistency. Produce ranked client list with trend direction and risk flags.

### REV-07: Cash Flow Projection
Project 30/60/90 day cash flow from pipeline data, outstanding invoices, recurring work, and known commitments. Use exponential smoothing on historical payment data.

### REV-08: Scenario Planner
Model "what-if" scenarios: rate changes, client churn, capacity changes. Use Monte Carlo simulation with historical data to produce probability-weighted outcomes.

### REV-09: Revenue Radar Dashboard
Dashboard component showing: recoverable revenue total, per-client breakdown, one-click action buttons. "You have $12,400 in recoverable revenue across 4 clients."

### REV-10: Weekly Revenue Digest
Auto-generated summary: invoiced, received, overdue, projected, unbilled. Designed for cron execution, stored in semantic_memories for agent reference.

### REV-11: Retainer Monitoring
Track retainer agreements: renewal dates, usage vs allocation, over/under utilization alerts. Flag forgotten renewals 30 days before expiry.

### REV-12: Revenue Intelligence API
REST API at /api/revenue/* exposing: snapshots, insights, projections, scores, scenarios. Authenticated via session, scoped to org.

### REV-13: Revenue Agent Tool
Agent tool that can be called from chat: "show me revenue health", "find unbilled work", "project cash flow". Uses Haiku for classification, Sonnet for generation.

### REV-14: Business Digital Twin Queries
Natural language queries against the business model: "what's my revenue per client?", "who pays slowest?", "what if I lose Client X?". Powered by structured data, not LLM hallucination.
