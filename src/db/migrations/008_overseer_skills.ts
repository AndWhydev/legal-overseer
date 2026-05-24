/**
 * Migration 008: Seed legal skill rows.
 *
 * The `tasks.skill_id` column has a FK into `skills(id)`. We seed every
 * legal SkillType so any task created via createTask can be routed
 * without tripping the FK.
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
      VALUES
        ('contract_review',    'Contract Review',    '1.0.0', 'src/skills/contract-review',    'Reads contracts, flags unusual clauses, missing protections, liability risks', 1),
        ('legal_research',     'Legal Research',     '1.0.0', 'src/skills/legal-research',     'Searches AustLII, summarises case law, flags citations as unverified',         1),
        ('matter_drafting',    'Matter Drafting',    '1.0.0', 'src/skills/matter-drafting',    'Drafts letters, memos, contracts, court documents',                            1),
        ('matter_management',  'Matter Management',  '1.0.0', 'src/skills/matter-management',  'Tracks deadlines, limitation periods, key dates, sends reminders',             1),
        ('client_comms',       'Client Comms',       '1.0.0', 'src/skills/client-comms',       'Drafts client update emails and correspondence',                               1),
        ('compliance_monitor', 'Compliance Monitor', '1.0.0', 'src/skills/compliance-monitor', 'Monitors regulatory change relevant to matter types',                          1),
        ('overseer_decision',  'Overseer Decision',  '1.0.0', 'src/agent/overseer-loop.ts',    'Materialised record of one overseer judgment',                                 1),
        ('general',            'General Assistant',  '1.0.0', 'src/skills',                    'Fallback for unclassified tasks',                                              1)
    `);

    logger.info('Seeded legal skills + overseer_decision + general');
  },
};
