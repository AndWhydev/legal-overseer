/**
 * Alibaba Scraper Types
 *
 * Type definitions for Alibaba product search and scraping.
 * Designed to align with ProductOpportunity interface for
 * seamless integration with R&D Scout research pipeline.
 */

/**
 * Alibaba product data from search results
 *
 * Maps closely to ProductOpportunity for easy transformation.
 */
export interface AlibabaProduct {
  /** Product title from listing */
  title: string;

  /** Minimum price in USD */
  priceMin: number;

  /** Maximum price in USD (for price ranges) */
  priceMax: number;

  /** Supplier/vendor name */
  supplier: string;

  /** Direct link to product listing */
  url: string;

  /** Main product image URL */
  image: string;

  /** Product category on Alibaba */
  category: string;

  /** Minimum order quantity (if available) */
  moq?: number;

  /** Supplier verification status */
  supplierVerified?: boolean;

  /** Supplier country */
  supplierCountry?: string;

  /** Number of reviews/orders */
  reviewCount?: number;

  /** Product rating (1-5) */
  rating?: number;
}

/**
 * Parameters for Alibaba product search
 */
export interface AlibabaSearchParams {
  /** Search query (keywords) */
  query: string;

  /** Product category filter */
  category?: AlibabaCategory;

  /** Minimum unit price in USD */
  minPrice?: number;

  /** Maximum unit price in USD */
  maxPrice?: number;

  /** Page number (1-indexed) */
  page?: number;

  /** Sort order */
  sortBy?: 'relevance' | 'price_asc' | 'price_desc' | 'orders';

  /** Only show verified suppliers */
  verifiedOnly?: boolean;
}

/**
 * Result from Alibaba search
 */
export interface AlibabaSearchResult {
  /** Products found in search */
  products: AlibabaProduct[];

  /** Total products matching query (estimate) */
  totalFound: number;

  /** Whether more pages are available */
  hasMore: boolean;

  /** Current page number */
  currentPage: number;

  /** Search query used */
  query: string;

  /** Errors or warnings from scraping */
  errors?: string[];
}

/**
 * Alibaba category mappings for beauty tools
 *
 * Maps human-readable categories to Alibaba category IDs/paths.
 * Focus on categories relevant to CheekyGlo's product line.
 */
export type AlibabaCategory =
  | 'skincare'
  | 'beauty-tools'
  | 'haircare'
  | 'nail-care'
  | 'organic-beauty'
  | 'face-massager'
  | 'hair-removal'
  | 'makeup-tools';

/**
 * Category URL mappings for Alibaba search
 *
 * These map internal category names to Alibaba search parameters.
 */
export const ALIBABA_CATEGORY_MAP: Record<AlibabaCategory, string> = {
  skincare: 'skincare',
  'beauty-tools': 'beauty+tools',
  haircare: 'hair+care',
  'nail-care': 'nail+care',
  'organic-beauty': 'organic+beauty',
  'face-massager': 'face+massager',
  'hair-removal': 'hair+removal',
  'makeup-tools': 'makeup+tools',
};

/**
 * Constants for Alibaba scraping
 */
export const ALIBABA_CONSTANTS = {
  /** Maximum pages to scrape per search (cost control) */
  MAX_PAGES: 3,

  /** Maximum products per search (cost control) */
  MAX_PRODUCTS: 50,

  /** Products per page on Alibaba */
  PRODUCTS_PER_PAGE: 48,

  /** Base URL for Alibaba search */
  SEARCH_BASE_URL: 'https://www.alibaba.com/trade/search',

  /** Delay between requests (ms) to avoid rate limiting */
  REQUEST_DELAY: 1000,

  /** CNY to USD conversion rate (approximate) */
  CNY_TO_USD: 0.14,
} as const;
