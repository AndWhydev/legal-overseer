import type { QuestionSet } from '../types.js';
import { parseClientDate, daysBetween } from '../date-utils.js';
import type { AustralianState } from '../types.js';

const STATE_CHOICES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

/** Notification / claim lodgement windows by state (days from injury). */
const NOTIFICATION_DAYS: Partial<Record<AustralianState, number>> = {
  NSW: 182, // 6 months
  QLD: 182, // 6 months
  WA: 365, // 12 months
  SA: 365, // 12 months (1 year)
  VIC: 730, // 2 years to claim (early lodgement strongly recommended)
};

/**
 * Workers compensation — scheme differs entirely per state. State is
 * asked first so downstream logic can pick the right scheme and the
 * right notification deadline.
 */
export const workersCompensation: QuestionSet = {
  matterType: 'workers-compensation',
  description: 'Workers compensation claim — state-based scheme.',
  openingMessage:
    'Thanks for contacting [Firm Name]. I have a few questions about your work injury so our lawyers can help you quickly. This usually takes about 5 minutes. Your answers will be reviewed by one of our lawyers before your consultation.',
  questions: [
    {
      id: 'state',
      text: 'Which state or territory did the injury occur in?',
      type: 'choice',
      choices: STATE_CHOICES,
      required: true,
      legalSignificance:
        'Entirely different schemes per state — iCare/SIRA (NSW), WorkSafe (VIC), WorkCover (QLD/WA), ReturnToWork (SA), WorkSafe (TAS/ACT), NT WorkSafe.',
    },
    {
      id: 'injury_date',
      text: 'What date did the injury or incident occur?',
      type: 'date',
      required: true,
      limitationPeriodTrigger: true,
      legalSignificance: 'Notification and claim lodgement deadlines vary by state.',
    },
    {
      id: 'injury_kind',
      text: 'Was this a physical injury, a psychological injury, or both?',
      type: 'choice',
      choices: ['Physical', 'Psychological', 'Both'],
      required: true,
      legalSignificance: 'Psychological injury claims have additional thresholds in most states.',
    },
    {
      id: 'reported',
      text: 'Did you report the injury to your employer at the time?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Late reporting can affect entitlements.',
    },
    {
      id: 'still_employed',
      text: 'Are you still employed at the same workplace?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Affects weekly payments calculation and return to work obligations.',
    },
    {
      id: 'seen_doctor',
      text: 'Have you seen a doctor about the injury?',
      type: 'yes-no',
      required: true,
      legalSignificance:
        'Certificate of capacity required to access weekly payments in most states.',
      followUpIf: {
        answer: 'yes',
        question: {
          id: 'certificate_of_capacity',
          text: 'Do you have a certificate of capacity or medical certificate?',
          type: 'yes-no',
          required: false,
          legalSignificance: 'Certificate of capacity is the gateway to weekly payments.',
        },
      },
    },
    {
      id: 'claim_lodged',
      text: "Have you lodged a claim with your employer's workers compensation insurer yet?",
      type: 'yes-no',
      required: true,
      legalSignificance: 'An uninsured employer triggers a different claim pathway.',
    },
    {
      id: 'receiving_payments',
      text: 'Are you currently receiving any weekly payments?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Existing payments affect strategy.',
    },
    {
      id: 'average_weekly_earnings',
      text: 'What were your average weekly earnings before the injury?',
      type: 'number',
      required: true,
      legalSignificance: 'Basis for weekly payment calculation.',
    },
    {
      id: 'mechanism',
      text: 'Describe what happened in your own words.',
      type: 'text',
      required: true,
      legalSignificance:
        'Establishes mechanism of injury and whether it arose out of or in the course of employment.',
    },
  ],
  urgencyCheck: (answers) => {
    const injury = parseClientDate(answers.injury_date);
    const state = (answers.state as AustralianState) ?? 'unknown';
    if (!injury) {
      return { urgent: false, reason: 'Injury date not yet provided.' };
    }
    const window = NOTIFICATION_DAYS[state] ?? 182;
    const daysRemaining = window - daysBetween(injury, new Date());
    if (daysRemaining <= 30 && daysRemaining > 0) {
      return {
        urgent: true,
        reason: `${state === 'unknown' ? 'Workers compensation' : state} notification/claim deadline approaching.`,
        daysRemaining,
      };
    }
    if (daysRemaining <= 0) {
      return {
        urgent: true,
        reason:
          'Workers compensation notification window appears to have passed — urgent review of late-claim options needed.',
        daysRemaining,
      };
    }
    return { urgent: false, reason: 'Within the notification window.', daysRemaining };
  },
};

export default workersCompensation;
