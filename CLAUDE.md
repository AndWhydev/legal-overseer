# Legal Overseer

AI legal operations system for Australian law firms. Deployed on-prem
on a firm's own server. Connects to the firm's email inboxes, drafts
work product (contracts, memos, letters, court documents), tracks
deadlines and limitation periods, monitors regulatory change, and
maintains an immutable audit log of every action.

**Hard product invariant:** every AI output requires admitted-lawyer
review before it reaches a client or court. The system never sends
substantive correspondence on its own. See `src/compliance/`.

## Architecture

```
src/
  skills/              Six legal skills (registry + per-skill runners)
    contract-review/      Read contracts, flag risks
    legal-research/       AustLII research → research memo
    matter-drafting/      Letters, memos, contracts, court documents
    matter-management/    Deadlines, limitation periods, SLAs
    client-comms/         Client-facing email drafts
    compliance-monitor/   Regulatory / legislative change scan
  compliance/          Six hard product constraints
    reviewGate.ts         Mandatory human review queue
    disclaimer.ts         AI-DRAFTED disclaimer on every output
    citationVerifier.ts   AustLII probe for every cited authority
    privilege.ts          Local redaction before any external model call
    audit.ts              Append-only hash-chained legal audit log
    billing.ts            AI time + spend per matter vs lawyer time
  legal-intake/        New-matter intake pipeline (LEGAL_EMAIL inbox)
  inbox-monitor/       IMAP poller for LEGAL/CLIENT/COURT/INTERNAL
    pipelines/            Per-slot handlers (legal-intake, correspondence)
  dashboard/           Local HTTP UI (matters, review queue, calendar, billing)
  briefing/            Daily partner briefing (cron-scheduled email)
  agent/               Classifier + processor + overseer loop
  governance/          Circuit breakers, control plane, PII redactor, logger
  memory/              Lessons + playbook surface
  db/                  SQLite migrations + repositories
  email/               SMTP notifier (briefings, intake notifications)
  api/                 /health endpoint
scripts/
  overseer-start.ts    Long-running daemon (processor + overseer + inbox)
  overseer-tick.ts     One-off tick (reminder dispatch)
  dashboard.ts         Standalone dashboard launcher
  inbox-monitor.ts     Standalone inbox poller
```

## Tech Stack

- **Runtime:** Node 20+, TypeScript, ESM
- **AI:** Anthropic Claude Agent SDK (Haiku / Sonnet / Opus by skill)
- **Storage:** SQLite (better-sqlite3) — local file, easy to back up
- **Email:** IMAP via `imapflow`, SMTP via `nodemailer`
- **Scheduling:** `node-cron` for the daily briefing
- **Dashboard:** zero-framework HTML rendered from template literals

## Hard product constraints

These are non-negotiable. Each is enforced in code and audited.

1. **Mandatory human review gate** (`compliance/reviewGate.ts`)
   Every skill output is enqueued into `review_queue` with
   `status='pending'`. Outbound channels (SMTP send, court filing
   connector) must call `assertApproved()` against an approved row
   before shipping. The dashboard `/review` view is where the lawyer
   approves or rejects.

2. **AI disclaimer on every output** (`compliance/disclaimer.ts`)
   `wrapWithDisclaimer()` is called on every skill output before it
   lands in the queue. `enqueueForReview()` refuses to insert a body
   missing the disclaimer block.

3. **Citation verification flag** (`compliance/citationVerifier.ts`)
   Every case / statute citation is flagged `[UNVERIFIED]` by default.
   The verifier probes AustLII (and the Federal Register of
   Legislation) and updates the citation to `[VERIFIED]` only when the
   authoritative source responds 200.

4. **Privilege protection layer** (`compliance/privilege.ts`)
   `redactForExternalModel()` runs locally on every document body
   before it leaves the building. It redacts emails, AU phone numbers,
   ABN/ACN/TFN, BSB-account numbers, court file numbers, AU street
   addresses, and title-cased name pairs. The reverse map stays local.

5. **Billing transparency log** (`compliance/billing.ts`)
   Every AI run is logged with skill, model, wall-clock time, spend,
   and the matter it served. Lawyer time entries land in the same
   table. The dashboard `/billing` view shows AI vs lawyer time per
   matter so the firm can disclose the AI share to the client.

6. **Immutable audit trail** (`compliance/audit.ts`)
   `legal_audit_log` is INSERT-only (enforced by SQLite trigger). Each
   row carries the SHA-256 of its canonical content plus the prior
   row's hash. `verifyAuditChain()` re-walks the chain and breaks the
   `/health` endpoint if any row has been tampered with.

## Pipeline at a glance

```
LEGAL_EMAIL inbox
  → legal-intake (matter number, classification, lawyer notification)
  → matter created in `matters` table
  → matter folder created on disk
  → auto-reply with matter number sent to enquirer

Existing matter → skill task created
  → processor classifies + executes (privilege-redacted)
  → output wrapped with AI disclaimer
  → review_queue row inserted (status=pending)
  → billing_log + legal_audit_log entries appended
  → lawyer reviews on /review, approves or rejects
  → outbound channel ships only after assertApproved() passes
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

Configure only the slots the firm actually uses; unconfigured slots
are skipped silently by the poller.

## Compliance notes

- Designed for Australian jurisdiction (Commonwealth + states).
- Default jurisdiction is NSW; override per matter or via
  `DEFAULT_JURISDICTION` env.
- Citation verifier only marks `[VERIFIED]` against authoritative AU
  hosts (`austlii.edu.au`, state/Cth legislation registers, court
  judgment portals). Foreign authority stays `[UNVERIFIED]`.
- Audit log retention is the firm's call — the system never deletes.
- Backups: just back up the SQLite file + `MATTER_FOLDERS_ROOT`.
