/**
 * AustLII real-time search.
 *
 * AustLII has a stable search endpoint at:
 *   https://www.austlii.edu.au/cgi-bin/sinosrch.cgi?method=auto&query=...
 *
 * It returns an HTML results page that lists matching documents.
 * This module fetches that page, parses the result list, and
 * normalises each hit into an AustLiiResult. All URLs are rewritten
 * to absolute https://www.austlii.edu.au/... so the citation
 * verifier downstream treats them as authoritative.
 *
 * The parser is intentionally tolerant: AustLII's HTML is decades-
 * stable but markup variants (italic-wrapped titles, tabular vs list
 * layout) appear. When parsing fails we return whatever we could
 * extract plus an `ok: false` flag — never an exception. Network
 * failures degrade gracefully: the caller (legal-research skill) sees
 * an empty result set and a non-null `error` and can continue without
 * AustLII enrichment.
 */

import { createSafeLogger } from '../../governance/index.js';
import type {
  AustLiiKind,
  AustLiiResult,
  AustLiiSearchOptions,
  AustLiiSearchResponse,
} from './types.js';

const logger = createSafeLogger('AustLII');

const BASE = 'https://www.austlii.edu.au';
const SEARCH_PATH = '/cgi-bin/sinosrch.cgi';
const DEFAULT_TIMEOUT = 10_000;
const USER_AGENT =
  'LegalOverseer/1.0 (+https://legaloverseer.com.au) Australian on-prem legal assistant';

function buildSearchUrl(opts: AustLiiSearchOptions): string {
  const params = new URLSearchParams({
    method: 'auto',
    meta: '/',
    query: opts.query,
    rank: 'on',
  });
  if (opts.database) params.set('mask_path', opts.database);
  return `${BASE}${SEARCH_PATH}?${params.toString()}`;
}

function absoluteUrl(href: string): string {
  if (!href) return '';
  if (href.startsWith('http://') || href.startsWith('https://')) return href;
  if (href.startsWith('//')) return `https:${href}`;
  if (href.startsWith('/')) return `${BASE}${href}`;
  return `${BASE}/${href}`;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x?[0-9a-fA-F]+;/g, ' ');
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

function classifyByUrl(url: string): { kind: AustLiiKind; database: string | null } {
  const u = url.toLowerCase();
  // AustLII path conventions:
  //   /au/cases/<jurisdiction>/<court-code>/<year>/<n>.html
  //   /au/legis/<jurisdiction>/<consol_act|num_act|num_reg>/<...>
  const casesMatch = u.match(/\/au\/cases\/[^/]+\/([^/]+)\//);
  if (casesMatch) return { kind: 'case', database: casesMatch[1].toUpperCase() };
  if (u.includes('/au/legis/')) return { kind: 'legislation', database: null };
  return { kind: 'other', database: null };
}

function extractYear(title: string): number | null {
  const m = title.match(/\((\d{4})\)|\[(\d{4})\]|\b(19|20)(\d{2})\b/);
  if (!m) return null;
  const y = Number.parseInt(m[1] ?? m[2] ?? `${m[3]}${m[4]}`, 10);
  if (!Number.isFinite(y) || y < 1800 || y > 2200) return null;
  return y;
}

function extractCitation(title: string): string {
  // The AustLII title is normally something like:
  //   Smith v Jones [2020] NSWCA 12 (3 March 2020)
  // → keep everything up to the closing trailing parenthetical.
  const trimmed = title.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return trimmed || title;
}

/**
 * Parse the AustLII search-results HTML. AustLII's result blocks
 * follow this rough shape:
 *
 *   <li> <a href="/au/cases/...html">Title text</a>
 *        ... snippet ... </li>
 *
 * (sometimes wrapped in <ol>, sometimes in <p>; we just iterate every
 * <a href> that points into the /au/ tree).
 */
function parseSearchHtml(html: string, limit: number): AustLiiResult[] {
  const results: AustLiiResult[] = [];
  const anchorRe = /<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]{0,400})/gi;
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = anchorRe.exec(html))) {
    const href = match[1];
    if (!/\/au\/(cases|legis)\//i.test(href)) continue;

    const url = absoluteUrl(href);
    if (seen.has(url)) continue;
    seen.add(url);

    const title = stripTags(match[2]);
    if (!title || title.length < 6) continue;

    const tail = stripTags(match[3]).slice(0, 400);
    const classification = classifyByUrl(url);

    results.push({
      title,
      url,
      citation: extractCitation(title),
      snippet: tail || title,
      kind: classification.kind,
      database: classification.database,
      year: extractYear(title),
    });

    if (results.length >= limit) break;
  }

  return results;
}

export async function searchAustLii(opts: AustLiiSearchOptions): Promise<AustLiiSearchResponse> {
  const start = Date.now();
  const limit = Math.max(1, Math.min(20, opts.limit ?? 10));
  const url = buildSearchUrl(opts);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;

  if (process.env.AUSTLII_DISABLED === 'true') {
    return { query: opts.query, results: [], ok: false, error: 'AustLII disabled (AUSTLII_DISABLED=true)', durationMs: 0 };
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
    });
    if (!res.ok) {
      return {
        query: opts.query,
        results: [],
        ok: false,
        error: `HTTP ${res.status}`,
        durationMs: Date.now() - start,
      };
    }
    const html = await res.text();
    const results = parseSearchHtml(html, limit);
    logger.info(`search "${opts.query.slice(0, 60)}" → ${results.length} result(s)`);
    return {
      query: opts.query,
      results,
      ok: results.length > 0,
      error: results.length > 0 ? null : 'no results parsed',
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`search failed: ${msg}`);
    return { query: opts.query, results: [], ok: false, error: msg, durationMs: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Convenience helper for the legal-research skill — runs one or more
 * sub-queries and merges results, preserving order and de-duping by URL.
 */
export async function searchAustLiiMulti(
  queries: string[],
  perQueryLimit = 5,
): Promise<AustLiiSearchResponse> {
  const start = Date.now();
  const merged: AustLiiResult[] = [];
  const seen = new Set<string>();
  const errors: string[] = [];

  for (const q of queries.slice(0, 6)) {
    const r = await searchAustLii({ query: q, limit: perQueryLimit });
    if (!r.ok && r.error) errors.push(`${q}: ${r.error}`);
    for (const hit of r.results) {
      if (seen.has(hit.url)) continue;
      seen.add(hit.url);
      merged.push(hit);
    }
  }

  return {
    query: queries.join(' | '),
    results: merged,
    ok: merged.length > 0,
    error: merged.length > 0 ? null : errors.join('; ') || 'no results',
    durationMs: Date.now() - start,
  };
}
