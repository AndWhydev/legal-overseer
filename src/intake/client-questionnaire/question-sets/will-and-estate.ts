import type { QuestionSet } from '../types.js';
import { parseClientDate, daysBetween, addMonths } from '../date-utils.js';

const STATE_CHOICES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

/**
 * Wills, probate, and estate administration. The death date starts the
 * family-provision claim clock (12 months in most states), so we flag
 * as the window closes.
 */
export const willAndEstate: QuestionSet = {
  matterType: 'will-and-estate',
  description: 'Deceased estate — probate, administration, and family provision.',
  openingMessage:
    'Thanks for contacting [Firm Name]. I am very sorry for your loss. I have a few questions about the estate so our lawyers can advise you on the next steps. This usually takes about 5 minutes.',
  questions: [
    {
      id: 'has_will',
      text: 'Has the deceased left a will?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Determines probate vs letters of administration.',
      followUpIf: {
        answer: 'yes',
        question: {
          id: 'executor',
          text: 'Who is named as executor?',
          type: 'text',
          required: false,
          legalSignificance: 'The executor has authority to apply for probate.',
        },
      },
    },
    {
      id: 'next_of_kin',
      text: 'If there is no will, are you the next of kin? What is your relationship to the deceased?',
      type: 'text',
      required: false,
      legalSignificance: 'On intestacy, the next of kin applies for letters of administration.',
    },
    {
      id: 'state',
      text: 'In which state did the deceased permanently reside at the time of death?',
      type: 'choice',
      choices: STATE_CHOICES,
      required: true,
      legalSignificance: 'Probate jurisdiction — each state Supreme Court.',
    },
    {
      id: 'estate_value',
      text: 'What is the approximate total value of the estate?',
      type: 'text',
      required: true,
      legalSignificance: 'Threshold for whether probate is required (varies by state and institution).',
    },
    {
      id: 'real_property',
      text: 'Does the estate include real property (land or a house)?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Real property almost always requires probate or letters of administration.',
    },
    {
      id: 'non_estate_assets',
      text: 'Are there any assets that pass outside the estate — jointly held property, superannuation, or life insurance with a nominated beneficiary?',
      type: 'text',
      required: true,
      legalSignificance: 'These do not form part of the estate and cannot be dealt with by the executor.',
    },
    {
      id: 'dependants_not_provided',
      text: 'Are there any beneficiaries who were financially dependent on the deceased but not adequately provided for in the will?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Family provision claim risk — 12 month limitation period in most states.',
    },
    {
      id: 'death_date',
      text: 'When did the deceased pass away?',
      type: 'date',
      required: true,
      limitationPeriodTrigger: true,
      legalSignificance: '12 month family provision claim limitation period starts here.',
    },
    {
      id: 'previous_wills',
      text: 'Were there any previous wills?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'The most recent valid will prevails; destroyed wills raise revocation issues.',
    },
    {
      id: 'spouse_at_death',
      text: 'Was the deceased married or in a de facto relationship at the time of death?',
      type: 'yes-no',
      required: true,
      legalSignificance: "Spouse's rights to the estate; revocation of will on marriage in some states.",
    },
    {
      id: 'estate_debts',
      text: 'Are there any debts owed by the estate?',
      type: 'text',
      required: true,
      legalSignificance: 'Estate administration sequence — debts before distribution.',
    },
  ],
  urgencyCheck: (answers) => {
    const death = parseClientDate(answers.death_date);
    if (!death) {
      return { urgent: false, reason: 'Date of death not yet provided.' };
    }
    const deadline = addMonths(death, 12);
    const daysRemaining = daysBetween(new Date(), deadline);
    if (daysRemaining <= 30) {
      return {
        urgent: true,
        reason:
          'Family provision claim window (12 months from death) is closing — review and act now.',
        daysRemaining,
      };
    }
    if (daysRemaining <= 365) {
      return {
        urgent: false,
        reason: 'Family provision claim window (12 months from death) is open.',
        daysRemaining,
      };
    }
    return { urgent: false, reason: 'Within the family provision window.', daysRemaining };
  },
};

export default willAndEstate;
