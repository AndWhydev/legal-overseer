/**
 * Scoring and Routing Module
 *
 * Aggregates technical and visual analysis results into a final QA score.
 * Determines routing recommendation based on score thresholds and critical issues.
 *
 * Scoring logic:
 * - Technical score = 100 - (critical_count * 20) - (warning_count * 5)
 * - Visual score = visual.complianceScore (already 0-100)
 * - Overall = (technical * weight.technical) + (visual * weight.visual)
 *
 * Routing logic:
 * - Any critical issue → 'return_to_creator' (regardless of score)
 * - Score < 60 → 'return_to_creator'
 * - Score 60-79 → 'flag_for_review'
 * - Score >= 80 → 'approve'
 */

import type { TechnicalQAResult } from './technical.js';
import type { VisualAnalysis, QAResult, QARecommendation } from '../types.js';

/**
 * Configurable weights for scoring aggregation
 */
export interface ScoringWeights {
  /** Weight for technical validation score (0-1) */
  technical: number;
  /** Weight for visual compliance score (0-1) */
  visual: number;
}

/**
 * Default weights: 40% technical, 60% visual
 * Rationale: Visual brand compliance is primary concern for content QA
 */
export const DEFAULT_WEIGHTS: ScoringWeights = {
  technical: 0.4,
  visual: 0.6,
};

/**
 * Score threshold: Below this score, return to creator
 */
export const RETURN_THRESHOLD = 60;

/**
 * Score threshold: At or above this score, approve automatically
 */
export const FLAG_THRESHOLD = 80;

/**
 * Calculate technical score from validation result.
 *
 * Scoring:
 * - Start at 100
 * - Subtract 20 points per critical issue
 * - Subtract 5 points per warning issue
 * - Minimum score is 0
 */
function calculateTechnicalScore(technical: TechnicalQAResult): number {
  const criticalPenalty = technical.criticalIssues.length * 20;
  const warningPenalty = technical.warningIssues.length * 5;

  const score = 100 - criticalPenalty - warningPenalty;
  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate overall QA score from technical and visual analysis.
 *
 * Combines technical and visual scores using configurable weights.
 * If no visual analysis available, uses technical score alone.
 *
 * @param technical - Technical validation result
 * @param visual - Visual compliance result, or null if not analyzed
 * @param weights - Optional custom weights (default: 40% technical, 60% visual)
 * @returns Overall score from 0-100
 *
 * @example
 * ```typescript
 * const technical = validateTechnical(metadata, audioLevels);
 * const visual = await analyzeVisualCompliance(videoPath);
 * const score = calculateOverallScore(technical, visual);
 * // score: 0-100
 * ```
 */
export function calculateOverallScore(
  technical: TechnicalQAResult,
  visual: VisualAnalysis | null,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): number {
  const technicalScore = calculateTechnicalScore(technical);

  if (!visual) {
    // No visual analysis - use technical score alone
    return Math.round(technicalScore);
  }

  const visualScore = visual.complianceScore;

  // Weighted average
  const overall = technicalScore * weights.technical + visualScore * weights.visual;

  return Math.round(Math.max(0, Math.min(100, overall)));
}

/**
 * Determine routing recommendation based on score and critical issues.
 *
 * Routing rules:
 * 1. Any critical technical issue → return_to_creator (fail fast)
 * 2. Score < 60 → return_to_creator
 * 3. Score 60-79 → flag_for_review
 * 4. Score >= 80 → approve
 *
 * @param score - Overall QA score (0-100)
 * @param hasCriticalIssues - Whether any critical technical issues exist
 * @returns Recommendation for content routing
 *
 * @example
 * ```typescript
 * const recommendation = determineRecommendation(75, false);
 * // recommendation: 'flag_for_review'
 *
 * const criticalRecommendation = determineRecommendation(90, true);
 * // criticalRecommendation: 'return_to_creator' (critical issues override score)
 * ```
 */
export function determineRecommendation(
  score: number,
  hasCriticalIssues: boolean
): QARecommendation {
  // Rule 1: Critical issues always return to creator
  if (hasCriticalIssues) {
    return 'return_to_creator';
  }

  // Rule 2: Low score returns to creator
  if (score < RETURN_THRESHOLD) {
    return 'return_to_creator';
  }

  // Rule 3: Medium score flags for review
  if (score < FLAG_THRESHOLD) {
    return 'flag_for_review';
  }

  // Rule 4: High score approves
  return 'approve';
}

/**
 * Collect all issues from technical and visual analysis.
 *
 * Combines critical issues, warning issues, and visual issues
 * into a single deduplicated list with severity prefixes.
 */
function collectAllIssues(
  technical: TechnicalQAResult,
  visual: VisualAnalysis | null
): string[] {
  const issues: string[] = [];

  // Add critical issues with prefix
  for (const issue of technical.criticalIssues) {
    issues.push(`[CRITICAL] ${issue}`);
  }

  // Add warning issues with prefix
  for (const issue of technical.warningIssues) {
    issues.push(`[WARNING] ${issue}`);
  }

  // Add visual issues
  if (visual) {
    for (const issue of visual.issues) {
      issues.push(`[VISUAL] ${issue}`);
    }
  }

  return issues;
}

/**
 * Build complete QA result from technical and visual analysis.
 *
 * Combines all analysis results into a single QAResult object
 * with overall score and routing recommendation.
 *
 * @param technical - Technical validation result from validateTechnical()
 * @param visual - Visual compliance result from analyzeVisualCompliance(), or null
 * @param weights - Optional custom weights for score calculation
 * @returns Complete QAResult ready for reporting
 *
 * @example
 * ```typescript
 * const technical = validateTechnical(metadata, audioLevels);
 * const visual = await analyzeVisualCompliance(videoPath);
 * const result = buildQAResult(technical, visual);
 *
 * console.log(`Score: ${result.overallScore}`);
 * console.log(`Recommendation: ${result.recommendation}`);
 * console.log('Issues:', result.issues);
 * ```
 */
export function buildQAResult(
  technical: TechnicalQAResult,
  visual: VisualAnalysis | null,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): QAResult {
  const overallScore = calculateOverallScore(technical, visual, weights);
  const hasCriticalIssues = technical.criticalIssues.length > 0;
  const recommendation = determineRecommendation(overallScore, hasCriticalIssues);
  const issues = collectAllIssues(technical, visual);

  return {
    technical: {
      resolution: {
        pass: technical.resolution.pass,
        actual: technical.resolution.actual,
        required: technical.resolution.required,
      },
      fps: {
        pass: technical.fps.pass,
        actual: technical.fps.actual,
        required: technical.fps.required,
      },
      audioLevels: {
        pass: technical.audioLevels.pass,
        actual: technical.audioLevels.actual,
        required: technical.audioLevels.required,
        target: typeof technical.audioLevels.required === 'string'
          ? parseInt(technical.audioLevels.required.match(/-?\d+/)?.[0] || '-14', 10)
          : -14,
      },
      format: {
        pass: technical.format.pass,
        actual: technical.format.actual,
        required: technical.format.required,
        allowed: technical.format.required.toString().split(', '),
      },
    },
    visual,
    overallScore,
    recommendation,
    issues,
  };
}
