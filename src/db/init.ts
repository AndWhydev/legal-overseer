/**
 * Database initialization module for BitBit
 *
 * Handles database setup, migrations table creation, and running pending migrations.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getDatabase } from './connection.js';
import type { Database } from 'better-sqlite3';
import { createSafeLogger } from '../governance/index.js';

const logger = createSafeLogger('DbInit');

// Import migrations
import { migration as migration001 } from './migrations/001_initial_schema.js';
import { migration as migration002 } from './migrations/002_governance_tables.js';
import { migration as migration003 } from './migrations/003_domain_tables.js';
import { migration as migration004 } from './migrations/004_seed_data.js';
import { migration as migration005 } from './migrations/005_invoices_table.js';
import { migration as migration006 } from './migrations/006_key_value_store.js';
import { migration as migration007 } from './migrations/007_projects.js';
import { migration as migration008 } from './migrations/008_overseer_skills.js';
import { migration as migration009 } from './migrations/009_lessons.js';
import { migration as migration010 } from './migrations/010_backlinks.js';
import { migration as migration011 } from './migrations/011_processed_emails.js';
import { migration as migration012 } from './migrations/012_legal_schema.js';
import { migration as migration013 } from './migrations/013_users_and_setup.js';
import { migration as migration014 } from './migrations/014_reminders_and_conflicts.js';

/**
 * Migration interface for database migrations
 */
export interface Migration {
  name: string;
  up: (db: Database) => void;
}

/**
 * All migrations in order
 * Add new migrations to this array
 */
const migrations: Migration[] = [migration001, migration002, migration003, migration004, migration005, migration006, migration007, migration008, migration009, migration010, migration011, migration012, migration013, migration014];

/**
 * Create migrations tracking table if it doesn't exist
 */
function createMigrationsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

/**
 * Get list of already applied migrations
 */
function getAppliedMigrations(db: Database): string[] {
  const stmt = db.prepare('SELECT name FROM migrations ORDER BY id');
  const rows = stmt.all() as { name: string }[];
  return rows.map((row) => row.name);
}

/**
 * Record a migration as applied
 */
function recordMigration(db: Database, name: string): void {
  const stmt = db.prepare('INSERT INTO migrations (name) VALUES (?)');
  stmt.run(name);
}

/**
 * Run pending migrations
 */
function runMigrations(db: Database): void {
  const applied = getAppliedMigrations(db);

  for (const migration of migrations) {
    if (applied.includes(migration.name)) {
      logger.info(`Migration already applied: ${migration.name}`);
      continue;
    }

    logger.info(`Applying migration: ${migration.name}`);

    // Run migration in a transaction
    const runMigration = db.transaction(() => {
      migration.up(db);
      recordMigration(db, migration.name);
    });

    runMigration();

    logger.info(`Migration applied: ${migration.name}`);
  }
}

/**
 * Ensure the data directory exists (for local development)
 */
function ensureDataDirectory(dbPath: string): void {
  const dir = dirname(dbPath);

  if (!existsSync(dir)) {
    logger.info(`Creating data directory: ${dir}`);
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Initialize the database
 *
 * Creates data directory if needed, connects to database,
 * creates migrations table, and runs all pending migrations.
 */
export function initializeDatabase(): void {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const databasePath =
    process.env.DATABASE_PATH ||
    (nodeEnv === 'production' ? '/data/bitbit.db' : './data/bitbit.db');

  // Ensure data directory exists (for local development)
  ensureDataDirectory(databasePath);

  // Get database connection
  const db = getDatabase();

  // Create migrations table
  createMigrationsTable(db);

  // Run pending migrations
  runMigrations(db);

  logger.info('Database initialized');
}
