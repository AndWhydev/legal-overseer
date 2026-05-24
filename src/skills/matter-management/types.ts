/**
 * Matter Management skill — type definitions.
 */

export type DeadlineType =
  | 'limitation'
  | 'court'
  | 'procedural'
  | 'internal_sla'
  | 'client';

export interface DeadlineFinding {
  deadlineType: DeadlineType;
  description: string;
  /** ISO date (YYYY-MM-DD). */
  dueDate: string;
  daysRemaining: number;
  jurisdictionBasis: string;
  consequenceIfMissed: string;
  recommendedAction: string;
  reminderDraft: string;
}

export interface MatterManagementResult {
  matterId: string;
  deadlines: DeadlineFinding[];
  /** Highest-urgency deadline at the time of analysis. */
  mostUrgent: DeadlineFinding | null;
  /** True until a human has reviewed and approved. */
  unverified: true;
  generatedAt: string;
}
