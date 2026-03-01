# Phase 14: Channel Relay & OAuth - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can connect all 6 channels (Gmail, Outlook, WhatsApp, Asana, Calendly, Stripe) from settings via OAuth/pairing flows. Connected channels show live status, and messages flow through the classification pipeline with deduplication. OAuth tokens refresh automatically. This phase wires real channel connectivity — the channel adapter stubs from earlier milestones become functional.

</domain>

<decisions>
## Implementation Decisions

### Connection flow UX
- OAuth channels (Gmail, Outlook, Asana, Calendly, Stripe) use in-app modal/popup — user stays on settings page, no full-page redirect
- WhatsApp uses QR code pairing in a modal (WhatsApp Web-style) with live status updates as user scans
- On success: channel card animates to connected state with green badge, last sync time, disconnect option
- On error: toast notification for immediate feedback + persistent status badge on card ("Needs attention") until resolved

### Channel settings layout
- Cards grid layout (responsive, 2-3 columns) — one card per channel
- Each connected card shows: channel icon, name, status dot (green/yellow/red), last sync time, message count processed
- All 6 channels always visible — connected ones show status, unconnected ones show "Connect" button
- Click a connected card opens a slide-out drawer with full channel config (sync frequency, filters, permissions)

### Message routing behavior
- Deduplication: message ID check first (fast), then content hash fallback for cross-channel dedup within 5-minute window
- Classification failure: queue for retry (up to 3 attempts with backoff), then mark as "unclassified" for human review in inbox
- Sync strategy: hybrid — webhooks for immediate delivery where supported (Gmail/Outlook push notifications), polling every 1-2 min as safety net
- Burst handling: classify all messages, queue if overwhelmed and process sequentially — no messages skipped

### Token lifecycle
- Notify on refresh failure: dashboard warning badge on channel card + email alert to user
- 24-hour grace period: retry token refresh every hour for 24h before marking channel as "Disconnected — needs re-auth"
- Token storage: encrypted at rest with server-side key in Supabase (not plain text, even with RLS)
- On disconnect: keep all historical messages — only sever the live connection. Reconnecting resumes from where it left off

### Claude's Discretion
- Exact card animation and transition design
- Slide-out drawer layout and field arrangement
- Specific retry backoff timing for message classification
- Webhook vs polling decision per channel based on provider API capabilities
- Encryption key management approach for token storage

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 14-channel-relay-oauth*
*Context gathered: 2026-03-01*
