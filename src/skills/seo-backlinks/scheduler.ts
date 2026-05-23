/**
 * Cron-driven dispatch for the SEO Backlinks skill.
 *
 * Defaults to a weekly schedule that:
 *   1. Walks every active campaign in the database.
 *   2. Runs one campaign pass per campaign (rate-limited).
 *   3. Emits a weekly report into the data directory.
 *
 * The schedule can be overridden via SEO_BACKLINKS_CRON for testing.
 * The weekly report cron is independent so operators can keep the
 * report cadence even when no campaigns are active.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import cron from 'node-cron';
import { createSafeLogger } from '../../governance/index.js';
import { listActiveCampaigns } from '../../db/repositories/backlinks.js';
import { runBacklinkCampaign } from './pipeline.js';
import { buildWeeklyReport, renderReportMarkdown } from './report/index.js';

const logger = createSafeLogger('SEOBacklinks.Scheduler');

/**
 * Default schedule: Monday 06:00 AEST = Sunday 20:00 UTC.
 */
export const DEFAULT_CAMPAIGN_CRON = '0 20 * * 0';

/**
 * Weekly report runs an hour later so it captures all the new links.
 */
export const DEFAULT_REPORT_CRON = '0 21 * * 0';

const DEFAULT_REPORT_DIR =
  process.env.NODE_ENV === 'production' ? '/data/reports' : './data/reports';

export type ScheduledTask = ReturnType<typeof cron.schedule>;

/**
 * Run every active campaign in series. Sequential so we don't burst
 * any platform with parallel submissions from the same operator.
 */
async function runAllActiveCampaigns(): Promise<void> {
  const campaigns = listActiveCampaigns();
  logger.info(`Active campaigns: ${campaigns.length}`);

  for (const c of campaigns) {
    const keywords = c.keywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    try {
      const result = await runBacklinkCampaign({
        targetDomain: c.target_domain,
        targetPage: c.target_page ?? undefined,
        keywords,
        clientName: c.client_name ?? undefined,
        campaignId: c.id,
        maxPlacements: c.links_planned > 0 ? c.links_planned : 6,
      });
      logger.info(
        `Campaign ${c.id}: ${result.placements.length} placements (${result.submissionsLive} live)`,
      );
    } catch (err) {
      logger.error(
        `Campaign ${c.id} crashed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/**
 * Build + write the weekly report to disk.
 */
async function writeWeeklyReport(): Promise<string> {
  const report = buildWeeklyReport();
  const md = renderReportMarkdown(report);

  await mkdir(DEFAULT_REPORT_DIR, { recursive: true });
  const filename = `backlink-weekly-${report.reportId}.md`;
  const filepath = join(DEFAULT_REPORT_DIR, filename);
  await writeFile(filepath, md, 'utf8');
  logger.info(`Weekly report written: ${filepath}`);
  return filepath;
}

/**
 * Schedule the campaign + weekly report cron jobs.
 */
export function scheduleBacklinkJobs(): { campaign: ScheduledTask; report: ScheduledTask } {
  const campaignCron = process.env.SEO_BACKLINKS_CRON || DEFAULT_CAMPAIGN_CRON;
  const reportCron = process.env.SEO_BACKLINKS_REPORT_CRON || DEFAULT_REPORT_CRON;

  if (!cron.validate(campaignCron)) {
    logger.error(`Invalid SEO_BACKLINKS_CRON "${campaignCron}"; using default`);
  }
  if (!cron.validate(reportCron)) {
    logger.error(`Invalid SEO_BACKLINKS_REPORT_CRON "${reportCron}"; using default`);
  }

  const validCampaignCron = cron.validate(campaignCron) ? campaignCron : DEFAULT_CAMPAIGN_CRON;
  const validReportCron = cron.validate(reportCron) ? reportCron : DEFAULT_REPORT_CRON;

  const campaign = cron.schedule(
    validCampaignCron,
    async () => {
      logger.info('Starting scheduled backlink campaign pass...');
      try {
        await runAllActiveCampaigns();
      } catch (err) {
        logger.error(
          `Scheduled campaign pass failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
    { timezone: 'UTC' },
  );

  const report = cron.schedule(
    validReportCron,
    async () => {
      logger.info('Building scheduled weekly backlink report...');
      try {
        await writeWeeklyReport();
      } catch (err) {
        logger.error(
          `Scheduled report failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
    { timezone: 'UTC' },
  );

  logger.info(`Scheduled campaigns "${validCampaignCron}" and report "${validReportCron}" (UTC)`);
  return { campaign, report };
}

/**
 * Run the weekly report immediately (used by the npm seo:run script).
 */
export async function runWeeklyReportNow(): Promise<{ filepath: string; markdown: string }> {
  const report = buildWeeklyReport();
  const md = renderReportMarkdown(report);
  await mkdir(DEFAULT_REPORT_DIR, { recursive: true });
  const filepath = join(DEFAULT_REPORT_DIR, `backlink-weekly-${report.reportId}.md`);
  await writeFile(filepath, md, 'utf8');
  return { filepath, markdown: md };
}
