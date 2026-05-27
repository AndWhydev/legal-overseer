import type { QuestionSet } from '../types.js';
import { parseClientDate, daysBetween, addYears } from '../date-utils.js';

const STATE_CHOICES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

/**
 * Defamation — uniform defamation laws. A strict 1-year limitation
 * period applies from the date of publication in all Australian
 * states, so the publication date is the critical urgency trigger.
 */
export const defamation: QuestionSet = {
  matterType: 'defamation',
  description: 'Defamation — uniform defamation laws, 1 year limitation.',
  openingMessage:
    'Thanks for contacting [Firm Name]. I have a few questions about what was said or published about you so our lawyers can advise — defamation has a strict 1 year deadline. This usually takes about 5 minutes.',
  questions: [
    {
      id: 'publication_content',
      text: 'What was published or said about you?',
      type: 'text',
      required: true,
      legalSignificance: 'Identifies the imputations said to be defamatory.',
    },
    {
      id: 'publication_medium',
      text: 'Where was it published — social media, a newspaper, a website, spoken in a meeting, or other?',
      type: 'choice',
      choices: ['Social media', 'Newspaper', 'Website', 'Spoken in a meeting', 'Other'],
      required: true,
      legalSignificance: 'Medium affects publication, audience, and the available defences.',
    },
    {
      id: 'publication_date',
      text: 'When was it published or said?',
      type: 'date',
      required: true,
      limitationPeriodTrigger: true,
      legalSignificance: '1 year limitation period for defamation in all Australian states.',
    },
    {
      id: 'publisher',
      text: 'Who published or said it?',
      type: 'text',
      required: true,
      legalSignificance: 'Identifies the prospective defendant.',
    },
    {
      id: 'publisher_type',
      text: 'Is the publisher an individual, a media organisation, or a business?',
      type: 'choice',
      choices: ['Individual', 'Media organisation', 'Business'],
      required: true,
      legalSignificance: 'Serious harm threshold and proportionate cap apply differently to individuals vs media.',
    },
    {
      id: 'falsity',
      text: 'Was what was said or published false?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'Truth is a complete defence; falsity is central to the claim.',
    },
    {
      id: 'harm',
      text: 'Has this affected your reputation, your business, or your employment?',
      type: 'text',
      required: true,
      legalSignificance: 'Serious harm threshold under the uniform defamation laws.',
    },
    {
      id: 'concerns_notice_sent',
      text: 'Have you sent a concerns notice to the publisher yet?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'A concerns notice is a mandatory first step before proceedings can be commenced.',
    },
    {
      id: 'publisher_responded',
      text: 'Has the publisher responded to any concerns notice?',
      type: 'yes-no',
      required: true,
      legalSignificance: 'An offer to make amends affects strategy and costs.',
    },
    {
      id: 'state',
      text: 'Which state are you in?',
      type: 'choice',
      choices: STATE_CHOICES,
      required: true,
      legalSignificance: 'Serious harm threshold applies in NSW, VIC, SA, WA — different rules in QLD.',
    },
  ],
  urgencyCheck: (answers) => {
    const published = parseClientDate(answers.publication_date);
    if (!published) {
      return { urgent: false, reason: 'Publication date not yet provided.' };
    }
    const deadline = addYears(published, 1);
    const daysRemaining = daysBetween(new Date(), deadline);
    if (daysRemaining <= 0) {
      return {
        urgent: true,
        reason: 'The 1 year defamation limitation period appears to have expired — urgent advice on extension needed.',
        daysRemaining,
      };
    }
    if (daysRemaining <= 30) {
      return {
        urgent: true,
        reason: '1 year defamation limitation period expires within 30 days — act immediately.',
        daysRemaining,
      };
    }
    return { urgent: false, reason: 'Within the 1 year defamation limitation period.', daysRemaining };
  },
};

export default defamation;
