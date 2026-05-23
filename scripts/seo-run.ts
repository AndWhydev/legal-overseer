/**
 * seo-run.ts — Manually trigger an SEO backlinks campaign.
 *
 * The entry point for the `npm run seo:run` script. Works for any
 * client domain — provide the target domain and one or more keywords
 * and the pipeline picks targets, generates articles, attempts
 * submission (or queues for manual), and writes a weekly report.
 *
 * Usage:
 *   npm run seo:run -- --domain example.com --keywords "cloud hosting,managed kubernetes"
 *   npm run seo:run -- --domain torkay.com.au --keywords "panel beater brisbane" --locale AU
 *   npm run seo:run -- --domain example.com --keywords "x,y" --dry-run --no-report
 *
 * Flags:
 *   --domain <d>          Target domain (required)
 *   --keywords <csv>      Comma-separated keywords (required, at least one)
 *   --target-page <url>   Full URL of the target page (default: https://<domain>/)
 *   --client <name>       Client/brand name to mention in articles
 *   --industry <s>        Industry tag for picking industry directories
 *   --locale <AU|...>     Locale bias (e.g. AU bumps local directories)
 *   --max <n>             Max placements this run (default: 6)
 *   --campaign <id>       Append to an existing campaign instead of creating one
 *   --dry-run             Plan everything but never POST to a third-party host
 *   --no-report           Skip writing the weekly report at the end
 *
 * Exit codes:
 *   0 success (campaign completed, possibly with per-platform notes)
 *   1 fatal error
 *   2 bad arguments
 */

import { initializeDatabase, closeDatabase } from '../src/db/index.js';
import {
  runBacklinkCampaign,
  runWeeklyReportNow,
  type CampaignConfig,
} from '../src/skills/seo-backlinks/index.js';

interface CliArgs {
  domain: string;
  keywords: string[];
  targetPage?: string;
  client?: string;
  industry?: string;
  locale?: string;
  max?: number;
  campaignId?: string;
  dryRun: boolean;
  noReport: boolean;
}

function printUsage(): void {
  console.log(
    [
      'Usage:',
      '  npm run seo:run -- --domain <d> --keywords "<csv>"',
      '',
      'Optional flags:',
      '  --target-page <url>   Full URL of the target page (default: https://<domain>/)',
      '  --client <name>       Client/brand name to weave into articles',
      '  --industry <tag>      Industry tag (e.g. "saas", "design")',
      '  --locale <code>       Locale bias (e.g. AU bumps Australian directories)',
      '  --max <n>             Max placements this run (default 6)',
      '  --campaign <id>       Append to an existing campaign',
      '  --dry-run             Skip outbound submissions; record plan only',
      '  --no-report           Skip writing the weekly report at the end',
    ].join('\n'),
  );
}

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = { dryRun: false, noReport: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--domain') args.domain = argv[++i];
    else if (a === '--keywords') {
      args.keywords = (argv[++i] ?? '')
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
    } else if (a === '--target-page') args.targetPage = argv[++i];
    else if (a === '--client') args.client = argv[++i];
    else if (a === '--industry') args.industry = argv[++i];
    else if (a === '--locale') args.locale = argv[++i];
    else if (a === '--max') {
      const v = Number.parseInt(argv[++i] ?? '', 10);
      if (!Number.isFinite(v) || v <= 0) {
        console.error(`Error: --max must be a positive integer`);
        process.exit(2);
      }
      args.max = v;
    } else if (a === '--campaign') args.campaignId = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--no-report') args.noReport = true;
    else if (a === '--help' || a === '-h') {
      printUsage();
      process.exit(0);
    } else {
      console.error(`Error: unknown argument: ${a}`);
      printUsage();
      process.exit(2);
    }
  }

  if (!args.domain) {
    console.error('Error: --domain is required');
    printUsage();
    process.exit(2);
  }
  if (!args.keywords || args.keywords.length === 0) {
    console.error('Error: --keywords (csv) is required and must include at least one keyword');
    printUsage();
    process.exit(2);
  }

  return args as CliArgs;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  initializeDatabase();

  const config: CampaignConfig = {
    targetDomain: args.domain,
    targetPage: args.targetPage,
    keywords: args.keywords,
    clientName: args.client,
    industry: args.industry,
    locale: args.locale,
    maxPlacements: args.max,
    campaignId: args.campaignId,
    dryRun: args.dryRun,
  };

  console.log('=== SEO Backlinks campaign ===');
  console.log(`domain:    ${config.targetDomain}`);
  console.log(`page:      ${config.targetPage ?? `https://${config.targetDomain}/`}`);
  console.log(`keywords:  ${config.keywords.join(', ')}`);
  if (config.clientName) console.log(`client:    ${config.clientName}`);
  if (config.industry) console.log(`industry:  ${config.industry}`);
  if (config.locale) console.log(`locale:    ${config.locale}`);
  console.log(`max:       ${config.maxPlacements ?? 6}`);
  console.log(`dry-run:   ${config.dryRun ?? false}`);
  console.log('');

  const result = await runBacklinkCampaign(config);

  console.log('=== Campaign result ===');
  console.log(`campaign:        ${result.campaignId}`);
  console.log(`duration:        ${result.durationMs}ms`);
  console.log(`targets:         ${result.targetsConsidered}`);
  console.log(`articles:        ${result.articlesGenerated}`);
  console.log(`submissions:     ${result.submissionsAttempted}`);
  console.log(`live:            ${result.submissionsLive}`);
  console.log(`queued (manual): ${result.submissionsQueuedManual}`);
  console.log(`errors:          ${result.errors.length}`);
  if (result.errors.length > 0) {
    for (const e of result.errors) console.log(`  - ${e}`);
  }
  console.log('');

  console.log('--- placements ---');
  if (result.placements.length === 0) {
    console.log('(none)');
  } else {
    for (const p of result.placements) {
      console.log(`[${p.status.padEnd(9)}] ${p.platform.padEnd(20)} anchor="${p.anchorText}" url=${p.url}`);
    }
  }

  if (!args.noReport) {
    console.log('');
    console.log('--- weekly report ---');
    const { filepath } = await runWeeklyReportNow();
    console.log(`Written: ${filepath}`);
  }

  closeDatabase();
}

main().catch((err) => {
  console.error('Fatal:', err);
  closeDatabase();
  process.exit(1);
});
