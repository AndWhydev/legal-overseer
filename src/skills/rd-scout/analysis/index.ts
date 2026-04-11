/**
 * R&D Scout Analysis Module
 *
 * Barrel export for analysis functions used by the R&D Scout skill.
 * Provides cross-referencing and scoring capabilities for product opportunities.
 *
 * @example
 * ```typescript
 * import {
 *   crossReferenceProducts,
 *   getCrossReferenceSummary,
 *   type CrossReferenceResult,
 * } from './analysis';
 *
 * const results = crossReferenceProducts(alibabaProducts, amazonBestSellers);
 * const summary = getCrossReferenceSummary(results);
 * console.log(`Found ${summary.totalOpportunities} opportunities`);
 * ```
 */

export {
  crossReferenceProducts,
  getCrossReferenceSummary,
  type CrossReferenceResult,
  type CrossReferenceOptions,
  type AmazonMatch,
} from './cross-reference.js';
