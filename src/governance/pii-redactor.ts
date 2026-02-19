/**
 * PII Redaction module for BitBit
 *
 * Handles Australian-specific PII formats with context-aware matching
 * to prevent sensitive data leakage in logs and outputs.
 */

/**
 * PII pattern definition
 */
interface PIIPattern {
  name: string;
  pattern: RegExp;
  replacement: string;
  contextKeywords?: string[];
}

/**
 * Context keywords for financial data
 */
const FINANCIAL_KEYWORDS = [
  'bsb',
  'account',
  'bank',
  'payment',
  'transfer',
  'routing',
  'sort code',
  'iban',
  'swift',
];

/**
 * PII patterns with Australian-specific formats
 *
 * Order matters: more specific patterns should come before general ones.
 * Phone patterns before ABN to prevent collision.
 */
const PII_PATTERNS: PIIPattern[] = [
  // Email - standard format
  {
    name: 'EMAIL',
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: '[REDACTED_EMAIL]',
  },
  // Australian phone numbers - international format +61
  // Must come before ABN to prevent +61 numbers being matched as ABN
  // Matches: +61 412 345 678, +61412345678, +61 4 1234 5678
  {
    name: 'PHONE_INTL',
    pattern: /\+61[\s-]?\d{1,3}[\s-]?\d{3,4}[\s-]?\d{3,4}/g,
    replacement: '[REDACTED_PHONE]',
  },
  // Australian phone numbers - mobile (04XX)
  {
    name: 'PHONE_MOBILE',
    pattern: /\b04\d{2}[\s-]?\d{3}[\s-]?\d{3}\b/g,
    replacement: '[REDACTED_PHONE]',
  },
  // Australian phone numbers - landline (0X XXXX XXXX)
  {
    name: 'PHONE_LANDLINE',
    pattern: /\b0[2378][\s-]?\d{4}[\s-]?\d{4}\b/g,
    replacement: '[REDACTED_PHONE]',
  },
  // Credit card: 16 digits in groups of 4
  {
    name: 'CREDIT_CARD',
    pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    replacement: '[REDACTED_CARD]',
  },
  // Australian Business Number: 11 digits with ABN keyword context
  // Uses context-aware matching to avoid false positives
  {
    name: 'ABN',
    pattern: /\b\d{2}[\s]?\d{3}[\s]?\d{3}[\s]?\d{3}\b/g,
    replacement: '[REDACTED_ABN]',
    contextKeywords: ['abn', 'business number', 'australian business'],
  },
  // BSB: 6 digits with optional separator (context-aware)
  {
    name: 'BSB',
    pattern: /\b\d{3}[-\s]?\d{3}\b/g,
    replacement: '[REDACTED_BSB]',
    contextKeywords: FINANCIAL_KEYWORDS,
  },
  // Account number: 6-10 digits (context-aware)
  {
    name: 'ACCOUNT',
    pattern: /\b\d{6,10}\b/g,
    replacement: '[REDACTED_ACCOUNT]',
    contextKeywords: FINANCIAL_KEYWORDS,
  },
];

/**
 * Check if a match position is near context keywords
 *
 * @param text - Full text being searched
 * @param position - Position of the match
 * @param keywords - Keywords to look for nearby
 * @param windowSize - How many characters to look before/after (default 50)
 * @returns True if any keyword is found within the window
 */
function isNearKeyword(
  text: string,
  position: number,
  keywords: string[],
  windowSize: number = 50
): boolean {
  const start = Math.max(0, position - windowSize);
  const end = Math.min(text.length, position + windowSize);
  const window = text.slice(start, end).toLowerCase();

  return keywords.some((keyword) => window.includes(keyword.toLowerCase()));
}

/**
 * Redact PII from a text string
 *
 * Replaces detected PII with [REDACTED_TYPE] placeholders.
 * Context-aware patterns only redact if near relevant keywords.
 *
 * @param text - Text to redact
 * @returns Text with PII replaced
 */
export function redact(text: string): string {
  if (!text || typeof text !== 'string') {
    return text;
  }

  let result = text;

  for (const piiPattern of PII_PATTERNS) {
    if (piiPattern.contextKeywords) {
      // Context-aware matching: only redact if near keywords
      result = result.replace(piiPattern.pattern, (match, ...args) => {
        // Get the offset from the last argument (before groups array)
        const offset =
          typeof args[args.length - 2] === 'number' ? args[args.length - 2] : 0;
        if (isNearKeyword(text, offset, piiPattern.contextKeywords!)) {
          return piiPattern.replacement;
        }
        return match;
      });
    } else {
      // Direct matching: always redact
      result = result.replace(piiPattern.pattern, piiPattern.replacement);
    }
  }

  return result;
}

/**
 * Recursively redact PII from all string properties in an object
 *
 * @param obj - Object to redact
 * @returns New object with all string values redacted
 */
export function redactObject<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return redact(obj) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item)) as T;
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = redactObject(value);
    }
    return result as T;
  }

  return obj;
}

/**
 * Redact PII from error stack traces
 *
 * Sanitizes error messages and stack traces to prevent PII leakage in logs.
 *
 * @param error - Error to sanitize
 * @returns Sanitized stack trace string
 */
export function redactStackTrace(error: Error): string {
  const message = error.message ? redact(error.message) : 'Unknown error';
  const stack = error.stack ? redact(error.stack) : '';

  // Also redact file paths that might contain usernames
  const sanitizedStack = stack.replace(
    /\/Users\/[^\/]+\//g,
    '/Users/[REDACTED]/'
  );

  return `${message}\n${sanitizedStack}`;
}

/**
 * Re-export isNearKeyword for testing
 */
export { isNearKeyword };
