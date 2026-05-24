/**
 * Compliance Monitor skill — type definitions.
 */

export type Urgency = 'immediate' | 'this_quarter' | 'monitoring_only';

export interface RegulatoryChange {
  source: string;
  title: string;
  url: string;
  datePublished: string;
  summary: string;
  matterTypesAffected: string[];
  recommendedReview: string;
  urgency: Urgency;
}

export interface ComplianceMonitorResult {
  scanWindowDays: number;
  changes: RegulatoryChange[];
  /** True until a human has reviewed and approved. */
  unverified: true;
  generatedAt: string;
}
