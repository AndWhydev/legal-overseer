import db from '../lib/db';

const migration = `
CREATE TABLE IF NOT EXISTS analysis_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  approval_item_id INTEGER NOT NULL REFERENCES approval_items(id),
  version INTEGER NOT NULL DEFAULT 1,
  model TEXT NOT NULL,
  summary TEXT NOT NULL,
  recommendation TEXT NOT NULL CHECK(recommendation IN ('approve', 'needs_changes', 'reject', 'escalate')),
  confidence INTEGER NOT NULL,
  reasoning TEXT NOT NULL,
  risk_flags TEXT, -- JSON array
  draft_response TEXT,
  questions_for_human TEXT, -- JSON array
  suggested_tasks TEXT, -- JSON array
  policies_applied TEXT, -- JSON array
  generation_time_ms INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analysis_item ON analysis_records(approval_item_id);
CREATE INDEX IF NOT EXISTS idx_analysis_version ON analysis_records(approval_item_id, version DESC);
`;

db.exec(migration);
console.log('Migration complete: analysis_records table created');

// Verify table exists
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='analysis_records'")
  .all() as { name: string }[];

if (tables.length > 0) {
  console.log('Verified: analysis_records table exists');
} else {
  console.error('Error: analysis_records table was not created');
  process.exit(1);
}

db.close();
