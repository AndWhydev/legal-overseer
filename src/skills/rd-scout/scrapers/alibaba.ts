/**
 * Alibaba Product Scraper
 *
 * Scrapes Alibaba.com search results for product data using ScraperAPI.
 * Uses HTML parsing with simple regex patterns (avoiding heavy dependencies).
 *
 * @see https://www.alibaba.com
 */

import { createSafeLogger } from '../../../governance/index.js';
import { scrapeUrl, isScraperAPIConfigured } from '../../../integrations/scraperapi/index.js';

const logger = createSafeLogger('RDScout');
import {
  ALIBABA_CONSTANTS,
  ALIBABA_CATEGORY_MAP,
  type AlibabaProduct,
  type AlibabaSearchParams,
  type AlibabaSearchResult,
} from './types.js';

/**
 * Sleep utility for request spacing
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build Alibaba search URL from parameters
 */
function buildSearchUrl(params: AlibabaSearchParams): string {
  const url = new URL(ALIBABA_CONSTANTS.SEARCH_BASE_URL);

  // Build search query with category
  let searchText = params.query;
  if (params.category && ALIBABA_CATEGORY_MAP[params.category]) {
    searchText = `${ALIBABA_CATEGORY_MAP[params.category]} ${searchText}`;
  }

  url.searchParams.set('SearchText', searchText);

  // Add price filters
  if (params.minPrice !== undefined) {
    url.searchParams.set('priceStart', String(params.minPrice));
  }
  if (params.maxPrice !== undefined) {
    url.searchParams.set('priceEnd', String(params.maxPrice));
  }

  // Add pagination
  if (params.page && params.page > 1) {
    url.searchParams.set('page', String(params.page));
  }

  // Add verified supplier filter
  if (params.verifiedOnly) {
    url.searchParams.set('ta', 'y'); // Trade Assurance
  }

  return url.toString();
}

/**
 * Parse price string from Alibaba listing
 *
 * Handles formats like:
 * - "$1.50 - $3.00"
 * - "US $1.50"
 * - "$1.50"
 *
 * @returns [minPrice, maxPrice] in USD
 */
function parsePrice(priceText: string): [number, number] {
  const cleaned = priceText.replace(/[^\d.\-–]/g, ' ').trim();
  const numbers = cleaned.match(/[\d.]+/g);

  if (!numbers || numbers.length === 0) {
    return [0, 0];
  }

  const prices = numbers.map(Number).filter((n) => !isNaN(n) && n > 0);

  if (prices.length === 0) {
    return [0, 0];
  }

  if (prices.length === 1) {
    return [prices[0], prices[0]];
  }

  return [Math.min(...prices), Math.max(...prices)];
}

/**
 * Parse MOQ (Minimum Order Quantity) from text
 *
 * Handles formats like:
 * - "Min. Order: 100 pieces"
 * - "100 Pieces (MOQ)"
 * - "MOQ: 50"
 */
function _parseMoq(moqText: string): number | undefined {
  const match = moqText.match(/(\d+)\s*(pieces?|pcs?|units?|sets?)?/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  return undefined;
}

/**
 * Extract product data from Alibaba HTML
 *
 * Uses regex patterns to extract product listings from search results.
 * This is fragile but avoids heavy cheerio/jsdom dependencies.
 */
function parseSearchResults(html: string): AlibabaProduct[] {
  const products: AlibabaProduct[] = [];

  // Pattern to find product cards in Alibaba search results
  // Alibaba uses various class patterns, we look for common data attributes
  // Note: _productPattern is reserved for future use with dynamic HTML parsing
  const _productPattern =
    /data-content="([^"]*)"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"[^>]*>[\s\S]*?class="[^"]*title[^"]*"[^>]*>([^<]*)<[\s\S]*?class="[^"]*price[^"]*"[^>]*>([^<]*)</gi;

  // Alternative pattern for JSON-LD structured data (more reliable when present)
  const jsonLdPattern = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;

  // Try to extract from JSON-LD first (more reliable)
  let jsonLdMatch;
  while ((jsonLdMatch = jsonLdPattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(jsonLdMatch[1]);
      if (data['@type'] === 'Product' || Array.isArray(data.itemListElement)) {
        // Handle product list schema
        const items = data.itemListElement || [data];
        for (const item of items) {
          const product = item.item || item;
          if (product.name && product.url) {
            products.push({
              title: product.name,
              priceMin: product.offers?.lowPrice || product.offers?.price || 0,
              priceMax: product.offers?.highPrice || product.offers?.price || 0,
              supplier: product.brand?.name || 'Unknown Supplier',
              url: product.url.startsWith('http')
                ? product.url
                : `https://www.alibaba.com${product.url}`,
              image: product.image || '',
              category: 'beauty-tools',
              supplierVerified: false,
            });
          }
        }
      }
    } catch {
      // JSON parsing failed, continue to regex fallback
    }
  }

  // If JSON-LD worked, return those results
  if (products.length > 0) {
    return products;
  }

  // Fallback: Use regex patterns for common Alibaba HTML structures
  // Look for product listing containers
  const listingPattern =
    /<div[^>]*class="[^"]*organic-list[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;

  let listingMatch;
  while ((listingMatch = listingPattern.exec(html)) !== null) {
    const listing = listingMatch[1];

    // Extract title
    const titleMatch = listing.match(
      /<a[^>]*class="[^"]*title[^"]*"[^>]*>([^<]*)</i
    );
    const title = titleMatch
      ? titleMatch[1].trim()
      : listing.match(/<h2[^>]*>([^<]*)</)?.[1]?.trim();

    // Extract URL
    const urlMatch = listing.match(/href="(https?:\/\/[^"]*alibaba[^"]*product[^"]*)"/i);
    const url = urlMatch ? urlMatch[1] : '';

    // Extract image
    const imageMatch = listing.match(/<img[^>]*src="([^"]*)"[^>]*>/i);
    const image = imageMatch ? imageMatch[1] : '';

    // Extract price
    const priceMatch = listing.match(
      /class="[^"]*price[^"]*"[^>]*>[\s\S]*?([\d.,]+\s*-?\s*[\d.,]*)/i
    );
    const [priceMin, priceMax] = priceMatch
      ? parsePrice(priceMatch[1])
      : [0, 0];

    // Extract supplier
    const supplierMatch = listing.match(
      /class="[^"]*company[^"]*"[^>]*>([^<]*)</i
    );
    const supplier = supplierMatch ? supplierMatch[1].trim() : 'Unknown Supplier';

    // Extract MOQ
    const moqMatch = listing.match(/(\d+)\s*(pieces?|pcs?)\s*\(?\s*min/i);
    const moq = moqMatch ? parseInt(moqMatch[1], 10) : undefined;

    // Check for verified supplier
    const verified =
      /trade\s*assurance|verified/i.test(listing) ||
      listing.includes('verified-icon');

    if (title && url) {
      products.push({
        title,
        priceMin,
        priceMax,
        supplier,
        url,
        image,
        category: 'beauty-tools',
        moq,
        supplierVerified: verified,
      });
    }
  }

  // Secondary fallback: look for simpler patterns
  if (products.length === 0) {
    // Try to find product links with titles
    const simpleLinkPattern =
      /<a[^>]*href="(https?:\/\/[^"]*alibaba[^"]*\/product[^"]*)"[^>]*title="([^"]*)"[^>]*>/gi;

    let linkMatch;
    while ((linkMatch = simpleLinkPattern.exec(html)) !== null) {
      products.push({
        title: linkMatch[2],
        priceMin: 0,
        priceMax: 0,
        supplier: 'Unknown Supplier',
        url: linkMatch[1],
        image: '',
        category: 'beauty-tools',
      });
    }
  }

  return products;
}

/**
 * Extract total results count from HTML
 */
function parseTotalResults(html: string): number {
  // Look for patterns like "1,234 Results" or "Showing 1-48 of 1,234"
  const countMatch = html.match(
    /(\d{1,3}(?:,\d{3})*)\s*(?:results?|products?|items?)/i
  );
  if (countMatch) {
    return parseInt(countMatch[1].replace(/,/g, ''), 10);
  }

  // Alternative pattern
  const showingMatch = html.match(/of\s+(\d{1,3}(?:,\d{3})*)/i);
  if (showingMatch) {
    return parseInt(showingMatch[1].replace(/,/g, ''), 10);
  }

  return 0;
}

/**
 * Search Alibaba for products matching the given parameters
 *
 * Uses ScraperAPI to bypass anti-bot protection and fetch search results.
 * Supports pagination up to MAX_PAGES with a total cap of MAX_PRODUCTS.
 *
 * @param params - Search parameters
 * @returns Promise resolving to search results
 *
 * @example
 * ```typescript
 * const results = await searchProducts({
 *   query: 'face massager',
 *   category: 'beauty-tools',
 *   maxPrice: 10,
 * });
 * console.log(`Found ${results.products.length} products`);
 * ```
 */
export async function searchProducts(
  params: AlibabaSearchParams
): Promise<AlibabaSearchResult> {
  // Check if ScraperAPI is configured
  if (!isScraperAPIConfigured()) {
    return {
      products: [],
      totalFound: 0,
      hasMore: false,
      currentPage: 1,
      query: params.query,
      errors: ['ScraperAPI not configured. Set SCRAPERAPI_KEY in environment.'],
    };
  }

  const allProducts: AlibabaProduct[] = [];
  const errors: string[] = [];
  let totalFound = 0;
  let currentPage = params.page || 1;
  const maxPages = Math.min(
    ALIBABA_CONSTANTS.MAX_PAGES,
    Math.ceil(ALIBABA_CONSTANTS.MAX_PRODUCTS / ALIBABA_CONSTANTS.PRODUCTS_PER_PAGE)
  );

  // Scrape pages until we hit limits
  while (currentPage <= maxPages && allProducts.length < ALIBABA_CONSTANTS.MAX_PRODUCTS) {
    const searchParams: AlibabaSearchParams = { ...params, page: currentPage };
    const url = buildSearchUrl(searchParams);

    logger.info(`Alibaba: Searching page ${currentPage} for "${params.query}"`);

    try {
      const html = await scrapeUrl(url, {
        render: true, // Alibaba requires JS rendering
        country: 'au',
        timeout: 60000, // Longer timeout for JS rendering
      });

      // Parse products from HTML
      const pageProducts = parseSearchResults(html);

      // Get total count from first page
      if (currentPage === 1) {
        totalFound = parseTotalResults(html);
        logger.info(`Alibaba: Found ~${totalFound} total results`);
      }

      if (pageProducts.length === 0) {
        logger.info(`Alibaba: No products found on page ${currentPage}`);
        break;
      }

      // Add products up to max limit
      const remaining = ALIBABA_CONSTANTS.MAX_PRODUCTS - allProducts.length;
      allProducts.push(...pageProducts.slice(0, remaining));

      logger.info(`Alibaba: Extracted ${pageProducts.length} products (total: ${allProducts.length})`);

      // Check if we should continue
      if (
        pageProducts.length < ALIBABA_CONSTANTS.PRODUCTS_PER_PAGE / 2 ||
        allProducts.length >= ALIBABA_CONSTANTS.MAX_PRODUCTS
      ) {
        break;
      }

      // Delay between requests
      if (currentPage < maxPages) {
        await sleep(ALIBABA_CONSTANTS.REQUEST_DELAY);
      }

      currentPage++;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Alibaba: Error on page ${currentPage}: ${errorMessage}`);
      errors.push(`Page ${currentPage}: ${errorMessage}`);
      break;
    }
  }

  return {
    products: allProducts,
    totalFound,
    hasMore:
      totalFound > allProducts.length &&
      allProducts.length < ALIBABA_CONSTANTS.MAX_PRODUCTS,
    currentPage,
    query: params.query,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Search multiple categories and combine results
 *
 * Useful for scanning all target categories in one call.
 *
 * @param query - Base search query
 * @param categories - Categories to search
 * @param options - Additional search options
 * @returns Combined search results from all categories
 */
export async function searchMultipleCategories(
  query: string,
  categories: Array<keyof typeof ALIBABA_CATEGORY_MAP>,
  options: Omit<AlibabaSearchParams, 'query' | 'category'> = {}
): Promise<AlibabaSearchResult> {
  const allProducts: AlibabaProduct[] = [];
  const errors: string[] = [];
  let totalFound = 0;

  for (const category of categories) {
    if (allProducts.length >= ALIBABA_CONSTANTS.MAX_PRODUCTS) {
      break;
    }

    const result = await searchProducts({
      query,
      category,
      ...options,
    });

    // Add products with their actual category
    for (const product of result.products) {
      if (allProducts.length >= ALIBABA_CONSTANTS.MAX_PRODUCTS) {
        break;
      }
      allProducts.push({ ...product, category });
    }

    totalFound += result.totalFound;

    if (result.errors) {
      errors.push(...result.errors.map((e) => `[${category}] ${e}`));
    }

    // Delay between category searches
    if (categories.indexOf(category) < categories.length - 1) {
      await sleep(ALIBABA_CONSTANTS.REQUEST_DELAY);
    }
  }

  return {
    products: allProducts,
    totalFound,
    hasMore: allProducts.length >= ALIBABA_CONSTANTS.MAX_PRODUCTS,
    currentPage: 1,
    query,
    errors: errors.length > 0 ? errors : undefined,
  };
}
