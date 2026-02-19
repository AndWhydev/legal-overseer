/**
 * Amazon Best Sellers Scraper
 *
 * Scrapes Amazon Best Sellers using ScraperAPI's Structured Data Endpoint.
 * Returns clean JSON data for cross-referencing with Alibaba products.
 *
 * @see https://www.scraperapi.com/documentation/amazon
 */

import { createSafeLogger } from '../../../governance/index.js';
import {
  scrapeStructured,
  isScraperAPIConfigured,
} from '../../../integrations/scraperapi/index.js';

const logger = createSafeLogger('RDScout');
import { SCRAPERAPI_ENDPOINTS } from '../../../integrations/scraperapi/types.js';

/**
 * Amazon Best Seller product data from SDE response
 */
export interface AmazonBestSeller {
  /** Product name/title */
  name: string;

  /** Current price in USD */
  price: number;

  /** Product rating (1-5 stars) */
  rating: number;

  /** Number of reviews */
  reviewCount?: number;

  /** Direct link to product page */
  url: string;

  /** Amazon Standard Identification Number */
  asin: string;

  /** Best seller rank in category */
  rank: number;

  /** Product image URL */
  image?: string;
}

/**
 * Amazon AU category IDs for beauty-related products
 *
 * These are the category node IDs used by Amazon AU.
 * Found via Amazon's browse node API and bestseller URLs.
 */
export enum AmazonCategory {
  /** Beauty category - cosmetics, skincare, etc. */
  BEAUTY = '5360925051',

  /** Health & Personal Care - includes beauty tools */
  HEALTH_PERSONAL_CARE = '5360904051',

  /** Skin Care subcategory */
  SKIN_CARE = '5360960051',

  /** Hair Care subcategory */
  HAIR_CARE = '5360943051',

  /** Makeup subcategory */
  MAKEUP = '5360954051',

  /** Fragrance subcategory */
  FRAGRANCE = '5360934051',

  /** Tools & Accessories */
  TOOLS_ACCESSORIES = '5360976051',
}

/**
 * Human-readable names for Amazon categories
 */
export const AMAZON_CATEGORY_NAMES: Record<AmazonCategory, string> = {
  [AmazonCategory.BEAUTY]: 'Beauty',
  [AmazonCategory.HEALTH_PERSONAL_CARE]: 'Health & Personal Care',
  [AmazonCategory.SKIN_CARE]: 'Skin Care',
  [AmazonCategory.HAIR_CARE]: 'Hair Care',
  [AmazonCategory.MAKEUP]: 'Makeup',
  [AmazonCategory.FRAGRANCE]: 'Fragrance',
  [AmazonCategory.TOOLS_ACCESSORIES]: 'Tools & Accessories',
};

/**
 * Raw response structure from ScraperAPI Amazon Bestsellers SDE
 *
 * Based on ScraperAPI documentation and observed responses.
 */
interface AmazonBestsellersSDEResponse {
  bestsellers?: Array<{
    name?: string;
    price?: string | number;
    rating?: number;
    reviews?: number;
    url?: string;
    asin?: string;
    rank?: number;
    image?: string;
    position?: number;
  }>;
  category?: string;
  country?: string;
}

/**
 * Result from getBestSellers operation
 */
export interface AmazonBestSellersResult {
  /** Best sellers found */
  products: AmazonBestSeller[];

  /** Category that was searched */
  category: AmazonCategory;

  /** Category name in human-readable format */
  categoryName: string;

  /** Error message if request failed */
  error?: string;
}

/**
 * Constants for Amazon scraping
 */
export const AMAZON_CONSTANTS = {
  /** Maximum products to return per category (cost control) */
  MAX_PRODUCTS_PER_CATEGORY: 20,

  /** Country code for Amazon AU */
  COUNTRY: 'au',

  /** Request timeout for SDE (ms) */
  TIMEOUT: 60000,
} as const;

/**
 * Parse price from various formats
 *
 * Handles:
 * - "$19.99"
 * - "19.99"
 * - 19.99 (number)
 *
 * @param priceValue - Price in string or number format
 * @returns Parsed price as number, or 0 if unparseable
 */
function parsePrice(priceValue: string | number | undefined): number {
  if (priceValue === undefined || priceValue === null) {
    return 0;
  }

  if (typeof priceValue === 'number') {
    return priceValue;
  }

  // Remove currency symbols and parse
  const cleaned = priceValue.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Transform raw SDE response to typed AmazonBestSeller array
 */
function transformBestsellersResponse(
  response: AmazonBestsellersSDEResponse,
  maxProducts: number
): AmazonBestSeller[] {
  if (!response.bestsellers || !Array.isArray(response.bestsellers)) {
    return [];
  }

  return response.bestsellers
    .slice(0, maxProducts)
    .map((item, index) => ({
      name: item.name || 'Unknown Product',
      price: parsePrice(item.price),
      rating: item.rating || 0,
      reviewCount: item.reviews,
      url: item.url || '',
      asin: item.asin || '',
      rank: item.rank || item.position || index + 1,
      image: item.image,
    }))
    .filter((item) => item.name !== 'Unknown Product' && item.url);
}

/**
 * Fetch Amazon Best Sellers for a category using ScraperAPI SDE
 *
 * Uses the Structured Data Endpoint for clean JSON response
 * without HTML parsing.
 *
 * @param category - Amazon category to fetch best sellers from
 * @returns Promise resolving to best sellers result
 *
 * @example
 * ```typescript
 * const result = await getBestSellers(AmazonCategory.BEAUTY);
 * console.log(`Found ${result.products.length} best sellers`);
 * for (const product of result.products) {
 *   console.log(`#${product.rank}: ${product.name} - $${product.price}`);
 * }
 * ```
 */
export async function getBestSellers(
  category: AmazonCategory
): Promise<AmazonBestSellersResult> {
  const categoryName = AMAZON_CATEGORY_NAMES[category];

  // Check if ScraperAPI is configured
  if (!isScraperAPIConfigured()) {
    return {
      products: [],
      category,
      categoryName,
      error: 'ScraperAPI not configured. Set SCRAPERAPI_KEY in environment.',
    };
  }

  logger.info(`Amazon: Fetching best sellers for ${categoryName} (${category})`);

  const endpoint = `${SCRAPERAPI_ENDPOINTS.amazonSDE}/bestsellers`;
  const params = {
    category_id: category,
    country: AMAZON_CONSTANTS.COUNTRY,
  };

  const response = await scrapeStructured<AmazonBestsellersSDEResponse>(
    endpoint,
    params,
    { timeout: AMAZON_CONSTANTS.TIMEOUT }
  );

  if (!response.success || !response.data) {
    logger.error(`Amazon: Failed to fetch ${categoryName}: ${response.error}`);
    return {
      products: [],
      category,
      categoryName,
      error: response.error || 'Unknown error fetching bestsellers',
    };
  }

  const products = transformBestsellersResponse(
    response.data,
    AMAZON_CONSTANTS.MAX_PRODUCTS_PER_CATEGORY
  );

  logger.info(`Amazon: Found ${products.length} best sellers in ${categoryName}`);

  return {
    products,
    category,
    categoryName,
  };
}

/**
 * Fetch best sellers from multiple categories
 *
 * @param categories - Array of categories to fetch
 * @returns Promise resolving to combined results
 *
 * @example
 * ```typescript
 * const results = await getMultipleCategoryBestSellers([
 *   AmazonCategory.BEAUTY,
 *   AmazonCategory.SKIN_CARE,
 * ]);
 * const allProducts = results.flatMap(r => r.products);
 * ```
 */
export async function getMultipleCategoryBestSellers(
  categories: AmazonCategory[]
): Promise<AmazonBestSellersResult[]> {
  const results: AmazonBestSellersResult[] = [];

  for (const category of categories) {
    const result = await getBestSellers(category);
    results.push(result);

    // Small delay between requests to avoid rate limiting
    if (categories.indexOf(category) < categories.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return results;
}

/**
 * Get all beauty-related best sellers
 *
 * Convenience function to scan all relevant beauty categories.
 *
 * @returns Promise resolving to all best sellers across beauty categories
 */
export async function getAllBeautyBestSellers(): Promise<AmazonBestSeller[]> {
  const categories = [
    AmazonCategory.BEAUTY,
    AmazonCategory.SKIN_CARE,
    AmazonCategory.HAIR_CARE,
    AmazonCategory.TOOLS_ACCESSORIES,
  ];

  const results = await getMultipleCategoryBestSellers(categories);

  // Combine all products, removing duplicates by ASIN
  const seenAsins = new Set<string>();
  const allProducts: AmazonBestSeller[] = [];

  for (const result of results) {
    for (const product of result.products) {
      if (product.asin && !seenAsins.has(product.asin)) {
        seenAsins.add(product.asin);
        allProducts.push(product);
      }
    }
  }

  return allProducts;
}
