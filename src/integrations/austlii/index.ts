/**
 * AustLII integration — public surface.
 *
 * Two callers:
 *   - legal-research skill: enriches its memo with AustLII hits and
 *     marks any sourced URL as auto-verified.
 *   - dashboard /research search box (future): direct ad-hoc search.
 */

export { searchAustLii, searchAustLiiMulti } from './search.js';
export type {
  AustLiiResult,
  AustLiiSearchOptions,
  AustLiiSearchResponse,
  AustLiiKind,
} from './types.js';

/**
 * Domain set the citation verifier already trusts. Re-exported here
 * so the legal-research skill can short-circuit verification on any
 * citation whose URL came directly out of an AustLII search.
 */
export const AUSTLII_AUTHORITATIVE_HOSTS = new Set([
  'www.austlii.edu.au',
  'austlii.edu.au',
  'classic.austlii.edu.au',
]);

/**
 * Convenience predicate — true when a URL is rooted at AustLII and
 * may therefore be treated as auto-verified.
 */
export function isAustLiiUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return AUSTLII_AUTHORITATIVE_HOSTS.has(host);
  } catch {
    return false;
  }
}
