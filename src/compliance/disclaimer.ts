/**
 * AI disclaimer enforcement.
 *
 * Every output that may end up in front of a human (lawyer reviewer,
 * client, court) is run through wrapWithDisclaimer() so the disclaimer
 * block is guaranteed to appear once at the bottom of the body. The
 * regex check is forgiving — if the model already appended the block
 * (per the systemPrompt), we don't double-print.
 *
 * Hard product constraint: nothing leaves the system without this
 * block attached. See registry.ts → LEGAL_HARD_RULES rule #2.
 */

export const AI_DISCLAIMER_BLOCK = `
---

> **AI-DRAFTED — REQUIRES LAWYER REVIEW**
>
> This document was prepared by an AI assistant (Legal Overseer).
> Do not send, sign, file, or rely on this output without an admitted
> lawyer reviewing every clause, fact, and citation. Citations marked
> [UNVERIFIED] have not been confirmed against an authoritative source.
`.trim();

const DISCLAIMER_DETECT = /AI-DRAFTED\s*[—-]\s*REQUIRES\s+LAWYER\s+REVIEW/i;

/**
 * Append the disclaimer block to a body of text, unless it already
 * contains one. Idempotent — safe to call multiple times.
 */
export function wrapWithDisclaimer(body: string): string {
  const trimmed = (body ?? '').trimEnd();
  if (DISCLAIMER_DETECT.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}\n\n${AI_DISCLAIMER_BLOCK}\n`;
}

/**
 * True when text already carries the AI-DRAFTED disclaimer.
 */
export function hasDisclaimer(body: string): boolean {
  return DISCLAIMER_DETECT.test(body ?? '');
}
