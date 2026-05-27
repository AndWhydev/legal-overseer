/**
 * Client intake intelligence — shared types.
 *
 * This layer sits BEFORE matter creation. A client makes contact, the
 * intake agent classifies the matter, runs the matching question set
 * for that matter type and Australian jurisdiction, then assembles a
 * structured brief the lawyer reads before the first consultation.
 *
 * Australian English throughout. No US spellings.
 */

export type MatterType =
  | 'unfair-dismissal'
  | 'workers-compensation'
  | 'family-law-property'
  | 'family-law-children'
  | 'conveyancing-purchase'
  | 'conveyancing-sale'
  | 'will-and-estate'
  | 'debt-recovery'
  | 'personal-injury-motor'
  | 'personal-injury-public-liability'
  | 'commercial-dispute'
  | 'residential-tenancy'
  | 'business-purchase'
  | 'defamation'
  | 'criminal-defence'
  | 'unknown';

export type AustralianState =
  | 'NSW'
  | 'VIC'
  | 'QLD'
  | 'WA'
  | 'SA'
  | 'TAS'
  | 'ACT'
  | 'NT'
  | 'unknown';

export interface IntakeQuestion {
  /** Stable identifier — used as the answer key on the session. */
  id: string;
  /** The question as sent to the client. Plain language, no jargon. */
  text: string;
  type: 'text' | 'date' | 'choice' | 'yes-no' | 'number';
  /** For type === 'choice'. */
  choices?: string[];
  required: boolean;
  /** Ask the nested follow-up when the answer matches. */
  followUpIf?: {
    answer: string;
    question: IntakeQuestion;
  };
  /** Internal-only — why this question matters legally. Never shown to the client. */
  legalSignificance: string;
  /** Does the answer to this question start a limitation clock? */
  limitationPeriodTrigger?: boolean;
}

export interface UrgencyResult {
  urgent: boolean;
  reason: string;
  daysRemaining?: number;
}

export interface QuestionSet {
  matterType: MatterType;
  description: string;
  /** First message sent to the client. */
  openingMessage: string;
  questions: IntakeQuestion[];
  urgencyCheck: (answers: Record<string, string>) => UrgencyResult;
}

export type IntakeStatus = 'in-progress' | 'complete' | 'abandoned' | 'escalated';

export interface IntakeSession {
  id: string;
  clientEmail: string;
  clientName: string;
  firmSlug: string;
  matterType: MatterType;
  state: AustralianState;
  answers: Record<string, string>;
  currentQuestionIndex: number;
  status: IntakeStatus;
  startedAt: Date;
  completedAt?: Date;
  briefGenerated?: boolean;
  matterId?: string;
  urgencyFlag?: boolean;
  urgencyReason?: string;
}

export interface RelevantCase {
  citation: string;
  court: string;
  summary: string;
  relevance: string;
}

export interface ClientBrief {
  sessionId: string;
  clientName: string;
  clientEmail: string;
  matterType: MatterType;
  state: AustralianState;
  urgencyFlag: boolean;
  urgencyReason?: string;
  daysUntilLimitationPeriod?: number;
  /** Plain English summary of the facts. */
  factSummary: string;
  structuredFacts: Record<string, string>;
  applicableLegislation: string[];
  limitationPeriod: string;
  relevantCases: RelevantCase[];
  recommendedFirstSteps: string[];
  estimatedCostRange: string;
  riskFlags: string[];
  fullTranscript: Array<{
    question: string;
    answer: string;
  }>;
  generatedAt: Date;
}
