# Ethical Billing Guidance for AI-Assisted Work

**Audience:** the partners and accounts team. Practical guide for
billing client work when AI assistance was used.

This guide reflects the position of the Australian Solicitors'
Conduct Rules (ASCR) and the general professional obligation not to
charge for work the lawyer did not do. It is not, itself, legal
advice — discuss with your insurer's panel solicitor.

---

## 1. The core rule

**You bill the lawyer's time, not the AI's time, at the lawyer's
rate.**

The AI is software the firm runs to make its lawyers more productive.
You can:

- Bill the lawyer's time to read, edit, verify, and approve the AI
  draft, at the lawyer's normal hourly rate.
- Bill the AI processing cost, at cost or with a transparent markup,
  as a disbursement.
- Recover the firm's licensing cost via overhead the way you recover
  any other firm system.

You can **not**:

- Bill four hours at a senior associate's rate for work the AI did
  in 90 seconds plus 20 minutes of associate review.
- Hide AI assistance from the client when asked.
- Treat AI output as billable hours of "legal research" if no lawyer
  actually read and verified it.

This aligns with ASCR 17.5 (a solicitor must be honest and fair when
dealing with clients) and the common-law fiduciary duty to charge
only fees the client knew were being incurred.

## 2. What the System records for you

Every AI run lands in the `billing_log` table with:

- The matter it belongs to.
- The skill that ran (contract-review, drafting, etc.).
- The wall-clock time the AI used.
- The model used (Haiku, Sonnet, Opus).
- The USD spend Anthropic charged.

Every lawyer-time entry the system tracks (review, correction,
external work) is in the same table tagged `kind=lawyer_time`.

The dashboard's `/billing` tab shows AI vs lawyer time per matter so
you can see at a glance which matters are AI-heavy vs lawyer-heavy.

## 3. Invoicing template

```
Description                                              Amount
─────────────────────────────────────────────────────────────────
2026-04-12  Initial review of Smith contract (P. Lee)    1.2 h × $450 = $540.00
2026-04-12  AI-assisted contract risk-flag scan          [included]
2026-04-13  Drafting cost agreement (J. Khan)            0.8 h × $300 = $240.00
2026-04-13  AI-assisted draft (cost agreement)           [included]
                                                         ──────────
                                                         Sub-total  $780.00

Disbursements:
  AI processing for this matter (Anthropic API)          $4.36
                                                         ──────────
                                                         Total      $784.36
```

**Notes you should include on every AI-assisted invoice:**

> "This matter benefited from AI-assisted drafting and research
> running on our own infrastructure. Every AI output was reviewed
> and approved by an admitted lawyer of this firm before being
> relied upon or sent. The 'AI processing' line above is the
> external model provider's processing cost, recovered at cost.
> The lawyer time you are billed for is the lawyer's actual
> review/correction time."

## 4. Hour-credit rules of thumb

The following are guidance, not rules. Run them past your insurer.

| Situation                                                  | What you bill                                       |
|------------------------------------------------------------|-----------------------------------------------------|
| Lawyer drafts from scratch, AI not used                    | Full lawyer time at lawyer rate                     |
| AI drafts, lawyer reviews + minor edits                    | Lawyer **review** time at lawyer rate (typically 30–50% of what unaided drafting would have taken) |
| AI drafts, lawyer rewrites substantially                   | Lawyer **rewrite** time at lawyer rate (typically 70–90%) |
| AI does first-pass research, lawyer verifies + extends     | Lawyer **verify + extend** time at lawyer rate      |
| Routine letter, AI draft + lawyer 5-min sign-off           | The 5 minutes, plus the firm's standard per-letter overhead, NOT the time the lawyer would have taken to draft from scratch |

## 5. Discounting practice

If your firm has historically billed "X hours" for a piece of work
the AI now produces in minutes, **disclose the discount**. Clients
notice. A line like:

> "Our usual rate for this work would be 3.5 hours; the AI-assisted
> draft reduced lawyer time to 1.0 hour. You are billed for 1.0
> hour."

… builds trust faster than burying the saving in overheads.

## 6. Trust-account implications

Disbursements paid out of a client trust account must be:

- Bona fide costs the firm incurred on the client's behalf.
- Authorised by the engagement letter.

If you bill AI processing as a disbursement, make sure the
engagement letter authorises "AI processing costs incurred on your
behalf" and the figure on the invoice matches what the firm actually
paid Anthropic (or the AI provider) for that matter. The dashboard
exports per-matter spend on demand.

## 7. Fixed-fee + retainer work

If you bill the matter on a fixed-fee basis, AI assistance lets you:

- Maintain the agreed fixed fee.
- Improve your margin without giving the client a worse outcome.

Be aware: a fixed-fee engagement letter that quietly increases the
firm's margin without disclosing AI use is at the boundary of ASCR
17.5. The safe path is to disclose AI use in the engagement letter
regardless of fee model.

## 8. Pro bono / legal-aid matters

For pro bono or legal-aid work where time-recording is required for
audit:

- Record the lawyer's actual review/correction time.
- The AI processing cost can be absorbed by the firm or claimed
  separately depending on the funder's rules.

## 9. Disputes

If a client queries an invoice on which AI was used:

- Show them the `billing_log` for the matter (it's already in the
  audit trail).
- Show them the review queue rows for that matter, with the
  approving lawyer's name and the approval timestamp.
- Be ready to articulate the value of the lawyer's review and the
  reason it is properly chargeable.

## 10. Annual review

The firm reviews this guidance annually alongside the firm's wider
rates review. The version in force is recorded in:

> `[firm intranet URL]/billing-policy/`

---

Adopted by: ___________________________________________

Date: ________________________________________________

Signature: ____________________________________________
