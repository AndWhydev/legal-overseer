/**
 * SEO Backlinks skill — public surface.
 *
 * Off-site SEO for any client domain. The skill:
 *   - Picks high-quality submission platforms from a curated registry
 *     (dev blogs, Q&A sites, AU directories, industry directories).
 *   - Generates one unique article per platform with a natural backlink
 *     to the target page.
 *   - Submits via API where available (e.g. dev.to), queues web-form +
 *     manual platforms with prepared payloads.
 *   - Persists every placement to the `backlinks` table.
 *   - Emits a weekly markdown report summarising new links, anchor mix,
 *     and category breakdown.
 *
 * Wiring:
 *   - Registered in src/skills/registry.ts as 'seo_backlinks'.
 *   - The processor (src/agent/processor.ts) special-cases the skill
 *     to run the pipeline directly with structured input rather than
 *     going through the SDK query() loop.
 *   - The overseer can dispatch backlink work by inserting a task with
 *     skill_id='seo_backlinks' and input_json={domain,keywords,...}.
 *   - The cron scheduler walks every active campaign weekly.
 *
 * Init via initSEOBacklinks() — gated on ENABLE_SEO_BACKLINKS=true.
 */

import { createSafeLogger } from '../../governance/index.js';
import { createTask } from '../../db/repositories/tasks.js';
import { getSkillDefinition } from '../registry.js';
import { scheduleBacklinkJobs } from './scheduler.js';
import type { CampaignConfig } from './types.js';

const logger = createSafeLogger('SEOBacklinks');

// Re-export types so callers don't have to reach into the subdirs.
export type {
  AnchorStyle,
  BacklinkTarget,
  CampaignConfig,
  CampaignRunResult,
  GeneratedArticle,
  SubmissionResult,
  WeeklyBacklinkReport,
} from './types.js';

export {
  BACKLINK_TARGETS,
  getTargetById,
  pickTargetsForCampaign,
} from './targets/index.js';

export { generateArticlesForTargets } from './content/index.js';
export { submitAll, submitArticle } from './submitter/index.js';
export {
  buildWeeklyReport,
  renderReportMarkdown,
} from './report/index.js';

export { runBacklinkCampaign } from './pipeline.js';
export {
  scheduleBacklinkJobs,
  runWeeklyReportNow,
  DEFAULT_CAMPAIGN_CRON,
  DEFAULT_REPORT_CRON,
} from './scheduler.js';

/**
 * Initialize the SEO Backlinks skill: schedule the weekly campaign and
 * report cron jobs. Gated behind ENABLE_SEO_BACKLINKS=true so the
 * standard dev server doesn't make real submissions by accident.
 */
export function initSEOBacklinks(): void {
  if (process.env.ENABLE_SEO_BACKLINKS !== 'true') {
    logger.info('Disabled (set ENABLE_SEO_BACKLINKS=true to enable cron jobs)');
    return;
  }
  logger.info('Initializing scheduled backlink jobs...');
  scheduleBacklinkJobs();
  logger.info('Initialized');
}

/**
 * Get the SEO Backlinks skill definition from the registry.
 */
export function getSEOBacklinksDefinition() {
  return getSkillDefinition('seo_backlinks');
}

/**
 * Enqueue a backlink campaign as a tasks-table row so the running
 * processor will pick it up on its next tick. This is the entry point
 * the overseer (or any orchestrator) should call when it wants to
 * dispatch backlink work — preferred over calling runBacklinkCampaign
 * directly because it goes through governance, audit, and trust scoring.
 *
 * Returns the new task id so callers can correlate logs later.
 */
export function dispatchBacklinkCampaign(
  config: CampaignConfig,
  source = 'overseer',
): { taskId: string } {
  if (!config.targetDomain || !Array.isArray(config.keywords) || config.keywords.length === 0) {
    throw new Error('dispatchBacklinkCampaign requires targetDomain and at least one keyword');
  }
  const inputJson = JSON.stringify({
    skill_id: 'seo_backlinks',
    targetDomain: config.targetDomain,
    targetPage: config.targetPage,
    keywords: config.keywords,
    clientName: config.clientName,
    campaignId: config.campaignId,
    maxPlacements: config.maxPlacements,
    locale: config.locale,
    industry: config.industry,
    dryRun: config.dryRun,
  });
  const task = createTask('seo_backlinks', source, inputJson);
  logger.info(`Dispatched backlink campaign task ${task.id} for ${config.targetDomain}`);
  return { taskId: task.id };
}
