/**
 * Court / tribunal registry.
 *
 * Maps a matter type and state (and, where it matters, the value in
 * dispute) to the correct Australian court or tribunal. Used in the
 * brief so the lawyer sees the right forum at a glance.
 *
 * Australian English throughout.
 */

import type { MatterType, AustralianState } from '../types.js';

/** State tenancy tribunals. */
const TENANCY_TRIBUNAL: Partial<Record<AustralianState, string>> = {
  NSW: 'NSW Civil and Administrative Tribunal (NCAT)',
  VIC: 'Victorian Civil and Administrative Tribunal (VCAT)',
  QLD: 'Queensland Civil and Administrative Tribunal (QCAT)',
  WA: 'State Administrative Tribunal (SAT)',
  SA: 'South Australian Civil and Administrative Tribunal (SACAT)',
  TAS: 'Tasmanian Civil and Administrative Tribunal (TASCAT)',
  ACT: 'ACT Civil and Administrative Tribunal (ACAT)',
  NT: 'Northern Territory Civil and Administrative Tribunal (NTCAT)',
};

/** State workers-compensation regulators / authorities. */
const WORKERS_COMP_AUTHORITY: Partial<Record<AustralianState, string>> = {
  NSW: 'SIRA / icare (NSW)',
  VIC: 'WorkSafe Victoria',
  QLD: 'WorkCover Queensland',
  WA: 'WorkCover WA',
  SA: 'ReturnToWork SA',
  TAS: 'WorkSafe Tasmania',
  ACT: 'WorkSafe ACT',
  NT: 'NT WorkSafe',
};

/** Lower court (small claims / summary) by state. */
const LOWER_COURT: Partial<Record<AustralianState, string>> = {
  NSW: 'Local Court of New South Wales',
  VIC: 'Magistrates Court of Victoria',
  QLD: 'Magistrates Court of Queensland',
  WA: 'Magistrates Court of Western Australia',
  SA: 'Magistrates Court of South Australia',
  TAS: 'Magistrates Court of Tasmania',
  ACT: 'ACT Magistrates Court',
  NT: 'Local Court of the Northern Territory',
};

/** Intermediate court by state (NSW/QLD/WA/SA: District; VIC: County). */
const INTERMEDIATE_COURT: Partial<Record<AustralianState, string>> = {
  NSW: 'District Court of New South Wales',
  VIC: 'County Court of Victoria',
  QLD: 'District Court of Queensland',
  WA: 'District Court of Western Australia',
  SA: 'District Court of South Australia',
  // TAS, ACT, NT have no intermediate court — handled in code.
};

/** Supreme Court by state. */
const SUPREME_COURT: Partial<Record<AustralianState, string>> = {
  NSW: 'Supreme Court of New South Wales',
  VIC: 'Supreme Court of Victoria',
  QLD: 'Supreme Court of Queensland',
  WA: 'Supreme Court of Western Australia',
  SA: 'Supreme Court of South Australia',
  TAS: 'Supreme Court of Tasmania',
  ACT: 'Supreme Court of the Australian Capital Territory',
  NT: 'Supreme Court of the Northern Territory',
};

function stateLabel(state: AustralianState): string {
  return state === 'unknown' ? 'the relevant state' : state;
}

/** Pick the civil court by value: <$100k lower, <$750k intermediate, else Supreme. */
function civilCourtByValue(state: AustralianState, value?: number): string {
  const amount = value ?? 0;
  if (amount > 0 && amount < 100_000) {
    return LOWER_COURT[state] ?? `Local / Magistrates Court (${stateLabel(state)})`;
  }
  if (amount < 750_000) {
    return (
      INTERMEDIATE_COURT[state] ??
      SUPREME_COURT[state] ??
      `District / County Court (${stateLabel(state)})`
    );
  }
  return SUPREME_COURT[state] ?? `Supreme Court (${stateLabel(state)})`;
}

/**
 * Return the name of the correct court or tribunal for the matter.
 */
export function getRelevantCourt(
  matterType: MatterType,
  state: AustralianState,
  value?: number,
): string {
  switch (matterType) {
    case 'unfair-dismissal':
      return 'Fair Work Commission (national)';

    case 'workers-compensation':
      return WORKERS_COMP_AUTHORITY[state] ?? `State workers compensation authority (${stateLabel(state)})`;

    case 'family-law-property':
      return state === 'WA'
        ? 'Family Court of Western Australia'
        : 'Federal Circuit and Family Court of Australia';

    case 'family-law-children':
      return state === 'WA'
        ? 'Family Court of Western Australia'
        : 'Federal Circuit and Family Court of Australia';

    case 'conveyancing-purchase':
    case 'conveyancing-sale':
      return `Land registry / titles office (${stateLabel(state)}) — conveyancing transaction, no court unless disputed`;

    case 'will-and-estate':
      return `${SUPREME_COURT[state] ?? `Supreme Court (${stateLabel(state)})`} — Probate Registry`;

    case 'debt-recovery':
    case 'commercial-dispute':
      return civilCourtByValue(state, value);

    case 'personal-injury-motor':
      return `CTP scheme dispute resolution then ${civilCourtByValue(state, value)}`;

    case 'personal-injury-public-liability':
      return civilCourtByValue(state, value);

    case 'residential-tenancy':
      return TENANCY_TRIBUNAL[state] ?? `State tenancy tribunal (${stateLabel(state)})`;

    case 'business-purchase':
      return `Commercial transaction (${stateLabel(state)}) — ${civilCourtByValue(state, value)} if disputed`;

    case 'defamation':
      // Defamation is heard in the District/County Court or Supreme Court
      // depending on value and complexity.
      return value && value >= 750_000
        ? SUPREME_COURT[state] ?? `Supreme Court (${stateLabel(state)})`
        : INTERMEDIATE_COURT[state] ??
            SUPREME_COURT[state] ??
            `District / County Court (${stateLabel(state)})`;

    case 'criminal-defence':
      // Summary matters start in the Magistrates/Local Court; indictable
      // matters proceed to the District/County or Supreme Court.
      return `${LOWER_COURT[state] ?? `Magistrates / Local Court (${stateLabel(state)})`} (summary) — committal to ${INTERMEDIATE_COURT[state] ?? SUPREME_COURT[state] ?? `the higher court (${stateLabel(state)})`} for indictable offences`;

    case 'unknown':
    default:
      return `To be determined on classification (${stateLabel(state)})`;
  }
}
