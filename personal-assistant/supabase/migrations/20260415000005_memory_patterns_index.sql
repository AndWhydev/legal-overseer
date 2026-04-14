CREATE INDEX IF NOT EXISTS idx_memory_patterns_org_status
  ON memory_patterns (org_id, status);
