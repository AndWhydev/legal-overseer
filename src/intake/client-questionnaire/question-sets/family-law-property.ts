import type { QuestionSet } from '../types.js';
import { parseClientDate, daysBetween, addYears, addMonths } from '../date-utils.js';

const STATE_CHOICES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

/**
 * Family law property settlement — Family Law Act 1975 (Cth). Married
 * couples: 12 months from divorce. De facto: 2 years from separation
 * (WA is governed by the Family Court Act 1997 (WA) instead).
 */
export const familyLawProperty: QuestionSet = {
  matterType: 'family-law-property',
  description: 'Family law property settlement — Federal Circuit and Family Court (or WA Family Court).',
  openingMessage:
    'Thanks for contacting [Firm Name]. I have a few questions about your situation so our family lawyers can prepare before your consultation. This usually takes about 5 minutes and your answers stay confidential.',
  questions: [
    {
      id: 'relationship_type',
      text: 'Were you and your partner married or in a de facto relationship?',
      type: 'choice',
      choices: ['Married', 'De facto'],
      required: true,
      legalSignificance: 'Different limitation periods and threshold tests apply.',
    },
    {
      id: 'separation_date',
      text: 'What date did you separate?',
      type: 'date',
      required: true,
      limitationPeriodTrigger: true,
      legalSignificance:
        '12 months from divorce for married couples; 2 years from separation for de facto (most states).',
    },
    {
      id: 'divorce_date',
      text: 'If you were married, have you been divorced? If yes, what was the date of divorce?',
      type: 'text',
      required: true,
      limitationPeriodTrigger: true,
      legalSignificance:
        '12 month limitation period runs from divorce date, not separation, for married couples.',
    },
    {
      id: 'relationship_length',
      text: 'How long were you together?',
      type: 'text',
      required: true,
      legalSignificance:
        'Length of relationship is a significant factor in the s.79 Family Law Act assessment.',
    },
    {
      id: 'children',
      text: 'Are there children from the relationship? If yes, how many and what are their ages?',
      type: 'text',
      required: true,
      legalSignificance: "Children's welfare and living arrangements affect property division.",
    },
    {
      id: 'existing_orders',
      text: 'Is there any existing court order or binding financial agreement already in place?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Existing orders may limit or define the current proceedings.',
    },
    {
      id: 'asset_value',
      text: 'Roughly what is the total value of assets — property, superannuation, savings, investments, and businesses?',
      type: 'text',
      required: true,
      legalSignificance:
        'Determines whether it is cost-effective to pursue court proceedings vs consent orders.',
    },
    {
      id: 'debts',
      text: 'Are there any significant debts — mortgages, personal loans, business debts?',
      type: 'text',
      required: true,
      legalSignificance: 'Net pool calculation.',
    },
    {
      id: 'proceedings_filed',
      text: 'Has either party already filed anything in the Federal Circuit and Family Court?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Existing proceedings affect strategy and urgency.',
    },
    {
      id: 'state',
      text: 'Which state are you in?',
      type: 'choice',
      choices: STATE_CHOICES,
      required: true,
      legalSignificance:
        'De facto property rights are not available in Western Australia under the Family Law Act — governed by the Family Court Act 1997 (WA) instead.',
    },
  ],
  urgencyCheck: (answers) => {
    const married = (answers.relationship_type ?? '').toLowerCase().startsWith('married');
    const waNote = (answers.state ?? '').toUpperCase() === 'WA' ? ' Note: WA de facto matters fall under the Family Court Act 1997 (WA).' : '';

    if (married) {
      const divorce = parseClientDate(answers.divorce_date);
      if (!divorce) {
        return { urgent: false, reason: `No divorce date provided — 12 month clock runs from divorce.${waNote}` };
      }
      const deadline = addMonths(divorce, 12);
      const daysRemaining = daysBetween(new Date(), deadline);
      if (daysRemaining <= 30) {
        return {
          urgent: true,
          reason: `12 month property settlement deadline from divorce approaching.${waNote}`,
          daysRemaining,
        };
      }
      return { urgent: false, reason: `Within the 12 month window from divorce.${waNote}`, daysRemaining };
    }

    const separation = parseClientDate(answers.separation_date);
    if (!separation) {
      return { urgent: false, reason: `Separation date not yet provided.${waNote}` };
    }
    const deadline = addYears(separation, 2);
    const daysRemaining = daysBetween(new Date(), deadline);
    if (daysRemaining <= 60) {
      return {
        urgent: true,
        reason: `2 year de facto property settlement deadline from separation approaching.${waNote}`,
        daysRemaining,
      };
    }
    return { urgent: false, reason: `Within the 2 year de facto window.${waNote}`, daysRemaining };
  },
};

export default familyLawProperty;
