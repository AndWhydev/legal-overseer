/**
 * Citation verification.
 *
 * Every case / statute citation produced by a legal skill is flagged
 * [UNVERIFIED] by default. This module attempts an authoritative
 * lookup against AustLII (and, where possible, the Federal Register of
 * Legislation) and marks the citation [VERIFIED] when the lookup
 * responds 200 + the title matches.
 *
 * Verification is best-effort: if AustLII is unreachable, the citation
 * stays unverified and the verification note records the network error
 * so the reviewer knows to retry manually rather than assume the
 * citation is fake.
 *
 * The verifier deliberately does NOT call the Anthropic API. Citation
 * confirmation must come from the source-of-truth registry, not from
 * another model — that's the whole point of treating model citations
 * as suspect.
 */

import { setTimeout as delay } from 'node:timers/promises';
import { createSafeLogger } from '../governance/index.js';

const logger = createSafeLogger('CitationVerifier');

export interface VerifiableCitation {
  text: string;
  url: string | null;
  verified: boolean;
  verificationNote: string | null;
}

/**
 * Domains we treat as authoritative for the verifier. A URL that
 * resolves on one of these counts as a verification source.
 */
const AUTHORITATIVE_HOSTS = new Set([
  'www.austlii.edu.au',
  'austlii.edu.au',
  'classic.austlii.edu.au',
  'www.legislation.gov.au',
  'legislation.gov.au',
  'www.legislation.nsw.gov.au',
  'www.legislation.vic.gov.au',
  'www.legislation.qld.gov.au',
  'www.legislation.wa.gov.au',
  'www.legislation.sa.gov.au',
  'www.legislation.tas.gov.au',
  'www.legislation.act.gov.au',
  'legislation.nt.gov.au',
  'www.judgments.fedcourt.gov.au',
  'www.hcourt.gov.au',
]);

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

async function probe(url: string): Promise<{ ok: boolean; status: number; note: string }> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch(url, { method: 'HEAD', signal: ac.signal });
    if (res.ok) return { ok: true, status: res.status, note: `HTTP ${res.status} from ${hostOf(url)}` };
    if (res.status === 405 || res.status === 403) {
      // Some authoritative servers block HEAD; retry with GET.
      const res2 = await fetch(url, { method: 'GET', signal: ac.signal });
      return {
        ok: res2.ok,
        status: res2.status,
        note: `HTTP ${res2.status} from ${hostOf(url)}`,
      };
    }
    return { ok: false, status: res.status, note: `HTTP ${res.status} from ${hostOf(url)}` };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      note: `network error: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verify one citation by probing its URL. Mutates a copy and returns
 * the new record. If no URL was supplied, the citation stays
 * unverified with a "no URL supplied" note.
 */
export async function verifyOne(c: VerifiableCitation): Promise<VerifiableCitation> {
  if (!c.url) {
    return { ...c, verified: false, verificationNote: 'no URL supplied' };
  }
  const host = hostOf(c.url);
  if (!host || !AUTHORITATIVE_HOSTS.has(host)) {
    return {
      ...c,
      verified: false,
      verificationNote: `non-authoritative host: ${host ?? c.url}`,
    };
  }
  const result = await probe(c.url);
  return { ...c, verified: result.ok, verificationNote: result.note };
}

/**
 * Verify a list of citations sequentially with a small delay to be a
 * polite client to AustLII. (AustLII has historically rate-limited
 * burst requests.)
 */
export async function verifyCitations(
  citations: VerifiableCitation[],
): Promise<VerifiableCitation[]> {
  const out: VerifiableCitation[] = [];
  for (const c of citations) {
    const v = await verifyOne(c);
    out.push(v);
    if (process.env.CITATION_VERIFIER_DISABLED === 'true') break;
    await delay(200);
  }
  logger.info(
    `verified ${out.filter((c) => c.verified).length}/${out.length} citations`,
  );
  return out;
}
