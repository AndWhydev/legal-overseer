/**
 * SEO inbox pipeline.
 *
 * Email body must contain (or strongly imply) a target domain and at
 * least one keyword. We extract both heuristically — operators get a
 * forgiving format:
 *
 *   Domain: example.com
 *   Keywords: cloud hosting, managed kubernetes
 *
 * or the same fields scattered as labelled lines anywhere in the body.
 * As a last resort, the first URL/domain in the body is used as the
 * target and the subject line is parsed for comma-separated keywords.
 *
 * On success we call dispatchBacklinkCampaign, which enqueues a task
 * the processor picks up — the same path the overseer uses.
 */

import { createSafeLogger } from '../../governance/index.js';
import { dispatchBacklinkCampaign } from '../../skills/seo-backlinks/index.js';
import type { IncomingEmail, PipelineResult } from '../types.js';

const logger = createSafeLogger('InboxMonitor.SEO');

const DOMAIN_RE = /\b((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})\b/i;

function extractField(body: string, names: string[]): string | null {
  for (const name of names) {
    const re = new RegExp(`^\\s*${name}\\s*[:\\-]\\s*(.+)$`, 'im');
    const m = body.match(re);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

function parseKeywords(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\n]/)
    .map((k) => k.trim())
    .filter((k) => k.length > 0)
    .slice(0, 8);
}

function firstDomain(text: string): string | null {
  const m = text.match(DOMAIN_RE);
  return m ? m[1].toLowerCase() : null;
}

export async function runSEOPipeline(email: IncomingEmail): Promise<PipelineResult> {
  const body = `${email.subject}\n${email.bodyText}`;

  const explicitDomain = extractField(email.bodyText, ['Domain', 'Target Domain', 'Site', 'Website', 'URL']);
  const explicitKeywords = parseKeywords(
    extractField(email.bodyText, ['Keywords', 'Keyword', 'Targets', 'Anchor Terms']),
  );
  const explicitClient = extractField(email.bodyText, ['Client', 'Brand', 'Company']);
  const explicitIndustry = extractField(email.bodyText, ['Industry', 'Vertical', 'Niche']);
  const explicitLocale = extractField(email.bodyText, ['Locale', 'Country', 'Region']);

  const domain = explicitDomain ?? firstDomain(body);
  let keywords = explicitKeywords;
  if (keywords.length === 0) {
    // Fallback: comma-separated subject after a colon.
    const subjAfterColon = email.subject.split(':').slice(1).join(':');
    keywords = parseKeywords(subjAfterColon || email.subject);
  }

  if (!domain) {
    return {
      success: false,
      summary: 'Could not find a target domain in the email — add a "Domain:" line and resend.',
      error: 'no domain detected',
    };
  }
  if (keywords.length === 0) {
    return {
      success: false,
      summary: 'Could not find any keywords — add a "Keywords:" line (comma separated) and resend.',
      error: 'no keywords detected',
    };
  }

  try {
    const { taskId } = dispatchBacklinkCampaign(
      {
        targetDomain: domain.replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
        keywords,
        clientName: explicitClient ?? email.fromName ?? undefined,
        industry: explicitIndustry ?? undefined,
        locale: explicitLocale ?? undefined,
      },
      'inbox_monitor',
    );
    const summary = `Backlink campaign queued for ${domain} on ${keywords.length} keyword(s): ${keywords.slice(0, 3).join(', ')}${keywords.length > 3 ? '…' : ''}.`;
    return { success: true, taskId, summary };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`SEO pipeline dispatch failed: ${msg}`);
    return {
      success: false,
      summary: `Could not queue the backlink campaign: ${msg}`,
      error: msg,
    };
  }
}
