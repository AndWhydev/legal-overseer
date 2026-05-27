/**
 * Migration 016: client intake intelligence layer.
 *
 * The intake layer sits before matter creation. `intake_sessions`
 * tracks a prospective client working through a matter-type-specific
 * questionnaire; `client_briefs` stores the structured brief the
 * system assembles for the lawyer once the questionnaire is complete.
 *
 * (The original feature spec referred to this as "025"; numbered 016
 * here to follow the actual sequential migration order — migrations
 * are tracked by name, applied in array order.)
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../init.js';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('Migration');

export const migration: Migration = {
  name: '016_intake_sessions',
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE intake_sessions (
        id TEXT PRIMARY KEY,
        client_email TEXT NOT NULL,
        client_name TEXT,
        firm_slug TEXT NOT NULL,
        matter_type TEXT NOT NULL,
        state TEXT,
        answers TEXT NOT NULL DEFAULT '{}',
        current_question_index INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'in-progress'
          CHECK (status IN ('in-progress', 'complete', 'abandoned', 'escalated')),
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        brief_generated INTEGER NOT NULL DEFAULT 0 CHECK (brief_generated IN (0, 1)),
        matter_id TEXT,
        urgency_flag INTEGER NOT NULL DEFAULT 0 CHECK (urgency_flag IN (0, 1)),
        urgency_reason TEXT,
        last_question_sent_at TEXT,
        follow_up_sent INTEGER NOT NULL DEFAULT 0 CHECK (follow_up_sent IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`CREATE INDEX idx_intake_sessions_email ON intake_sessions(client_email)`);
    db.exec(`CREATE INDEX idx_intake_sessions_status ON intake_sessions(status)`);
    db.exec(`CREATE INDEX idx_intake_sessions_matter ON intake_sessions(matter_id)`);
    logger.info('Created table: intake_sessions');

    db.exec(`
      CREATE TABLE client_briefs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES intake_sessions(id),
        client_name TEXT NOT NULL,
        client_email TEXT NOT NULL,
        matter_type TEXT NOT NULL,
        state TEXT,
        urgency_flag INTEGER NOT NULL DEFAULT 0 CHECK (urgency_flag IN (0, 1)),
        urgency_reason TEXT,
        days_until_limitation INTEGER,
        fact_summary TEXT,
        structured_facts TEXT,
        applicable_legislation TEXT,
        limitation_period TEXT,
        relevant_cases TEXT,
        recommended_first_steps TEXT,
        estimated_cost_range TEXT,
        risk_flags TEXT,
        full_transcript TEXT,
        matter_id TEXT,
        review_id TEXT,
        generated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`CREATE INDEX idx_client_briefs_session ON client_briefs(session_id)`);
    db.exec(`CREATE INDEX idx_client_briefs_matter ON client_briefs(matter_id)`);
    logger.info('Created table: client_briefs');
  },
};
