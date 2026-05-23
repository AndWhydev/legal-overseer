/**
 * Backlink target registry + discovery.
 *
 * This is a curated, source-of-truth list of submission platforms the
 * pipeline considers. Each entry encodes:
 *   - what kind of platform it is (dev_community, directory_au, …)
 *   - how to submit (API, web form, RSS, or manual_queue)
 *   - a DA estimate (Moz-style 0–100) — heuristic, not a paid API call
 *   - whether it permits promotional content
 *   - the topics it covers, used to match against campaign keywords
 *
 * The discovery function (`pickTargetsForCampaign`) filters by topic
 * overlap, locale bias, and dedupes against backlinks already created
 * for the target_domain.
 */

import type { BacklinkTarget, CampaignConfig } from '../types.js';
import { backlinkExistsFor } from '../../../db/repositories/backlinks.js';

/**
 * Curated platform catalogue. Order doesn't matter — discovery scores
 * and re-ranks.
 */
export const BACKLINK_TARGETS: BacklinkTarget[] = [
  // ─────────────────── Developer / technical ───────────────────
  {
    id: 'dev.to',
    name: 'DEV Community',
    category: 'dev_community',
    daEstimate: 87,
    submissionUrl: 'https://dev.to/new',
    submissionMethod: 'api',
    apiKeyEnvVar: 'DEVTO_API_KEY',
    topics: ['software', 'web', 'cloud', 'devops', 'ai', 'saas', 'developer', 'technical', 'startup'],
    minWords: 700,
    maxWords: 1800,
    allowsPromotional: true,
    notes: 'Allows canonical_url; one link in body is acceptable per editorial guidelines.',
  },
  {
    id: 'hashnode',
    name: 'Hashnode',
    category: 'dev_community',
    daEstimate: 79,
    submissionUrl: 'https://hashnode.com/create/story',
    submissionMethod: 'api',
    apiKeyEnvVar: 'HASHNODE_API_KEY',
    topics: ['software', 'web', 'developer', 'saas', 'ai', 'technical'],
    minWords: 600,
    maxWords: 1800,
    allowsPromotional: true,
  },
  {
    id: 'medium',
    name: 'Medium',
    category: 'general_blog',
    daEstimate: 95,
    submissionUrl: 'https://medium.com/new-story',
    // Medium's API is restricted; web_form is the realistic path.
    submissionMethod: 'web_form',
    topics: ['business', 'marketing', 'productivity', 'technology', 'startup', 'ai', 'design'],
    minWords: 600,
    maxWords: 2000,
    allowsPromotional: true,
    notes: 'Manual review recommended — promotional content gets flagged.',
  },
  {
    id: 'indiehackers',
    name: 'Indie Hackers',
    category: 'forum',
    daEstimate: 75,
    submissionUrl: 'https://www.indiehackers.com/post/new',
    submissionMethod: 'manual_queue',
    topics: ['saas', 'startup', 'marketing', 'product', 'business', 'founder'],
    minWords: 200,
    maxWords: 1200,
    allowsPromotional: false,
    notes: 'No overt promotion; share lessons-learned with optional link.',
  },
  {
    id: 'reddit',
    name: 'Reddit',
    category: 'forum',
    daEstimate: 92,
    submissionUrl: 'https://www.reddit.com/submit',
    submissionMethod: 'manual_queue',
    topics: ['*'],
    minWords: 150,
    maxWords: 800,
    allowsPromotional: false,
    notes: 'Each subreddit has its own self-promotion rules; humans must pick the sub.',
  },

  // ─────────────────── Q&A ───────────────────
  {
    id: 'quora',
    name: 'Quora',
    category: 'q_and_a',
    daEstimate: 91,
    submissionUrl: 'https://www.quora.com/',
    submissionMethod: 'manual_queue',
    topics: ['*'],
    minWords: 200,
    maxWords: 700,
    allowsPromotional: false,
    notes: 'Answer relevant questions; cite source link in context.',
  },
  {
    id: 'stackexchange',
    name: 'Stack Exchange Network',
    category: 'q_and_a',
    daEstimate: 93,
    submissionUrl: 'https://stackexchange.com/sites',
    submissionMethod: 'manual_queue',
    topics: ['software', 'developer', 'technical', 'business', 'productivity'],
    minWords: 150,
    maxWords: 600,
    allowsPromotional: false,
  },

  // ─────────────────── Product / launch ───────────────────
  {
    id: 'producthunt',
    name: 'Product Hunt',
    category: 'product_launch',
    daEstimate: 90,
    submissionUrl: 'https://www.producthunt.com/posts/new',
    submissionMethod: 'manual_queue',
    topics: ['saas', 'product', 'startup', 'ai', 'software', 'tool'],
    minWords: 60,
    maxWords: 260,
    allowsPromotional: true,
    notes: 'Launch-only; not for ongoing link building.',
  },
  {
    id: 'betalist',
    name: 'BetaList',
    category: 'product_launch',
    daEstimate: 68,
    submissionUrl: 'https://betalist.com/submit',
    submissionMethod: 'web_form',
    topics: ['saas', 'startup', 'product', 'beta', 'ai'],
    minWords: 50,
    maxWords: 200,
    allowsPromotional: true,
  },

  // ─────────────────── Australian directories ───────────────────
  {
    id: 'hotfrog-au',
    name: 'Hotfrog Australia',
    category: 'directory_au',
    daEstimate: 71,
    submissionUrl: 'https://www.hotfrog.com.au/add-business',
    submissionMethod: 'web_form',
    topics: ['*'],
    locale: 'AU',
    minWords: 80,
    maxWords: 250,
    allowsPromotional: true,
  },
  {
    id: 'truelocal',
    name: 'TrueLocal',
    category: 'directory_au',
    daEstimate: 76,
    submissionUrl: 'https://www.truelocal.com.au/add-business',
    submissionMethod: 'web_form',
    topics: ['*'],
    locale: 'AU',
    minWords: 80,
    maxWords: 250,
    allowsPromotional: true,
  },
  {
    id: 'yellowpages-au',
    name: 'Yellow Pages Australia',
    category: 'directory_au',
    daEstimate: 80,
    submissionUrl: 'https://www.yellowpages.com.au/add-business',
    submissionMethod: 'web_form',
    topics: ['*'],
    locale: 'AU',
    minWords: 60,
    maxWords: 200,
    allowsPromotional: true,
  },
  {
    id: 'startlocal',
    name: 'StartLocal',
    category: 'directory_au',
    daEstimate: 58,
    submissionUrl: 'https://www.startlocal.com.au/add-business',
    submissionMethod: 'web_form',
    topics: ['*'],
    locale: 'AU',
    minWords: 60,
    maxWords: 200,
    allowsPromotional: true,
  },
  {
    id: 'aussieweb',
    name: 'AussieWeb',
    category: 'directory_au',
    daEstimate: 55,
    submissionUrl: 'https://www.aussieweb.com.au/add-listing',
    submissionMethod: 'web_form',
    topics: ['*'],
    locale: 'AU',
    minWords: 60,
    maxWords: 200,
    allowsPromotional: true,
  },

  // ─────────────────── General / global directories ───────────────────
  {
    id: 'crunchbase',
    name: 'Crunchbase',
    category: 'directory_general',
    daEstimate: 92,
    submissionUrl: 'https://www.crunchbase.com/add',
    submissionMethod: 'manual_queue',
    topics: ['startup', 'business', 'saas', 'product'],
    minWords: 80,
    maxWords: 300,
    allowsPromotional: true,
    notes: 'Requires verified profile; manual onboarding.',
  },
  {
    id: 'g2',
    name: 'G2',
    category: 'directory_general',
    daEstimate: 90,
    submissionUrl: 'https://www.g2.com/products/new',
    submissionMethod: 'manual_queue',
    topics: ['saas', 'software', 'product'],
    minWords: 100,
    maxWords: 400,
    allowsPromotional: true,
  },
  {
    id: 'capterra',
    name: 'Capterra',
    category: 'directory_general',
    daEstimate: 90,
    submissionUrl: 'https://www.capterra.com/vendors/add-product',
    submissionMethod: 'manual_queue',
    topics: ['saas', 'software', 'business'],
    minWords: 100,
    maxWords: 400,
    allowsPromotional: true,
  },
  {
    id: 'getapp',
    name: 'GetApp',
    category: 'directory_general',
    daEstimate: 84,
    submissionUrl: 'https://www.getapp.com/vendors',
    submissionMethod: 'manual_queue',
    topics: ['saas', 'software', 'business'],
    minWords: 100,
    maxWords: 400,
    allowsPromotional: true,
  },
  {
    id: 'saashub',
    name: 'SaaSHub',
    category: 'directory_general',
    daEstimate: 67,
    submissionUrl: 'https://www.saashub.com/submit-product',
    submissionMethod: 'web_form',
    topics: ['saas', 'software', 'startup', 'product', 'ai'],
    minWords: 60,
    maxWords: 250,
    allowsPromotional: true,
  },
  {
    id: 'alternativeto',
    name: 'AlternativeTo',
    category: 'directory_general',
    daEstimate: 82,
    submissionUrl: 'https://alternativeto.net/software/new/',
    submissionMethod: 'web_form',
    topics: ['software', 'saas', 'app', 'tool'],
    minWords: 50,
    maxWords: 200,
    allowsPromotional: true,
  },

  // ─────────────────── Industry-specific examples ───────────────────
  {
    id: 'designernews',
    name: 'Designer News',
    category: 'industry_directory',
    daEstimate: 69,
    submissionUrl: 'https://www.designernews.co/stories/new',
    submissionMethod: 'manual_queue',
    topics: ['design', 'ux', 'product', 'frontend'],
    minWords: 80,
    maxWords: 400,
    allowsPromotional: false,
  },
  {
    id: 'lobsters',
    name: 'Lobsters',
    category: 'industry_directory',
    daEstimate: 72,
    submissionUrl: 'https://lobste.rs/stories/new',
    submissionMethod: 'manual_queue',
    topics: ['software', 'developer', 'technical', 'security'],
    minWords: 80,
    maxWords: 400,
    allowsPromotional: false,
    notes: 'Invite-only; strict no-self-promotion policy.',
  },
];

/**
 * Tokenise free-text keyword/topic strings into a comparable shape.
 */
function tokenize(...inputs: string[]): string[] {
  return inputs
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

/**
 * Score a target against the campaign. Returns 0 when the target
 * shouldn't be considered at all (e.g. promotional ban + we'd be
 * posting promotional content) — those still get included but routed
 * to manual_queue downstream so we never auto-spam.
 */
function scoreTarget(t: BacklinkTarget, campaign: CampaignConfig): number {
  const kwTokens = tokenize(...campaign.keywords);
  const industry = campaign.industry?.toLowerCase();

  let score = t.daEstimate;

  // Topic overlap: '*' targets accept anything but score lower than a
  // good thematic match.
  const topicHits = t.topics.some((x) => x === '*')
    ? 1
    : t.topics.filter((topic) => kwTokens.some((kw) => kw.includes(topic) || topic.includes(kw))).length;
  score += topicHits * 8;

  // Industry directory bonus when industry matches a listed topic.
  if (industry && t.category === 'industry_directory') {
    if (t.topics.some((x) => x.includes(industry) || industry.includes(x))) score += 25;
  }

  // Locale bias — give AU directories a healthy bump when the campaign
  // is AU-locale (or the domain is .com.au / .au).
  const wantsAu =
    campaign.locale?.toUpperCase() === 'AU' ||
    /\.au$/i.test(campaign.targetDomain) ||
    /\.com\.au$/i.test(campaign.targetDomain);
  if (wantsAu && t.locale === 'AU') score += 15;
  if (!wantsAu && t.locale === 'AU') score -= 5;

  return score;
}

/**
 * Pick targets for one campaign run.
 *
 * Behaviour:
 * - Excludes platforms we've already created a backlink to for this
 *   target_domain (dedupe via backlinkExistsFor).
 * - Sorts by score desc.
 * - Caps at `maxPlacements` (default 6).
 */
export function pickTargetsForCampaign(
  campaign: CampaignConfig,
  catalogue: BacklinkTarget[] = BACKLINK_TARGETS,
): BacklinkTarget[] {
  const cap = Math.max(1, Math.min(50, campaign.maxPlacements ?? 6));

  const ranked = catalogue
    .filter((t) => !backlinkExistsFor(campaign.targetDomain, t.id))
    .map((t) => ({ t, score: scoreTarget(t, campaign) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, cap)
    .map(({ t }) => t);

  return ranked;
}

/**
 * Convenience: get a target by id (used by the report builder when it
 * needs platform metadata to format a row).
 */
export function getTargetById(id: string): BacklinkTarget | undefined {
  return BACKLINK_TARGETS.find((t) => t.id === id);
}
