/**
 * Migration 008: Seed overseer skill rows.
 *
 * The `tasks.skill_id` column has a FK into `skills(id)`. Up to now the
 * skills table has been empty in dev because the existing skill registry
 * lives in TypeScript and createTask was only ever called from code
 * paths that nobody actually exercised end-to-end.
 *
 * Stages 2 and 3 introduce two new skill IDs that DO get inserted into
 * tasks:
 *   - claude_code_worker:  a worker dispatch task
 *   - overseer_decision:   a wait/escalate decision the overseer logs
 *                          as a completed task so decision_traces can
 *                          reference it cleanly.
 *
 * Use INSERT OR IGNORE so re-running on an already-populated row is a
 * no-op.
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../init.js';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('Migration');

export const migration: Migration = {
  name: '008_overseer_skills',
  up: (db: Database) => {
    db.exec(`
      INSERT OR IGNORE INTO skills (id, name, version, skill_path, description, enabled)
      VALUES (
        'claude_code_worker',
        'Claude Code Worker',
        '1.0.0',
        'src/skills/claude-code-worker',
        'Dispatches a headless claude -p invocation into a registered project directory',
        1
      )
    `);

    db.exec(`
      INSERT OR IGNORE INTO skills (id, name, version, skill_path, description, enabled)
      VALUES (
        'overseer_decision',
        'Overseer Decision',
        '1.0.0',
        'src/agent/overseer-loop.ts',
        'Materialized record of one overseer judgment (wait, escalate, or dispatch)',
        1
      )
    `);

    // Also backfill the existing in-code skills so future code paths
    // that go through createTask don't trip the same FK.
    db.exec(`
      INSERT OR IGNORE INTO skills (id, name, version, skill_path, description, enabled)
      VALUES
        ('rd_scout',     'R&D Scout',         '1.0.0', 'src/skills/rd-scout',     'Market research and product opportunity discovery',     1),
        ('gatekeeper',   'Gatekeeper',        '1.0.0', 'src/skills/gatekeeper',   'Content QA, style guide compliance, video analysis',    1),
        ('ops_officer',  'Ops Officer',       '1.0.0', 'src/skills/ops-officer', 'Invoice processing, supplier verification, payments',   1),
        ('general',      'General Assistant', '1.0.0', 'src/skills',              'Fallback for unclassified tasks',                       1)
    `);

    logger.info('Seeded skills: claude_code_worker, overseer_decision, and core skills');
  },
};
