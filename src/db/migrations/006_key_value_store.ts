/**
 * Migration 006: Key Value Store
 *
 * Creates the key_value_store table for storing configuration data.
 * Used by Xero integration for OAuth token storage.
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../init.js';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('Migration');

export const migration: Migration = {
  name: '006_key_value_store',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE key_value_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    logger.info('Created table: key_value_store');
  },
};
