# T023 — Dashboard UX Polish

## Overview

Remaining UX improvements for non-technical agency owners. Progressive disclosure, dynamic KPIs, notification badges, and conversation interface unification.

## What Exists

- Mobile responsive: bottom-nav.tsx, sidebar collapse, card stacking
- Onboarding wizard: 5-step flow with first-login detection
- Dashboard tab: main landing page with KPI row, kanban board, inbox feed
- Dynamic KPI cards driven by industry pack (agency/content-creator/tradie)
- Notification center: exists with real badge counts on sidebar
- Channel adapters: WhatsApp, SMS, email each have separate command parsers

## Completed

| # | Task | Status |
|---|------|--------|
| 1 | Notification badges on sidebar items with real unread counts | Done (commit 79878b05) |
| 2 | Replace hardcoded dark-mode colors with CSS variables | Done (commit 86df925e) |
| 3 | Dynamic KPI cards per industry pack (StatCard redesign, no icons, charts, trends) | Done |
| 4 | KPIConfig type in IndustryPack, per-industry KPI definitions | Done |
| 5 | Wire dashboard-redesign.tsx to use industry-pack KPIs | Done |
| 6 | Interactive data-viz library (sparkline, bar, donut, gauge with hover tooltips) | Done (commit 9f34996f) |
| 7 | KPI card horizontal layout (value-left, chart-right) | Done (commit 9f34996f) |
| 8 | ChartTooltip shared component for all chart types | Done (commit 9f34996f) |

## Remaining Tasks

### Progressive Disclosure

| # | Task | Effort | Details |
|---|------|--------|---------|
| 1 | Add "Advanced" toggle to sidebar hiding: Analytics, Costs, Knowledge, Admin, Sentry tabs | 2 hr | Reduce cognitive load for basic users |
| 2 | Empty state illustrations for tabs with no data yet | 2 hr | Better first-run experience |

### Conversation Interface Unification

| # | Task | Effort | Details |
|---|------|--------|---------|
| 3 | Extract shared ConversationInterface from WhatsApp command parser | 3 hr | Common protocol for all messaging |
| 4 | Wire email-command.ts to use shared interface | 2 hr | Currently separate implementation |
| 5 | Wire sms.ts to use shared interface | 2 hr | Currently separate implementation |

## Acceptance Criteria

- [x] Dynamic KPI cards driven by industry pack with charts and trends
- [x] Dashboard uses CSS variables for proper light/dark mode support
- [x] Sidebar badges show real unread/pending counts
- [ ] Non-technical users see a simplified sidebar by default
- [ ] WhatsApp, email, and SMS command flows share one parser interface
