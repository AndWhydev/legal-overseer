import type { QuestionSet } from '../types.js';
import { parseClientDate, daysBetween, addYears } from '../date-utils.js';

const STATE_CHOICES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

/**
 * Personal injury — public liability (slips, falls, defective premises
 * or products). A 3-year limitation period applies generally from the
 * date of injury.
 */
export const personalInjuryPublicLiability: QuestionSet = {
  matterType: 'personal-injury-public-liability',
  description: 'Public liability personal injury — occupiers and product liability.',
  openingMessage:
    'Thanks for contacting [Firm Name]. I have a few questions about your accident so our lawyers can assess your claim. This usually takes about 5 minutes.',
  questions: [
    {
      id: 'location',
      text: 'Where did the accident occur — on whose property or at what type of premises?',
      type: 'text',
      required: true,
      legalSignificance: 'Identifies the occupier and the duty of care owed.',
    },
    {
      id: 'state',
      text: 'Which state did it occur in?',
      type: 'choice',
      choices: STATE_CHOICES,
      required: true,
      legalSignificance: 'Civil liability statutes and limitation periods differ by state.',
    },
    {
      id: 'incident_date',
      text: 'What date did it occur?',
      type: 'date',
      required: true,
      limitationPeriodTrigger: true,
      legalSignificance: '3 year limitation period in most states from the date of injury.',
    },
    {
      id: 'responsible_party',
      text: 'Who do you believe was responsible?',
      type: 'text',
      required: true,
      legalSignificance: 'Identifies the prospective defendant and insurer.',
    },
    {
      id: 'cause',
      text: 'What caused the accident — a slip, a fall, a defective product, or an unsafe structure?',
      type: 'text',
      required: true,
      legalSignificance: 'Establishes breach and the mechanism of injury.',
    },
    {
      id: 'reported',
      text: 'Was the incident reported to the occupier or owner at the time?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Contemporaneous reports corroborate the incident.',
    },
    {
      id: 'witnesses',
      text: 'Were there any witnesses?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Witness evidence supports liability.',
    },
    {
      id: 'photos',
      text: 'Were there any photos taken at the scene?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Scene photographs are powerful evidence of the hazard.',
    },
    {
      id: 'injuries',
      text: 'What injuries did you sustain?',
      type: 'text',
      required: true,
      legalSignificance: 'Injury severity governs damages thresholds.',
    },
    {
      id: 'seen_doctor',
      text: 'Have you seen a doctor?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Medical evidence is essential to prove injury and causation.',
      followUpIf: {
        answer: 'yes',
        question: {
          id: 'medical_records',
          text: 'Do you have medical records documenting the injuries?',
          type: 'yes-no',
          required: false,
          legalSignificance: 'Records establish the link between the incident and the injury.',
        },
      },
    },
  ],
  urgencyCheck: (answers) => {
    const incident = parseClientDate(answers.incident_date);
    if (!incident) {
      return { urgent: false, reason: 'Incident date not yet provided.' };
    }
    const deadline = addYears(incident, 3);
    const daysRemaining = daysBetween(new Date(), deadline);
    if (daysRemaining <= 0) {
      return {
        urgent: true,
        reason: 'The 3 year limitation period appears to have expired — urgent review needed.',
        daysRemaining,
      };
    }
    if (daysRemaining <= 180) {
      return {
        urgent: true,
        reason: '3 year limitation period approaching — proceedings should be prepared now.',
        daysRemaining,
      };
    }
    return { urgent: false, reason: 'Within the 3 year limitation period.', daysRemaining };
  },
};

export default personalInjuryPublicLiability;
