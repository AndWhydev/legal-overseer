-- eval_runs + eval_results — persistence for the per-mode eval pipeline (#100/#111/#112).
--
-- Each batch run writes one row to `eval_runs` plus one row per judged
-- case to `eval_results`. Trend analysis is then a SELECT over either
-- table, scoped by mode/candidate_model/judge_model/window.
--
-- Foundation only: schema is wide enough to capture today's
-- EvalRunReport without forcing a follow-up migration. No RLS yet —
-- the cron route is the only writer, and it auths on CRON_SECRET; user-
-- scoped reads land when the eval dashboard does.

CREATE TABLE IF NOT EXISTS eval_runs (
  run_id           text         PRIMARY KEY,
  started_at       timestamptz  NOT NULL,
  finished_at      timestamptz  NOT NULL,
  -- Filter that produced this run, or null when the full dataset ran.
  mode             text         CHECK (mode IS NULL OR mode IN ('chat','inbox','work','money')),
  candidate_model  text,
  judge_model      text,
  -- Aggregated mean across all results in this run, 0-100.
  overall_mean     int          NOT NULL DEFAULT 0,
  -- {"chat": {"count": 3, "mean": 80}, ...}
  by_mode          jsonb        NOT NULL DEFAULT '{}'::jsonb,
  -- [{caseId, phase: 'candidate'|'judge', message}, ...]
  errors           jsonb        NOT NULL DEFAULT '[]'::jsonb,
  -- Free-form metadata bag for future tags (run_kind, env, git_sha, etc).
  metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eval_runs_started_at_idx     ON eval_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS eval_runs_mode_started_idx   ON eval_runs (mode, started_at DESC);
CREATE INDEX IF NOT EXISTS eval_runs_candidate_idx      ON eval_runs (candidate_model, started_at DESC);

CREATE TABLE IF NOT EXISTS eval_results (
  id                bigserial    PRIMARY KEY,
  run_id            text         NOT NULL REFERENCES eval_runs(run_id) ON DELETE CASCADE,
  case_id           text         NOT NULL,
  -- Mode the case belongs to. Denormalised here so trend queries don't need
  -- to join the seed dataset (which lives in code, not the DB).
  mode              text         NOT NULL CHECK (mode IN ('chat','inbox','work','money')),
  candidate_model   text,
  -- The judge's per-dimension scores: [{dimension, score, evidence?}].
  scores            jsonb        NOT NULL DEFAULT '[]'::jsonb,
  -- Aggregate 0-100 from scoreSubmission. Indexed for floor/ceiling queries.
  normalized_score  int          NOT NULL DEFAULT 0,
  rationale         text,
  created_at        timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eval_results_run_idx              ON eval_results (run_id);
CREATE INDEX IF NOT EXISTS eval_results_case_created_idx     ON eval_results (case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS eval_results_mode_score_idx       ON eval_results (mode, normalized_score);
CREATE INDEX IF NOT EXISTS eval_results_candidate_mode_idx   ON eval_results (candidate_model, mode, created_at DESC);
