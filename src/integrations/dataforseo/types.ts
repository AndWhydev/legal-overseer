/**
 * DataForSEO Integration Types
 *
 * Type definitions for DataForSEO API client configuration,
 * request/response structures, and error handling.
 *
 * @see https://docs.dataforseo.com/v3/keywords_data/google_ads/search_volume/live/
 */

/**
 * DataForSEO API credentials
 *
 * Authentication uses HTTP Basic Auth with login:password encoded in base64.
 */
export interface DataForSEOCredentials {
  /** DataForSEO account login (email) */
  login: string;

  /** DataForSEO API password (not account password) */
  password: string;
}

/**
 * Monthly search volume data point
 *
 * Represents search volume for a single month.
 */
export interface MonthlySearchVolume {
  /** Year of the data point */
  year: number;

  /** Month of the data point (1-12) */
  month: number;

  /** Search volume for this month */
  search_volume: number;
}

/**
 * Processed keyword data from DataForSEO response
 *
 * Contains search volume, competition, and trend data
 * extracted from the API response.
 */
export interface KeywordData {
  /** The keyword or search term */
  keyword: string;

  /** Current monthly search volume */
  searchVolume: number;

  /** Competition level (0-100 scale, normalized) */
  competition: number;

  /** Competition category: LOW, MEDIUM, or HIGH */
  competitionLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';

  /** Monthly search volumes (last 12 months, most recent first) */
  monthlySearches: MonthlySearchVolume[];

  /** Cost per click in USD (if available) */
  cpc?: number;

  /** Location code used for the query */
  locationCode: number;

  /** Language code used for the query */
  languageCode: string;
}

/**
 * Single keyword result from DataForSEO API
 *
 * Matches the structure returned by the search_volume/live endpoint.
 */
export interface DataForSEOKeywordResult {
  keyword: string;
  spell?: string | null;
  location_code: number;
  language_code: string;
  search_partners: boolean;
  keyword_info: {
    se_type: string;
    last_updated_time: string;
    competition: number;
    competition_level: 'LOW' | 'MEDIUM' | 'HIGH' | null;
    cpc: number | null;
    search_volume: number | null;
    low_top_of_page_bid: number | null;
    high_top_of_page_bid: number | null;
    categories: number[] | null;
    monthly_searches: MonthlySearchVolume[] | null;
  };
  keyword_info_normalized_with_bing?: unknown;
  impressions_info?: unknown;
  serp_info?: {
    se_type: string;
    check_url: string;
    serp_item_types: string[];
    se_results_count: number;
    last_updated_time: string;
    previous_updated_time: string;
  } | null;
}

/**
 * Task result from DataForSEO API response
 */
export interface DataForSEOTaskResult {
  keyword: string;
  location_code: number;
  language_code: string;
  search_partners: boolean;
  competition: number | null;
  competition_level: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  cpc: number | null;
  search_volume: number | null;
  monthly_searches: MonthlySearchVolume[] | null;
}

/**
 * Single task in DataForSEO API response
 */
export interface DataForSEOTask {
  id: string;
  status_code: number;
  status_message: string;
  time: string;
  cost: number;
  result_count: number;
  path: string[];
  data: {
    api: string;
    function: string;
    keywords: string[];
    location_code: number;
    language_code: string;
    include_serp_info: boolean;
  };
  result: DataForSEOKeywordResult[] | null;
}

/**
 * Full DataForSEO API response structure
 *
 * The API returns results wrapped in a standard envelope
 * with version, status, cost, and tasks array.
 */
export interface DataForSEOResponse {
  /** API version */
  version: string;

  /** Overall status code (20000 = success) */
  status_code: number;

  /** Status message */
  status_message: string;

  /** Total execution time */
  time: string;

  /** Total cost in USD */
  cost: number;

  /** Number of tasks in response */
  tasks_count: number;

  /** Number of completed tasks */
  tasks_done: number;

  /** Array of task results */
  tasks: DataForSEOTask[];
}

/**
 * Request body for DataForSEO search_volume/live endpoint
 */
export interface DataForSEORequest {
  /** Keywords to analyze (max 1000 per request) */
  keywords: string[];

  /** Location code (2036 for Australia) */
  location_code: number;

  /** Language code ('en' for English) */
  language_code: string;

  /** Include SERP info for richer data */
  include_serp_info?: boolean;
}

/**
 * Custom error class for DataForSEO API failures
 *
 * Includes status code, error code, and whether the error is retryable.
 */
export class DataForSEOError extends Error {
  /** HTTP status code from the API */
  public readonly statusCode: number;

  /** DataForSEO error code (if available) */
  public readonly errorCode?: number;

  /** Whether this error should trigger a retry */
  public readonly retryable: boolean;

  /** Original response body if available */
  public readonly responseBody?: string;

  constructor(
    message: string,
    statusCode: number,
    retryable: boolean = false,
    errorCode?: number,
    responseBody?: string
  ) {
    super(message);
    this.name = 'DataForSEOError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.retryable = retryable;
    this.responseBody = responseBody;

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace?.(this, DataForSEOError);
  }

  /**
   * Create error from HTTP response
   */
  static fromResponse(
    response: Response,
    responseBody?: string
  ): DataForSEOError {
    const retryable =
      response.status === 429 || // Rate limited
      response.status >= 500; // Server error

    return new DataForSEOError(
      `DataForSEO request failed: ${response.status} ${response.statusText}`,
      response.status,
      retryable,
      undefined,
      responseBody
    );
  }

  /**
   * Create error from API error response
   */
  static fromAPIError(
    statusCode: number,
    statusMessage: string,
    errorCode?: number
  ): DataForSEOError {
    // Error codes in 40000 range are client errors (not retryable)
    // Error codes in 50000 range are server errors (retryable)
    const retryable = errorCode ? errorCode >= 50000 : statusCode >= 500;

    return new DataForSEOError(
      `DataForSEO API error: ${statusMessage}`,
      statusCode,
      retryable,
      errorCode
    );
  }
}

/**
 * DataForSEO API endpoint configuration
 */
export const DATAFORSEO_ENDPOINTS = {
  /** Search volume live endpoint */
  searchVolumeLive:
    'https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live',

  /** Keywords for site endpoint */
  keywordsForSite:
    'https://api.dataforseo.com/v3/keywords_data/google_ads/keywords_for_site/live',

  /** Account/user data endpoint (balance, limits) */
  userData: 'https://api.dataforseo.com/v3/appendix/user_data',
} as const;

/**
 * Default configuration for DataForSEO requests
 */
export const DEFAULT_DATAFORSEO_CONFIG = {
  /** Location code for Australia */
  locationCode: 2036,

  /** Language code for English */
  languageCode: 'en',

  /** Include SERP info by default for richer data */
  includeSerpInfo: true,

  /** Request timeout in milliseconds */
  timeout: 30000,

  /** Maximum retry attempts */
  retries: 3,
} as const;
