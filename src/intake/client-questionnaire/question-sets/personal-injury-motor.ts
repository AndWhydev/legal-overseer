import type { QuestionSet, AustralianState } from '../types.js';
import { parseClientDate, daysBetween } from '../date-utils.js';

const STATE_CHOICES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

/** CTP claim notification deadlines by state, in days from the accident. */
const NOTIFICATION_DAYS: Partial<Record<AustralianState, number>> = {
  NSW: 28, // most claims — early notification critical
  QLD: 273, // ~9 months
  VIC: 365, // 12 months
  WA: 1095, // 3 years
  SA: 1095, // 3 years
};

/**
 * Personal injury — motor vehicle (CTP). Schemes differ entirely per
 * state, so state is asked first and drives the notification deadline.
 */
export const personalInjuryMotor: QuestionSet = {
  matterType: 'personal-injury-motor',
  description: 'Motor vehicle personal injury — state CTP scheme.',
  openingMessage:
    'Thanks for contacting [Firm Name]. I have a few questions about your accident so our lawyers can protect your claim quickly — some deadlines are very short. This usually takes about 5 minutes.',
  questions: [
    {
      id: 'state',
      text: 'Which state did the accident occur in?',
      type: 'choice',
      choices: STATE_CHOICES,
      required: true,
      legalSignificance:
        'Entirely different CTP schemes — SIRA (NSW), TAC (VIC), CTP (QLD), ICWA (WA), CTP (SA).',
    },
    {
      id: 'accident_date',
      text: 'What date did the accident occur?',
      type: 'date',
      required: true,
      limitationPeriodTrigger: true,
      legalSignificance:
        'Notification deadlines: NSW 28 days for most claims, QLD 9 months, VIC 12 months, WA 3 years, SA 3 years.',
    },
    {
      id: 'police_report',
      text: 'Was a police report made?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'A police event number is often required to lodge a CTP claim.',
      followUpIf: {
        answer: 'no',
        question: {
          id: 'police_report_reason',
          text: 'Why not?',
          type: 'text',
          required: false,
          legalSignificance: 'Late or absent reporting may need to be explained on lodgement.',
        },
      },
    },
    {
      id: 'role',
      text: 'Were you the driver, a passenger, a pedestrian, or a cyclist?',
      type: 'choice',
      choices: ['Driver', 'Passenger', 'Pedestrian', 'Cyclist'],
      required: true,
      legalSignificance: 'Affects fault assessment and entitlements.',
    },
    {
      id: 'at_fault_identified',
      text: 'Was the at-fault vehicle identified?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'The Nominal Defendant scheme applies for unidentified vehicles in most states.',
      followUpIf: {
        answer: 'no',
        question: {
          id: 'hit_and_run',
          text: 'Was it a hit and run?',
          type: 'yes-no',
          required: false,
          legalSignificance: 'Hit-and-run claims engage the Nominal Defendant and stricter search duties.',
        },
      },
    },
    {
      id: 'at_fault_insured',
      text: 'Was the at-fault vehicle registered and insured?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Unregistered vehicles route the claim through the Nominal Defendant.',
    },
    {
      id: 'injuries',
      text: 'What injuries did you sustain?',
      type: 'text',
      required: true,
      legalSignificance: 'Injury severity governs thresholds for damages and treatment entitlements.',
    },
    {
      id: 'ongoing_treatment',
      text: 'Are you still receiving medical treatment?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Ongoing treatment affects prognosis and quantum.',
    },
    {
      id: 'time_off_work',
      text: 'Have you been unable to work because of the injuries?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Economic loss is a key head of damage.',
    },
    {
      id: 'claim_lodged',
      text: 'Has any claim been lodged with the CTP insurer yet?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Determines whether we are lodging or progressing an existing claim.',
    },
  ],
  urgencyCheck: (answers) => {
    const accident = parseClientDate(answers.accident_date);
    const state = (answers.state ?? '').toUpperCase() as AustralianState;
    if (!accident) {
      return { urgent: false, reason: 'Accident date not yet provided.' };
    }
    const window = NOTIFICATION_DAYS[state] ?? 28;
    const daysRemaining = window - daysBetween(accident, new Date());
    if (daysRemaining <= 0) {
      return {
        urgent: true,
        reason: `${state === 'unknown' ? 'CTP' : state} notification deadline appears to have passed — urgent late-claim advice needed.`,
        daysRemaining,
      };
    }
    if (daysRemaining <= 28) {
      return {
        urgent: true,
        reason: `${state === 'unknown' ? 'CTP' : state} CTP notification deadline is imminent — lodge the claim now.`,
        daysRemaining,
      };
    }
    return { urgent: false, reason: 'Within the CTP notification window.', daysRemaining };
  },
};

export default personalInjuryMotor;
