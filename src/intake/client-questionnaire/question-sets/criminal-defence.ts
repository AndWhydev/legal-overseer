import type { QuestionSet } from '../types.js';
import { parseClientDate, daysBetween } from '../date-utils.js';

/**
 * Criminal defence. Court dates are immovable, so a hearing within 7
 * days is treated as urgent, as is any indication that bail conditions
 * have been breached.
 */
export const criminalDefence: QuestionSet = {
  matterType: 'criminal-defence',
  description: 'Criminal defence — charges, court attendance, and bail.',
  openingMessage:
    'Thanks for contacting [Firm Name]. I have a few questions about your matter so our lawyers can act quickly — court dates can be very soon. This usually takes about 5 minutes and everything you tell us is confidential.',
  questions: [
    {
      id: 'stage',
      text: 'Have you been charged, received a court attendance notice, or are you under investigation?',
      type: 'choice',
      choices: ['Charged', 'Received a court attendance notice', 'Under investigation'],
      required: true,
      legalSignificance: 'Determines whether the priority is representation, advice, or pre-charge engagement.',
    },
    {
      id: 'offence',
      text: 'What is the offence or alleged offence?',
      type: 'text',
      required: true,
      legalSignificance: 'Governs summary vs indictable jurisdiction and the available pleas.',
    },
    {
      id: 'court_date',
      text: 'What is the first court date, if known?',
      type: 'date',
      required: true,
      legalSignificance: 'First appearance deadline.',
    },
    {
      id: 'court_and_state',
      text: 'Which court and which state?',
      type: 'text',
      required: true,
      legalSignificance: 'Determines the registry, procedure, and applicable criminal statute.',
    },
    {
      id: 'arrested_bail',
      text: 'Were you arrested, and if so were you released on bail?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Bail status governs liberty and any conditions that must be observed.',
      followUpIf: {
        answer: 'yes',
        question: {
          id: 'bail_conditions',
          text: 'What are the bail conditions?',
          type: 'text',
          required: false,
          legalSignificance: 'Breach of conditions can lead to arrest and bail revocation.',
        },
      },
    },
    {
      id: 'spoke_to_police',
      text: 'Have you spoken to police — given a statement or participated in an interview?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Admissions and records of interview are typically the most significant evidence.',
    },
    {
      id: 'maintains_innocence',
      text: 'Do you maintain that you did not commit the offence?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Shapes the plea and whether the matter heads to a defended hearing.',
    },
    {
      id: 'witnesses',
      text: 'Are there any witnesses you believe can support your account?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Defence witnesses must be identified and preserved early.',
    },
    {
      id: 'prior_history',
      text: 'Have you been in trouble with the law before?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Prior criminal history affects bail applications and sentencing.',
    },
    {
      id: 'personal_circumstances',
      text: 'Are you currently employed, a carer, or in circumstances that would be affected by a conviction?',
      type: 'text',
      required: true,
      legalSignificance: 'Relevant to sentencing submissions and character references.',
    },
  ],
  urgencyCheck: (answers) => {
    const courtDate = parseClientDate(answers.court_date);
    const bailConditions = (answers.bail_conditions ?? '').toLowerCase();
    if (bailConditions.includes('breach')) {
      return {
        urgent: true,
        reason: 'A possible breach of bail conditions has been disclosed — urgent advice required to avoid arrest.',
      };
    }
    if (courtDate) {
      const daysRemaining = daysBetween(new Date(), courtDate);
      if (daysRemaining <= 7) {
        return {
          urgent: true,
          reason: 'A court date is within 7 days — representation must be arranged immediately.',
          daysRemaining,
        };
      }
      return { urgent: false, reason: 'Court date is more than 7 days away.', daysRemaining };
    }
    return { urgent: false, reason: 'No imminent court date provided.' };
  },
};

export default criminalDefence;
