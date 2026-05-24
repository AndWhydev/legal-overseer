/**
 * Migration 011: Track processed inbox messages.
 *
 * The inbox-monitor module polls multiple IMAP accounts. Mark-as-Seen
 * on the IMAP server alone isn't enough — a transient error can leave
 * a message in an inconsistent state, and we want a local record so we
 * can:
 *   - Skip messages we've already routed (idempotent restart).
 *   - Correlate emails to the tasks/projects they spawned.
 *   - Show a per-inbox audit trail in the dashboard.
 *
 * Uniqueness key is (inbox_type, message_id). Message-Id is set by the
 * sending MTA and is globally unique; falling back to IMAP UID + inbox
 * email when Message-Id is missing.
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../init.js';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('Migration');

export const migration: Migration = {
  name: '011_processed_emails',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE processed_emails (
        id TEXT PRIMARY KEY,
        inbox_type TEXT NOT NULL
          CHECK (inbox_type IN (
            'legal_intake', 'client', 'court', 'internal'
          )),
        inbox_address TEXT NOT NULL,
        imap_uid INTEGER NOT NULL,
        message_id TEXT NOT NULL,
        from_address TEXT NOT NULL,
        from_name TEXT,
        subject TEXT,
        received_at DATETIME NOT NULL,
        attachment_count INTEGER NOT NULL DEFAULT 0,
        attachments_dir TEXT,
        routed_task_id TEXT,
        routed_matter_id TEXT,
        status TEXT NOT NULL DEFAULT 'routed'
          CHECK (status IN ('routed', 'failed', 'skipped')),
        error_message TEXT,
        reply_sent INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(
      `CREATE UNIQUE INDEX idx_processed_emails_dedupe
       ON processed_emails(inbox_type, message_id)`,
    );
    db.exec(`CREATE INDEX idx_processed_emails_inbox ON processed_emails(inbox_type)`);
    db.exec(`CREATE INDEX idx_processed_emails_status ON processed_emails(status)`);
    db.exec(`CREATE INDEX idx_processed_emails_received ON processed_emails(received_at)`);
    db.exec(`CREATE INDEX idx_processed_emails_task ON processed_emails(routed_task_id)`);
    db.exec(`CREATE INDEX idx_processed_emails_matter ON processed_emails(routed_matter_id)`);

    logger.info('Created table: processed_emails');
  },
};
