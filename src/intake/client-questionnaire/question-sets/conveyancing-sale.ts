import type { QuestionSet } from '../types.js';
import { parseClientDate, daysBetween } from '../date-utils.js';

const STATE_CHOICES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

/**
 * Conveyancing — sale. State is asked first; foreign-resident CGT
 * withholding and deceased-estate flags drive what we need before
 * settlement.
 */
export const conveyancingSale: QuestionSet = {
  matterType: 'conveyancing-sale',
  description: 'Property sale conveyancing — state-based.',
  openingMessage:
    'Thanks for contacting [Firm Name]. I have a few quick questions about the property you are selling so we can prepare your contract and get to settlement smoothly. This usually takes about 5 minutes.',
  questions: [
    {
      id: 'state',
      text: 'Which state is the property in?',
      type: 'choice',
      choices: STATE_CHOICES,
      required: true,
      legalSignificance: 'Completely different forms, vendor disclosure, and timeframes per state.',
    },
    {
      id: 'property_use',
      text: 'Is this a residential or commercial property?',
      type: 'choice',
      choices: ['Residential', 'Commercial'],
      required: true,
      legalSignificance: 'Disclosure and GST treatment differ for commercial property.',
    },
    {
      id: 'mortgage',
      text: 'Is there a mortgage on the property?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Discharge of mortgage must be coordinated for settlement.',
    },
    {
      id: 'tenanted',
      text: 'Is the property currently tenanted?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Vacant possession vs sale subject to tenancy.',
      followUpIf: {
        answer: 'yes',
        question: {
          id: 'tenant_notice',
          text: 'Has the tenant been given proper notice?',
          type: 'yes-no',
          required: false,
          legalSignificance: 'Notice requirements vary by state and affect the settlement date.',
        },
      },
    },
    {
      id: 'contract_received',
      text: "Has a contract of sale been received from the buyer’s solicitor?",
      type: 'yes-no',
      required: true,
      legalSignificance: 'Determines whether we are drafting or reviewing.',
    },
    {
      id: 'settlement_date',
      text: 'What is the proposed settlement date?',
      type: 'date',
      required: true,
      legalSignificance: 'Drives the discharge, adjustments, and lodgement timeline.',
    },
    {
      id: 'seller_entity',
      text: 'Is the seller an individual, a company, or a self-managed super fund?',
      type: 'choice',
      choices: ['Individual', 'Company', 'Self-managed super fund'],
      required: true,
      legalSignificance: 'Affects authority, GST, and duty treatment.',
    },
    {
      id: 'foreign_resident',
      text: 'Is the seller a foreign resident for tax purposes?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Foreign resident capital gains withholding of 12.5% applies on sales over $750k.',
    },
    {
      id: 'deceased_estate',
      text: 'Is this a deceased estate sale?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Probate required before settlement; executor authority needed.',
    },
    {
      id: 'special_conditions',
      text: 'Has the seller agreed to any special conditions the buyer requested?',
      type: 'text',
      required: true,
      legalSignificance: 'Special conditions must be reflected accurately in the contract.',
    },
  ],
  urgencyCheck: (answers) => {
    const settlement = parseClientDate(answers.settlement_date);
    if (!settlement) {
      return { urgent: false, reason: 'No settlement date provided yet.' };
    }
    const daysRemaining = daysBetween(new Date(), settlement);
    if (daysRemaining <= 14 && daysRemaining >= 0) {
      return {
        urgent: true,
        reason: 'Settlement is within 14 days — discharge, adjustments, and lodgement must be actioned now.',
        daysRemaining,
      };
    }
    return { urgent: false, reason: 'Settlement is not imminent.', daysRemaining };
  },
};

export default conveyancingSale;
