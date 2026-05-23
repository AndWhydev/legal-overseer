/**
 * Migration 010: SEO backlinks tracking.
 *
 * Two tables back the seo_backlinks skill:
 *
 * - backlink_campaigns: one row per campaign run (a (domain, keywords) pair
 *   the operator or overseer asked us to chase). Useful for grouping the
 *   weekly report and de-duplicating in-flight work on the same domain.
 *
 * - backlinks: every link we create or queue. Status moves through
 *   {planned → submitted → live → rejected → dead}. The "live" status is
 *   what counts toward the weekly link build total.
 *
 * domain_authority_estimate is an integer 0–100 estimate snapshotted at
 * creation time (refreshed on demand by the report builder). It's an
 * estimate rather than a Moz/Ahrefs DA call so we don't add a paid API
 * dependency to the critical path.
 *
 * Also seeds the seo_backlinks skill row so tasks.skill_id FK is satisfied
 * when the processor enqueues backlink work.
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../init.js';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('Migration');

export const migration: Migration = {
  name: '010_backlinks',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE backlink_campaigns (
        id TEXT PRIMARY KEY,
        target_domain TEXT NOT NULL,
        target_page TEXT,
        keywords TEXT NOT NULL,
        client_name TEXT,
        status TEXT NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'paused', 'completed')),
        links_built INTEGER NOT NULL DEFAULT 0,
        links_planned INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`CREATE INDEX idx_backlink_campaigns_domain ON backlink_campaigns(target_domain)`);
    db.exec(`CREATE INDEX idx_backlink_campaigns_status ON backlink_campaigns(status)`);

    db.exec(`
      CREATE TABLE backlinks (
        id TEXT PRIMARY KEY,
        campaign_id TEXT REFERENCES backlink_campaigns(id),
        url TEXT NOT NULL,
        anchor_text TEXT NOT NULL,
        target_page TEXT NOT NULL,
        target_domain TEXT NOT NULL,
        platform TEXT NOT NULL,
        platform_category TEXT,
        domain_authority_estimate INTEGER NOT NULL DEFAULT 0
          CHECK (domain_authority_estimate BETWEEN 0 AND 100),
        status TEXT NOT NULL DEFAULT 'planned'
          CHECK (status IN ('planned', 'submitted', 'live', 'rejected', 'dead')),
        submission_method TEXT
          CHECK (submission_method IN ('api', 'web_form', 'manual_queue', 'rss', NULL)),
        article_id TEXT,
        article_title TEXT,
        article_body TEXT,
        submission_response TEXT,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        submitted_at DATETIME,
        verified_at DATETIME
      )
    `);

    db.exec(`CREATE INDEX idx_backlinks_campaign ON backlinks(campaign_id)`);
    db.exec(`CREATE INDEX idx_backlinks_domain ON backlinks(target_domain)`);
    db.exec(`CREATE INDEX idx_backlinks_platform ON backlinks(platform)`);
    db.exec(`CREATE INDEX idx_backlinks_status ON backlinks(status)`);
    db.exec(`CREATE INDEX idx_backlinks_created ON backlinks(created_at)`);
    db.exec(`CREATE INDEX idx_backlinks_anchor ON backlinks(anchor_text)`);

    db.exec(`
      INSERT OR IGNORE INTO skills (id, name, version, skill_path, description, enabled)
      VALUES (
        'seo_backlinks',
        'SEO Backlinks',
        '1.0.0',
        'src/skills/seo-backlinks',
        'Off-site SEO: target discovery, article generation, submission, link tracking',
        1
      )
    `);

    logger.info('Created tables: backlink_campaigns, backlinks; seeded skill seo_backlinks');
  },
};
