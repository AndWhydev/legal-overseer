import type { QuestionSet, AustralianState } from '../types.js';

const STATE_CHOICES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

/**
 * Residential / commercial cooling-off period by state, in business
 * days. WA and TAS have no statutory cooling-off period for
 * residential contracts. Used to flag that the clock is running once a
 * contract has been received.
 */
const COOLING_OFF_BUSINESS_DAYS: Partial<Record<AustralianState, number>> = {
  NSW: 5,
  VIC: 3,
  QLD: 5,
  SA: 2,
  ACT: 5,
};

/**
 * Conveyancing — purchase. Forms, duties, and cooling-off timeframes
 * differ entirely per state, so state is asked first.
 */
export const conveyancingPurchase: QuestionSet = {
  matterType: 'conveyancing-purchase',
  description: 'Property purchase conveyancing — state-based.',
  openingMessage:
    'Thanks for contacting [Firm Name]. I have a few quick questions about the property you are buying so we can act quickly to protect you. This usually takes about 5 minutes and your answers are reviewed by one of our lawyers.',
  questions: [
    {
      id: 'state',
      text: 'Which state is the property in?',
      type: 'choice',
      choices: STATE_CHOICES,
      required: true,
      legalSignificance: 'Completely different forms, duties, and timeframes per state.',
    },
    {
      id: 'property_use',
      text: 'Is this a residential or commercial property?',
      type: 'choice',
      choices: ['Residential', 'Commercial'],
      required: true,
      legalSignificance: 'Cooling-off and disclosure rules differ for commercial property.',
    },
    {
      id: 'buyer_entity',
      text: 'Is the buyer an individual, a company, or a self-managed super fund?',
      type: 'choice',
      choices: ['Individual', 'Company', 'Self-managed super fund'],
      required: true,
      legalSignificance: 'Different duty rates and restrictions apply.',
    },
    {
      id: 'first_home',
      text: 'Is this the buyer’s first home?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'First Home Owner Grant and duty exemptions/concessions.',
    },
    {
      id: 'established_or_offplan',
      text: 'Is the property established or off the plan?',
      type: 'choice',
      choices: ['Established', 'Off the plan'],
      required: true,
      legalSignificance: 'Off the plan has different cooling-off rights and duty timing.',
    },
    {
      id: 'purchase_price',
      text: 'What is the purchase price?',
      type: 'number',
      required: true,
      legalSignificance: 'Stamp duty calculation and FIRB thresholds.',
    },
    {
      id: 'foreign_person',
      text: 'Is the buyer a foreign person or foreign company?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Foreign duty surcharge and FIRB approval requirements.',
    },
    {
      id: 'contract_received',
      text: 'Has a contract of sale been received?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Cooling-off and finance deadlines run once a contract is on foot.',
      followUpIf: {
        answer: 'yes',
        question: {
          id: 'settlement_date',
          text: 'What is the proposed settlement date?',
          type: 'date',
          required: false,
          legalSignificance: 'Drives the conveyancing timeline and finance/inspection deadlines.',
        },
      },
    },
    {
      id: 'subject_to_finance',
      text: 'Is the purchase subject to finance approval?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Finance clause and subject-to-finance deadline.',
    },
    {
      id: 'tenant_present',
      text: 'Is there a current tenant in the property?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Tenancy rights on sale vary by state.',
    },
  ],
  urgencyCheck: (answers) => {
    const state = (answers.state ?? '').toUpperCase() as AustralianState;
    const contractReceived = (answers.contract_received ?? '').toLowerCase().startsWith('y');
    const coolingDays = COOLING_OFF_BUSINESS_DAYS[state];

    if (contractReceived && coolingDays) {
      return {
        urgent: true,
        reason: `Contract received — the ${state} cooling-off period of ${coolingDays} business days is running. Advise the buyer before it expires.`,
        daysRemaining: coolingDays,
      };
    }
    if (contractReceived && (state === 'WA' || state === 'TAS')) {
      return {
        urgent: false,
        reason: `Contract received — ${state} has no statutory residential cooling-off period, so review the contract promptly.`,
      };
    }
    return { urgent: false, reason: 'No contract received yet, or cooling-off not yet triggered.' };
  },
};

export default conveyancingPurchase;
