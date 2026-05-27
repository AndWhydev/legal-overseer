/**
 * Question-set registry.
 *
 * Maps every supported MatterType to its QuestionSet. The intake agent
 * and the classifier look matter types up here. To add a new practice
 * area: create a new file in this folder, import it, and add it to the
 * registry below.
 */

import type { MatterType, QuestionSet } from '../types.js';

import { unfairDismissal } from './unfair-dismissal.js';
import { workersCompensation } from './workers-compensation.js';
import { familyLawProperty } from './family-law-property.js';
import { familyLawChildren } from './family-law-children.js';
import { conveyancingPurchase } from './conveyancing-purchase.js';
import { conveyancingSale } from './conveyancing-sale.js';
import { willAndEstate } from './will-and-estate.js';
import { debtRecovery } from './debt-recovery.js';
import { personalInjuryMotor } from './personal-injury-motor.js';
import { personalInjuryPublicLiability } from './personal-injury-public-liability.js';
import { commercialDispute } from './commercial-dispute.js';
import { residentialTenancy } from './residential-tenancy.js';
import { businessPurchase } from './business-purchase.js';
import { defamation } from './defamation.js';
import { criminalDefence } from './criminal-defence.js';

/** All question sets keyed by matter type. */
export const QUESTION_SETS: Partial<Record<MatterType, QuestionSet>> = {
  'unfair-dismissal': unfairDismissal,
  'workers-compensation': workersCompensation,
  'family-law-property': familyLawProperty,
  'family-law-children': familyLawChildren,
  'conveyancing-purchase': conveyancingPurchase,
  'conveyancing-sale': conveyancingSale,
  'will-and-estate': willAndEstate,
  'debt-recovery': debtRecovery,
  'personal-injury-motor': personalInjuryMotor,
  'personal-injury-public-liability': personalInjuryPublicLiability,
  'commercial-dispute': commercialDispute,
  'residential-tenancy': residentialTenancy,
  'business-purchase': businessPurchase,
  defamation,
  'criminal-defence': criminalDefence,
};

/** The matter types that have a question set (everything except `unknown`). */
export const SUPPORTED_MATTER_TYPES = Object.keys(QUESTION_SETS) as MatterType[];

/** Look up a question set, or undefined for `unknown` / unsupported types. */
export function getQuestionSet(matterType: MatterType): QuestionSet | undefined {
  return QUESTION_SETS[matterType];
}

export {
  unfairDismissal,
  workersCompensation,
  familyLawProperty,
  familyLawChildren,
  conveyancingPurchase,
  conveyancingSale,
  willAndEstate,
  debtRecovery,
  personalInjuryMotor,
  personalInjuryPublicLiability,
  commercialDispute,
  residentialTenancy,
  businessPurchase,
  defamation,
  criminalDefence,
};
