import type { QuestionSet } from '../types.js';
import { parseClientDate, daysSince } from '../date-utils.js';

const STATE_CHOICES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

/**
 * Unfair dismissal — Fair Work Act 2009 (Cth). 21-day filing deadline
 * to the Fair Work Commission runs from the date the dismissal took
 * effect (s.394).
 */
export const unfairDismissal: QuestionSet = {
  matterType: 'unfair-dismissal',
  description: 'Unfair dismissal claim — Fair Work Commission (national jurisdiction).',
  openingMessage:
    'Thanks for contacting [Firm Name]. To make sure we can help you as quickly as possible, I have a few questions about your situation. This usually takes about 5 minutes. Your answers will be reviewed by one of our lawyers before your consultation.',
  questions: [
    {
      id: 'dismissal_date',
      text: 'What date were you dismissed or told your employment was ending?',
      type: 'date',
      required: true,
      limitationPeriodTrigger: true,
      legalSignificance: '21 day limitation period runs from this date under Fair Work Act s.394.',
    },
    {
      id: 'length_of_service',
      text: 'How long had you been working for this employer?',
      type: 'text',
      required: true,
      legalSignificance:
        'Minimum employment period is 6 months (12 months for a small business employer under 15 employees).',
    },
    {
      id: 'small_business',
      text: 'Did your employer have fewer than 15 employees?',
      type: 'yes-no',
      required: true,
      legalSignificance:
        'Small business employers have different obligations under the Small Business Fair Dismissal Code.',
    },
    {
      id: 'reason_given',
      text: 'What reason did your employer give for the dismissal?',
      type: 'text',
      required: true,
      legalSignificance: 'Valid reason vs harsh, unjust or unreasonable determination.',
    },
    {
      id: 'warnings',
      text: 'Were you given any warnings before the dismissal?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Procedural fairness requirement.',
    },
    {
      id: 'opportunity_to_respond',
      text: 'Were you given a chance to respond to any concerns before the decision was made?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Procedural fairness — opportunity to respond.',
    },
    {
      id: 'protected_reason',
      text: 'Do you believe your dismissal was related to any of these? Union activity, making a complaint about safety or workplace rights, taking sick leave, pregnancy or parental leave, discrimination.',
      type: 'choice',
      choices: [
        'Union activity',
        'A complaint about safety or workplace rights',
        'Taking sick leave',
        'Pregnancy or parental leave',
        'Discrimination',
        'None of these',
      ],
      required: true,
      legalSignificance:
        'Determines if a general protections claim under s.340 is more appropriate than unfair dismissal.',
    },
    {
      id: 'written_contract',
      text: 'Did you have a written employment contract?',
      type: 'yes-no',
      required: true,
      legalSignificance:
        'Relevant to notice entitlements and any restraint of trade provisions.',
    },
    {
      id: 'fwc_lodged',
      text: 'Have you lodged anything with the Fair Work Commission yet?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Filing in the wrong jurisdiction or late is fatal to the claim.',
    },
    {
      id: 'state',
      text: 'Which state or territory did you work in?',
      type: 'choice',
      choices: STATE_CHOICES,
      required: true,
      legalSignificance: 'Jurisdiction for any state-based award or agreement claims.',
    },
  ],
  urgencyCheck: (answers) => {
    const dismissed = parseClientDate(answers.dismissal_date);
    if (!dismissed) {
      return { urgent: false, reason: 'Dismissal date not yet provided.' };
    }
    const elapsed = daysSince(dismissed);
    const daysRemaining = 21 - elapsed;
    if (daysRemaining <= 21 && daysRemaining > 0) {
      return {
        urgent: true,
        reason: '21 day Fair Work Commission filing deadline approaching.',
        daysRemaining,
      };
    }
    if (daysRemaining <= 0) {
      return {
        urgent: true,
        reason:
          '21 day Fair Work Commission filing deadline appears to have passed — an extension of time application may be required.',
        daysRemaining,
      };
    }
    return { urgent: false, reason: 'Within the 21 day filing window.', daysRemaining };
  },
};

export default unfairDismissal;
