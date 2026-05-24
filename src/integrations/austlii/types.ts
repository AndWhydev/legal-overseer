/**
 * AustLII integration types.
 *
 * AustLII (Australasian Legal Information Institute) is the canonical
 * free-access database for Australian case law and legislation. We
 * search it through its public search endpoint, parse the result
 * pages, and treat any document hosted at austlii.edu.au as
 * authoritative for citation-verification purposes.
 */

export type AustLiiKind =
  | 'case'
  | 'legislation'
  | 'other';

export interface AustLiiResult {
  /** Document title as shown in the AustLII search list. */
  title: string;
  /** Canonical AustLII URL (always https://www.austlii.edu.au/...). */
  url: string;
  /** Short citation lifted from the title (best-effort). */
  citation: string;
  /** Snippet AustLII rendered for this hit. */
  snippet: string;
  /** Kind we classified the hit as (case / legislation / other). */
  kind: AustLiiKind;
  /** Court / database the result lives in (e.g. "HCA", "FCA", "NSWCA"). */
  database: string | null;
  /** Year mentioned in the citation, if we could parse it. */
  year: number | null;
}

export interface AustLiiSearchOptions {
  /** Free-text query. Same syntax AustLII's web UI accepts. */
  query: string;
  /** How many results to return (max 20, default 10). */
  limit?: number;
  /** Restrict to one of the AustLII database scopes (e.g. "cth/HCA"). */
  database?: string;
  /** Network timeout in ms (default 10s). */
  timeoutMs?: number;
}

export interface AustLiiSearchResponse {
  query: string;
  results: AustLiiResult[];
  /** True when the call hit the network and parsed at least one result. */
  ok: boolean;
  /** Set when ok=false; human-readable reason for the failure. */
  error: string | null;
  /** Total wall time of the search (ms). */
  durationMs: number;
}
