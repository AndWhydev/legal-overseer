/**
 * Migration 012: Legal-domain schema.
 *
 * Adds the tables Legal Overseer needs on top of the platform tables
 * inherited from the fork:
 *
 *   - matters         — one row per client engagement; matter_number
 *                       is the firm-facing reference shown on every
 *                       email subject and review queue row.
 *   - deadlines       — limitation periods, court-set dates,
 *                       procedural deadlines, internal SLAs.
 *   - review_queue    — every AI output waiting on a lawyer's
 *                       approval before being sent / filed.
 *   - billing_log     — AI runs and lawyer time logged per matter.
 *   - legal_audit_log — hash-chained immutable record of every
 *                       material action against a matter.
 *   - citations       — flat record of every citation produced and
 *                       its current verification state (so the
 *                       dashboard can show coverage).
 *
 * Conventions:
 *   - id columns are TEXT (uuid v4) to match the rest of the schema.
 *   - timestamps are ISO-8601 strings in TEXT columns when written
 *     from JS, or DATETIME with CURRENT_TIMESTAMP defaults when set
 *     by SQLite.
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../init.js';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('Migration');

export const migration: Migration = {
  name: '012_legal_schema',
  up: (db: Database) => {
    // ============================================================
    // matters — one per client engagement
    // ============================================================
    db.exec(`
      CREATE TABLE matters (
        id TEXT PRIMARY KEY,
        matter_number TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        client_name TEXT NOT NULL,
        client_email TEXT,
        matter_type TEXT NOT NULL,
        jurisdiction TEXT NOT NULL DEFAULT 'NSW',
        responsible_lawyer_email TEXT,
        opposing_party TEXT,
        opposing_solicitor TEXT,
        status TEXT NOT NULL DEFAULT 'open'
          CHECK (status IN ('open', 'on_hold', 'closed', 'archived')),
        opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        closed_at DATETIME,
        intake_email_id TEXT,
        notes TEXT,
        matter_folder TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.exec(`CREATE INDEX idx_matters_status ON matters(status)`);
    db.exec(`CREATE INDEX idx_matters_lawyer ON matters(responsible_lawyer_email)`);
    db.exec(`CREATE INDEX idx_matters_type ON matters(matter_type)`);
    db.exec(`CREATE INDEX idx_matters_opened ON matters(opened_at)`);
    logger.info('Created table: matters');

    // ============================================================
    // deadlines — limitation periods, court dates, SLAs
    // ============================================================
    db.exec(`
      CREATE TABLE deadlines (
        id TEXT PRIMARY KEY,
        matter_id TEXT NOT NULL,
        deadline_type TEXT NOT NULL
          CHECK (deadline_type IN ('limitation', 'court', 'procedural', 'internal_sla', 'client')),
        description TEXT NOT NULL,
        due_date TEXT NOT NULL,
        jurisdiction_basis TEXT,
        consequence_if_missed TEXT,
        recommended_action TEXT,
        reminder_draft TEXT,
        status TEXT NOT NULL DEFAULT 'open'
          CHECK (status IN ('open', 'reminded', 'met', 'missed', 'waived')),
        reminded_at DATETIME,
        resolved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (matter_id) REFERENCES matters(id)
      )
    `);
    db.exec(`CREATE INDEX idx_deadlines_matter ON deadlines(matter_id)`);
    db.exec(`CREATE INDEX idx_deadlines_due ON deadlines(due_date)`);
    db.exec(`CREATE INDEX idx_deadlines_status ON deadlines(status)`);
    db.exec(`
      CREATE UNIQUE INDEX idx_deadlines_dedupe
        ON deadlines(matter_id, deadline_type, description, due_date)
    `);
    logger.info('Created table: deadlines');

    // ============================================================
    // review_queue — every AI output awaiting lawyer approval
    // ============================================================
    db.exec(`
      CREATE TABLE review_queue (
        id TEXT PRIMARY KEY,
        matter_id TEXT,
        matter_number TEXT,
        skill_id TEXT NOT NULL,
        output_kind TEXT NOT NULL
          CHECK (output_kind IN (
            'contract_review', 'research_memo', 'drafted_document',
            'client_email', 'matter_management', 'regulatory_alert'
          )),
        title TEXT NOT NULL,
        body_markdown TEXT NOT NULL,
        metadata_json TEXT,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'rejected', 'sent')),
        reviewed_by TEXT,
        reviewed_at DATETIME,
        review_note TEXT,
        cost_usd REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (matter_id) REFERENCES matters(id)
      )
    `);
    db.exec(`CREATE INDEX idx_review_queue_status ON review_queue(status)`);
    db.exec(`CREATE INDEX idx_review_queue_matter ON review_queue(matter_id)`);
    db.exec(`CREATE INDEX idx_review_queue_kind ON review_queue(output_kind)`);
    db.exec(`CREATE INDEX idx_review_queue_created ON review_queue(created_at)`);
    logger.info('Created table: review_queue');

    // ============================================================
    // billing_log — AI runs and lawyer time
    // ============================================================
    db.exec(`
      CREATE TABLE billing_log (
        id TEXT PRIMARY KEY,
        matter_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('ai_run', 'lawyer_time')),
        actor_id TEXT NOT NULL,
        description TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL CHECK (duration_seconds >= 0),
        cost_usd REAL,
        review_id TEXT,
        task_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (matter_id) REFERENCES matters(id),
        FOREIGN KEY (review_id) REFERENCES review_queue(id)
      )
    `);
    db.exec(`CREATE INDEX idx_billing_matter ON billing_log(matter_id)`);
    db.exec(`CREATE INDEX idx_billing_kind ON billing_log(kind)`);
    db.exec(`CREATE INDEX idx_billing_created ON billing_log(created_at)`);
    logger.info('Created table: billing_log');

    // ============================================================
    // legal_audit_log — append-only, hash-chained
    // ============================================================
    db.exec(`
      CREATE TABLE legal_audit_log (
        id TEXT PRIMARY KEY,
        matter_id TEXT,
        actor_id TEXT NOT NULL,
        action TEXT NOT NULL,
        detail TEXT,
        ref_table TEXT,
        ref_id TEXT,
        model_used TEXT,
        metadata_json TEXT,
        prev_hash TEXT,
        row_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    db.exec(`CREATE INDEX idx_legal_audit_matter ON legal_audit_log(matter_id)`);
    db.exec(`CREATE INDEX idx_legal_audit_action ON legal_audit_log(action)`);
    db.exec(`CREATE INDEX idx_legal_audit_actor ON legal_audit_log(actor_id)`);
    db.exec(`CREATE INDEX idx_legal_audit_created ON legal_audit_log(created_at)`);

    // Enforce append-only via triggers that raise on UPDATE / DELETE.
    db.exec(`
      CREATE TRIGGER trg_legal_audit_no_update
      BEFORE UPDATE ON legal_audit_log
      BEGIN
        SELECT RAISE(FAIL, 'legal_audit_log is append-only');
      END
    `);
    db.exec(`
      CREATE TRIGGER trg_legal_audit_no_delete
      BEFORE DELETE ON legal_audit_log
      BEGIN
        SELECT RAISE(FAIL, 'legal_audit_log is append-only');
      END
    `);
    logger.info('Created table: legal_audit_log (append-only)');

    // ============================================================
    // citations — flat record of every cited authority
    // ============================================================
    db.exec(`
      CREATE TABLE citations (
        id TEXT PRIMARY KEY,
        matter_id TEXT,
        review_id TEXT,
        citation_text TEXT NOT NULL,
        url TEXT,
        verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
        verification_note TEXT,
        verified_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (matter_id) REFERENCES matters(id),
        FOREIGN KEY (review_id) REFERENCES review_queue(id)
      )
    `);
    db.exec(`CREATE INDEX idx_citations_matter ON citations(matter_id)`);
    db.exec(`CREATE INDEX idx_citations_review ON citations(review_id)`);
    db.exec(`CREATE INDEX idx_citations_verified ON citations(verified)`);
    logger.info('Created table: citations');
  },
};
