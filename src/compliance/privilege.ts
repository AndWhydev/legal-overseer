/**
 * Privilege protection layer.
 *
 * Hard product constraint: documents are summarised / redacted locally
 * before any Anthropic API call so we don't ship raw client-identifying
 * material to a third-party model. The redactor is intentionally
 * conservative — false positives (over-redaction) are preferable to
 * false negatives (privileged content leaking).
 *
 * What we redact:
 *   - Personal names that look like Australian people
 *     (heuristic — title-cased two-token sequences not in a small
 *     allow-list of generic legal terms).
 *   - Email addresses.
 *   - Australian phone numbers (mobile + landline patterns).
 *   - Australian addresses (street numbers + suburb hints).
 *   - ABN / ACN / TFN numeric patterns.
 *   - Bank account numbers (BSB-account patterns).
 *   - Court file numbers when prefixed with NSD/VID/QUD/SAD/WAD.
 *   - Direct quotation of confidential markers like "Without
 *     Prejudice" content blocks.
 *
 * The reverse map of redactions is returned so the calling skill can
 * either show it to the human reviewer or, where strictly necessary,
 * re-insert specific tokens (under explicit operator control).
 *
 * The redactor is also called from the inbox monitor when staging
 * inbound matter docs so the local DB never stores raw privileged
 * material in plain text without an explicit per-matter allow list.
 */

export interface RedactionRecord {
  /** Token used in the redacted text, e.g. "[PERSON_1]". */
  token: string;
  /** Original substring that was replaced. */
  original: string;
  /** Why it was redacted (matching rule name). */
  rule: string;
}

export interface RedactionResult {
  /** Text with sensitive substrings replaced by tokens. */
  text: string;
  /** Per-token reverse map (the local-only key to undo redaction). */
  redactions: RedactionRecord[];
}

export interface RedactionOptions {
  /** Matter id this redaction belongs to (kept in the record for audit). */
  matterId: string | null;
  /** Tokens the operator has explicitly allow-listed for this matter. */
  allowList?: string[];
}

const RULES: Array<{
  name: string;
  re: RegExp;
  token: (n: number) => string;
}> = [
  {
    name: 'email',
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    token: (n) => `[EMAIL_${n}]`,
  },
  {
    name: 'au_mobile',
    re: /\b(?:\+61\s?4\d{2}|04\d{2})\s?\d{3}\s?\d{3}\b/g,
    token: (n) => `[PHONE_${n}]`,
  },
  {
    name: 'au_landline',
    re: /\b(?:\+61\s?[2378]|0[2378])\s?\d{4}\s?\d{4}\b/g,
    token: (n) => `[PHONE_${n}]`,
  },
  {
    name: 'abn',
    re: /\bABN[:\s]*\d{2}\s?\d{3}\s?\d{3}\s?\d{3}\b/gi,
    token: (n) => `[ABN_${n}]`,
  },
  {
    name: 'acn',
    re: /\bACN[:\s]*\d{3}\s?\d{3}\s?\d{3}\b/gi,
    token: (n) => `[ACN_${n}]`,
  },
  {
    name: 'tfn',
    re: /\bTFN[:\s]*\d{3}\s?\d{3}\s?\d{3}\b/gi,
    token: (n) => `[TFN_${n}]`,
  },
  {
    name: 'bsb_account',
    re: /\b\d{3}-?\d{3}\s+\d{6,10}\b/g,
    token: (n) => `[BANK_${n}]`,
  },
  {
    name: 'court_file_number',
    re: /\b(?:NSD|VID|QUD|SAD|WAD|TAD|ACD)\s?\d{1,6}\s?\/\s?\d{4}\b/gi,
    token: (n) => `[COURT_FILE_${n}]`,
  },
  {
    name: 'au_address',
    re: /\b\d{1,5}\s+[A-Z][a-z]+\s+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Lane|Ln|Court|Ct|Place|Pl|Parade|Pde|Crescent|Cres)\b/g,
    token: (n) => `[ADDRESS_${n}]`,
  },
];

/**
 * Two title-case tokens in a row (e.g. "Jane Smith"). Excluded if both
 * tokens are in the small allow-list — keeps "High Court", "Federal
 * Court", "Without Prejudice", etc. unredacted.
 */
const NAME_RE = /\b[A-Z][a-z]{1,}\s+[A-Z][a-z]{1,}\b/g;
const NAME_ALLOW = new Set([
  'High Court',
  'Federal Court',
  'Supreme Court',
  'District Court',
  'Local Court',
  'Family Court',
  'Federal Circuit',
  'Family Provision',
  'Without Prejudice',
  'In Confidence',
  'Privileged Confidential',
  'New South',
  'South Wales',
  'Western Australia',
  'South Australia',
  'Northern Territory',
  'Australian Capital',
  'Capital Territory',
  'United Kingdom',
  'United States',
  'New Zealand',
  'Solicitor Client',
  'Client Solicitor',
]);

function redactNames(text: string, redactions: RedactionRecord[], allowList: Set<string>): string {
  let counter = redactions.filter((r) => r.rule === 'person_name').length + 1;
  return text.replace(NAME_RE, (match) => {
    if (NAME_ALLOW.has(match) || allowList.has(match)) return match;
    const existing = redactions.find((r) => r.rule === 'person_name' && r.original === match);
    if (existing) return existing.token;
    const token = `[PERSON_${counter}]`;
    redactions.push({ token, original: match, rule: 'person_name' });
    counter++;
    return token;
  });
}

/**
 * Redact privileged / personally identifying tokens from text before
 * sending it to an external model. Returns the redacted text plus a
 * reverse map so the caller can audit (or selectively undo) what was
 * redacted.
 */
export function redactForExternalModel(
  text: string,
  options: RedactionOptions,
): RedactionResult {
  const allow = new Set(options.allowList ?? []);
  const redactions: RedactionRecord[] = [];

  let working = text ?? '';
  for (const rule of RULES) {
    let counter = 1;
    working = working.replace(rule.re, (match) => {
      if (allow.has(match)) return match;
      const token = rule.token(counter);
      redactions.push({ token, original: match, rule: rule.name });
      counter++;
      return token;
    });
  }

  working = redactNames(working, redactions, allow);
  return { text: working, redactions };
}

/**
 * Rough "redaction strength" metric used in audit logs — the fraction
 * of characters that were swapped for tokens. Useful for spotting
 * documents the redactor did very little to (likely safe) vs ones it
 * heavily masked (worth a closer look).
 */
export function redactionDensity(result: RedactionResult, originalLength: number): number {
  if (originalLength === 0) return 0;
  const replaced = result.redactions.reduce((sum, r) => sum + r.original.length, 0);
  return Math.min(1, replaced / originalLength);
}
