/**
 * Jurisdiction rules and matter-type baselines.
 *
 * Central place for: normalising free-text state answers into an
 * AustralianState; the fallback legislation list per matter type (used
 * when the model can't be reached); and the standard cost-estimate
 * ranges per matter type (used when the firm has not configured its own
 * rate schedule).
 *
 * Australian English throughout.
 */

import type { MatterType, AustralianState } from '../types.js';

const STATE_ALIASES: Record<string, AustralianState> = {
  nsw: 'NSW',
  'new south wales': 'NSW',
  vic: 'VIC',
  victoria: 'VIC',
  qld: 'QLD',
  queensland: 'QLD',
  wa: 'WA',
  'western australia': 'WA',
  sa: 'SA',
  'south australia': 'SA',
  tas: 'TAS',
  tasmania: 'TAS',
  act: 'ACT',
  'australian capital territory': 'ACT',
  canberra: 'ACT',
  nt: 'NT',
  'northern territory': 'NT',
};

/** Normalise a free-text or coded state value into an AustralianState. */
export function normaliseState(value: string | undefined | null): AustralianState {
  if (!value) return 'unknown';
  const key = value.trim().toLowerCase();
  if (!key) return 'unknown';
  if (STATE_ALIASES[key]) return STATE_ALIASES[key];
  // Try to find a state code/word anywhere in the string.
  for (const [alias, state] of Object.entries(STATE_ALIASES)) {
    if (key.includes(alias)) return state;
  }
  return 'unknown';
}

/**
 * Fallback applicable-legislation list per matter type. The brief
 * generator prefers an Opus-generated list; this is used when the
 * model is unavailable so the brief is never empty.
 */
const FALLBACK_LEGISLATION: Record<MatterType, string[]> = {
  'unfair-dismissal': [
    'Fair Work Act 2009 (Cth) s.385 — meaning of unfair dismissal',
    'Fair Work Act 2009 (Cth) s.394 — 21 day application deadline',
    'Fair Work Act 2009 (Cth) s.387 — criteria for harsh, unjust or unreasonable',
    'Small Business Fair Dismissal Code',
  ],
  'workers-compensation': [
    'Workers Compensation Act 1987 (NSW) / equivalent state Act',
    'Workplace Injury Management and Workers Compensation Act 1998 (NSW)',
    'State certificate of capacity requirements',
  ],
  'family-law-property': [
    'Family Law Act 1975 (Cth) s.79 — alteration of property interests',
    'Family Law Act 1975 (Cth) s.44 — limitation periods',
    'Family Court Act 1997 (WA) — for WA de facto matters',
  ],
  'family-law-children': [
    'Family Law Act 1975 (Cth) Part VII — children',
    'Family Law Act 1975 (Cth) s.60CC — best interests of the child',
    'Family Law Act 1975 (Cth) s.60I — family dispute resolution certificate',
  ],
  'conveyancing-purchase': [
    'State conveyancing / sale of land legislation',
    'State duties legislation (stamp duty)',
    'Foreign Acquisitions and Takeovers Act 1975 (Cth) — FIRB',
  ],
  'conveyancing-sale': [
    'State conveyancing / sale of land legislation',
    'Taxation Administration Act 1953 (Cth) — foreign resident CGT withholding',
    'State vendor disclosure requirements',
  ],
  'will-and-estate': [
    'State succession / wills legislation',
    'State family provision legislation',
    'State probate and administration legislation',
  ],
  'debt-recovery': [
    'State limitation of actions legislation (6 years for contract)',
    'Personal Property Securities Act 2009 (Cth) — secured debts',
    'Bankruptcy Act 1966 (Cth) / Corporations Act 2001 (Cth) — enforcement',
  ],
  'personal-injury-motor': [
    'State motor accident / CTP legislation',
    'State civil liability legislation',
    'Nominal defendant provisions',
  ],
  'personal-injury-public-liability': [
    'State civil liability legislation',
    'State limitation of actions legislation (3 years)',
    'Occupiers liability principles',
  ],
  'commercial-dispute': [
    'Australian Consumer Law (Competition and Consumer Act 2010 (Cth) Sch 2)',
    'State limitation of actions legislation (6 years for contract)',
    'Corporations Act 2001 (Cth) — for shareholder/company disputes',
  ],
  'residential-tenancy': [
    'State residential tenancies legislation',
    'State civil and administrative tribunal rules',
  ],
  'business-purchase': [
    'Australian Consumer Law (Competition and Consumer Act 2010 (Cth) Sch 2)',
    'Fair Work Act 2009 (Cth) — transfer of business',
    'State duties legislation',
  ],
  defamation: [
    'Uniform Defamation Act (state-based) — serious harm threshold',
    'Uniform Defamation Act — concerns notice and offer to make amends',
    'Uniform Defamation Act — 1 year limitation period',
  ],
  'criminal-defence': [
    'State criminal procedure legislation',
    'State crimes / criminal code',
    'State bail legislation',
  ],
  unknown: [],
};

/** Fallback applicable legislation for a matter type. */
export function fallbackLegislation(matterType: MatterType): string[] {
  return FALLBACK_LEGISLATION[matterType] ?? [];
}

/** Standard cost-estimate ranges (AUD) per matter type. */
const COST_RANGES: Record<MatterType, string> = {
  'unfair-dismissal': 'A$3,500 – A$15,000 (conciliation to arbitration)',
  'workers-compensation': 'Often no win, no fee; A$0 upfront, costs recovered from the claim',
  'family-law-property': 'A$5,000 – A$30,000+ (consent orders to contested hearing)',
  'family-law-children': 'A$5,000 – A$35,000+ (mediation to contested parenting hearing)',
  'conveyancing-purchase': 'A$1,200 – A$2,500 plus disbursements and duty',
  'conveyancing-sale': 'A$1,000 – A$2,200 plus disbursements',
  'will-and-estate': 'A$2,500 – A$12,000 (probate to contested estate)',
  'debt-recovery': 'A$1,500 – A$10,000+ (demand to judgment and enforcement)',
  'personal-injury-motor': 'Typically no win, no fee; costs recovered from the claim',
  'personal-injury-public-liability': 'Typically no win, no fee; costs recovered from the claim',
  'commercial-dispute': 'A$8,000 – A$50,000+ (negotiation to trial)',
  'residential-tenancy': 'A$1,000 – A$6,000 (tribunal application to hearing)',
  'business-purchase': 'A$5,000 – A$25,000+ (due diligence and completion)',
  defamation: 'A$8,000 – A$60,000+ (concerns notice to trial)',
  'criminal-defence': 'A$2,500 – A$25,000+ (plea to defended hearing)',
  unknown: 'To be estimated once the matter type is confirmed',
};

/** Standard cost-estimate range for a matter type. */
export function standardCostRange(matterType: MatterType): string {
  return COST_RANGES[matterType] ?? COST_RANGES.unknown;
}
