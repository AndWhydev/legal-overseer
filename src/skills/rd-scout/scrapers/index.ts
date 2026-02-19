/**
 * R&D Scout Scrapers Module
 *
 * Barrel export for all product scrapers used by the R&D Scout skill.
 * Supports Alibaba and Amazon scrapers for cross-reference analysis.
 *
 * @example
 * ```typescript
 * import {
 *   searchProducts,
 *   searchMultipleCategories,
 *   getBestSellers,
 *   AmazonCategory,
 * } from './scrapers';
 *
 * // Fetch Alibaba products
 * const alibaba = await searchProducts({
 *   query: 'face massager',
 *   category: 'beauty-tools',
 *   maxPrice: 10,
 * });
 *
 * // Fetch Amazon best sellers
 * const amazon = await getBestSellers(AmazonCategory.BEAUTY);
 * ```
 */

// Alibaba scraper
export { searchProducts, searchMultipleCategories } from './alibaba.js';

export {
  ALIBABA_CONSTANTS,
  ALIBABA_CATEGORY_MAP,
  type AlibabaProduct,
  type AlibabaSearchParams,
  type AlibabaSearchResult,
  type AlibabaCategory,
} from './types.js';

// Amazon scraper
export {
  getBestSellers,
  getMultipleCategoryBestSellers,
  getAllBeautyBestSellers,
  AmazonCategory,
  AMAZON_CATEGORY_NAMES,
  AMAZON_CONSTANTS,
  type AmazonBestSeller,
  type AmazonBestSellersResult,
} from './amazon.js';
