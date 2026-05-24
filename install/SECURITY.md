# Legal Overseer — Security Whitepaper

**Audience:** the firm's managing partner, ethics officer, IT security
lead, and (if applicable) insurer. Plain-English, no marketing fluff.

This document explains what data the product holds, where it goes,
what we do to protect it, and how the controls map onto the obligations
that apply to an Australian law firm — in particular the
**Australian Solicitors' Conduct Rule (ASCR) 9.1** confidentiality
duty, the **Privacy Act 1988 (Cth)** Australian Privacy Principles,
and clients' reasonable expectations of privilege.

If anything here is unclear, please ask your account manager — these
controls are baked into the code, but you should understand them
before you go live.

---

## 1. Data architecture (one paragraph)

Every piece of firm data lives on the firm's own server, inside one
directory. The product is a single container with a single SQLite
file plus a folder of matter-specific attachments. Nothing is
streamed to the vendor. The only outbound network calls are
(a) explicit, redacted text sent to the Anthropic Claude API to
classify and draft documents, and (b) a daily 5KB JSON poll to
`updates.legaloverseer.com.au` to check whether you're on a
supported version. Both are togglable.

---

## 2. What we hold, where it lives

| Asset                              | Where                                                    |
|------------------------------------|----------------------------------------------------------|
| Matter metadata                    | SQLite table `matters` inside `data/legal-overseer.db`   |
| Attachments + drafts               | Plain files under `data/matters/<matter-number>/`        |
| AI drafts awaiting review          | SQLite table `review_queue` (markdown body)              |
| Lawyer-time + AI-time entries      | SQLite table `billing_log`                               |
| Citations (verified / unverified)  | SQLite table `citations`                                 |
| User accounts (PBKDF2 hashed)      | SQLite table `users`                                     |
| Sessions (HTTP-only cookies)       | SQLite table `sessions`                                  |
| Append-only audit trail            | SQLite table `legal_audit_log` (hash-chained, INSERT-only) |
| Licence key                        | `data/licence.key`, mode 0600                            |

Nothing else. We do not ship logs to a vendor cloud, we do not maintain a
copy of your matter data anywhere outside your network, and we do not
require you to relay email through us.

---

## 3. ASCR 9.1 (Confidentiality) — how the product enforces it

> Rule 9.1: A solicitor must not disclose any information which is
> confidential to a client … unless permitted by an exception.

The product is built so that no AI output can be sent to a client or
filed with a court without a named admitted lawyer signing off.

### Mandatory human review gate

- Every skill (contract review, drafting, client email, etc.) writes
  its output into the `review_queue` table with `status='pending'`.
- The lawyer reviews it on the dashboard and explicitly clicks
  "approve" or "reject". The action is bound to their email and
  written to the immutable audit log.
- Outbound channels (SMTP send, court filing connector) call
  `assertApproved(reviewId)` before shipping anything. A pending or
  rejected row throws — there is no codepath that ships unreviewed
  content.

Source: `src/compliance/reviewGate.ts`.

### AI-DRAFTED disclaimer

Every output is wrapped with a clearly visible "AI-drafted, requires
admitted-lawyer review" disclaimer before it reaches the queue. The
queue itself refuses inserts that are missing the disclaimer.

Source: `src/compliance/disclaimer.ts`.

### Citation verification

Every case or statute citation is flagged `[UNVERIFIED]` by default.
A separate verifier probes AustLII (and the Federal Register of
Legislation) and only marks a citation `[VERIFIED]` if an
authoritative AU host responds 200 OK. Foreign authority stays
`[UNVERIFIED]` for the lawyer to confirm.

Source: `src/compliance/citationVerifier.ts`.

### Privilege redaction before external AI calls

The product never sends raw client text to the model provider. Every
body is passed through `redactForExternalModel()` which redacts:

- email addresses
- AU mobile / landline phone numbers
- ABN, ACN, TFN
- BSB + bank account numbers
- court file numbers
- AU street addresses
- title-cased name pairs (heuristic — over-redacts on purpose)

The reverse map is kept locally and used to re-hydrate the response
on return. The vendor (Anthropic) receives a redacted payload.

Source: `src/compliance/privilege.ts`.

---

## 4. Privacy Act 1988 (Cth) — APP mapping

| APP # | Topic                          | How we handle it                                                                                                                                                                |
|-------|--------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1     | Open & transparent management  | This document + `AI-USAGE-POLICY.md` describe what we do. The firm publishes the AI policy internally and (recommended) externally.                                             |
| 3     | Collection of solicited info   | The product only collects what the firm puts into it (emails, attachments, lawyer notes). No third-party enrichment.                                                            |
| 5     | Notification of collection     | Recommended: amend the firm's standard engagement letter to disclose AI use. Template wording in `AI-USAGE-POLICY.md`.                                                          |
| 6     | Use or disclosure              | No data leaves the firm's perimeter except the redacted payload to the model provider (above).                                                                                  |
| 8     | Cross-border disclosure        | Anthropic processes data in AWS regions; the firm must confirm with Anthropic which regions handle their traffic. Disclose this in the engagement letter.                       |
| 11    | Security of personal info      | Section 5 below.                                                                                                                                                                |
| 12/13 | Access &amp; correction        | Every matter row + audit entry is exportable as JSON from the dashboard `/api/matters.json` endpoint.                                                                           |

The firm remains the **APP entity**. The vendor is a software
supplier, not a controller of the firm's data.

---

## 5. Defence in depth

### At the host

- One container, non-root user (`overseer`, uid 1100).
- All Linux capabilities dropped (`cap_drop: ALL`), no new privileges.
- Read-only filesystem except for `/data` and an explicit `/tmp` tmpfs.
- Hard memory cap (default 2 GB) prevents a runaway process from
  affecting other workloads on the host.

### At the network

- Dashboard binds `127.0.0.1` by default. Remote access requires you
  to put your existing reverse proxy in front and set `FORCE_HTTPS=true`.
- No inbound ports other than 8080 (health) and 3000 (dashboard).
- HTTP-only `SameSite=Strict` session cookies; `Secure` flag added
  when `FORCE_HTTPS=true`.
- Per-IP rate limits on HTTP endpoints (low-risk and medium-risk
  buckets via `rate-limiter-flexible`).
- Failed-login throttling: 8 failures from one IP locks that IP out
  for 10 minutes.

### At the data layer

- SQLite WAL mode for crash safety + foreign keys for integrity.
- Append-only `legal_audit_log` (triggers raise on UPDATE / DELETE).
- Each audit row carries a SHA-256 chain hash. `verifyAuditChain()`
  re-walks the chain on every `/health` probe and flips the system
  status to `unhealthy` if any row was tampered with.
- Passwords stored as PBKDF2-SHA256, 200 000 iterations, per-user
  16-byte random salt. No plaintext storage anywhere.
- Sessions are 256-bit random tokens; 12-hour expiry; no sliding
  renewal (deliberate, to limit risk on shared firm machines).

### At the AI layer

- Privilege redaction runs locally **before** any external call.
- Every model call is wrapped in a circuit breaker so a sustained
  failure on the model provider doesn't queue unbounded work.
- Per-skill model choice (Haiku for cheap classification, Sonnet for
  drafting, Opus for high-risk review) — documented per skill in
  source.
- Every AI run is logged into `billing_log` with model, wall time,
  spend, and the matter it served, so the firm can disclose
  AI-assisted work on the invoice (see `BILLING-GUIDANCE.md`).

---

## 6. Threat model + non-goals

### Threats we defend against

1. **Casual snooping by other staff on the same server.** Data dir
   permissions are restrictive; ACLs are tightened on Windows.
2. **Stale sessions on shared workstations.** 12-hour hard expiry.
3. **An attacker reading the SQLite file.** Passwords are PBKDF2;
   audit chain detects out-of-band tampering.
4. **A prompt-injection attack against the model.** Every output
   still requires a human reviewer to approve before send.
5. **Citation hallucination.** Every cite ships `[UNVERIFIED]` until
   an authoritative AU source confirms it.
6. **Licence forgery.** Tokens are HMAC-SHA256 signed by the vendor.
   A forged licence won't verify and the system goes read-only.

### Non-goals (be aware)

- **Disk encryption.** Use the firm's existing disk encryption
  (BitLocker, LUKS) on the volume holding `data/`.
- **Network-level intrusion detection.** Use the firm's existing
  perimeter and endpoint protection.
- **Single sign-on.** The built-in login is username/password. For
  SSO, front the dashboard with the firm's existing IdP (Azure AD
  Entra, Okta, Google Workspace) at the reverse-proxy layer.
- **Multi-tenant isolation.** This is on-prem, one firm per install.
  Don't try to share an install between firms.

---

## 7. Incident response

If you suspect a breach or tampering:

1. **Freeze.** `systemctl stop legal-overseer` (or
   `docker compose down`). Stop email send by killing SMTP creds in
   `.env`.
2. **Snapshot.** Tar the `data/` directory to a write-once medium
   before you do anything else. The audit log is your investigation
   substrate.
3. **Verify the audit chain.**
   `curl http://127.0.0.1:8080/health | jq .audit` — anything other
   than `chainOk: true` is a tamper indicator.
4. **Rotate.** Rotate licence (request a new key from the vendor),
   rotate the signing secret (replace `LICENCE_SIGNING_SECRET` and
   re-issue all customer licences if you're the vendor), rotate
   SMTP/IMAP credentials, expire all sessions
   (`DELETE FROM sessions;`), force a password reset for all admins.
5. **Notify.** Email `security@legaloverseer.com.au` with the
   incident timeline. The vendor will assist with forensic capture
   if needed.
6. **Notifiable data breach.** Australian firms that meet the
   [Notifiable Data Breaches scheme](https://www.oaic.gov.au/privacy/notifiable-data-breaches)
   threshold must notify the OAIC and affected individuals within 30
   days. Discuss with your legal counsel before you decide.

---

## 8. Vulnerability disclosure

Report issues to `security@legaloverseer.com.au`. We commit to
acknowledging within 2 business days and patching critical issues
within 7 days. We do not currently run a bug bounty.

PGP key:
[Fingerprint published at](https://legaloverseer.com.au/security.txt).

---

## 9. Audit + assurance

The vendor will provide, on request:

- SBOM for the current release (CycloneDX JSON).
- Penetration test report (annual).
- SOC 2 / ISO 27001 statements if applicable to the vendor entity.
- A copy of this whitepaper signed by the CTO.

Ask `compliance@legaloverseer.com.au`.
