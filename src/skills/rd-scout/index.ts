/**
 * R&D Scout Skill Module for BitBit
 *
 * Provides market research capabilities including:
 * - Alibaba/1688 product scanning
 * - Amazon cross-reference for market validation
 * - SEO trend analysis for demand identification
 * - Automated research report generation
 *
 * The R&D Scout skill runs on a schedule (configurable via node-cron)
 * and produces weekly research reports with product opportunities.
 *
 * @module skills/rd-scout
 */

import { createSafeLogger } from '../../governance/index.js';
import { getSkillDefinition } from '../registry.js';

const logger = createSafeLogger('RDScout');
import type { ResearchReport, RDScoutConfig } from './types.js';
import { scheduleWeeklyReport, describeCronSchedule } from './scheduler.js';
import {
  runResearchPipeline as runPipeline,
  DEFAULT_PIPELINE_CONFIG,
  type PipelineConfig,
} from './pipeline.js';

// Re-export types
export type {
  ProductOpportunity,
  SEOTrendData,
  ResearchReport,
  RDScoutConfig,
} from './types.js';

// Re-export scrapers module
export * from './scrapers/index.js';

// Re-export analysis module
export * from './analysis/index.js';

// Re-export trends module (SEO spike detection via DataForSEO)
export * from './trends/index.js';

// Re-export reports module
export * from './reports/index.js';

// Re-export scheduler module
export * from './scheduler.js';

// Re-export pipeline module
export * from './pipeline.js';

/**
 * Default configuration for R&D Scout research pipeline
 *
 * Targets beauty/skincare categories aligned with CheekyGlo's product line.
 */
export const DEFAULT_CONFIG: RDScoutConfig = {
  targetCategories: [
    'skincare',
    'beauty-tools',
    'haircare',
    'nail-care',
    'organic-beauty',
  ],
  maxProductsPerCategory: 20,
  seoKeywords: [
    'glass skin serum',
    'korean skincare',
    'lip oil plumping',
    'scalp massager',
    'gua sha tool',
  ],
  minMarginThreshold: 40,
  maxPrice: 50,
  enabledSources: {
    alibaba: true,
    aliexpress: true,
    amazon: true,
  },
};

/**
 * Initialize R&D Scout skill with scheduled execution
 *
 * Sets up the weekly research report schedule if enabled via environment.
 * Should be called during application startup.
 *
 * Required environment variables:
 * - ENABLE_RD_SCOUT=true - Enables the skill
 * - RD_SCOUT_CLICKUP_TASK_ID - ClickUp task for report delivery
 *
 * Optional environment variables:
 * - RD_SCOUT_CATEGORIES - Comma-separated categories (default: beauty-tools,skincare,haircare)
 * - RD_SCOUT_KEYWORDS - Comma-separated SEO keywords
 * - RD_SCOUT_MAX_PRODUCTS - Max products to process (default: 50)
 * - RD_SCOUT_CRON - Custom cron expression (default: '0 18 * * 0')
 *
 * @returns void - Schedules the task internally
 *
 * @example
 * ```typescript
 * // In main entry point:
 * if (process.env.ENABLE_RD_SCOUT === 'true') {
 *   initRDScout();
 * }
 * ```
 */
export function initRDScout(): void {
  // Check if R&D Scout is enabled
  if (process.env.ENABLE_RD_SCOUT !== 'true') {
    logger.info('Disabled (set ENABLE_RD_SCOUT=true to enable)');
    return;
  }

  // Build configuration from environment
  const config: PipelineConfig = {
    targetCategories: (
      process.env.RD_SCOUT_CATEGORIES ||
      DEFAULT_PIPELINE_CONFIG.targetCategories.join(',')
    ).split(',').map((c) => c.trim()) as PipelineConfig['targetCategories'],

    searchQuery:
      process.env.RD_SCOUT_SEARCH_QUERY ||
      DEFAULT_PIPELINE_CONFIG.searchQuery,

    seoKeywords: (
      process.env.RD_SCOUT_KEYWORDS ||
      DEFAULT_PIPELINE_CONFIG.seoKeywords.join(',')
    ).split(',').map((k) => k.trim()),

    clickupTaskId: process.env.RD_SCOUT_CLICKUP_TASK_ID || undefined,

    maxProducts: parseInt(
      process.env.RD_SCOUT_MAX_PRODUCTS ||
        String(DEFAULT_PIPELINE_CONFIG.maxProducts),
      10
    ),

    minOpportunityScore: parseInt(
      process.env.RD_SCOUT_MIN_SCORE ||
        String(DEFAULT_PIPELINE_CONFIG.minOpportunityScore),
      10
    ),
  };

  // Log configuration
  logger.info('Initializing...');
  logger.info(`Categories: ${config.targetCategories.join(', ')}`);
  logger.info(`SEO Keywords: ${config.seoKeywords.length} tracked`);
  logger.info(`Max Products: ${config.maxProducts}`);
  logger.info(`ClickUp Task: ${config.clickupTaskId || '(not configured)'}`);

  // Schedule the research pipeline
  const schedule = describeCronSchedule(process.env.RD_SCOUT_CRON);
  logger.info(`Schedule: ${schedule}`);

  scheduleWeeklyReport(async () => {
    await runPipeline(config);
  });

  logger.info('Initialized successfully');
}

/**
 * Generate a formatted research report
 *
 * Takes raw research data and produces a human-readable report
 * suitable for stakeholder review or AI analysis.
 *
 * @param report - The research report to format
 * @returns Formatted markdown string
 *
 * @example
 * ```typescript
 * const report = await runResearchPipeline();
 * const markdown = generateReport(report);
 * await writeFile('research-report.md', markdown);
 * ```
 */
export function generateReport(report: ResearchReport): string {
  const lines: string[] = [
    `# R&D Scout Research Report`,
    ``,
    `**Generated:** ${report.generatedAt}`,
    `**Report ID:** ${report.reportId}`,
    ``,
    `## Summary`,
    ``,
    report.summary,
    ``,
    `## Categories Scanned`,
    ``,
    ...report.categoriesScanned.map((c) => `- ${c}`),
    ``,
    `## Product Opportunities (${report.opportunities.length})`,
    ``,
  ];

  if (report.opportunities.length === 0) {
    lines.push('_No opportunities identified in this cycle._');
  } else {
    for (const opp of report.opportunities) {
      lines.push(`### ${opp.title}`);
      lines.push(`- **Price:** $${opp.price.toFixed(2)}`);
      lines.push(`- **Supplier:** ${opp.supplier}`);
      lines.push(`- **Category:** ${opp.category}`);
      lines.push(`- **Estimated Margin:** ${opp.marginEstimate}%`);
      lines.push(`- **Link:** ${opp.url}`);
      lines.push('');
    }
  }

  lines.push(`## SEO Trends (${report.trends.length})`);
  lines.push('');

  if (report.trends.length === 0) {
    lines.push('_No trend data available._');
  } else {
    for (const trend of report.trends) {
      const direction = trend.trendDirection >= 0 ? '+' : '';
      lines.push(`### "${trend.keyword}"`);
      lines.push(`- **Search Volume:** ${trend.searchVolume.toLocaleString()}/month`);
      lines.push(`- **Competition:** ${trend.competition}`);
      lines.push(`- **Trend:** ${direction}${trend.trendDirection}%`);
      lines.push(`- **Spike Detected:** ${trend.spikeDetected ? 'Yes' : 'No'}`);
      lines.push('');
    }
  }

  lines.push(`## Recommendations`);
  lines.push('');
  lines.push(...report.recommendations.map((r) => `- ${r}`));

  if (report.errors && report.errors.length > 0) {
    lines.push('');
    lines.push('## Errors & Limitations');
    lines.push('');
    lines.push(...report.errors.map((e) => `- ${e}`));
  }

  return lines.join('\n');
}

/**
 * Get R&D Scout skill definition from registry
 *
 * Helper function to access the skill's system prompt and configuration.
 *
 * @returns The R&D Scout skill definition
 */
export function getRDScoutDefinition() {
  return getSkillDefinition('rd_scout');
}
