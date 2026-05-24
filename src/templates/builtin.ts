/**
 * Built-in Australian legal templates.
 *
 * Loaded once on first boot. They are intentionally plain Markdown,
 * Australian English, and reference Australian law / the firm's
 * jurisdiction. None of these are a substitute for the lawyer's own
 * drafting — they are starting scaffolds with [SQUARE BRACKET]
 * placeholders that the drafting skill or lawyer must fill in.
 */

import type { TemplateCategory, UpsertTemplateInput } from './repo.js';

export const BUILTIN_TEMPLATES: UpsertTemplateInput[] = [
  // ── NDAs ──────────────────────────────────────────────────────────
  {
    slug: 'mutual-nda-au',
    category: 'nda' as TemplateCategory,
    title: 'Mutual Non-Disclosure Agreement (Australia)',
    description: 'Bilateral confidentiality between two Australian commercial parties.',
    source: 'builtin',
    body_markdown: `# MUTUAL NON-DISCLOSURE AGREEMENT

**This Agreement** is made on [DATE].

**Between:**

1. **[PARTY A NAME]** (ABN [PARTY A ABN]) of [PARTY A ADDRESS] (**Party A**); and
2. **[PARTY B NAME]** (ABN [PARTY B ABN]) of [PARTY B ADDRESS] (**Party B**).

## 1. Definitions

**Confidential Information** means any information disclosed by one
party to the other (whether oral, written, electronic, or in any other
form) that is marked or identified as confidential or that a reasonable
person would understand to be confidential, including but not limited
to trade secrets, business plans, financial information, customer
lists, software, technical information, and product designs.

## 2. Obligations

Each party (the **Receiving Party**) will:

(a) keep all Confidential Information strictly confidential;

(b) not use the Confidential Information except for the **Permitted
    Purpose**, being [DESCRIBE PURPOSE];

(c) limit access to its officers, employees, contractors and
    professional advisers who reasonably need to know and who are
    bound by equivalent obligations of confidence;

(d) protect the Confidential Information using at least the same
    degree of care it uses to protect its own confidential
    information, and not less than a reasonable standard of care.

## 3. Exclusions

The obligations in clause 2 do not apply to information that:

(a) is or becomes publicly available other than through breach of this
    Agreement;

(b) was lawfully in the Receiving Party's possession before disclosure
    under this Agreement and free of any obligation of confidence;

(c) is independently developed by the Receiving Party without use of
    or reference to the Disclosing Party's Confidential Information;
    or

(d) is required to be disclosed by law, court order, or by a
    regulatory authority of competent jurisdiction, provided the
    Receiving Party gives prompt notice (where lawful) so the
    Disclosing Party can seek a protective order.

## 4. Term

This Agreement starts on the date set out above and continues for
[TERM] years.

## 5. Return of information

On written request from the Disclosing Party, the Receiving Party will
return or securely destroy all Confidential Information in its
possession, except copies required to be retained by law or for genuine
recordkeeping (which remain subject to this Agreement).

## 6. No licence

Nothing in this Agreement transfers any intellectual property right or
licence in the Confidential Information.

## 7. Governing law

This Agreement is governed by the laws of **[NSW / VIC / QLD / ...]**
and the parties submit to the non-exclusive jurisdiction of its courts.

## 8. Counterparts &amp; electronic execution

This Agreement may be signed in counterparts and by electronic means.

---

**Executed by Party A:** _____________________________

**Executed by Party B:** _____________________________
`,
  },

  // ── Retainer agreement ─────────────────────────────────────────────
  {
    slug: 'retainer-cost-agreement-au',
    category: 'retainer' as TemplateCategory,
    title: 'Costs Agreement &amp; Retainer (Australian solicitor)',
    description: 'Compliant with Legal Profession Uniform Law / state equivalents. Adjust the AI disclosure paragraph to match the firm\'s AI Usage Policy.',
    source: 'builtin',
    body_markdown: `# COSTS AGREEMENT &amp; RETAINER

**Between:**

1. **[FIRM NAME]** (ABN [FIRM ABN]) of [FIRM ADDRESS] (**the Firm**); and
2. **[CLIENT NAME]** of [CLIENT ADDRESS] (**you**).

## 1. Scope of work

The Firm has agreed to act for you in connection with: **[MATTER
DESCRIPTION]** (the **Matter**).

Work outside this scope requires a separate written instruction and
may be the subject of a further costs agreement.

## 2. Responsible solicitor

The solicitor with day-to-day conduct of the Matter is
**[LAWYER NAME], [POSITION]**, supervised by **[SUPERVISING PARTNER]**.

## 3. Our fees

Time will be billed at the following hourly rates (plus GST):

| Role                | Rate (per hour, ex-GST) |
|---------------------|-------------------------|
| Partner             | $[RATE]                 |
| Senior associate    | $[RATE]                 |
| Solicitor           | $[RATE]                 |
| Paralegal           | $[RATE]                 |

We charge in 6-minute (1/10th of an hour) units. Rates are reviewed
annually on 1 July.

## 4. Estimate of costs

Our current estimate of the total professional fees and disbursements
for the Matter is **$[ESTIMATE] (excluding GST)**. This estimate is
not a quote — it is our best assessment based on the information you
have given us. If circumstances change materially we will give you a
revised estimate as soon as practicable.

## 5. Disbursements

You agree to pay reasonable disbursements that the Firm incurs on
your behalf, including but not limited to:

- search fees, court filing fees, agent's fees;
- counsel's fees (where briefed with your prior authority);
- expert reports;
- AI processing costs incurred at the AI provider on your behalf
  (recovered at cost — typically less than $10 per matter unless the
  matter involves heavy document review).

## 6. AI assistance disclosure

The Firm uses an on-premises AI assistant ("Legal Overseer") to help
draft routine correspondence, conduct initial research, and track
deadlines. Every AI output is reviewed and approved by an admitted
lawyer of this Firm before being relied upon or sent. Client
identifiers (your name, contact details, sensitive identifiers) are
removed from any data sent to the external AI provider. The AI does
not make legal judgments on your matter — those remain the
responsibility of your lawyer.

## 7. Billing

We will issue monthly invoices. Payment is due within 14 days of the
invoice date. Interest accrues at the rate prescribed by the Legal
Profession Uniform General Rules / state equivalent on amounts unpaid
after 30 days.

## 8. Termination

You may terminate this retainer at any time on written notice. The
Firm may terminate on reasonable notice for any of the reasons
permitted by the relevant Conduct Rules.

## 9. Your right to negotiate

You have the right to:

- negotiate the terms of this Agreement before you sign it;
- request itemised bills and a written report on the progress of
  costs;
- be informed promptly of any material changes in the costs estimate;
- a costs assessment if you disagree with our bill.

## 10. Acceptance

By signing below (or paying our first invoice) you accept this Costs
Agreement.

---

**Signed for and on behalf of the Firm:** ________________________

**Signed by the Client:** _________________________________________
`,
  },

  // ── Demand letter ─────────────────────────────────────────────────
  {
    slug: 'demand-letter-debt-au',
    category: 'demand_letter' as TemplateCategory,
    title: 'Letter of Demand — Debt (Australian)',
    description: 'Standard pre-litigation demand letter for an unpaid debt. Adjust the limitation-period warning to the relevant state Act.',
    source: 'builtin',
    body_markdown: `[FIRM LETTERHEAD]

[DATE]

[DEBTOR NAME]
[DEBTOR ADDRESS]

**By [post / email / both]**

**Without prejudice save as to costs**

Dear [DEBTOR],

## Re: Outstanding amount of $[AMOUNT] owed to [CLIENT NAME]

We act for **[CLIENT NAME]**.

Our client has instructed us that you owe the sum of **$[AMOUNT]**
under [INVOICE / CONTRACT / GUARANTEE] dated [DATE]. Particulars of
the debt are:

- [INVOICE NUMBER] dated [DATE] — $[AMOUNT]
- [INVOICE NUMBER] dated [DATE] — $[AMOUNT]
- **Total outstanding: $[TOTAL]**

Despite [DATE OF LAST REMINDER / NOTICE], the debt remains unpaid.

**We are instructed to demand payment of the sum of $[TOTAL] within
seven (7) days of the date of this letter.**

Payment may be made to:

> Account name: [CLIENT ACCOUNT NAME]
> BSB:          [BSB]
> Account:      [ACCOUNT NUMBER]
> Reference:    [REFERENCE]

If you dispute the debt, you must do so in writing within the same
seven (7) day period, setting out the basis of your dispute.

If we do not receive payment or a substantive response in that time,
we have instructions to commence recovery proceedings in the
[COURT / TRIBUNAL] without further notice. You will also be liable
for our client's legal costs of those proceedings.

Time is critical. The Limitation Act [APPLICABLE ACT] limits the
period within which a debt of this kind may be sued upon.

Yours faithfully

**[LAWYER NAME]**
[POSITION]
[FIRM NAME]
`,
  },

  // ── Court document shell ──────────────────────────────────────────
  {
    slug: 'court-statement-of-claim-fcafc',
    category: 'court_document' as TemplateCategory,
    title: 'Statement of Claim — Federal Court (general civil claim)',
    description: 'Skeleton compliant with the Federal Court Rules 2011 (Cth), Form 17. Adjust the relief sought + cause of action.',
    source: 'builtin',
    body_markdown: `**Form 17**
**Rule 8.05(1)(a)**

# IN THE FEDERAL COURT OF AUSTRALIA
**[REGISTRY] REGISTRY**
**[DIVISION] DIVISION**

No. [FILE NUMBER] of [YEAR]

**[APPLICANT NAME]**
Applicant

**v.**

**[RESPONDENT NAME]**
Respondent

# STATEMENT OF CLAIM

## A. The parties

1. The Applicant is, and at all material times was, [DESCRIPTION OF
   APPLICANT — e.g., a company incorporated in Australia and
   registered with ACN [ACN]].

2. The Respondent is, and at all material times was, [DESCRIPTION OF
   RESPONDENT].

## B. The agreement

3. On or about [DATE], the Applicant and the Respondent entered into
   a written contract (the **Contract**).

   **Particulars**

   (a) The Contract is in writing.

   (b) The Contract is dated [DATE].

   (c) The Contract was signed by [SIGNATORIES].

4. The terms of the Contract material to this proceeding included:

   (a) [TERM];

   (b) [TERM]; and

   (c) [TERM].

## C. The breach

5. In breach of the Contract, the Respondent has [DESCRIBE BREACH].

   **Particulars**

   (a) [PARTICULAR];

   (b) [PARTICULAR].

## D. Loss and damage

6. By reason of the breach pleaded in paragraph 5, the Applicant has
   suffered loss and damage.

   **Particulars of loss**

   (a) [HEAD OF LOSS] in the sum of $[AMOUNT];

   (b) [HEAD OF LOSS] in the sum of $[AMOUNT].

## E. Relief sought

The Applicant claims:

(a) damages in the sum of $[AMOUNT];

(b) interest pursuant to s 51A of the *Federal Court of Australia Act
    1976* (Cth);

(c) the Applicant's costs of and incidental to the proceeding; and

(d) such further or other order as the Court considers appropriate.

Dated: [DATE]

---

**[LAWYER NAME]**
Solicitor for the Applicant
[FIRM NAME]
`,
  },

  // ── Contract ──────────────────────────────────────────────────────
  {
    slug: 'services-agreement-au',
    category: 'contract' as TemplateCategory,
    title: 'Services Agreement (Australian B2B)',
    description: 'Plain-English services agreement between two Australian businesses.',
    source: 'builtin',
    body_markdown: `# SERVICES AGREEMENT

**This Agreement** is made on [DATE].

**Between:**

1. **[SERVICE PROVIDER]** (ABN [ABN]) of [ADDRESS] (**Provider**); and
2. **[CLIENT]** (ABN [ABN]) of [ADDRESS] (**Customer**).

## 1. Services

The Provider will supply the services described in **Schedule 1**
(the **Services**) to the Customer.

## 2. Term

This Agreement starts on [START DATE] and continues until [END DATE],
unless terminated earlier under clause 9.

## 3. Fees

The Customer will pay the Provider the fees set out in **Schedule 2**
(the **Fees**). All Fees are quoted exclusive of GST. GST will be
added to invoices in accordance with the *A New Tax System (Goods and
Services Tax) Act 1999* (Cth).

## 4. Payment terms

Invoices are payable within [N] days of issue. Interest accrues on
overdue amounts at [RATE]% per annum.

## 5. Provider obligations

The Provider will:

(a) supply the Services with due care and skill;

(b) comply with all applicable laws;

(c) provide the personnel listed in **Schedule 3** (the **Key
    Personnel**); and

(d) maintain the insurance policies listed in **Schedule 4**.

## 6. Customer obligations

The Customer will:

(a) provide the access, information, and cooperation reasonably
    required by the Provider;

(b) pay invoices in accordance with clause 4; and

(c) [OTHER OBLIGATIONS].

## 7. Intellectual property

(a) Each party retains ownership of all intellectual property
    rights it owned before this Agreement.

(b) The Provider assigns to the Customer all intellectual property
    rights in any deliverables prepared specifically for the
    Customer under this Agreement.

## 8. Confidentiality

Each party will keep the other party's confidential information
confidential, and use it only for the purpose of this Agreement.

## 9. Termination

Either party may terminate this Agreement on [N] days' written notice.
Either party may terminate immediately if the other party commits a
material breach that is not remedied within [N] days of written
notice.

## 10. Liability

(a) Subject to (b), the maximum aggregate liability of each party
    under this Agreement is limited to the Fees paid in the [12]
    months immediately preceding the event giving rise to the claim.

(b) Neither party limits its liability for [DEATH OR PERSONAL INJURY
    CAUSED BY NEGLIGENCE / FRAUD / WILFUL MISCONDUCT / BREACH OF THE
    AUSTRALIAN CONSUMER LAW].

## 11. Notices

Notices must be in writing and delivered to the address listed at the
top of this Agreement (or to any updated address notified in writing).

## 12. Dispute resolution

Before commencing court proceedings, the parties will use reasonable
efforts to resolve any dispute through good-faith negotiation and, if
that fails, through mediation administered by the Resolution
Institute or such other mediator as the parties agree.

## 13. Governing law

This Agreement is governed by the laws of **[NSW / VIC / ...]** and
the parties submit to the non-exclusive jurisdiction of its courts.

## Schedules

**Schedule 1 — Services**

[DESCRIPTION OF SERVICES]

**Schedule 2 — Fees**

[FEES TABLE]

**Schedule 3 — Key Personnel**

[NAMES + ROLES]

**Schedule 4 — Insurance**

[POLICIES + COVER AMOUNTS]

---

**Executed by Provider:** _____________________________

**Executed by Customer:** _____________________________
`,
  },

  // ── Correspondence: client update letter ──────────────────────────
  {
    slug: 'client-update-letter-au',
    category: 'correspondence' as TemplateCategory,
    title: 'Client matter update letter',
    description: 'Periodic update letter for an active client. Plain English; explains progress, next steps, and any cost variation.',
    source: 'builtin',
    body_markdown: `[FIRM LETTERHEAD]

[DATE]

[CLIENT NAME]
[CLIENT ADDRESS]

**Our ref:** [MATTER NUMBER]
**Your ref:** [CLIENT REF, IF ANY]

Dear [CLIENT],

## Re: [MATTER TITLE] — update as at [DATE]

I am writing to update you on your matter.

## Progress since our last letter

Since our last update on [DATE], the following has happened:

1. [WHAT HAPPENED];
2. [WHAT HAPPENED];
3. [WHAT HAPPENED].

## Next steps

The next steps in your matter are:

1. **[NEXT STEP]** — we expect this to occur by [DATE].
2. **[NEXT STEP]** — this is contingent on [WHAT].

## What we need from you

To progress your matter, we need you to:

- [WHAT WE NEED];
- [BY WHEN].

## Costs to date

The total costs incurred on your matter to date are **$[AMOUNT] (ex
GST)**. Our current estimate of total costs to completion is
**$[ESTIMATE] (ex GST)**, [unchanged / increased / decreased from our
last estimate of $[PREVIOUS]]. [If varied: brief reason for the
variation.]

## Any questions

Please do not hesitate to contact me on [PHONE] or by reply email if
you have any questions.

Yours sincerely

**[LAWYER NAME]**
[POSITION]
[FIRM NAME]
`,
  },
];
