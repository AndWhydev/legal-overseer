/**
 * Weekly backlink report builder.
 *
 * Pure data assembly + a markdown formatter. The output is the
 * `WeeklyBacklinkReport` struct plus a markdown blob suitable for
 * emailing or pasting into a doc.
 *
 * The "weekly" window is the last 168h by default — callers can pass
 * a different windowHours value when they need a daily/monthly view.
 */

import { randomUUID } from 'node:crypto';
import {
  getBacklinkTotals,
  getTopAnchorTexts,
  listRecentBacklinks,
} from '../../../db/repositories/backlinks.js';
import { getTargetById } from '../targets/index.js';
import type { WeeklyBacklinkReport } from '../types.js';

const WEEK_HOURS = 168;

export interface BuildReportOptions {
  windowHours?: number;
  targetDomain?: string;
  topAnchorLimit?: number;
  recentPlacementsLimit?: number;
}

/**
 * Aggregate the report data straight from the backlinks table. No
 * external dependencies — same SQLite that the pipeline writes into.
 */
export function buildWeeklyReport(options: BuildReportOptions = {}): WeeklyBacklinkReport {
  const windowHours = options.windowHours ?? WEEK_HOURS;
  const targetDomain = options.targetDomain;
  const topAnchorLimit = options.topAnchorLimit ?? 10;
  const recentPlacementsLimit = options.recentPlacementsLimit ?? 25;

  const recent = listRecentBacklinks(windowHours, targetDomain);
  const totals = getBacklinkTotals(targetDomain);
  const lifetime = getBacklinkTotals();

  // Per-category rollup over the window.
  const categoryMap = new Map<string, { count: number; liveCount: number }>();
  for (const r of recent) {
    const target = getTargetById(r.platform);
    const category = target?.category ?? r.platform_category ?? 'unknown';
    const slot = categoryMap.get(category) ?? { count: 0, liveCount: 0 };
    slot.count += 1;
    if (r.status === 'live') slot.liveCount += 1;
    categoryMap.set(category, slot);
  }

  const topAnchors = getTopAnchorTexts(windowHours, topAnchorLimit, targetDomain).map((row) => ({
    anchorText: row.anchor_text,
    count: row.count,
    liveCount: row.live_count,
    avgDa: Math.round(row.avg_da ?? 0),
  }));

  const newLive = recent.filter((r) => r.status === 'live').length;

  const summary = [
    `${recent.length} new links recorded in the last ${windowHours}h (${newLive} live).`,
    `Lifetime totals: ${lifetime.live} live / ${lifetime.total} total across all campaigns.`,
    topAnchors[0]
      ? `Top anchor this period: "${topAnchors[0].anchorText}" (${topAnchors[0].liveCount} live).`
      : 'No anchor placements this period.',
  ].join(' ');

  return {
    reportId: `BL-${Date.now()}-${randomUUID().slice(0, 8)}`,
    generatedAt: new Date().toISOString(),
    windowHours,
    targetDomain,
    newLinks: recent.length,
    newLiveLinks: newLive,
    totalLifetimeLinks: lifetime.total,
    totalLifetimeLiveLinks: lifetime.live,
    topAnchorTexts: topAnchors,
    byPlatformCategory: Array.from(categoryMap.entries())
      .map(([category, v]) => ({ category, count: v.count, liveCount: v.liveCount }))
      .sort((a, b) => b.liveCount - a.liveCount || b.count - a.count),
    recentPlacements: recent.slice(0, recentPlacementsLimit).map((r) => ({
      platform: r.platform,
      anchorText: r.anchor_text,
      status: r.status,
      daEstimate: r.domain_authority_estimate,
      createdAt: r.created_at,
      url: r.url,
    })),
    summary,
  };
}

/**
 * Render the report as markdown. Intentionally plain — easy to email,
 * easy to paste into a Notion/Confluence doc, easy to diff.
 */
export function renderReportMarkdown(report: WeeklyBacklinkReport): string {
  const lines: string[] = [];
  lines.push(`# Weekly Backlink Report`);
  lines.push('');
  lines.push(`- **Report ID:** ${report.reportId}`);
  lines.push(`- **Generated:** ${report.generatedAt}`);
  lines.push(`- **Window:** last ${report.windowHours}h`);
  if (report.targetDomain) lines.push(`- **Target domain:** ${report.targetDomain}`);
  lines.push('');
  lines.push(`## Summary`);
  lines.push('');
  lines.push(report.summary);
  lines.push('');
  lines.push(`## Totals`);
  lines.push('');
  lines.push(`| Metric | Window | Lifetime |`);
  lines.push(`| --- | --- | --- |`);
  lines.push(`| Links recorded | ${report.newLinks} | ${report.totalLifetimeLinks} |`);
  lines.push(`| Live placements | ${report.newLiveLinks} | ${report.totalLifetimeLiveLinks} |`);
  lines.push('');
  lines.push(`## Top anchor texts`);
  lines.push('');
  if (report.topAnchorTexts.length === 0) {
    lines.push('_No anchor placements in this window._');
  } else {
    lines.push(`| Anchor | Total | Live | Avg DA |`);
    lines.push(`| --- | --- | --- | --- |`);
    for (const a of report.topAnchorTexts) {
      lines.push(`| ${a.anchorText} | ${a.count} | ${a.liveCount} | ${a.avgDa} |`);
    }
  }
  lines.push('');
  lines.push(`## By platform category`);
  lines.push('');
  if (report.byPlatformCategory.length === 0) {
    lines.push('_No placements grouped this window._');
  } else {
    lines.push(`| Category | Total | Live |`);
    lines.push(`| --- | --- | --- |`);
    for (const c of report.byPlatformCategory) {
      lines.push(`| ${c.category} | ${c.count} | ${c.liveCount} |`);
    }
  }
  lines.push('');
  lines.push(`## Recent placements`);
  lines.push('');
  if (report.recentPlacements.length === 0) {
    lines.push('_No new placements in window._');
  } else {
    for (const p of report.recentPlacements) {
      lines.push(`- **${p.platform}** [${p.status}] — anchor "${p.anchorText}" (DA ${p.daEstimate}) — ${p.url}`);
    }
  }

  return lines.join('\n');
}
