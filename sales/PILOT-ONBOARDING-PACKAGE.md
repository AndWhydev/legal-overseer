# Legal Overseer — Pilot Onboarding Package

Welcome aboard. This document is everything you need to run your 30-day
pilot of Legal Overseer — the AI paralegal that installs on your own
server, keeps a lawyer in control of every output, and never lets your
client data leave the building.

Read Section 1 first. Hand Section 2 to your IT person. The responsible
lawyer should read Section 3. Sections 4–6 explain the guardrails,
feedback, and what happens at day 30.

**Pilot support:** Andy — andy@allwebbedup.com.au — 1800 714 148.

---

## Section 1 — Welcome and what to expect

### What happens in the first 7 days

| Day | What happens |
|-----|--------------|
| **Day 1** | Your IT person installs Legal Overseer on your server (about 30 minutes — see Section 2) and creates the first lawyer user. |
| **Day 1** | You point a dedicated intake email address (e.g. `legal@yourfirm.com.au`) at the system. |
| **Day 2** | You send a test enquiry to that address and watch the intake questionnaire and brief flow through. |
| **Days 2–3** | We load sample data so the responsible lawyer can explore the dashboard, review queue, and Monday briefing risk-free. |
| **Days 3–7** | You start routing real new-client enquiries through it. Every AI output waits in the review queue for a lawyer to approve. |
| **End of week 1** | A 20-minute check-in call with Andy to answer questions and tune the setup. |

### What the firm needs to do

1. **One server.** A small Windows or Linux machine inside the firm (see Section 2 for specs). No cloud account required.
2. **One IT contact** to run the installer and complete the setup wizard.
3. **One responsible lawyer** who will review and approve outputs and give feedback.
4. **One test email** to the overseer address to confirm the pipeline works end to end.

### What Legal Overseer will do automatically

- Greet every new client enquiry and ask the right intake questions for their matter type and state.
- Calculate limitation periods and alert the responsible lawyer when a deadline is close.
- Research relevant Australian case law on AustLII with citation verification.
- Draft letters, memos, and a structured matter brief — all held for lawyer review.
- Track deadlines and send a Monday morning briefing to each lawyer.
- Keep an immutable, hash-chained audit log of every action.

### How to give feedback

Throughout the pilot, email andy@allwebbedup.com.au any time, or jot notes
as you go. At day 30, fill in the short feedback form in **Section 5**.

---

## Section 2 — IT setup checklist (for the firm's IT person)

Estimated time: **30–45 minutes.** You will need administrator access to
the server and the firm's email system.

### Step 1 — Server requirements

| | Minimum | Recommended |
|---|---|---|
| **OS** | Windows Server 2019+ / Windows 10+, or Linux (Ubuntu 22.04+) | Ubuntu 22.04 LTS |
| **RAM** | 4 GB | 8 GB |
| **Disk** | 20 GB free | 50 GB free (on an encrypted volume / firm file share) |
| **Runtime** | Node.js 20 LTS or newer | Node.js 22 LTS |
| **Network** | Outbound HTTPS to AustLII and the Anthropic API; inbound IMAP/SMTP to the firm mail server | Same, behind the firm firewall |

> The dashboard binds to `127.0.0.1` by default. If lawyers need to reach
> it from other machines, front it with the firm's existing internal
> reverse proxy and set `FORCE_HTTPS=true`.

### Step 2 — Run the installer

From the Legal Overseer folder:

**Linux / macOS**
```bash
bash install.sh
```

**Windows (elevated PowerShell)**
```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install-windows.ps1
```

The installer checks your Node version, installs dependencies, creates a
`.env` file from the template, prepares the `./data` directory, and runs
the database migrations.

### Step 3 — Fill in the .env file

Open `.env` in a text editor. Walk through each field:

**Operator notifications**
- `ADMIN_EMAIL` — where system alerts and the daily briefing go (e.g. the managing partner).
- `INTAKE_LAWYER_EMAIL` — the responsible lawyer who triages new enquiries. Falls back to `ADMIN_EMAIL`.

**Outbound email (SMTP) — used to send acknowledgements, briefings, alerts**
- `SMTP_HOST` — your mail server (e.g. `smtp.office365.com`).
- `SMTP_PORT` — usually `587`.
- `SMTP_USER` / `SMTP_PASS` — a dedicated overseer mailbox credential (never a client-facing mailbox).
- `SMTP_FROM` *(optional)* — the From: address. **Tip:** set this to your `LEGAL_EMAIL` so client replies thread back to the intake inbox.
- `SMTP_SECURE` *(optional)* — `true` to force TLS (auto-detected for port 465).

**Anthropic (the AI engine)**
- `ANTHROPIC_API_KEY` — your API key. Privilege-sensitive text is redacted locally before any model call.

**Database & jurisdiction**
- `DATABASE_PATH` *(optional)* — defaults to `./data/bitbit.db`. Put it on the encrypted file share so it's part of normal backups.
- `MATTER_FOLDERS_ROOT` *(optional)* — where per-matter folders are created.
- `DEFAULT_JURISDICTION` — your default state (e.g. `NSW`).

**Inbox monitor (the four intake inboxes)**
- `ENABLE_INBOX_MONITOR=true`
- `LEGAL_EMAIL` / `LEGAL_EMAIL_PASS` — the new-matter intake mailbox. Set at minimum this slot; `CLIENT_EMAIL`, `COURT_EMAIL`, `INTERNAL_EMAIL` are optional.
- IMAP/SMTP hosts are auto-detected for Gmail, Office 365, iCloud, Fastmail, Yahoo, Zoho; otherwise set the `*_IMAP_HOST` / `*_SMTP_HOST` overrides.

**Client intake intelligence (your firm's identity in client questionnaires)**
- `INTAKE_FIRM_NAME` — e.g. `Smith & Co Lawyers`.
- `INTAKE_FIRM_LOGO_URL` *(optional)* — logo shown on the client web portal.
- `INTAKE_FIRM_COLOURS_PRIMARY` *(optional)* — brand colour, e.g. `#1a2e4a`.
- `INTAKE_DEFAULT_LAWYER_EMAIL` *(optional)* — where new-matter briefs and urgent alerts are sent.

**Task processor / dashboard / briefing**
- `ENABLE_TASK_PROCESSOR=true` — runs the skill processor.
- `DASHBOARD_PORT=3000`
- `BRIEFING_ENABLED=true`, `BRIEFING_CRON=0 8 * * 1` — Monday 8am briefing.

**Licence (we provide this)**
- `LICENCE_KEY` — paste the pilot licence token Andy sends you (or save it to `data/licence.key`). The pilot licence is a **trial** tier, valid for the pilot period.

### Step 4 — Add the overseer email address to the firm's email system

Create (or designate) the mailbox you put in `LEGAL_EMAIL`, e.g.
`legal@yourfirm.com.au`. Make sure IMAP access is enabled and the
password in `.env` works. Publish this address as your new-enquiry
contact (website contact form, footer, "new matter" inbox).

### Step 5 — Test by sending an email to the overseer address

From any external account, send a short enquiry to `LEGAL_EMAIL`, e.g.
*"I was dismissed from my job last week and want advice."* Within a poll
cycle you should see:
- An intake session appear on the dashboard under **Intake**.
- The sender receive the first intake question (and a link to the web portal).

### Step 6 — Access the dashboard

Open **http://localhost:3000** on the server. On first run you'll be
guided through the setup wizard.

### Step 7 — Add the first lawyer user

In the setup wizard (or later under **Users**, admin only) create the
responsible lawyer's account: name, email, role = `lawyer`, and a strong
password (12+ characters).

### Step 8 — Run the demo seed to see it working with sample data

```bash
npm run demo:seed
```

This loads a realistic demo firm — matters, deadlines, a review queue,
billing, and audit entries — so the lawyer can explore safely. To wipe
back to an empty database:

```bash
npm run demo:reset
```

When you're ready for live use, run `demo:reset` (or point
`DATABASE_PATH` at a fresh file) so no demo data mixes with real matters.

---

## Section 3 — For the responsible lawyer

You don't need to be technical. Here's what matters.

### What the AI does

- **Drafts.** Letters, memos, contracts, and court-document drafts — always as a draft for you to review, never sent on its own.
- **Researches.** Searches AustLII for relevant Australian case law and verifies citations against authoritative sources, flagging anything it can't confirm as `[UNVERIFIED]`.
- **Manages deadlines.** Tracks limitation periods and court dates, and alerts you when something is close.
- **Runs intake.** Asks new clients the right questions for their matter type and state, then hands you a structured brief before the first call.

### What the lawyer always does

**You review and approve everything.** Nothing substantive reaches a
client or a court without your explicit approval. The AI's job is to do
the legwork; your job is judgement and sign-off.

### How to use the review queue

Open **Review** in the dashboard. Every AI output lands here with status
**pending**. Each row shows the matter, the type of output, and when it
was produced. Click a row to read the full draft, the citations (with
verification status), and any metadata.

### How to approve or reject a document

On the review detail page:
- **Approve** — confirms the draft is fit to proceed. Outbound channels only ship after approval passes the review gate. You can add an optional note.
- **Reject** — sends it back with your note explaining what needs to change.

Every approval and rejection is recorded in the immutable audit log
against your name.

### How to add a matter manually

If a matter doesn't come in by email, open **Matters → New** (or upload a
document at **Upload**, which creates a matter from the file). Fill in the
client name, matter type, and jurisdiction. The system allocates the next
matter number automatically.

### How to read the Monday morning briefing

Each Monday at 8am you receive an email briefing covering: new and active
matters, deadlines in the next period, anything overdue, items waiting in
your review queue, and relevant regulatory changes. Skim it over coffee;
click through to the dashboard for anything that needs action. You can
tune which sections you receive under **My briefing preferences**.

---

## Section 4 — The 6 things Legal Overseer will never do

1. **Send anything to a client without lawyer approval.** Every outbound
   message passes the mandatory review gate first.
2. **File anything in court.** It prepares drafts; filing is always a
   human act.
3. **Provide legal advice directly to clients.** It gathers facts and
   drafts for your review; advice comes from you.
4. **Access any system outside the firm's own server.** It runs on your
   hardware, inside your network.
5. **Share client data with any external service.** Privilege-sensitive
   text is redacted locally before any model call, and nothing is sent to
   third-party storage.
6. **Make decisions about legal strategy.** Strategy is the lawyer's. The
   system surfaces options and evidence; you decide.

---

## Section 5 — 30-day feedback form

Please complete after 30 days and return to andy@allwebbedup.com.au.

```
LEGAL OVERSEER — 30-DAY PILOT FEEDBACK

Firm:                         ____________________________
Responsible lawyer:           ____________________________
Date:                         ____________________________

1. Roughly how many hours per week did Legal Overseer save you or
   your staff?
   ☐ 0–2   ☐ 3–5   ☐ 6–10   ☐ 10+    Estimate: ______ hrs/week

2. Which features were MOST useful? (tick all that apply)
   ☐ Client intake questionnaire + brief
   ☐ AustLII legal research
   ☐ Document / letter drafting
   ☐ Limitation period & deadline alerts
   ☐ Monday morning briefing
   ☐ Review queue workflow
   ☐ Other: ____________________________

3. Which features need improvement? What would you change?
   ____________________________________________________________
   ____________________________________________________________

4. How likely are you to recommend Legal Overseer to another firm?
   (0 = not at all, 10 = extremely likely)
   0  1  2  3  4  5  6  7  8  9  10        Score: ______

5. Would you convert to a paid subscription?
   ☐ Yes    ☐ Maybe    ☐ No        Why: ________________________

6. Any concerns about ASCR compliance (esp. rule 9.1 confidentiality,
   supervision, and your duty to the court)?
   ____________________________________________________________

7. Any technical issues (installation, email, dashboard, performance)?
   ____________________________________________________________

8. Anything else?
   ____________________________________________________________
```

---

## Section 6 — What happens at day 30

1. **Andy reviews your feedback** and books a short wrap-up call.

2. **If you convert:**
   - **Pricing tiers:**
     - **Small firm** (under 5 lawyers): **$15,000 / year**.
     - **Mid firm** (5–20 lawyers): **$35,000 / year**.
     - **Enterprise** (20+): tailored.
   - **Payment options:** annual invoice (EFT), or quarterly by arrangement.
   - **Ongoing support:** software updates, new practice-area question
     sets, and email/phone support. Your existing data and configuration
     carry straight over — nothing to re-set-up.
   - We issue a full-term licence key to replace the pilot trial licence.

3. **If you don't convert — no lock-in:**
   - **Data export:** we export every matter, document, and audit record
     in open formats (the SQLite database plus your matter folders are
     yours).
   - **Clean uninstall:** stop the service and delete the application
     folder. Because everything lived on your server, there is nothing in
     anyone else's cloud to clean up.
   - No penalty, no minimum term, no hard feelings. The pilot is genuinely
     free.

---

*Legal Overseer is a tool to support admitted Australian legal
practitioners. It does not provide legal advice and does not replace a
lawyer's professional judgement or supervision obligations.*
