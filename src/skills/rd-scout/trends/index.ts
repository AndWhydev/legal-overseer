/**
 * SEO Trend Analysis Module
 *
 * Barrel export for SEO trend spike detection, analysis functions,
 * and type definitions.
 *
 * @example
 * ```typescript
 * import {
 *   analyzeTrends,
 *   filterSpikes,
 *   sortByOpportunity,
 *   type TrendAnalysis,
 * } from './trends';
 *
 * const trends = await analyzeTrends(['glass skin serum', 'korean skincare']);
 * const opportunities = sortByOpportunity(filterSpikes(trends, 'MEDIUM'));
 * ```
 */

export {
  analyzeTrends,
  detectSpike,
  calculateConfidence,
  filterSpikes,
  sortByOpportunity,
} from './seo.js';

export {
  DEFAULT_TREND_CONFIG,
  DEFAULT_CONFIDENCE_THRESHOLDS,
  type TrendAnalysis,
  type TrendConfig,
  type SpikeDetectionResult,
  type ConfidenceLevel,
  type ConfidenceThresholds,
} from './types.js';
