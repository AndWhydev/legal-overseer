/**
 * Migration 003: Domain Tables
 *
 * Creates domain-specific tables:
 * - suppliers: Approved supplier list for invoice verification
 * - style_guide: Encoded brand compliance rules for Gatekeeper skill
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../init.js';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('Migration');

export const migration: Migration = {
  name: '003_domain_tables',
  up: (db: Database) => {
    // ========================================
    // Table: suppliers
    // Approved supplier list for invoice verification
    // Note: bank_details_hash stores only hashed values for security
    // ========================================
    db.exec(`
      CREATE TABLE suppliers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        contact_email TEXT,
        bank_details_hash TEXT,
        status TEXT NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'suspended', 'blacklisted')),
        reliability_score REAL DEFAULT 100.0,
        total_paid REAL DEFAULT 0.0,
        last_order_at DATETIME,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`CREATE INDEX idx_suppliers_name ON suppliers(name)`);
    db.exec(`CREATE INDEX idx_suppliers_status ON suppliers(status)`);

    logger.info('Created table: suppliers');

    // ========================================
    // Table: style_guide
    // Encoded brand compliance rules for the Gatekeeper skill
    // ========================================
    db.exec(`
      CREATE TABLE style_guide (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        rule_name TEXT NOT NULL,
        rule_type TEXT NOT NULL
          CHECK (rule_type IN ('requirement', 'prohibition', 'recommendation')),
        rule_value TEXT NOT NULL,
        severity TEXT NOT NULL
          CHECK (severity IN ('critical', 'warning', 'info')),
        description TEXT,
        examples_json TEXT,
        enabled BOOLEAN DEFAULT TRUE,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(category, rule_name)
      )
    `);

    db.exec(`CREATE INDEX idx_style_category ON style_guide(category)`);
    db.exec(`CREATE INDEX idx_style_severity ON style_guide(severity)`);
    db.exec(`CREATE INDEX idx_style_enabled ON style_guide(enabled)`);

    logger.info('Created table: style_guide');
  },
};
