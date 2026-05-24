# Legal Overseer

AI legal operations system for Australian law firms — the most
comprehensive AI-powered paralegal replacement available, deployed
on-prem on a firm's own server. Connects to the firm's email inboxes,
drafts work product (contracts, memos, letters, court documents),
tracks deadlines and limitation periods, monitors regulatory change,
runs analytics and integrations across the firm, and maintains an
immutable audit log of every action.

**Hard product invariant:** every AI output requires admitted-lawyer
review before it reaches a client or court. The system never sends
substantive correspondence on its own. See `src/compliance/`.

## Architecture

```
src/
  skills/                 Six legal skills (registry + per-skill runners)
    contract-review/         Read contracts, flag risks
    legal-research/          AustLII research → research memo
    matter-drafting/         Letters, memos, contracts, court documents
    matter-management/       Deadlines, limitation periods, SLAs
    client-comms/            Client-facing email drafts
    compliance-monitor/      Regulatory / legislative change scan
  compliance/             Six hard product constraints + new compliance modules
    reviewGate.ts            Mandatory human review queue
    disclaimer.ts            AI-DRAFTED disclaimer on every output
    citationVerifier.ts      AustLII probe for every cited authority
    privilege.ts             Local redaction before any external model call
    audit.ts                 Append-only hash-chained legal audit log
    billing.ts               AI time + spend per matter vs lawyer time
    conflicts.ts             Conflict-of-interest checker
    aml.ts                   AML screening + monthly compliance report
    pi-risk.ts               1-10 PI risk scoring with partner alerts
    regulatory-calendar.ts   CPD / PC / trust / PII renewal calendar
    file-review.ts           Periodic file review scheduler
    costs-disclosure.ts      LPUL costs disclosure checker
    trust-reconciliation.ts  Bank CSV import + reconciliation reports
  intelligence/           Seven Opus-powered analysis tools
    outcome-predictor.ts     Win/lose/settle estimation
    strategy-generator.ts    Auto-drafted matter strategy
    deposition-prep.ts       Cross-examination preparation
    negotiation-tracker.ts   Version-tracked contract negotiation
    fee-benchmarking.ts      Law-Society benchmark comparison
    jurisdiction-compare.ts  Multi-jurisdiction comparison memo
    plain-english.ts         Client-facing plain-English explainer
    market-intelligence.ts   Monthly market intelligence reports
    competitor-analysis.ts   Publicly available competitor signals
  documents/              Document management
    version-control.ts       Full document version history + rollback
    classifier.ts            Haiku-driven document classification
    esignature.ts            Built-in e-signature (DocuSign-ready)
    redline.ts               LCS-based redline comparison
  knowledge/              Firm-wide knowledge
    knowledge-base.ts        Versioned firm KB with prompt-injection
    clause-library.ts        Approved clause library with usage tracking
  search/                 Smart search
    smart-search.ts          Token-vector cosine search across the firm
  clients/                Client CRM
    repo.ts                  Clients table
    health-score.ts          Weekly weighted client health score
    satisfaction.ts          5-question satisfaction surveys
    referrals.ts             Referral tracking + thank-you drafts
  onboarding/             Zero-touch client onboarding
    client-onboarding.ts     Conflict → engagement letter → e-sign → ID
  matters/                Matter-scoped features
    budgeting.ts             Per-matter budget with 75/90 % alerts
    supervision.ts           Secondary-review queue for junior work
    bulk-import.ts           CSV / LEAP / Clio import
  collaboration/          Internal collaboration
    matter-chat.ts           Internal chat with @mentions and action items
    external-counsel.ts      Token-protected barrister portal
    file-notes.ts            Dictation → structured file note
  communication/          Outbound channels
    outbound-email.ts        Per-lawyer SMTP w/ review gate
    document-chasing.ts      3-day / 7-day / 14-day chase workflow
    call-logging.ts          Phone-call dictation + follow-up drafts
    sms.ts                   Twilio SMS with STOP-handling
  billing/                Invoicing
    invoice-generator.ts     Time-entry → invoice draft → review
    payment-chasing.ts       7/14/30-day overdue chase
  analytics/              Firm BI
    profitability.ts         Multi-dimensional revenue / profit
    lawyer-performance.ts    Per-lawyer KPIs
    pipeline.ts              30/60/90-day forecasting
  integrations/           External systems
    austlii/                 AustLII real-time search
    leap/, clio/             Bidirectional matter sync
    xero/                    Invoice + payment sync
    docusign/                E-signature provider
    teams/                   Microsoft Teams notifications
    outlook/                 Outlook add-in API + manifest
    zapier/                  Outbound + inbound webhooks (HMAC)
    calendar-sync.ts         Google / Outlook OAuth + ICS feed
  legal-intake/           New-matter intake pipeline (LEGAL_EMAIL inbox)
  inbox-monitor/          IMAP poller for LEGAL/CLIENT/COURT/INTERNAL
    pipelines/               Per-slot handlers (legal-intake, correspondence)
  dashboard/              Local HTTP UI
    server.ts                Main dashboard router (auth, session, etc.)
    feature-routes.ts        All section 1-9 feature pages + APIs
  api/                    REST API
    rest.ts                  /api/v1/* — full CRUD + webhooks
    keys.ts                  API key issuance + auth
  auth/                   Authentication
    sso.ts                   Azure AD + Google Workspace SSO
    practice-groups.ts       Practice-group isolation
  branding/               Custom branding (logo, colours)
  admin/
    offices.ts               Multi-office support
  monitoring/             Uptime monitoring + alerting
  backup/                 Encrypted daily backups
  briefing/               Daily partner briefing (cron-scheduled email)
  agent/                  Classifier + processor + overseer loop
  governance/             Circuit breakers, control plane, PII redactor, logger
  memory/                 Lessons + playbook surface
  db/                     SQLite migrations + repositories
  email/                  SMTP notifier (briefings, intake notifications)

scripts/
  overseer-start.ts       Long-running daemon (processor + overseer + inbox)
  overseer-tick.ts        One-off tick (reminder dispatch)
  dashboard.ts            Standalone dashboard launcher
  inbox-monitor.ts        Standalone inbox poller
```

## Tech Stack

- **Runtime:** Node 20+, TypeScript, ESM
- **AI:** Anthropic Claude Agent SDK (Haiku / Sonnet / Opus by skill)
- **Storage:** SQLite (better-sqlite3) — local file, easy to back up
- **Email:** IMAP via `imapflow`, SMTP via `nodemailer`
- **Scheduling:** `node-cron` for the daily briefing, backups, and monitoring
- **Dashboard:** zero-framework HTML rendered from template literals

## Hard product constraints

These are non-negotiable. Each is enforced in code and audited.

1. **Mandatory human review gate** (`compliance/reviewGate.ts`)
2. **AI disclaimer on every output** (`compliance/disclaimer.ts`)
3. **Citation verification flag** (`compliance/citationVerifier.ts`)
4. **Privilege protection layer** (`compliance/privilege.ts`)
5. **Billing transparency log** (`compliance/billing.ts`)
6. **Immutable audit trail** (`compliance/audit.ts`)

## Comprehensive feature surface

### Section 1 — Intelligence
- Predictive case-outcome analysis with acknowledgement gate
- Auto-generated matter strategy memos (lawyer-approved before agents use)
- Deposition / cross-examination prep briefs
- Contract negotiation tracker (version diff, concessions/gains)
- Fee benchmarking against publicly available Law Society data
- Multi-jurisdiction comparison memos
- Plain-English explainers for any document

### Section 2 — Document & knowledge management
- Full document version control with rollback
- Natural-language smart search across matters / docs / KB
- Automatic document classification + deadline extraction
- Firm-wide knowledge base with versioning + prompt injection
- Clause library with risk profiles and usage tracking
- Redline comparison for any two text bodies

### Section 3 — Client & matter management
- Client CRM with weighted health score
- Zero-touch onboarding (conflict → engagement → e-sign → ID)
- Built-in electronic signatures (DocuSign-compatible)
- Five-question satisfaction surveys + dashboard
- Referral source tracking + thank-you drafts
- Per-matter budgets with 75 / 90 % alerts

### Section 4 — Compliance & risk
- AML screening against seed lists + optional external lookup
- 1-10 PI risk scoring with senior-partner alert
- Regulatory calendar pre-seeded for CPD / trust audit / PC / PI
- File review scheduler with type-based intervals
- Costs disclosure checker (LPUL requirements)
- Trust account reconciliation via bank-CSV import

### Section 5 — Communication & collaboration
- Internal matter chat with @mentions and action items
- External counsel portal with token-protected document share
- Court date calendar sync (Google / Outlook OAuth or ICS feed)
- File notes from dictation
- SMS via Twilio with STOP-handling

### Section 6 — Analytics & business intelligence
- Firm profitability dashboard
- Per-lawyer performance metrics
- 30 / 60 / 90-day pipeline forecasting
- Monthly market intelligence reports
- Competitor analysis from publicly available sources

### Section 7 — Integrations & infrastructure
- Xero bidirectional invoice / payment sync
- DocuSign as an e-signature provider
- Microsoft Teams adaptive-card notifications
- Outlook add-in manifest + API endpoints
- Zapier-compatible webhooks (HMAC signed)
- Daily AES-256-GCM-encrypted backups with verification

### Section 8 — Paralegal replacement
- Outbound email through the lawyer's own SMTP, approval-gated
- Document chasing workflow (3 / 7 / 14 day reminders + escalation)
- Phone-call logging with follow-up drafts
- Invoice generator from billing data
- Payment chasing with ageing report

### Section 9 — Enterprise features
- SSO via Azure AD and Google Workspace
- Practice-group isolation
- Matter supervision with secondary review queue
- Bulk import from LEAP / Clio / CSV
- Custom firm branding (logo, colours)
- REST API v1 with API keys + OpenAPI + Swagger UI
- Multi-office support
- Uptime monitoring + alerting

## Pipeline at a glance

```
LEGAL_EMAIL inbox
  → legal-intake (matter number, classification, lawyer notification)
  → matter created in `matters` table
  → matter folder created on disk
  → auto-reply with matter number sent to enquirer
  → conflict check + PI risk + file-review schedule + strategy draft

Existing matter → skill task created
  → processor classifies + executes (privilege-redacted)
  → output wrapped with AI disclaimer
  → review_queue row inserted (status=pending)
  → billing_log + legal_audit_log entries appended
  → lawyer reviews on /review, approves or rejects
  → (optionally) secondary review by supervising partner
  → outbound channel ships only after assertApproved() passes
  → triggers cross-system webhooks (Zapier / Teams) when configured
```

## Development

```bash
npm install
cp .env.example .env       # then fill in firm-specific values
npm run dev                # starts the main process on :8080 + dashboard on :3000
npm run dashboard          # dashboard only
npm run inbox:monitor      # inbox poller only
npm run overseer:tick      # one overseer tick
npm run overseer:start     # long-running daemon (processor + overseer + inbox)
```

## Inbox slots (intake)

| Slot      | Env prefix      | Purpose                                            |
|-----------|-----------------|----------------------------------------------------|
| legal     | `LEGAL_EMAIL`   | New matter intake — creates a matter on receipt    |
| client    | `CLIENT_EMAIL`  | Ongoing client correspondence on existing matters  |
| court     | `COURT_EMAIL`   | Court / tribunal / regulator correspondence        |
| internal  | `INTERNAL_EMAIL`| Firm admin / billing / IT (triage only)            |

## Compliance notes

- Designed for Australian jurisdiction (Commonwealth + states).
- Default jurisdiction is NSW; override per matter or via
  `DEFAULT_JURISDICTION` env.
- Citation verifier only marks `[VERIFIED]` against authoritative AU
  hosts (`austlii.edu.au`, state/Cth legislation registers, court
  judgment portals). Foreign authority stays `[UNVERIFIED]`.
- Audit log retention is the firm's call — the system never deletes.
- Backups: enable with `BACKUP_ENABLED=true`. Backups are AES-256-GCM
  encrypted with a key derived from `BACKUP_ENCRYPTION_PASSPHRASE`.
- SMTP credentials for outbound lawyer email are encrypted at rest
  using the same passphrase.
