# AI Usage Policy (Template)

**Audience:** every lawyer, paralegal, and admin staff member at the
firm. The managing partner adopts this internally and (recommended)
references it externally in engagement letters.

This is a template. Edit the bracketed text, run it past the firm's
ethics officer, and have the managing partner sign and date the
final version.

---

## 1. Purpose

[Firm Name] uses Legal Overseer ("the System"), an AI assistant
running on the firm's own infrastructure, to help with classification
of inbound correspondence, drafting of routine work product, legal
research, and matter management. This policy sets the rules every
member of the firm must follow when using the System.

## 2. Scope

This policy applies to:

- All staff (admitted lawyers, paralegals, administrative, IT).
- All AI-assisted output produced through the System, regardless of
  who initiated the task.
- All client-facing correspondence drafted with the System's help.

## 3. The two non-negotiable rules

### Rule 1 — A human admitted lawyer reviews every output

No AI-drafted correspondence, contract, memo, advice, court
document, or client email is sent to a client, a court, a regulator,
or an opposing party without an admitted lawyer reviewing it,
correcting it as needed, and approving it through the System's
review queue.

The System enforces this with code (see `SECURITY.md` §3). Approving
through the dashboard binds your professional name to the output and
writes a permanent audit entry.

### Rule 2 — Citations are verified before reliance

Every case or statute reference in an AI-assisted output is treated
as `[UNVERIFIED]` until an authoritative source (AustLII, Federal
Register of Legislation, an official court judgment portal) has been
checked. Do not rely on, quote, or file a `[UNVERIFIED]` citation.

## 4. What the System may be used for

| Task                                                       | Permitted? |
|------------------------------------------------------------|------------|
| First-pass risk flags on inbound contracts                 | Yes        |
| Drafting routine letters (cost agreements, status updates) | Yes        |
| Researching Australian case law on a closed question       | Yes        |
| Drafting a court document for a lawyer to review and sign  | Yes (review mandatory) |
| Generating client emails for lawyer review                 | Yes (review mandatory) |
| Tracking limitation periods + procedural deadlines         | Yes        |
| Acting as a sole adviser on complex matters                | **No**     |
| Bypassing the review queue ("send straight from the AI")   | **No**     |
| Uploading entire matter folders to public AI tools         | **No**     |

## 5. What the System must NOT be used for

- Generating advice that is sent to the client without lawyer review.
- Citing AI-produced authority without verification.
- Forming a view on matters the firm is not insured to advise on.
- Replacing the supervising lawyer's professional judgment.
- Drafting communications outside this firm's permitted areas of
  practice.

## 6. Confidentiality (ASCR 9.1)

The System runs on the firm's own server. Client information stays
on the firm's network. When the System needs to call the external
AI model provider, it locally redacts client identifiers (names,
emails, phone numbers, ABNs, addresses, court file numbers) **before**
the text leaves the building. Confidentiality of the matter is
preserved.

You must not:

- Paste matter content into any public AI tool (ChatGPT, Claude.ai,
  Gemini, Copilot, etc.).
- Bypass the System's privilege-redaction layer.
- Share your dashboard login with anyone.

## 7. Client disclosure

The firm discloses its use of AI assistance in every new engagement
letter. Suggested wording (consult your insurer's panel):

> "We use AI-assisted tooling running on our own systems to help
> draft routine correspondence, conduct initial legal research, and
> track deadlines. Every AI output is reviewed and approved by an
> admitted lawyer of this firm before it reaches you, the court, or
> any third party. Client identifiers (your name, contact details
> and any sensitive identifiers) are removed from any data sent to
> external AI providers. We do not use AI to make legal judgments
> on your matter — those remain the responsibility of your lawyer."

## 8. Billing

The firm bills AI-assisted work transparently. See
`BILLING-GUIDANCE.md` for the rules:

- AI processing time is recorded separately on every invoice.
- AI time is not billed at lawyer rates.
- The lawyer's review and correction time is billed at the
  lawyer's normal rate.

## 9. Training

Every staff member must complete the firm's "Using AI Responsibly"
training before being granted a System login. Refresher annually.

## 10. Reporting issues

If you see the System produce something wrong, biased, or
inappropriate — **reject the queue item and add a note**. The
rejection and your note are permanently recorded. The firm reviews
the rejection log monthly to improve prompts and skill rules.

If you suspect a confidentiality breach, contact the firm's data
breach officer immediately:
**[Data Breach Officer Name + Internal Phone]**.

## 11. Discipline

Breaches of this policy may result in disciplinary action, including
loss of System access, and may be reported to the Office of the
Legal Services Commissioner in the relevant State or Territory if
the conduct amounts to a breach of ASCR.

## 12. Review

This policy is reviewed annually by the managing partner and ethics
officer. The current version is published at:
**[firm intranet URL]**.

---

Adopted by: ___________________________________________

Date: ________________________________________________

Signature: ____________________________________________
