/**
 * ScraperAPI Integration Types
 *
 * Type definitions for ScraperAPI client configuration,
 * options, and error handling.
 */

/**
 * Configuration options for ScraperAPI requests
 *
 * @see https://www.scraperapi.com/documentation
 */
export interface ScraperAPIOptions {
  /** Enable JavaScript rendering (default: false) */
  render?: boolean;

  /** Country code for geo-targeting (default: 'au' for Australia) */
  country?: string;

  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;

  /** Maximum retry attempts (default: 3) */
  retries?: number;

  /** Enable premium proxies for difficult targets */
  premium?: boolean;

  /** Keep session for consistent IP across requests */
  sessionNumber?: number;
}

/**
 * Response from ScraperAPI Structured Data Endpoints
 */
export interface ScraperAPIStructuredResponse<T = unknown> {
  /** Whether the request was successful */
  success: boolean;

  /** The parsed data (varies by endpoint) */
  data?: T;

  /** Error message if request failed */
  error?: string;

  /** HTTP status code from target site */
  statusCode?: number;
}

/**
 * Custom error class for ScraperAPI failures
 *
 * Includes status code and whether the error is retryable
 * (e.g., 429 rate limit or 5xx server errors).
 */
export class ScraperAPIError extends Error {
  /** HTTP status code from the API */
  public readonly statusCode: number;

  /** Whether this error should trigger a retry */
  public readonly retryable: boolean;

  /** Original response body if available */
  public readonly responseBody?: string;

  constructor(
    message: string,
    statusCode: number,
    retryable: boolean = false,
    responseBody?: string
  ) {
    super(message);
    this.name = 'ScraperAPIError';
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.responseBody = responseBody;

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace?.(this, ScraperAPIError);
  }

  /**
   * Create error from HTTP response
   */
  static fromResponse(
    response: Response,
    responseBody?: string
  ): ScraperAPIError {
    const retryable =
      response.status === 429 || // Rate limited
      response.status >= 500; // Server error

    return new ScraperAPIError(
      `ScraperAPI request failed: ${response.status} ${response.statusText}`,
      response.status,
      retryable,
      responseBody
    );
  }
}

/**
 * ScraperAPI endpoint base URLs
 */
export const SCRAPERAPI_ENDPOINTS = {
  /** Base URL for raw scraping */
  base: 'https://api.scraperapi.com/',

  /** Base URL for Amazon Structured Data */
  amazonSDE: 'https://api.scraperapi.com/structured/amazon',

  /** Base URL for Google Structured Data */
  googleSDE: 'https://api.scraperapi.com/structured/google',
} as const;

/**
 * Default options for ScraperAPI requests
 */
export const DEFAULT_SCRAPER_OPTIONS: Required<
  Omit<ScraperAPIOptions, 'premium' | 'sessionNumber'>
> = {
  render: false,
  country: 'au',
  timeout: 30000,
  retries: 3,
};
