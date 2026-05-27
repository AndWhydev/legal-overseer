# Legal Overseer — Sales Collateral

Everything Andy needs to take a firm from first contact to a running
pilot. Use the documents in this order.

| Stage | Send / use | Audience | Purpose |
|-------|-----------|----------|---------|
| **Before the call** | [`PRODUCT-ONE-PAGER.md`](./PRODUCT-ONE-PAGER.md) (or `legal-overseer-one-pager.pdf`) | Decision-maker / partner | Skimmable in 60 seconds — earns the 20-minute demo call. |
| **The demo call** | Live demo on a seeded instance (`npm run demo:seed`) | Partner + responsible lawyer | Show intake → brief → review queue with their practice area. |
| **On pilot sign-up** | [`PILOT-ONBOARDING-PACKAGE.md`](./PILOT-ONBOARDING-PACKAGE.md) | Firm (split across IT + lawyer) | The complete 30-day pilot pack: setup, lawyer guide, guardrails, feedback, day-30. |
| **Install day** | `install.sh` / `install-windows.ps1` (repo root) | Firm IT | One-command install: Node check, deps, `.env`, data dirs, migrations. |
| **Day 30** | Feedback form (Section 5 of the onboarding package) | Responsible lawyer | Convert / iterate decision. |

## The one-line pitch

> The AI paralegal that installs on your firm's own server, keeps a
> lawyer in control of every output, and never lets client data leave the
> building.

## Pricing at a glance

- **30-day free pilot** — no credit card.
- **Small firm** (under 5 lawyers): **$15,000 / year**.
- **Mid firm** (5–20 lawyers): **$35,000 / year**.
- **Enterprise** (20+): tailored.

Tiers map to the licence caps in `src/licence/types.ts`
(`small_firm` ≤5 users, `mid_firm` ≤20, `enterprise`). Pilots run on a
`trial` licence issued with `npm run licence:generate`.

## Contact

andy@allwebbedup.com.au · 1800 714 148

---

*Legal Overseer supports admitted Australian legal practitioners. It does
not provide legal advice and does not replace a lawyer's professional
judgement or supervision obligations.*
