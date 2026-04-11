/**
 * Migration 005: Invoices Table
 *
 * Creates the invoices table for tracking processed invoices.
 * Used by Ops Officer for:
 * - Duplicate detection (same vendor, similar amount, recent)
 * - Historical average calculations
 * - Audit trail of all processed invoices
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../init.js';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('Migration');

export const migration: Migration = {
  name: '005_invoices_table',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE invoices (
        id TEXT PRIMARY KEY,
        supplier_id TEXT NOT NULL REFERENCES suppliers(id),
        email_id TEXT,
        invoice_number TEXT NOT NULL,
        invoice_date TEXT NOT NULL,
        due_date TEXT,
        subtotal REAL NOT NULL,
        gst REAL,
        total REAL NOT NULL,
        currency TEXT DEFAULT 'AUD',
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
        approval_id TEXT REFERENCES approvals(id),
        xero_invoice_id TEXT,
        confidence_score INTEGER,
        extraction_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`CREATE INDEX idx_invoices_supplier ON invoices(supplier_id)`);
    db.exec(`CREATE INDEX idx_invoices_date ON invoices(invoice_date)`);
    db.exec(`CREATE INDEX idx_invoices_status ON invoices(status)`);
    db.exec(`CREATE INDEX idx_invoices_number ON invoices(invoice_number)`);

    logger.info('Created table: invoices');
  },
};
