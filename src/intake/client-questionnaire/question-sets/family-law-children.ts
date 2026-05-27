import type { QuestionSet } from '../types.js';

const STATE_CHOICES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

/**
 * Family law — children's arrangements. No limitation period, but
 * safety concerns and relocation/abduction risk demand urgent action.
 */
export const familyLawChildren: QuestionSet = {
  matterType: 'family-law-children',
  description: "Family law children's arrangements — parenting orders and parenting plans.",
  openingMessage:
    'Thanks for contacting [Firm Name]. I have a few questions about your children’s situation so our family lawyers can prepare before your consultation. Your answers stay confidential and are reviewed by a lawyer.',
  questions: [
    {
      id: 'living_arrangement',
      text: 'Are the children currently living with you, the other parent, or splitting time?',
      type: 'choice',
      choices: ['With me', 'With the other parent', 'Splitting time'],
      required: true,
      legalSignificance: 'Establishes the status quo, which courts are reluctant to disturb.',
    },
    {
      id: 'existing_order',
      text: 'Is there any existing parenting order or parenting plan in place?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Existing orders frame any application to vary.',
    },
    {
      id: 'arrangement_sought',
      text: 'What is the current arrangement and what arrangement are you seeking?',
      type: 'text',
      required: true,
      legalSignificance: 'Defines the orders to be sought and the gap to be bridged.',
    },
    {
      id: 'safety_concerns',
      text: 'Are there any safety concerns — family violence, substance use, mental health, abuse?',
      type: 'yes-no',
      required: true,
      legalSignificance:
        'Safety concerns trigger different procedural pathways including Location Orders, Recovery Orders, and mandatory reporting.',
      followUpIf: {
        answer: 'yes',
        question: {
          id: 'safety_reported',
          text: 'Have these been reported to police or child protection services?',
          type: 'yes-no',
          required: false,
          legalSignificance: 'Existing reports support urgent applications and corroborate risk.',
        },
      },
    },
    {
      id: 'mediation_attempted',
      text: 'Have the parties attempted mediation or family dispute resolution?',
      type: 'yes-no',
      required: true,
      legalSignificance:
        'A section 60I certificate is required before filing in court unless an exemption applies.',
    },
    {
      id: 'children_ages',
      text: 'What ages are the children?',
      type: 'text',
      required: true,
      legalSignificance: "Children's ages affect the weight given to their views and care needs.",
    },
    {
      id: 'avo_applied',
      text: 'Has either party applied for an Apprehended Violence Order or equivalent?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Existing protection orders interact with parenting arrangements.',
    },
    {
      id: 'state',
      text: 'Which state are you in?',
      type: 'choice',
      choices: STATE_CHOICES,
      required: true,
      legalSignificance: 'Determines the relevant registry and any state child-protection interface.',
    },
    {
      id: 'relocation_risk',
      text: 'Has the other parent indicated they intend to move interstate or overseas with the children?',
      type: 'yes-no',
      required: true,
      legalSignificance:
        'Relocation cases require urgent intervention — child abduction risk.',
    },
  ],
  urgencyCheck: (answers) => {
    const safety = (answers.safety_concerns ?? '').toLowerCase().startsWith('y');
    const existingOrder = (answers.existing_order ?? '').toLowerCase().startsWith('y');
    const relocation = (answers.relocation_risk ?? '').toLowerCase().startsWith('y');

    if (relocation) {
      return {
        urgent: true,
        reason:
          'Possible interstate/overseas relocation of the children — seek an urgent injunction and consider a watch-list/Airport Watch List request.',
      };
    }
    if (safety && !existingOrder) {
      return {
        urgent: true,
        reason:
          'Safety concerns with no existing parenting order — urgent advice on protective applications required.',
      };
    }
    if (safety) {
      return { urgent: true, reason: 'Safety concerns disclosed — prioritise risk assessment.' };
    }
    return { urgent: false, reason: 'No immediate safety or relocation flag.' };
  },
};

export default familyLawChildren;
