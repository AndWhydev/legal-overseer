-- Workspace Sessions & Artifacts
-- Tracks E2B sandbox sessions and any files/data produced during execution.

-- ---------------------------------------------------------------------------
-- workspace_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspace_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task_id       uuid REFERENCES execution_tasks(id) ON DELETE SET NULL,
  sandbox_id    text NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','running','completed','failed','timeout')),
  purpose       text NOT NULL DEFAULT '',
  template      text NOT NULL DEFAULT 'default'
                  CHECK (template IN ('default','data-science','web-dev')),
  started_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  total_seconds numeric NOT NULL DEFAULT 0,
  cost_usd      numeric NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_workspace_sessions_org_status ON workspace_sessions (org_id, status);
CREATE UNIQUE INDEX idx_workspace_sessions_sandbox_id ON workspace_sessions (sandbox_id);

-- RLS
ALTER TABLE workspace_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_sessions_org_isolation ON workspace_sessions
  USING (org_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY workspace_sessions_service_role ON workspace_sessions
  USING (current_setting('role') = 'service_role');

-- ---------------------------------------------------------------------------
-- workspace_artifacts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspace_artifacts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace_sessions(id) ON DELETE CASCADE,
  artifact_type text NOT NULL CHECK (artifact_type IN ('file','image','chart','data')),
  name          text NOT NULL,
  content       text,
  storage_path  text,
  mime_type     text,
  size_bytes    bigint,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_workspace_artifacts_workspace ON workspace_artifacts (workspace_id);

-- RLS: artifact access mirrors parent workspace session access
ALTER TABLE workspace_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_artifacts_org_isolation ON workspace_artifacts
  USING (
    EXISTS (
      SELECT 1 FROM workspace_sessions ws
      WHERE ws.id = workspace_artifacts.workspace_id
        AND ws.org_id = (current_setting('app.current_org_id', true))::uuid
    )
  );

CREATE POLICY workspace_artifacts_service_role ON workspace_artifacts
  USING (current_setting('role') = 'service_role');

-- updated_at trigger (reuse existing function if available, otherwise create)
CREATE OR REPLACE FUNCTION update_workspace_sessions_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_workspace_sessions_updated_at
  BEFORE UPDATE ON workspace_sessions
  FOR EACH ROW EXECUTE FUNCTION update_workspace_sessions_updated_at();
