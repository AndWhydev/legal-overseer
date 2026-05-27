import type { QuestionSet } from '../types.js';

const STATE_CHOICES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

/**
 * Residential tenancy disputes. There is no single limitation period —
 * the relevant tribunal and the notice periods drive timing. State is
 * asked first because the tribunal differs entirely.
 */
export const residentialTenancy: QuestionSet = {
  matterType: 'residential-tenancy',
  description: 'Residential tenancy dispute — state tenancy tribunal.',
  openingMessage:
    'Thanks for contacting [Firm Name]. I have a few questions about your tenancy dispute so our lawyers can advise you. This usually takes about 5 minutes.',
  questions: [
    {
      id: 'party_role',
      text: 'Are you the landlord/property manager or the tenant?',
      type: 'choice',
      choices: ['Landlord', 'Tenant'],
      required: true,
      legalSignificance: 'Determines which rights and obligations apply.',
    },
    {
      id: 'state',
      text: 'Which state is the property in?',
      type: 'choice',
      choices: STATE_CHOICES,
      required: true,
      legalSignificance:
        'Entirely different tribunals and rules — NCAT (NSW), VCAT (VIC), QCAT (QLD), SAT (WA), SACAT (SA).',
    },
    {
      id: 'written_agreement',
      text: 'Is there a written tenancy agreement?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'A written agreement governs the terms; oral tenancies still attract the Act.',
    },
    {
      id: 'dispute_nature',
      text: 'What is the nature of the dispute — rent arrears, bond, repairs, illegal entry, eviction, or damage?',
      type: 'choice',
      choices: ['Rent arrears', 'Bond', 'Repairs', 'Illegal entry', 'Eviction', 'Damage'],
      required: true,
      legalSignificance: 'Determines the application type and the notice that must precede it.',
    },
    {
      id: 'amount',
      text: 'How much money is involved, if any?',
      type: 'number',
      required: true,
      legalSignificance: 'Affects the tribunal jurisdiction and remedy sought.',
    },
    {
      id: 'notice_served',
      text: 'Has a formal notice been served — notice to remedy, notice to vacate, or termination notice?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'A valid notice is usually a prerequisite to a tribunal application.',
      followUpIf: {
        answer: 'yes',
        question: {
          id: 'notice_detail',
          text: 'What type, and when was it served?',
          type: 'text',
          required: false,
          legalSignificance: 'Notice type and service date determine validity and timing.',
        },
      },
    },
    {
      id: 'tenancy_end_or_notice_date',
      text: 'What date does the tenancy end, or when was notice served?',
      type: 'date',
      required: true,
      legalSignificance: 'Drives the notice period and application timing.',
    },
    {
      id: 'prior_tribunal',
      text: 'Has the matter been to the tenancy tribunal before?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Prior orders frame what can be sought now.',
    },
    {
      id: 'tenant_in_property',
      text: 'Is the tenant currently in the property?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Possession and warrant-of-possession steps depend on this.',
    },
    {
      id: 'outcome_sought',
      text: 'What outcome is the client seeking?',
      type: 'text',
      required: true,
      legalSignificance: 'Defines the orders to be sought.',
    },
  ],
  urgencyCheck: (answers) => {
    const dispute = (answers.dispute_nature ?? '').toLowerCase();
    const noticeServed = (answers.notice_served ?? '').toLowerCase().startsWith('y');
    const tenantIn = (answers.tenant_in_property ?? '').toLowerCase().startsWith('y');

    if (dispute.includes('eviction') && noticeServed && tenantIn) {
      return {
        urgent: true,
        reason:
          'Eviction in progress with a notice served and the tenant still in occupation — tribunal timelines are short, act now.',
      };
    }
    if (dispute.includes('illegal entry')) {
      return {
        urgent: true,
        reason: 'Alleged illegal entry — advise on urgent restraint and tribunal options.',
      };
    }
    return { urgent: false, reason: 'No immediate tribunal deadline flagged.' };
  },
};

export default residentialTenancy;
