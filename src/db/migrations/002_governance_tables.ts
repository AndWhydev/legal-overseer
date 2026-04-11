/**
 * Migration 002: Governance Tables
 *
 * Creates tables for governance and trust management:
 * - trust_scores: Graduated autonomy through runtime trust tracking
 * - decision_traces: Captures the "why" behind agent decisions
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../init.js';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('Migration');

export const migration: Migration = {
  name: '002_governance_tables',
  up: (db: Database) => {
    // ========================================
    // Table: trust_scores
    // Implements graduated autonomy through runtime trust tracking
    // ========================================
    db.exec(`
      CREATE TABLE trust_scores (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        skill_id TEXT NOT NULL,
        domain TEXT NOT NULL,
        successful_executions INTEGER DEFAULT 0,
        failed_executions INTEGER DEFAULT 0,
        human_overrides INTEGER DEFAULT 0,
        reliability_score REAL DEFAULT 0.0,
        autonomy_level INTEGER DEFAULT 1
          CHECK (autonomy_level BETWEEN 1 AND 5),
        can_auto_approve BOOLEAN DEFAULT FALSE,
        requires_human_review BOOLEAN DEFAULT TRUE,
        last_anomaly DATETIME,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agent_id) REFERENCES agents(id),
        FOREIGN KEY (skill_id) REFERENCES skills(id),
        UNIQUE(agent_id, skill_id, domain)
      )
    `);

    db.exec(`CREATE INDEX idx_trust_agent ON trust_scores(agent_id)`);
    db.exec(`CREATE INDEX idx_trust_reliability ON trust_scores(reliability_score)`);

    logger.info('Created table: trust_scores');

    // ========================================
    // Table: decision_traces
    // Captures the "why" behind agent decisions for learning and audit
    // ========================================
    db.exec(`
      CREATE TABLE decision_traces (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        trigger TEXT NOT NULL,
        inputs_json TEXT NOT NULL,
        reasoning TEXT NOT NULL,
        alternatives_considered TEXT,
        action_taken TEXT NOT NULL,
        result TEXT CHECK (result IN ('success', 'partial', 'failure')),
        impact_json TEXT,
        human_feedback TEXT
          CHECK (human_feedback IN ('approved', 'overridden', 'none')),
        override_reason TEXT,
        retrospective_notes TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      )
    `);

    db.exec(`CREATE INDEX idx_decisions_task ON decision_traces(task_id)`);
    db.exec(`CREATE INDEX idx_decisions_result ON decision_traces(result)`);
    db.exec(`CREATE INDEX idx_decisions_feedback ON decision_traces(human_feedback)`);

    logger.info('Created table: decision_traces');
  },
};
