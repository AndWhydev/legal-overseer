/**
 * DataForSEO Client
 *
 * HTTP client for DataForSEO API with retry logic, exponential backoff,
 * and proper error handling. Used for keyword volume analysis and
 * SEO trend detection in the R&D Scout skill.
 * Protected by circuit breaker to handle DataForSEO outages gracefully.
 *
 * @see https://docs.dataforseo.com/v3/keywords_data/google_ads/search_volume/live/
 */

import {
  DataForSEOError,
  DATAFORSEO_ENDPOINTS,
  DEFAULT_DATAFORSEO_CONFIG,
  type DataForSEOResponse,
  type DataForSEORequest,
  type KeywordData,
  type MonthlySearchVolume,
} from './types.js';
import { createCircuitBreaker, createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('DataForSEO');

/**
 * Sleep utility for exponential backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get DataForSEO credentials from environment
 *
 * @throws DataForSEOError if credentials are not set
 */
function getCredentials(): { login: string; password: string } {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;

  if (!login || !password) {
    throw new DataForSEOError(
      'DataForSEO credentials not configured. ' +
        'Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD environment variables. ' +
        'Sign up at https://dataforseo.com/ for free $100 credit.',
      401,
      false
    );
  }

  return { login, password };
}

/**
 * Create Basic auth header value
 *
 * DataForSEO uses HTTP Basic Auth with base64-encoded login:password
 */
function createAuthHeader(login: string, password: string): string {
  const credentials = `${login}:${password}`;
  // Use Buffer for Node.js or btoa for browser environments
  const encoded =
    typeof Buffer !== 'undefined'
      ? Buffer.from(credentials).toString('base64')
      : btoa(credentials);
  return `Basic ${encoded}`;
}

/**
 * Log a request with timestamp for debugging
 */
function logRequest(
  endpoint: string,
  keywordCount: number,
  attempt: number,
  maxRetries: number
): void {
  logger.debug(`Requesting ${keywordCount} keywords (attempt ${attempt}/${maxRetries})`);
}

/**
 * Log a response or error
 */
function logResponse(
  success: boolean,
  statusCode: number,
  durationMs: number,
  cost?: number
): void {
  const status = success ? 'SUCCESS' : 'FAILED';
  const costStr = cost !== undefined ? `, cost=$${cost.toFixed(4)}` : '';
  logger.debug(`${status}: status=${statusCode}, duration=${durationMs}ms${costStr}`);
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
 * Transform API result to KeywordData
 */
function transformKeywordResult(
  result: {
    keyword: string;
    location_code: number;
    language_code: string;
    keyword_info: {
      search_volume: number | null;
      competition: number;
      competition_level: 'LOW' | 'MEDIUM' | 'HIGH' | null;
      cpc: number | null;
      monthly_searches: MonthlySearchVolume[] | null;
    };
  },
  locationCode: number,
  languageCode: string
): KeywordData {
  const info = result.keyword_info;

  return {
    keyword: result.keyword,
    searchVolume: info.search_volume ?? 0,
    competition: info.competition ?? 0,
    competitionLevel: info.competition_level ?? 'UNKNOWN',
    monthlySearches: info.monthly_searches ?? [],
    cpc: info.cpc ?? undefined,
    locationCode: result.location_code ?? locationCode,
    languageCode: result.language_code ?? languageCode,
  };
}

/**
 * Internal function to get keyword volumes (used by circuit breaker)
 */
async function getKeywordVolumesInternal(
  keywords: string[],
  options: {
    locationCode?: number;
    languageCode?: string;
    includeSerpInfo?: boolean;
    timeout?: number;
    retries?: number;
  }
): Promise<KeywordData[]> {
  if (keywords.length === 0) {
    return [];
  }

  if (keywords.length > 1000) {
    throw new DataForSEOError(
      'Maximum 1000 keywords per request. Split into multiple calls.',
      400,
      false
    );
  }

  const { login, password } = getCredentials();
  const authHeader = createAuthHeader(login, password);

  const locationCode = options.locationCode ?? DEFAULT_DATAFORSEO_CONFIG.locationCode;
  const languageCode = options.languageCode ?? DEFAULT_DATAFORSEO_CONFIG.languageCode;
  const includeSerpInfo =
    options.includeSerpInfo ?? DEFAULT_DATAFORSEO_CONFIG.includeSerpInfo;
  const timeout = options.timeout ?? DEFAULT_DATAFORSEO_CONFIG.timeout;
  const maxRetries = options.retries ?? DEFAULT_DATAFORSEO_CONFIG.retries;

  const requestBody: DataForSEORequest[] = [
    {
      keywords,
      location_code: locationCode,
      language_code: languageCode,
      include_serp_info: includeSerpInfo,
    },
  ];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const startTime = Date.now();
    logRequest(
      DATAFORSEO_ENDPOINTS.searchVolumeLive,
      keywords.length,
      attempt,
      maxRetries
    );

    try {
      const response = await fetch(DATAFORSEO_ENDPOINTS.searchVolumeLive, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(timeout),
      });

      const durationMs = Date.now() - startTime;

      if (!response.ok) {
        const responseBody = await response.text().catch(() => undefined);
        logResponse(false, response.status, durationMs);

        const error = DataForSEOError.fromResponse(response, responseBody);

        // Retry on rate limit (429) or server error (5xx)
        if (error.retryable && attempt < maxRetries) {
          const delay = getBackoffDelay(attempt);
          logger.info(`Retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }

        throw error;
      }

      const data = (await response.json()) as DataForSEOResponse;
      logResponse(true, data.status_code, durationMs, data.cost);

      // Check for API-level errors
      if (data.status_code !== 20000) {
        const error = DataForSEOError.fromAPIError(
          data.status_code,
          data.status_message
        );

        if (error.retryable && attempt < maxRetries) {
          const delay = getBackoffDelay(attempt);
          logger.info(`API error, retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }

        throw error;
      }

      // Extract keyword data from tasks
      const results: KeywordData[] = [];
      for (const task of data.tasks) {
        if (task.status_code !== 20000 || !task.result) {
          logger.warn(`Task ${task.id} failed: ${task.status_message}`);
          continue;
        }

        for (const result of task.result) {
          results.push(transformKeywordResult(result, locationCode, languageCode));
        }
      }

      return results;
    } catch (error) {
      const durationMs = Date.now() - startTime;

      // Handle timeout
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        logResponse(false, 0, durationMs);
        const timeoutError = new DataForSEOError(
          `Request timed out after ${timeout}ms`,
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

      // Re-throw DataForSEOError as-is
      if (error instanceof DataForSEOError) {
        throw error;
      }

      // Wrap unknown errors
      throw new DataForSEOError(
        `DataForSEO request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        0,
        false
      );
    }
  }

  // Should not reach here, but TypeScript needs this
  throw new DataForSEOError('Max retries exceeded', 0, false);
}

/**
 * Circuit breaker for DataForSEO API
 * - Timeout: 10000ms
 * - Error threshold: 50%
 * - Reset timeout: 30000ms
 */
const dataforseoBreaker = createCircuitBreaker<KeywordData[]>(
  'dataforseo',
  getKeywordVolumesInternal as unknown as (...args: unknown[]) => Promise<KeywordData[]>,
  {
    timeout: 10000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
  }
);

/**
 * Get keyword search volumes from DataForSEO
 *
 * Fetches search volume, competition, and monthly trend data
 * for a list of keywords.
 * Protected by circuit breaker for resilience.
 *
 * @param keywords - Array of keywords to analyze (max 1000)
 * @param options - Optional configuration overrides
 * @returns Promise resolving to array of KeywordData
 *
 * @example
 * ```typescript
 * const data = await getKeywordVolumes(['glass skin serum', 'korean skincare']);
 * for (const kw of data) {
 *   console.log(`${kw.keyword}: ${kw.searchVolume}/month`);
 * }
 * ```
 */
export async function getKeywordVolumes(
  keywords: string[],
  options: {
    locationCode?: number;
    languageCode?: string;
    includeSerpInfo?: boolean;
    timeout?: number;
    retries?: number;
  } = {}
): Promise<KeywordData[]> {
  if (keywords.length === 0) {
    return [];
  }

  try {
    const result = await dataforseoBreaker.fire(keywords, options) as KeywordData[];
    return result;
  } catch (error) {
    // Check if this is a circuit breaker rejection
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    if (errorMsg.includes('Breaker is open')) {
      logger.warn('DataForSEO circuit is open, request rejected');
      throw new DataForSEOError('DataForSEO temporarily unavailable', 503, false);
    }
    throw error;
  }
}

/**
 * Check if DataForSEO is configured
 *
 * @returns true if both DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD are set
 */
export function isDataForSEOConfigured(): boolean {
  return !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

/**
 * Get remaining API credits (placeholder for future implementation)
 *
 * Note: DataForSEO provides account balance info via a separate endpoint.
 * This can be implemented when needed for monitoring costs.
 */
export async function getAccountBalance(): Promise<{
  balance: number;
  currency: string;
} | null> {
  // TODO: Implement balance check endpoint
  // GET https://api.dataforseo.com/v3/appendix/user_data
  logger.warn('DataForSEO balance check not yet implemented');
  return null;
}
