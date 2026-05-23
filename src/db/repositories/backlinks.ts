/**
 * Backlinks + campaigns repository.
 *
 * Access layer for the two tables added in migration 010. Campaigns
 * group every (target_domain, keywords) chase; backlinks are the
 * individual placements we plan, submit, or verify as live.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../connection.js';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('BacklinkRepo');

export type BacklinkStatus = 'planned' | 'submitted' | 'live' | 'rejected' | 'dead';
export type CampaignStatus = 'active' | 'paused' | 'completed';
export type SubmissionMethod = 'api' | 'web_form' | 'manual_queue' | 'rss';

export interface BacklinkCampaign {
  id: string;
  target_domain: string;
  target_page: string | null;
  /** Comma-separated keyword list */
  keywords: string;
  client_name: string | null;
  status: CampaignStatus;
  links_built: number;
  links_planned: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Backlink {
  id: string;
  campaign_id: string | null;
  url: string;
  anchor_text: string;
  target_page: string;
  target_domain: string;
  platform: string;
  platform_category: string | null;
  domain_authority_estimate: number;
  status: BacklinkStatus;
  submission_method: SubmissionMethod | null;
  article_id: string | null;
  article_title: string | null;
  article_body: string | null;
  submission_response: string | null;
  error_message: string | null;
  created_at: string;
  submitted_at: string | null;
  verified_at: string | null;
}

export interface CreateCampaignInput {
  target_domain: string;
  keywords: string[];
  target_page?: string;
  client_name?: string;
  notes?: string;
  links_planned?: number;
}

export function createCampaign(input: CreateCampaignInput): BacklinkCampaign {
  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  const keywords = input.keywords.map((k) => k.trim()).filter(Boolean).join(',');

  db.prepare(
    `
    INSERT INTO backlink_campaigns (
      id, target_domain, target_page, keywords, client_name,
      status, links_built, links_planned, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'active', 0, ?, ?, ?, ?)
    `,
  ).run(
    id,
    input.target_domain,
    input.target_page ?? null,
    keywords,
    input.client_name ?? null,
    input.links_planned ?? 0,
    input.notes ?? null,
    now,
    now,
  );

  logger.info(`Campaign created: ${id} (${input.target_domain}, ${input.keywords.length} keywords)`);
  return {
    id,
    target_domain: input.target_domain,
    target_page: input.target_page ?? null,
    keywords,
    client_name: input.client_name ?? null,
    status: 'active',
    links_built: 0,
    links_planned: input.links_planned ?? 0,
    notes: input.notes ?? null,
    created_at: now,
    updated_at: now,
  };
}

export function getCampaign(id: string): BacklinkCampaign | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM backlink_campaigns WHERE id = ?').get(id) as
    | BacklinkCampaign
    | undefined;
  return row ?? null;
}

export function listActiveCampaigns(): BacklinkCampaign[] {
  const db = getDatabase();
  return db
    .prepare(`SELECT * FROM backlink_campaigns WHERE status = 'active' ORDER BY created_at DESC`)
    .all() as BacklinkCampaign[];
}

export function setCampaignStatus(id: string, status: CampaignStatus): void {
  const db = getDatabase();
  db.prepare(
    `UPDATE backlink_campaigns SET status = ?, updated_at = ? WHERE id = ?`,
  ).run(status, new Date().toISOString(), id);
}

export interface CreateBacklinkInput {
  campaign_id?: string | null;
  url: string;
  anchor_text: string;
  target_page: string;
  target_domain: string;
  platform: string;
  platform_category?: string | null;
  domain_authority_estimate: number;
  status?: BacklinkStatus;
  submission_method?: SubmissionMethod | null;
  article_id?: string | null;
  article_title?: string | null;
  article_body?: string | null;
  submission_response?: string | null;
  error_message?: string | null;
  submitted_at?: string | null;
}

export function createBacklink(input: CreateBacklinkInput): Backlink {
  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  const status = input.status ?? 'planned';
  const da = Math.max(0, Math.min(100, Math.round(input.domain_authority_estimate)));

  db.prepare(
    `
    INSERT INTO backlinks (
      id, campaign_id, url, anchor_text, target_page, target_domain,
      platform, platform_category, domain_authority_estimate, status,
      submission_method, article_id, article_title, article_body,
      submission_response, error_message, created_at, submitted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    input.campaign_id ?? null,
    input.url,
    input.anchor_text,
    input.target_page,
    input.target_domain,
    input.platform,
    input.platform_category ?? null,
    da,
    status,
    input.submission_method ?? null,
    input.article_id ?? null,
    input.article_title ?? null,
    input.article_body ?? null,
    input.submission_response ?? null,
    input.error_message ?? null,
    now,
    input.submitted_at ?? null,
  );

  // Keep links_built in sync — only count live links toward the campaign total.
  if (input.campaign_id && status === 'live') {
    db.prepare(
      `UPDATE backlink_campaigns SET links_built = links_built + 1, updated_at = ? WHERE id = ?`,
    ).run(now, input.campaign_id);
  }

  return {
    id,
    campaign_id: input.campaign_id ?? null,
    url: input.url,
    anchor_text: input.anchor_text,
    target_page: input.target_page,
    target_domain: input.target_domain,
    platform: input.platform,
    platform_category: input.platform_category ?? null,
    domain_authority_estimate: da,
    status,
    submission_method: input.submission_method ?? null,
    article_id: input.article_id ?? null,
    article_title: input.article_title ?? null,
    article_body: input.article_body ?? null,
    submission_response: input.submission_response ?? null,
    error_message: input.error_message ?? null,
    created_at: now,
    submitted_at: input.submitted_at ?? null,
    verified_at: null,
  };
}

export function updateBacklinkStatus(
  id: string,
  status: BacklinkStatus,
  extras: {
    submission_response?: string;
    error_message?: string;
    submitted_at?: string;
    verified_at?: string;
  } = {},
): void {
  const db = getDatabase();
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    const current = db.prepare(`SELECT campaign_id, status FROM backlinks WHERE id = ?`).get(id) as
      | { campaign_id: string | null; status: BacklinkStatus }
      | undefined;

    db.prepare(
      `
      UPDATE backlinks SET
        status = ?,
        submission_response = COALESCE(?, submission_response),
        error_message = COALESCE(?, error_message),
        submitted_at = COALESCE(?, submitted_at),
        verified_at = COALESCE(?, verified_at)
      WHERE id = ?
      `,
    ).run(
      status,
      extras.submission_response ?? null,
      extras.error_message ?? null,
      extras.submitted_at ?? null,
      extras.verified_at ?? null,
      id,
    );

    // Move the counter when the link crosses the live boundary in either direction.
    if (current && current.campaign_id) {
      const wasLive = current.status === 'live';
      const isLive = status === 'live';
      if (!wasLive && isLive) {
        db.prepare(
          `UPDATE backlink_campaigns SET links_built = links_built + 1, updated_at = ? WHERE id = ?`,
        ).run(now, current.campaign_id);
      } else if (wasLive && !isLive) {
        db.prepare(
          `UPDATE backlink_campaigns SET links_built = MAX(0, links_built - 1), updated_at = ? WHERE id = ?`,
        ).run(now, current.campaign_id);
      }
    }
  });
  tx();
}

/**
 * Has any backlink for (target_domain, platform) already been recorded?
 * Used by the pipeline to avoid resubmitting the same article to the
 * same directory twice.
 */
export function backlinkExistsFor(targetDomain: string, platform: string): boolean {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT 1 AS n FROM backlinks WHERE target_domain = ? AND platform = ? LIMIT 1`,
    )
    .get(targetDomain, platform) as { n: number } | undefined;
  return Boolean(row);
}

export function listBacklinksForCampaign(campaignId: string): Backlink[] {
  const db = getDatabase();
  return db
    .prepare(`SELECT * FROM backlinks WHERE campaign_id = ? ORDER BY created_at DESC`)
    .all(campaignId) as Backlink[];
}

export function listRecentBacklinks(sinceHours: number, targetDomain?: string): Backlink[] {
  const db = getDatabase();
  if (targetDomain) {
    return db
      .prepare(
        `SELECT * FROM backlinks
         WHERE created_at > datetime('now', '-' || ? || ' hours')
           AND target_domain = ?
         ORDER BY created_at DESC`,
      )
      .all(sinceHours, targetDomain) as Backlink[];
  }
  return db
    .prepare(
      `SELECT * FROM backlinks
       WHERE created_at > datetime('now', '-' || ? || ' hours')
       ORDER BY created_at DESC`,
    )
    .all(sinceHours) as Backlink[];
}

export interface BacklinkTotals {
  total: number;
  live: number;
  submitted: number;
  planned: number;
  rejected: number;
  dead: number;
}

export function getBacklinkTotals(targetDomain?: string): BacklinkTotals {
  const db = getDatabase();
  const where = targetDomain ? `WHERE target_domain = ?` : '';
  const params = targetDomain ? [targetDomain] : [];

  const row = db
    .prepare(
      `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'live' THEN 1 ELSE 0 END) AS live,
        SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) AS submitted,
        SUM(CASE WHEN status = 'planned' THEN 1 ELSE 0 END) AS planned,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
        SUM(CASE WHEN status = 'dead' THEN 1 ELSE 0 END) AS dead
      FROM backlinks ${where}
      `,
    )
    .get(...params) as Record<keyof BacklinkTotals, number | null>;

  return {
    total: row.total ?? 0,
    live: row.live ?? 0,
    submitted: row.submitted ?? 0,
    planned: row.planned ?? 0,
    rejected: row.rejected ?? 0,
    dead: row.dead ?? 0,
  };
}

export interface AnchorTextStat {
  anchor_text: string;
  count: number;
  live_count: number;
  avg_da: number;
}

/**
 * Top anchor texts by live placements (then total). Used by the weekly
 * report's "top performing anchors" section.
 */
export function getTopAnchorTexts(
  sinceHours: number,
  limit: number,
  targetDomain?: string,
): AnchorTextStat[] {
  const db = getDatabase();
  const domainClause = targetDomain ? 'AND target_domain = ?' : '';
  const params: unknown[] = [sinceHours];
  if (targetDomain) params.push(targetDomain);
  params.push(limit);

  return db
    .prepare(
      `
      SELECT
        anchor_text,
        COUNT(*) AS count,
        SUM(CASE WHEN status = 'live' THEN 1 ELSE 0 END) AS live_count,
        AVG(domain_authority_estimate) AS avg_da
      FROM backlinks
      WHERE created_at > datetime('now', '-' || ? || ' hours')
        ${domainClause}
      GROUP BY anchor_text
      ORDER BY live_count DESC, count DESC, avg_da DESC
      LIMIT ?
      `,
    )
    .all(...params) as AnchorTextStat[];
}
