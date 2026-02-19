/**
 * ScraperAPI Client
 *
 * HTTP client for ScraperAPI with rate limiting, retry logic,
 * and exponential backoff. Handles both raw HTML scraping and
 * Structured Data Endpoint requests.
 * Protected by circuit breaker to handle ScraperAPI outages gracefully.
 *
 * @see https://www.scraperapi.com/documentation
 */

import {
  ScraperAPIError,
  SCRAPERAPI_ENDPOINTS,
  DEFAULT_SCRAPER_OPTIONS,
  type ScraperAPIOptions,
  type ScraperAPIStructuredResponse,
} from './types.js';
import { createCircuitBreaker, createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('ScraperAPI');

/**
 * Sleep utility for exponential backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get the ScraperAPI key from environment
 *
 * @throws Error if SCRAPERAPI_KEY is not set
 */
function getApiKey(): string {
  const key = process.env.SCRAPERAPI_KEY;
  if (!key) {
    throw new Error(
      'SCRAPERAPI_KEY environment variable is not set. ' +
        'Sign up at https://www.scraperapi.com/ and add your key to .env'
    );
  }
  return key;
}

/**
 * Log a request with timestamp for debugging
 */
function logRequest(
  method: string,
  url: string,
  attempt: number,
  maxRetries: number
): void {
  logger.debug(`${method}: ${url.substring(0, 100)}... (attempt ${attempt}/${maxRetries})`);
}

/**
 * Log a response or error
 */
function logResponse(
  success: boolean,
  statusCode: number,
  durationMs: number
): void {
  const status = success ? 'SUCCESS' : 'FAILED';
  logger.debug(`${status}: status=${statusCode}, duration=${durationMs}ms`);
}

/**
 * Calculate exponential backoff delay
 *
 * Uses exponential pattern: 1s, 2s, 4s for attempts 1, 2, 3
 *
 * @param attempt - Current attempt number (1-indexed)
 * @returns Delay in milliseconds
 */
function getBackoffDelay(attempt: number): number {
  return Math.pow(2, attempt - 1) * 1000;
}

/**
 * Internal function to scrape URL (used by circuit breaker)
 */
async function scrapeUrlInternal(
  url: string,
  options: ScraperAPIOptions
): Promise<string> {
  const apiKey = getApiKey();
  const opts = { ...DEFAULT_SCRAPER_OPTIONS, ...options };
  const maxRetries = opts.retries;

  const params = new URLSearchParams({
    api_key: apiKey,
    url,
    render: String(opts.render),
    country_code: opts.country,
  });

  // Add optional parameters
  if (opts.premium) {
    params.set('premium', 'true');
  }
  if (opts.sessionNumber !== undefined) {
    params.set('session_number', String(opts.sessionNumber));
  }

  const scraperUrl = `${SCRAPERAPI_ENDPOINTS.base}?${params}`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const startTime = Date.now();
    logRequest('GET', url, attempt, maxRetries);

    try {
      const response = await fetch(scraperUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(opts.timeout),
      });

      const durationMs = Date.now() - startTime;

      if (response.ok) {
        logResponse(true, response.status, durationMs);
        return await response.text();
      }

      // Handle error responses
      const responseBody = await response.text().catch(() => undefined);
      logResponse(false, response.status, durationMs);

      const error = ScraperAPIError.fromResponse(response, responseBody);

      // Retry on rate limit (429) or server error (5xx)
      if (error.retryable && attempt < maxRetries) {
        const delay = getBackoffDelay(attempt);
        logger.info(`Retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      }

      throw error;
    } catch (error) {
      const durationMs = Date.now() - startTime;

      // Handle timeout
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        logResponse(false, 0, durationMs);
        const timeoutError = new ScraperAPIError(
          `Request timed out after ${opts.timeout}ms`,
          0,
          true // Timeouts are retryable
        );

        if (attempt < maxRetries) {
          const delay = getBackoffDelay(attempt);
          logger.info(`Timeout, retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }

        throw timeoutError;
      }

      // Re-throw ScraperAPIError as-is
      if (error instanceof ScraperAPIError) {
        throw error;
      }

      // Wrap unknown errors
      throw new ScraperAPIError(
        `ScraperAPI request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        0,
        false
      );
    }
  }

  // Should not reach here, but TypeScript needs this
  throw new ScraperAPIError('Max retries exceeded', 0, false);
}

/**
 * Circuit breaker for ScraperAPI
 * - Timeout: 30000ms (scraping is slow)
 * - Error threshold: 50%
 * - Reset timeout: 60000ms (longer for scraping)
 */
const scraperBreaker = createCircuitBreaker<string>(
  'scraperapi',
  scrapeUrlInternal as unknown as (...args: unknown[]) => Promise<string>,
  {
    timeout: 30000,
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
  }
);

/**
 * Scrape a URL and return raw HTML content
 *
 * Uses ScraperAPI's base endpoint with proxy rotation and
 * optional JavaScript rendering.
 * Protected by circuit breaker for resilience.
 *
 * @param url - The URL to scrape
 * @param options - Scraping options (render, country, timeout, retries)
 * @returns Promise resolving to the raw HTML string
 *
 * @example
 * ```typescript
 * const html = await scrapeUrl('https://example.com', {
 *   render: true,
 *   country: 'au',
 * });
 * ```
 */
export async function scrapeUrl(
  url: string,
  options: ScraperAPIOptions = {}
): Promise<string> {
  try {
    const result = await scraperBreaker.fire(url, options) as string;
    return result;
  } catch (error) {
    // Check if this is a circuit breaker rejection
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    if (errorMsg.includes('Breaker is open')) {
      logger.warn('ScraperAPI circuit is open, request rejected');
      throw new ScraperAPIError('ScraperAPI temporarily unavailable', 503, false);
    }
    throw error;
  }
}

/**
 * Call a ScraperAPI Structured Data Endpoint
 *
 * Structured Data Endpoints return clean JSON data without
 * requiring HTML parsing. Available for Amazon, Google, etc.
 *
 * @param endpoint - Full endpoint URL (use SCRAPERAPI_ENDPOINTS)
 * @param params - Query parameters for the endpoint
 * @param options - Scraping options (timeout, retries)
 * @returns Promise resolving to the parsed JSON response
 *
 * @example
 * ```typescript
 * const result = await scrapeStructured(
 *   'https://api.scraperapi.com/structured/amazon/product',
 *   { asin: 'B08N5WRWNW', country: 'au' }
 * );
 * ```
 */
export async function scrapeStructured<T = unknown>(
  endpoint: string,
  params: Record<string, string>,
  options: ScraperAPIOptions = {}
): Promise<ScraperAPIStructuredResponse<T>> {
  const apiKey = getApiKey();
  const opts = { ...DEFAULT_SCRAPER_OPTIONS, ...options };
  const maxRetries = opts.retries;

  const searchParams = new URLSearchParams({
    api_key: apiKey,
    ...params,
  });

  const scraperUrl = `${endpoint}?${searchParams}`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const startTime = Date.now();
    logRequest('SDE', endpoint, attempt, maxRetries);

    try {
      const response = await fetch(scraperUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(opts.timeout),
      });

      const durationMs = Date.now() - startTime;

      if (response.ok) {
        logResponse(true, response.status, durationMs);
        const data = (await response.json()) as T;
        return {
          success: true,
          data,
        };
      }

      // Handle error responses
      const responseBody = await response.text().catch(() => undefined);
      logResponse(false, response.status, durationMs);

      const error = ScraperAPIError.fromResponse(response, responseBody);

      // Retry on rate limit (429) or server error (5xx)
      if (error.retryable && attempt < maxRetries) {
        const delay = getBackoffDelay(attempt);
        logger.info(`SDE: Retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      }

      return {
        success: false,
        error: error.message,
        statusCode: error.statusCode,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      // Handle timeout
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        logResponse(false, 0, durationMs);

        if (attempt < maxRetries) {
          const delay = getBackoffDelay(attempt);
          logger.info(`SDE: Timeout, retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }

        return {
          success: false,
          error: `Request timed out after ${opts.timeout}ms`,
          statusCode: 0,
        };
      }

      // Re-throw ScraperAPIError as-is
      if (error instanceof ScraperAPIError) {
        return {
          success: false,
          error: error.message,
          statusCode: error.statusCode,
        };
      }

      // Return unknown errors
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
        statusCode: 0,
      };
    }
  }

  return {
    success: false,
    error: 'Max retries exceeded',
    statusCode: 0,
  };
}

/**
 * Check if ScraperAPI is configured
 *
 * @returns true if SCRAPERAPI_KEY is set in environment
 */
export function isScraperAPIConfigured(): boolean {
  return !!process.env.SCRAPERAPI_KEY;
}
