import type { QuestionSet } from '../types.js';
import { parseClientDate, daysBetween, addYears } from '../date-utils.js';

const STATE_CHOICES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

/**
 * Commercial dispute — breach of contract, partnership/shareholder
 * disputes, misleading conduct. A 6-year limitation period applies to
 * contract claims in most states.
 */
export const commercialDispute: QuestionSet = {
  matterType: 'commercial-dispute',
  description: 'Commercial dispute — contract, partnership, shareholder, or misleading conduct.',
  openingMessage:
    'Thanks for contacting [Firm Name]. I have a few questions about your commercial dispute so our lawyers can assess it before your consultation. This usually takes about 5 minutes.',
  questions: [
    {
      id: 'dispute_nature',
      text: 'What is the nature of the dispute — a breach of contract, a partnership dispute, a shareholder dispute, misleading conduct, or other?',
      type: 'choice',
      choices: [
        'Breach of contract',
        'Partnership dispute',
        'Shareholder dispute',
        'Misleading conduct',
        'Other',
      ],
      required: true,
      legalSignificance: 'Frames the cause of action and the governing statute.',
    },
    {
      id: 'parties',
      text: 'Who are the parties — individuals, companies, or a mix?',
      type: 'text',
      required: true,
      legalSignificance: 'Affects standing, joinder, and enforcement.',
    },
    {
      id: 'value',
      text: 'What is the approximate value in dispute?',
      type: 'number',
      required: true,
      legalSignificance: 'Determines the appropriate court and the proportionality of proceedings.',
    },
    {
      id: 'written_agreement',
      text: 'Is there a written agreement or contract?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Documentary terms govern the rights and remedies.',
      followUpIf: {
        answer: 'yes',
        question: {
          id: 'dispute_clause',
          text: 'Does it contain a dispute resolution clause?',
          type: 'yes-no',
          required: false,
          legalSignificance: 'A dispute clause may require mediation/arbitration before litigation.',
        },
      },
    },
    {
      id: 'conduct',
      text: 'What has the other party done or failed to do?',
      type: 'text',
      required: true,
      legalSignificance: 'Establishes the alleged breach or contravention.',
    },
    {
      id: 'first_occurred',
      text: 'When did the conduct you are complaining about first occur?',
      type: 'date',
      required: true,
      limitationPeriodTrigger: true,
      legalSignificance: '6 year limitation period for contract claims in most states.',
    },
    {
      id: 'correspondence',
      text: 'Has there been any written demand or correspondence between the parties?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Prior correspondence frames admissions and without-prejudice positions.',
    },
    {
      id: 'regulator_complaint',
      text: 'Has any formal complaint been made to a regulator — ACCC, ASIC, AFCA, or a state fair trading office?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Regulator involvement may run in parallel or affect strategy.',
    },
    {
      id: 'ongoing_dealings',
      text: 'Are there any ongoing business dealings between the parties?',
      type: 'yes-no',
      required: true,
      legalSignificance:
        'Affects the urgency of interlocutory relief and commercial relationship preservation.',
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
    const first = parseClientDate(answers.first_occurred);
    if (!first) {
      return { urgent: false, reason: 'Date the conduct first occurred not yet provided.' };
    }
    const deadline = addYears(first, 6);
    const daysRemaining = daysBetween(new Date(), deadline);
    if (daysRemaining <= 0) {
      return {
        urgent: true,
        reason: 'The 6 year contract limitation period appears to have expired — urgent review needed.',
        daysRemaining,
      };
    }
    if (daysRemaining <= 180) {
      return {
        urgent: true,
        reason: '6 year contract limitation period approaching — proceedings should be prepared now.',
        daysRemaining,
      };
    }
    return { urgent: false, reason: 'Within the 6 year limitation period.', daysRemaining };
  },
};

export default commercialDispute;
