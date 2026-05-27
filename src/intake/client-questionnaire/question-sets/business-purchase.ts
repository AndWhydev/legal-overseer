import type { QuestionSet } from '../types.js';

/**
 * Business purchase — share sale vs asset sale, due diligence, employee
 * transfer, leases, and restraints. No single limitation period; the
 * urgency turns on the transaction milestones.
 */
export const businessPurchase: QuestionSet = {
  matterType: 'business-purchase',
  description: 'Business acquisition — share or asset sale.',
  openingMessage:
    'Thanks for contacting [Firm Name]. I have a few questions about the business you are buying so our lawyers can advise on structure and due diligence. This usually takes about 5 minutes.',
  questions: [
    {
      id: 'sale_structure',
      text: 'What type of business is being purchased — a company share sale or an asset sale?',
      type: 'choice',
      choices: ['Company share sale', 'Asset sale'],
      required: true,
      legalSignificance: 'Fundamentally different legal structures, liability exposure, and due diligence.',
    },
    {
      id: 'industry',
      text: 'What industry is the business in?',
      type: 'text',
      required: true,
      legalSignificance: 'Licences, approvals, and industry-specific regulations.',
    },
    {
      id: 'purchase_price',
      text: 'What is the purchase price?',
      type: 'number',
      required: true,
      legalSignificance: 'Duty, GST, and proportionality of due diligence.',
    },
    {
      id: 'heads_of_agreement',
      text: 'Has a heads of agreement or letter of intent been signed?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'May bind the parties on exclusivity and confidentiality.',
    },
    {
      id: 'sale_contract',
      text: 'Has a formal sale contract been received or drafted?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Determines whether we are drafting or reviewing.',
    },
    {
      id: 'subject_to_finance',
      text: 'Is the purchase subject to finance?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Finance condition and its deadline.',
    },
    {
      id: 'employees_transfer',
      text: 'Are there employees, and will they transfer to the buyer?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Fair Work Act transfer of business obligations.',
    },
    {
      id: 'leases',
      text: 'Are there any existing leases — property, equipment, or vehicles?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Lease assignment or a new lease will be required.',
    },
    {
      id: 'restraint_expected',
      text: 'Is a restraint of trade clause expected?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Reasonableness in time, geography, and activity must be assessed.',
    },
    {
      id: 'seller_stays_on',
      text: 'Is the seller remaining involved in the business post-sale?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Earn-out provisions, consulting agreements, and non-compete enforcement.',
    },
  ],
  urgencyCheck: (answers) => {
    const contract = (answers.sale_contract ?? '').toLowerCase().startsWith('y');
    const finance = (answers.subject_to_finance ?? '').toLowerCase().startsWith('y');
    if (contract && finance) {
      return {
        urgent: true,
        reason:
          'A sale contract is on foot and the purchase is subject to finance — the finance condition deadline must be diarised and managed.',
      };
    }
    return { urgent: false, reason: 'No imminent contractual deadline flagged.' };
  },
};

export default businessPurchase;
