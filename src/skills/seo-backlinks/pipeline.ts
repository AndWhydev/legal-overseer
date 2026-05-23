/**
 * Campaign pipeline for the SEO Backlinks skill.
 *
 * One pass = one (target_domain, keywords) campaign run. The pipeline
 * is fault-tolerant: a failure on one platform never aborts the rest.
 *
 * Steps:
 *   1. Resolve or create the campaign row.
 *   2. Discover targets (dedupes against the backlinks table).
 *   3. Generate one article per target (Claude SDK or offline fallback).
 *   4. Submit (API, web_form, or queue manual).
 *   5. Persist every result as a row in `backlinks`.
 *   6. Return a summary the report builder + caller can use.
 */

import { createSafeLogger } from '../../governance/index.js';
import {
  createBacklink,
  createCampaign,
  getCampaign,
  setCampaignStatus,
  type BacklinkCampaign,
} from '../../db/repositories/backlinks.js';
import { generateArticlesForTargets } from './content/index.js';
import { submitAll } from './submitter/index.js';
import { pickTargetsForCampaign } from './targets/index.js';
import type { CampaignConfig, CampaignRunResult } from './types.js';

const logger = createSafeLogger('SEOBacklinks.Pipeline');

function resolveTargetPage(config: CampaignConfig): string {
  if (config.targetPage) return config.targetPage;
  return `https://${config.targetDomain.replace(/^https?:\/\//, '')}/`;
}

function resolveCampaign(config: CampaignConfig): BacklinkCampaign {
  if (config.campaignId) {
    const existing = getCampaign(config.campaignId);
    if (existing) return existing;
    logger.warn(`Campaign id ${config.campaignId} not found — creating a new one.`);
  }
  return createCampaign({
    target_domain: config.targetDomain,
    keywords: config.keywords,
    target_page: resolveTargetPage(config),
    client_name: config.clientName,
    links_planned: config.maxPlacements ?? 6,
  });
}

/**
 * Run one campaign pass.
 */
export async function runBacklinkCampaign(
  config: CampaignConfig,
): Promise<CampaignRunResult> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const errors: string[] = [];

  if (!config.targetDomain || config.keywords.length === 0) {
    throw new Error('runBacklinkCampaign requires targetDomain and at least one keyword');
  }

  const campaign = resolveCampaign(config);
  const targetPage = resolveTargetPage(config);
  logger.info(
    `Campaign ${campaign.id}: ${config.targetDomain} · ${config.keywords.length} keywords · dryRun=${config.dryRun ?? false}`,
  );

  // 1. Discover targets.
  const targets = pickTargetsForCampaign({ ...config, campaignId: campaign.id });
  logger.info(`Selected ${targets.length} target platform(s)`);

  if (targets.length === 0) {
    const finishedAt = new Date().toISOString();
    return {
      campaignId: campaign.id,
      targetDomain: config.targetDomain,
      startedAt,
      finishedAt,
      durationMs: Date.now() - startMs,
      targetsConsidered: 0,
      articlesGenerated: 0,
      submissionsAttempted: 0,
      submissionsLive: 0,
      submissionsQueuedManual: 0,
      errors: ['No new targets available — all known platforms already linked from this domain.'],
      placements: [],
    };
  }

  // 2. Generate articles for the selected targets.
  let articles: Awaited<ReturnType<typeof generateArticlesForTargets>>;
  try {
    articles = await generateArticlesForTargets(targets, { ...config, campaignId: campaign.id });
    logger.info(`Generated ${articles.length} article(s)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Article generation crashed: ${msg}`);
    errors.push(`Article generation: ${msg}`);
    articles = [];
  }

  // Pair article → target by index (generator preserves order).
  const pairs = targets
    .map((t, i) => ({ target: t, article: articles[i] }))
    .filter((p): p is { target: typeof p.target; article: NonNullable<typeof p.article> } =>
      Boolean(p.article),
    );

  // 3. Submit / queue every pair.
  const submissions = await submitAll(pairs, config.dryRun ?? false);

  // 4. Persist each placement as a backlink row.
  const placements: CampaignRunResult['placements'] = [];
  let live = 0;
  let queuedManual = 0;
  for (let i = 0; i < submissions.length; i++) {
    const sub = submissions[i];
    const pair = pairs[i];
    try {
      const row = createBacklink({
        campaign_id: campaign.id,
        url: sub.url,
        anchor_text: pair.article.anchorText,
        target_page: pair.article.targetUrl,
        target_domain: config.targetDomain,
        platform: pair.target.id,
        platform_category: pair.target.category,
        domain_authority_estimate: pair.target.daEstimate,
        status: sub.status,
        submission_method: sub.method,
        article_id: pair.article.id,
        article_title: pair.article.title,
        article_body: pair.article.body,
        submission_response: sub.response,
        error_message: sub.error,
        submitted_at: sub.status === 'planned' ? null : new Date().toISOString(),
      });

      placements.push({
        backlinkId: row.id,
        platform: pair.target.id,
        status: sub.status,
        anchorText: pair.article.anchorText,
        url: sub.url,
      });

      if (sub.status === 'live') live += 1;
      if (sub.method === 'manual_queue') queuedManual += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Persisting backlink for ${pair.target.id} failed: ${msg}`);
      errors.push(`Persist ${pair.target.id}: ${msg}`);
    }
  }

  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - startMs;

  // If the campaign now has more live links than planned, mark it
  // completed so future overseer ticks don't keep dispatching it.
  const refreshed = getCampaign(campaign.id);
  if (refreshed && refreshed.links_planned > 0 && refreshed.links_built >= refreshed.links_planned) {
    setCampaignStatus(campaign.id, 'completed');
  }

  logger.info(
    `Campaign ${campaign.id} finished in ${durationMs}ms — ${placements.length} placements (${live} live, ${queuedManual} manual)`,
  );

  return {
    campaignId: campaign.id,
    targetDomain: config.targetDomain,
    startedAt,
    finishedAt,
    durationMs,
    targetsConsidered: targets.length,
    articlesGenerated: articles.length,
    submissionsAttempted: submissions.length,
    submissionsLive: live,
    submissionsQueuedManual: queuedManual,
    errors,
    placements,
  };
}
