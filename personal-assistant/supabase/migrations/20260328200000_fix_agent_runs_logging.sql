-- Migration: Fix agent_runs logging pipeline
--
-- Root cause: agent_configs table is empty and CHECK constraints are too
-- restrictive for the current codebase, so every logAgentRun() call either
-- skips (no agentConfigId) or fails (constraint violation).
--
-- Fixes:
--   1. Add 'assistant' to agent_configs.agent_type CHECK
--   2. Add 'chat' to agent_runs.trigger_type CHECK
--   3. Relax agent_runs.model_used CHECK to accept ModelPurpose values
--   4. Seed a default 'assistant' config for org 7abcbfb1

-- ── 1. Relax agent_configs.agent_type CHECK ────────────────────────────────
ALTER TABLE agent_configs
  DROP CONSTRAINT IF EXISTS agent_configs_agent_type_check;

ALTER TABLE agent_configs
  ADD CONSTRAINT agent_configs_agent_type_check
  CHECK (agent_type IN (
    'assistant',
    'lead-swarm', 'invoice-flow', 'channel-triage', 'client-comms',
    'proposal-bot', 'ad-script-gen', 'client-onboarding',
    'ai-search-optimizer', 'tender-hunter', 'sentry'
  ));

-- ── 2. Relax agent_runs.trigger_type CHECK ─────────────────────────────────
ALTER TABLE agent_runs
  DROP CONSTRAINT IF EXISTS agent_runs_trigger_type_check;

ALTER TABLE agent_runs
  ADD CONSTRAINT agent_runs_trigger_type_check
  CHECK (trigger_type IN ('scheduled', 'webhook', 'manual', 'watch', 'chat'));

-- ── 3. Relax agent_runs.model_used CHECK ───────────────────────────────────
-- The run-logger writes ModelPurpose values ('conversation', 'classification',
-- 'synthesis') rather than tier names ('haiku', 'sonnet', 'opus').
-- Accept both sets to be backwards-compatible.
ALTER TABLE agent_runs
  DROP CONSTRAINT IF EXISTS agent_runs_model_used_check;

ALTER TABLE agent_runs
  ADD CONSTRAINT agent_runs_model_used_check
  CHECK (model_used IN (
    'haiku', 'sonnet', 'opus',
    'classification', 'conversation', 'synthesis'
  ));

-- ── 4. Seed default assistant config for Tor Personal org ──────────────────
INSERT INTO agent_configs (org_id, name, agent_type, description, enabled, model_tier_override)
VALUES (
  '7abcbfb1-67e5-4a3b-aa08-a17cfd2867e9',
  'BitBit Assistant',
  'assistant',
  'Default assistant agent for chat conversations',
  true,
  'sonnet'
)
ON CONFLICT (org_id, agent_type) DO NOTHING;

-- ── 5. Add service_role RLS policies if missing ────────────────────────────
-- The chat route uses the service client for agent runs logging.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'agent_configs' AND policyname = 'agent_configs_service_role'
  ) THEN
    CREATE POLICY "agent_configs_service_role" ON agent_configs
      FOR ALL USING (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'agent_runs' AND policyname = 'agent_runs_service_role'
  ) THEN
    CREATE POLICY "agent_runs_service_role" ON agent_runs
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;
