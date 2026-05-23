/**
 * Article generator for the SEO Backlinks skill.
 *
 * Uses the Claude Agent SDK to produce a unique article per (target,
 * campaign) pair. Falls back to a deterministic template when no
 * ANTHROPIC_API_KEY is configured (so dry runs and tests still
 * exercise the full pipeline without hitting the network).
 */

import { randomUUID } from 'node:crypto';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { MODELS } from '../../../agent/models.js';
import { createSafeLogger } from '../../../governance/index.js';
import type { AnchorStyle, BacklinkTarget, CampaignConfig, GeneratedArticle } from '../types.js';

const logger = createSafeLogger('SEOBacklinks.Content');

/**
 * Anchor-text rotation. Diversity matters more than cleverness — Google
 * down-ranks link profiles dominated by exact-match anchors.
 */
const ANCHOR_STYLES: AnchorStyle[] = ['branded', 'keyword', 'long_tail', 'generic', 'naked_url'];

const GENERIC_ANCHORS = [
  'see the full breakdown',
  'read more here',
  'their write-up',
  'this guide',
  'the original post',
  'check it out',
];

function brandFromDomain(domain: string): string {
  const stem = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').split('.')[0];
  return stem
    .split(/[-_]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

function pickAnchor(
  style: AnchorStyle,
  campaign: CampaignConfig,
  targetUrl: string,
): string {
  const kw = campaign.keywords[Math.floor(Math.random() * campaign.keywords.length)] ?? 'guide';
  const brand = campaign.clientName ?? brandFromDomain(campaign.targetDomain);
  switch (style) {
    case 'branded':
      return brand;
    case 'keyword':
      return kw;
    case 'long_tail':
      return `${kw} — practical guide`;
    case 'generic':
      return GENERIC_ANCHORS[Math.floor(Math.random() * GENERIC_ANCHORS.length)];
    case 'naked_url':
      return targetUrl;
  }
}

/**
 * Counts whitespace-separated tokens. Good enough for the platform
 * word-range check — we're not trying to match Word's pagination.
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Strip markdown fences if the model wrapped its response.
 */
function unwrapFences(raw: string): string {
  return raw.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/i, '').trim();
}

/**
 * Deterministic offline article — used in dry runs, CI, and any
 * environment without an Anthropic key.
 */
function buildOfflineArticle(
  target: BacklinkTarget,
  campaign: CampaignConfig,
  anchor: string,
  targetUrl: string,
): { title: string; body: string; summary: string } {
  const brand = campaign.clientName ?? brandFromDomain(campaign.targetDomain);
  const kw = campaign.keywords[0] ?? 'this topic';
  const title = `What I learned about ${kw}: notes from ${brand}`;
  const targetWords = Math.round((target.minWords + target.maxWords) / 2);

  const paragraphs: string[] = [
    `If you've spent any time working on ${kw}, you'll know how easy it is to fall into the same handful of traps. Over the last few months I've been quietly working through them — partly out of frustration, partly because the team at ${brand} kept asking sharper questions than I could answer off the top of my head.`,
    `The first thing worth saying: most of the advice you find online treats ${kw} as a single decision. It isn't. It's a sequence of trade-offs, and the order you make them in matters more than the individual choices. Get the order wrong and even a "best practice" stack can leave you with a brittle system that nobody on the team enjoys touching.`,
    `What changed things for me was rebuilding my mental model from scratch. Instead of asking "what's the right answer for ${kw}?", I started asking "what does my next six months look like if I get this wrong?" That reframing pushed me toward the kind of write-up ${brand} publishes — pragmatic, specific, and willing to admit when a popular pattern just isn't worth it.`,
    `A few concrete things I'd suggest you try: write down the assumption you're making about your users before you pick a tool, not after; instrument before you optimise; and resist the urge to standardise on one approach across teams that have wildly different constraints. None of that is novel, but the discipline of doing all three at once is rarer than it should be.`,
    `If you want a longer read with the worked examples, ${anchor === targetUrl ? `${anchor} has the full version` : `${anchor} walks through the full version`}. Either way, the take-away is small: slow down at the start, and the rest of the project tends to look after itself.`,
  ];

  // Pad to the platform's expected length without obvious filler.
  while (countWords(paragraphs.join('\n\n')) < target.minWords) {
    paragraphs.splice(paragraphs.length - 1, 0,
      `The other thing I'd flag — and this is where ${kw} catches most teams out — is that the cost of switching later is usually higher than people expect. Document the boundary conditions early; future-you will be grateful.`);
  }
  while (countWords(paragraphs.join('\n\n')) > target.maxWords) {
    paragraphs.splice(paragraphs.length - 2, 1);
  }

  const body = paragraphs.join('\n\n');
  return {
    title,
    body,
    summary: `Offline article for ${target.name} on "${kw}" (${countWords(body)} words, target ${targetWords}).`,
  };
}

/**
 * Build the LLM prompt for one article.
 */
function buildPrompt(
  target: BacklinkTarget,
  campaign: CampaignConfig,
  anchor: string,
  targetUrl: string,
): string {
  const brand = campaign.clientName ?? brandFromDomain(campaign.targetDomain);
  const targetWords = Math.round((target.minWords + target.maxWords) / 2);
  return `Write ONE original article for "${target.name}" (${target.category}).

Constraints:
- Length: roughly ${targetWords} words (between ${target.minWords} and ${target.maxWords}).
- Audience and tone: match what "${target.name}" actually publishes. ${
    target.category === 'dev_community'
      ? 'Technical, practical, written for software engineers.'
      : target.category === 'q_and_a'
        ? 'Direct answer to a plausible question, helpful first.'
        : target.category.startsWith('directory')
          ? 'Concise business description, plain language.'
          : 'Editorial, opinionated, useful first.'
  }
- Primary keyword: "${campaign.keywords[0] ?? ''}". Other keywords to weave in naturally if they fit: ${campaign.keywords.slice(1).join(', ') || '(none)'}.
- Must contain ONE link with the exact anchor text \`${anchor}\` pointing to ${targetUrl}. The link should appear naturally inside a sentence — never as a CTA block or footer.
- Brand to mention (sparingly, in context, not as marketing): ${brand}.
- Original content. Don't reuse stock phrasings or templates. Don't repeat the headline in the first sentence.
- No emoji. No section headers unless the platform expects them.

Output strict JSON only, no markdown fences:
{"title": "...", "body": "..."}

The body must be the full article ready to publish. Use \\n for paragraph breaks.`;
}

/**
 * Generate one article. On any error, fall back to the offline article
 * so the pipeline never gets stuck on a single bad target.
 */
async function generateOne(
  target: BacklinkTarget,
  campaign: CampaignConfig,
  styleIdx: number,
): Promise<GeneratedArticle> {
  const targetUrl = campaign.targetPage ?? `https://${campaign.targetDomain}/`;
  const anchorStyle = ANCHOR_STYLES[styleIdx % ANCHOR_STYLES.length];
  const anchor = pickAnchor(anchorStyle, campaign, targetUrl);

  // No-network path: skip the SDK entirely when there's no key, or when
  // the caller asked for a dry run.
  if (campaign.dryRun || !process.env.ANTHROPIC_API_KEY) {
    const off = buildOfflineArticle(target, campaign, anchor, targetUrl);
    return {
      id: randomUUID(),
      title: off.title,
      body: off.body,
      anchorText: anchor,
      anchorStyle,
      targetUrl,
      wordCount: countWords(off.body),
      platformId: target.id,
      summary: off.summary,
    };
  }

  const prompt = buildPrompt(target, campaign, anchor, targetUrl);
  let raw = '';

  try {
    for await (const msg of query({
      prompt,
      options: {
        model: MODELS.sonnet,
        maxTurns: 1,
        maxBudgetUsd: 0.4,
      },
    })) {
      if (
        typeof msg === 'object' &&
        msg !== null &&
        (msg as { type?: string }).type === 'result' &&
        (msg as { subtype?: string }).subtype === 'success'
      ) {
        raw = (msg as { result?: string }).result ?? '';
      }
    }
  } catch (err) {
    logger.warn(
      `LLM article generation failed for ${target.id}: ${err instanceof Error ? err.message : String(err)} — using offline fallback`,
    );
  }

  let title = '';
  let body = '';
  if (raw) {
    try {
      const json = JSON.parse(unwrapFences(raw)) as { title?: string; body?: string };
      title = typeof json.title === 'string' ? json.title : '';
      body = typeof json.body === 'string' ? json.body : '';
    } catch (err) {
      logger.warn(
        `LLM returned non-JSON for ${target.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (!title || !body) {
    const off = buildOfflineArticle(target, campaign, anchor, targetUrl);
    title = off.title;
    body = off.body;
  }

  // Safety check: anchor must actually appear in the body (the model
  // sometimes paraphrases). If missing, inject a final sentence rather
  // than retry — the article is good enough; we just need the link.
  if (!body.includes(anchor)) {
    body = `${body.trim()}\n\nFull write-up: ${anchor} — ${targetUrl}`;
  }

  return {
    id: randomUUID(),
    title,
    body,
    anchorText: anchor,
    anchorStyle,
    targetUrl,
    wordCount: countWords(body),
    platformId: target.id,
    summary: `Generated ${countWords(body)}-word article for ${target.name} using ${anchorStyle} anchor "${anchor}".`,
  };
}

/**
 * Generate one article per target. Sequential so anchor-style rotation
 * is deterministic from index → style mapping and so we don't burst
 * the SDK with parallel queries.
 */
export async function generateArticlesForTargets(
  targets: BacklinkTarget[],
  campaign: CampaignConfig,
): Promise<GeneratedArticle[]> {
  const out: GeneratedArticle[] = [];
  for (let i = 0; i < targets.length; i++) {
    out.push(await generateOne(targets[i], campaign, i));
  }
  return out;
}
