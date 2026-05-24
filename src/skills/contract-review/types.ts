/**
 * Contract Review skill — type definitions.
 *
 * Mirrors the JSON shape the model is asked to produce in
 * registry.ts (contract_review systemPrompt).
 */

export type RiskSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface ContractFinding {
  clauseRef: string;
  severity: RiskSeverity;
  riskExplanation: string;
  suggestedRedline: string;
}

export interface ContractReviewResult {
  matterId: string | null;
  documentRef: string;
  summary: string;
  overallRisk: RiskSeverity;
  findings: ContractFinding[];
  missingClauses: string[];
  recommendedRedlines: number;
  /** True until a human has reviewed and approved. */
  unverified: true;
  generatedAt: string;
}
