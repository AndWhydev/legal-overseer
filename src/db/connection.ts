/**
 * Database connection module for BitBit
 *
 * Provides SQLite database connection using better-sqlite3.
 * Implements singleton pattern for connection reuse.
 */

import Database from 'better-sqlite3';
import { createSafeLogger } from '../governance/index.js';

const logger = createSafeLogger('Database');

let db: Database.Database | null = null;

/**
 * Get the default database path based on environment
 */
function getDefaultDatabasePath(): string {
  const nodeEnv = process.env.NODE_ENV || 'development';

  if (nodeEnv === 'production') {
    return '/data/bitbit.db';
  }

  return './data/bitbit.db';
}

/**
 * Get database instance (singleton pattern)
 *
 * Creates a new database connection if one doesn't exist.
 * Enables WAL mode for better concurrency and foreign keys for referential integrity.
 */
export function getDatabase(): Database.Database {
  if (db) {
    return db;
  }

  const databasePath = process.env.DATABASE_PATH || getDefaultDatabasePath();

  logger.info(`Connecting to database: ${databasePath}`);

  db = new Database(databasePath);

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');

  // Enable foreign keys for referential integrity
  db.pragma('foreign_keys = ON');

  logger.info('Database connected successfully');

  return db;
}

/**
 * Close the database connection
 *
 * Used for graceful shutdown and testing cleanup.
 */
export function closeDatabase(): void {
  if (db) {
    logger.info('Closing database connection...');
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
}
