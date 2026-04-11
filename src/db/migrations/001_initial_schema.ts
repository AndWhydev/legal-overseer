/**
 * Migration 001: Initial Schema
 *
 * Creates the core tables for BitBit:
 * - agents: Registered agent instances and configurations
 * - skills: Installed skills and their association with agents
 * - tasks: Task execution state linked to ClickUp
 * - audit_logs: Immutable audit trail for all agent actions
 * - approvals: HITL approval requests and responses
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../init.js';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('Migration');

export const migration: Migration = {
  name: '001_initial_schema',
  up: (db: Database) => {
    // ========================================
    // Table: agents
    // Stores registered agent instances and their configurations
    // ========================================
    db.exec(`
      CREATE TABLE agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('orchestrator', 'subagent', 'specialist')),
        status TEXT NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'paused', 'disabled', 'terminated')),
        config_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`CREATE INDEX idx_agents_status ON agents(status)`);
    db.exec(`CREATE INDEX idx_agents_type ON agents(type)`);

    logger.info('Created table: agents');

    // ========================================
    // Table: skills
    // Tracks installed skills and their association with agents
    // ========================================
    db.exec(`
      CREATE TABLE skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        version TEXT NOT NULL,
        skill_path TEXT NOT NULL,
        description TEXT,
        agent_id TEXT,
        enabled BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agent_id) REFERENCES agents(id)
      )
    `);

    db.exec(`CREATE INDEX idx_skills_name ON skills(name)`);
    db.exec(`CREATE INDEX idx_skills_enabled ON skills(enabled)`);

    logger.info('Created table: skills');

    // ========================================
    // Table: tasks
    // Links agent execution to ClickUp tasks and stores execution state
    // ========================================
    db.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        clickup_id TEXT,
        skill_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'running', 'awaiting_approval',
                            'completed', 'failed', 'cancelled')),
        input_json TEXT,
        output_json TEXT,
        started_at DATETIME,
        completed_at DATETIME,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (skill_id) REFERENCES skills(id)
      )
    `);

    db.exec(`CREATE INDEX idx_tasks_status ON tasks(status)`);
    db.exec(`CREATE INDEX idx_tasks_clickup ON tasks(clickup_id)`);
    db.exec(`CREATE INDEX idx_tasks_skill ON tasks(skill_id)`);
    db.exec(`CREATE INDEX idx_tasks_created ON tasks(created_at)`);

    logger.info('Created table: tasks');

    // ========================================
    // Table: audit_logs
    // Immutable audit trail for all agent actions (append-only)
    // ========================================
    db.exec(`
      CREATE TABLE audit_logs (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        task_id TEXT,
        action_type TEXT NOT NULL,
        action_detail TEXT NOT NULL,
        risk_level TEXT NOT NULL
          CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
        input_hash TEXT,
        output_hash TEXT,
        user_id TEXT,
        session_id TEXT,
        ip_address TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agent_id) REFERENCES agents(id),
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      )
    `);

    db.exec(`CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp)`);
    db.exec(`CREATE INDEX idx_audit_agent ON audit_logs(agent_id)`);
    db.exec(`CREATE INDEX idx_audit_risk ON audit_logs(risk_level)`);
    db.exec(`CREATE INDEX idx_audit_action ON audit_logs(action_type)`);

    logger.info('Created table: audit_logs');

    // ========================================
    // Table: approvals
    // Tracks HITL approval requests and responses
    // ========================================
    db.exec(`
      CREATE TABLE approvals (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        action_summary TEXT NOT NULL,
        amount REAL,
        currency TEXT,
        approval_token TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
        requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        approved_by TEXT,
        approved_at DATETIME,
        rejection_reason TEXT,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      )
    `);

    db.exec(`CREATE INDEX idx_approvals_status ON approvals(status)`);
    db.exec(`CREATE INDEX idx_approvals_token ON approvals(approval_token)`);
    db.exec(`CREATE INDEX idx_approvals_expires ON approvals(expires_at)`);

    logger.info('Created table: approvals');
  },
};
