/**
 * Migration 014: deadline reminder log, conflict-of-interest checks,
 * document templates, weekly-briefing preferences, matter cost
 * estimates, and the precedents library index.
 *
 * Single migration for the back-half of the commercial-features wave
 * so the on-prem upgrade is a single restart for the firm.
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../init.js';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('Migration');

export const migration: Migration = {
  name: '014_reminders_and_conflicts',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE deadline_reminders (
        id TEXT PRIMARY KEY,
        deadline_id TEXT NOT NULL,
        matter_id TEXT NOT NULL,
        offset_days INTEGER NOT NULL,
        sent_to TEXT NOT NULL,
        sent_at TEXT NOT NULL DEFAULT (datetime('now')),
        message_id TEXT,
        snoozed_until TEXT,
        dismissed_at TEXT,
        dismissed_by TEXT,
        FOREIGN KEY (deadline_id) REFERENCES deadlines(id),
        FOREIGN KEY (matter_id) REFERENCES matters(id)
      )
    `);
    db.exec(`CREATE INDEX idx_reminders_deadline ON deadline_reminders(deadline_id)`);
    db.exec(`CREATE INDEX idx_reminders_matter ON deadline_reminders(matter_id)`);
    db.exec(`CREATE INDEX idx_reminders_sent ON deadline_reminders(sent_at)`);
    db.exec(`
      CREATE UNIQUE INDEX idx_reminders_dedupe
        ON deadline_reminders(deadline_id, offset_days)
    `);
    logger.info('Created table: deadline_reminders');

    db.exec(`
      CREATE TABLE conflict_checks (
        id TEXT PRIMARY KEY,
        matter_id TEXT NOT NULL,
        ran_at TEXT NOT NULL DEFAULT (datetime('now')),
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'cleared', 'blocked', 'override')),
        match_count INTEGER NOT NULL DEFAULT 0,
        matches_json TEXT,
        cleared_by TEXT,
        cleared_at TEXT,
        cleared_note TEXT,
        FOREIGN KEY (matter_id) REFERENCES matters(id)
      )
    `);
    db.exec(`CREATE INDEX idx_conflict_matter ON conflict_checks(matter_id)`);
    db.exec(`CREATE INDEX idx_conflict_status ON conflict_checks(status)`);
    logger.info('Created table: conflict_checks');

    db.exec(`
      CREATE TABLE document_templates (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        body_markdown TEXT NOT NULL,
        author_email TEXT,
        source TEXT NOT NULL DEFAULT 'firm'
          CHECK (source IN ('builtin', 'firm')),
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`CREATE INDEX idx_templates_category ON document_templates(category)`);
    db.exec(`CREATE INDEX idx_templates_active ON document_templates(active)`);
    logger.info('Created table: document_templates');

    db.exec(`
      CREATE TABLE document_template_versions (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        body_markdown TEXT NOT NULL,
        change_note TEXT,
        author_email TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (template_id) REFERENCES document_templates(id)
      )
    `);
    db.exec(`
      CREATE UNIQUE INDEX idx_template_versions_unique
        ON document_template_versions(template_id, version)
    `);
    logger.info('Created table: document_template_versions');

    db.exec(`
      CREATE TABLE precedents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        practice_area TEXT,
        matter_type TEXT,
        document_type TEXT,
        body_markdown TEXT NOT NULL,
        source_review_id TEXT,
        source_matter_id TEXT,
        added_by TEXT,
        tags TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`CREATE INDEX idx_precedents_category ON precedents(category)`);
    db.exec(`CREATE INDEX idx_precedents_practice ON precedents(practice_area)`);
    db.exec(`CREATE INDEX idx_precedents_matter_type ON precedents(matter_type)`);
    logger.info('Created table: precedents');

    db.exec(`
      CREATE TABLE matter_cost_estimates (
        id TEXT PRIMARY KEY,
        matter_id TEXT NOT NULL UNIQUE,
        matter_type TEXT NOT NULL,
        complexity TEXT NOT NULL
          CHECK (complexity IN ('simple', 'medium', 'complex')),
        estimated_ai_usd REAL NOT NULL,
        estimated_lawyer_hours REAL NOT NULL,
        currency TEXT NOT NULL DEFAULT 'AUD',
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (matter_id) REFERENCES matters(id)
      )
    `);
    db.exec(`CREATE INDEX idx_estimates_matter ON matter_cost_estimates(matter_id)`);
    logger.info('Created table: matter_cost_estimates');

    db.exec(`
      CREATE TABLE briefing_preferences (
        user_id TEXT PRIMARY KEY,
        weekly_enabled INTEGER NOT NULL DEFAULT 1 CHECK (weekly_enabled IN (0, 1)),
        section_matters INTEGER NOT NULL DEFAULT 1 CHECK (section_matters IN (0, 1)),
        section_deadlines INTEGER NOT NULL DEFAULT 1 CHECK (section_deadlines IN (0, 1)),
        section_overdue INTEGER NOT NULL DEFAULT 1 CHECK (section_overdue IN (0, 1)),
        section_regulatory INTEGER NOT NULL DEFAULT 1 CHECK (section_regulatory IN (0, 1)),
        section_precedents INTEGER NOT NULL DEFAULT 1 CHECK (section_precedents IN (0, 1)),
        practice_areas TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
    logger.info('Created table: briefing_preferences');

    db.exec(`
      CREATE TABLE client_users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'suspended', 'removed')),
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        password_iter INTEGER NOT NULL DEFAULT 200000,
        last_login_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`CREATE INDEX idx_client_users_email ON client_users(email)`);
    logger.info('Created table: client_users');

    db.exec(`
      CREATE TABLE client_user_matters (
        client_user_id TEXT NOT NULL,
        matter_id TEXT NOT NULL,
        granted_by TEXT NOT NULL,
        granted_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (client_user_id, matter_id),
        FOREIGN KEY (client_user_id) REFERENCES client_users(id),
        FOREIGN KEY (matter_id) REFERENCES matters(id)
      )
    `);
    logger.info('Created table: client_user_matters');

    db.exec(`
      CREATE TABLE client_visible_documents (
        document_id TEXT PRIMARY KEY,
        matter_id TEXT NOT NULL,
        granted_by TEXT NOT NULL,
        granted_at TEXT NOT NULL DEFAULT (datetime('now')),
        note TEXT,
        FOREIGN KEY (matter_id) REFERENCES matters(id)
      )
    `);
    db.exec(`CREATE INDEX idx_client_visible_matter ON client_visible_documents(matter_id)`);
    logger.info('Created table: client_visible_documents');

    db.exec(`
      CREATE TABLE share_links (
        token TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        matter_id TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        revoked_at TEXT
      )
    `);
    db.exec(`CREATE INDEX idx_share_links_doc ON share_links(document_id)`);
    db.exec(`CREATE INDEX idx_share_links_expires ON share_links(expires_at)`);
    logger.info('Created table: share_links');

    db.exec(`
      CREATE TABLE client_sessions (
        id TEXT PRIMARY KEY,
        client_user_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        FOREIGN KEY (client_user_id) REFERENCES client_users(id)
      )
    `);
    db.exec(`CREATE INDEX idx_client_sessions_user ON client_sessions(client_user_id)`);
    logger.info('Created table: client_sessions');
  },
};
