# T023 — Dashboard UX Polish

## Overview

Remaining UX improvements for non-technical agency owners. Progressive disclosure, quick actions, notification badges, and conversation interface unification.

## What Exists

- Mobile responsive: bottom-nav.tsx, sidebar collapse, card stacking
- Onboarding wizard: 5-step flow with first-login detection
- Command Center tab: exists but needs quick-action buttons
- Notification center: exists but needs real data wiring
- Channel adapters: WhatsApp, SMS, email each have separate command parsers

## Tasks

### Progressive Disclosure

| # | Task | Effort | Details |
|---|------|--------|---------|
| 1 | Add "Advanced" toggle to sidebar hiding: Analytics, Costs, Knowledge, Admin, Sentry tabs | 2 hr | Reduce cognitive load for basic users |
| 2 | Set Command Center as default landing page (over kanban) | 1 hr | Config change + redirect |
| 3 | Empty state illustrations for tabs with no data yet | 2 hr | Better first-run experience |

### Quick Actions & Notifications

| # | Task | Effort | Details |
|---|------|--------|---------|
| 4 | Quick-action buttons on Command Center (approve, invoice, reply, dismiss) | 3 hr | One-tap common operations |
| 5 | Notification badges on sidebar items with real unread counts | 2 hr | Wire to real data queries |

### Conversation Interface Unification

| # | Task | Effort | Details |
|---|------|--------|---------|
| 6 | Extract shared ConversationInterface from WhatsApp command parser | 3 hr | Common protocol for all messaging |
| 7 | Wire email-command.ts to use shared interface | 2 hr | Currently separate implementation |
| 8 | Wire sms.ts to use shared interface | 2 hr | Currently separate implementation |

## Acceptance Criteria

- [ ] Non-technical users see a simplified sidebar by default
- [ ] Command Center is the first screen after onboarding
- [ ] Common actions available with one tap from Command Center
- [ ] Sidebar badges show real unread/pending counts
- [ ] WhatsApp, email, and SMS command flows share one parser interface
