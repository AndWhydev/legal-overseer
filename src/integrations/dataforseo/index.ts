/**
 * DataForSEO Integration Module
 *
 * Barrel export for DataForSEO client functions, types, and configuration.
 * Use this module for keyword volume analysis and SEO trend detection.
 *
 * @example
 * ```typescript
 * import {
 *   getKeywordVolumes,
 *   isDataForSEOConfigured,
 *   type KeywordData,
 * } from '../integrations/dataforseo';
 *
 * if (isDataForSEOConfigured()) {
 *   const data = await getKeywordVolumes(['glass skin serum']);
 *   console.log(`Volume: ${data[0].searchVolume}/month`);
 * }
 * ```
 */

export {
  getKeywordVolumes,
  isDataForSEOConfigured,
  getAccountBalance,
} from './client.js';

export {
  DataForSEOError,
  DATAFORSEO_ENDPOINTS,
  DEFAULT_DATAFORSEO_CONFIG,
  type DataForSEOCredentials,
  type KeywordData,
  type MonthlySearchVolume,
  type DataForSEOResponse,
  type DataForSEORequest,
  type DataForSEOKeywordResult,
  type DataForSEOTask,
  type DataForSEOTaskResult,
} from './types.js';
