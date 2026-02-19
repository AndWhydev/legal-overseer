/**
 * ScraperAPI Integration Module
 *
 * Barrel export for ScraperAPI client functions, types, and configuration.
 * Use this module for all web scraping operations via ScraperAPI.
 *
 * @example
 * ```typescript
 * import { scrapeUrl, scrapeStructured, isScraperAPIConfigured } from '../integrations/scraperapi';
 *
 * if (isScraperAPIConfigured()) {
 *   const html = await scrapeUrl('https://example.com', { render: true });
 * }
 * ```
 */

export {
  scrapeUrl,
  scrapeStructured,
  isScraperAPIConfigured,
} from './client.js';

export {
  ScraperAPIError,
  SCRAPERAPI_ENDPOINTS,
  DEFAULT_SCRAPER_OPTIONS,
  type ScraperAPIOptions,
  type ScraperAPIStructuredResponse,
} from './types.js';
