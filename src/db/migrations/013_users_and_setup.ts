/**
 * Migration 013: Users, sessions, and onboarding state.
 *
 * Adds the tables the commercial product needs on top of the legal
 * domain schema:
 *
 *   - users          — admin / lawyer / paralegal accounts with PBKDF2
 *                      password hashes. Sessions are issued against
 *                      this table on /login.
 *   - sessions       — opaque tokens with an expiry stamp; cleaned up
 *                      lazily by the dashboard middleware.
 *   - setup_state    — single-row table tracking whether the first-run
 *                      wizard has been completed.
 *
 * The wizard is allowed to insert the first 'admin' row even when no
 * session exists; thereafter all writes require a session.
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../init.js';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('Migration');

export const migration: Migration = {
  name: '013_users_and_setup',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'lawyer'
          CHECK (role IN ('admin', 'lawyer', 'paralegal')),
        status TEXT NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'suspended', 'removed')),
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        password_iter INTEGER NOT NULL DEFAULT 200000,
        last_login_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`CREATE INDEX idx_users_email ON users(email)`);
    db.exec(`CREATE INDEX idx_users_role  ON users(role)`);
    db.exec(`CREATE INDEX idx_users_status ON users(status)`);
    logger.info('Created table: users');

    db.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        ip TEXT,
        user_agent TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    db.exec(`CREATE INDEX idx_sessions_user ON sessions(user_id)`);
    db.exec(`CREATE INDEX idx_sessions_expires ON sessions(expires_at)`);
    logger.info('Created table: sessions');

    db.exec(`
      CREATE TABLE setup_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        completed INTEGER NOT NULL DEFAULT 0,
        completed_at TEXT,
        completed_by TEXT,
        firm_name TEXT,
        notes TEXT
      )
    `);
    db.exec(`INSERT INTO setup_state (id, completed) VALUES (1, 0)`);
    logger.info('Created table: setup_state');
  },
};
