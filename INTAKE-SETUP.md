# Client Intake Intelligence — Setup Guide

## How it works

When a new client emails the firm (the `LEGAL_EMAIL` inbox), the system
automatically:

1. Detects the likely matter type from their message (keyword match, with
   a Haiku fallback when ambiguous).
2. Sends them a short questionnaire (5 to 10 questions) tailored to that
   matter type and Australian jurisdiction.
3. Calculates any limitation-period urgency and alerts the responsible
   lawyer immediately when a deadline is within 7 days.
4. Researches directly relevant Australian case law on AustLII.
5. Generates a structured brief for the lawyer, identifies applicable
   legislation, drafts recommended first steps, and estimates the cost
   range.

The lawyer receives a full brief — and a new matter in the review queue —
before the first consultation. Every brief carries the standard
AI-DRAFTED disclaimer and must pass the mandatory human review gate
before anything reaches the client.

The client can answer either by replying to the email or via a clean,
branded web portal linked in every message:

```
http://localhost:3000/intake/<session-id>
```

## Practice areas covered

1. Unfair dismissal
2. Workers compensation
3. Family law — property settlement
4. Family law — children's arrangements
5. Conveyancing — purchase
6. Conveyancing — sale
7. Wills and estates
8. Debt recovery
9. Personal injury — motor vehicle (CTP)
10. Personal injury — public liability
11. Commercial dispute
12. Residential tenancy
13. Business purchase
14. Defamation
15. Criminal defence

## Urgency alerts

The system emails the responsible lawyer immediately if:

- A Fair Work Commission unfair-dismissal deadline is within 21 days.
- A court date (criminal) is within 7 days, or a bail breach is disclosed.
- A defamation limitation period is within 30 days.
- A CTP / workers-compensation notification window is closing.
- A family-provision claim window (12 months from death) is closing.
- Any other matter-specific urgent threshold is triggered.

The limitation engine (`jurisdiction/limitation-periods.ts`) flags a
matter `urgent` when fewer than 14 days remain and `critical` when fewer
than 3 days remain.

## Customising question sets

Each practice area has a question set at:

```
src/intake/client-questionnaire/question-sets/<matter-type>.ts
```

To add questions, follow the `IntakeQuestion` interface pattern (plain
language for the client; `legalSignificance` is internal only). To add a
new practice area:

1. Add `<new-type>` to the `MatterType` union in `types.ts`.
2. Create `question-sets/<new-type>.ts` exporting a `QuestionSet`.
3. Register it in `question-sets/index.ts`.
4. Add keyword rules in `classifier.ts`.
5. Add the limitation period in `jurisdiction/limitation-periods.ts`,
   the forum in `jurisdiction/court-registry.ts`, and the cost range and
   fallback legislation in `jurisdiction/jurisdiction-rules.ts`.

## Configuring for each firm

Set in `.env`:

```
INTAKE_FIRM_NAME=Smith & Co Lawyers
INTAKE_FIRM_LOGO_URL=https://...
INTAKE_FIRM_COLOURS_PRIMARY=#1a2e4a
INTAKE_DEFAULT_LAWYER_EMAIL=john@smithlawyers.com.au
INTAKE_SMS_ENABLED=true        # requires Twilio credentials
```

If `INTAKE_FIRM_NAME` / `INTAKE_FIRM_COLOURS_PRIMARY` are unset, the
portal falls back to the firm branding configured under Section 9.5.

## Operational notes

- **Email-reply continuation:** the intake emails are sent via the
  firm's transactional SMTP (`SMTP_FROM`). For client replies to thread
  back into the `LEGAL_EMAIL` inbox, set `SMTP_FROM` to the
  `LEGAL_EMAIL` address. Otherwise, clients continue via the web portal
  link included in every message (always available).
- **Stale sessions:** `overseer-tick` sweeps in-progress sessions — a
  single reminder after 24 hours of inactivity, then abandonment plus a
  firm notification at 48 hours.
- **Dashboard:** `/intake` shows active sessions, completed sessions with
  briefs ready for review, and sessions needing human follow-up. Each
  matter page links to `/matter/<id>/intake` for the transcript and brief
  side by side.
- **Privilege:** every message sent to a model is run through the local
  privilege redactor first (`src/compliance/privilege.ts`).

## Migration

The intake tables are created by migration `016_intake_sessions`
(`intake_sessions`, `client_briefs`). It applies automatically on the
next start / `initializeDatabase()`.
