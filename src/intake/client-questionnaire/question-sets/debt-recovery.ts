import type { QuestionSet } from '../types.js';
import { parseClientDate, daysBetween, addYears } from '../date-utils.js';

const STATE_CHOICES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

/**
 * Debt recovery. The 6-year limitation period (most states) runs from
 * the last payment or written acknowledgement, so that date is the key
 * urgency trigger.
 */
export const debtRecovery: QuestionSet = {
  matterType: 'debt-recovery',
  description: 'Debt recovery — letter of demand through to judgment and enforcement.',
  openingMessage:
    'Thanks for contacting [Firm Name]. I have a few questions about the money you are owed so our lawyers can advise on recovering it. This usually takes about 5 minutes.',
  questions: [
    {
      id: 'amount_owed',
      text: 'What is the total amount of money owed?',
      type: 'number',
      required: true,
      legalSignificance:
        'Determines the appropriate court — Magistrates/Local Court under $100k, District Court under $750k, Supreme Court above.',
    },
    {
      id: 'basis',
      text: 'What is the basis of the debt — unpaid invoice, loan agreement, contract, or other?',
      type: 'choice',
      choices: ['Unpaid invoice', 'Loan agreement', 'Contract', 'Other'],
      required: true,
      legalSignificance: 'Frames the cause of action and the evidence required.',
    },
    {
      id: 'debtor_acknowledges',
      text: 'Does the debtor acknowledge they owe the money?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Acknowledgement narrows the dispute and can restart the limitation clock.',
    },
    {
      id: 'written_agreement',
      text: 'Is there a written agreement, invoice, or contract?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Documentary proof of the debt.',
    },
    {
      id: 'last_acknowledgement',
      text: 'When was the last payment made, or when did the debtor last acknowledge the debt in writing?',
      type: 'date',
      required: true,
      limitationPeriodTrigger: true,
      legalSignificance: '6 year limitation period in most states, running from last acknowledgement.',
    },
    {
      id: 'debtor_entity',
      text: 'Is the debtor an individual, a company, or a trust?',
      type: 'choice',
      choices: ['Individual', 'Company', 'Trust'],
      required: true,
      legalSignificance: 'Different enforcement options — bankruptcy vs liquidation.',
    },
    {
      id: 'debtor_assets',
      text: 'Does the debtor have assets or income you are aware of?',
      type: 'text',
      required: true,
      legalSignificance:
        'Practical enforcement — a judgment against an asset-less debtor has limited value.',
    },
    {
      id: 'demand_sent',
      text: 'Has a formal written demand been sent?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'A letter of demand is the usual first step and may be a prerequisite.',
      followUpIf: {
        answer: 'yes',
        question: {
          id: 'demand_response',
          text: 'What was the response?',
          type: 'text',
          required: false,
          legalSignificance: 'The response shapes the next step and any dispute on quantum.',
        },
      },
    },
    {
      id: 'secured',
      text: 'Is the debt secured against any property or asset?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'PPSR-registered security interests and mortgage security change enforcement.',
    },
    {
      id: 'state',
      text: 'Which state are you in?',
      type: 'choice',
      choices: STATE_CHOICES,
      required: true,
      legalSignificance: 'Determines the court and the applicable limitation statute.',
    },
  ],
  urgencyCheck: (answers) => {
    const last = parseClientDate(answers.last_acknowledgement);
    if (!last) {
      return { urgent: false, reason: 'Date of last payment/acknowledgement not yet provided.' };
    }
    const deadline = addYears(last, 6);
    const daysRemaining = daysBetween(new Date(), deadline);
    if (daysRemaining <= 0) {
      return {
        urgent: true,
        reason: 'The 6 year limitation period appears to have expired — urgent review needed.',
        daysRemaining,
      };
    }
    if (daysRemaining <= 365) {
      return {
        urgent: true,
        reason: 'Limitation period may be approaching — urgent review needed.',
        daysRemaining,
      };
    }
    return { urgent: false, reason: 'Within the 6 year limitation period.', daysRemaining };
  },
};

export default debtRecovery;
