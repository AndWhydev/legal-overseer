-- ============================================================================
-- Phase 44 / Phase 43 bridge: Extend knowledge_log signal_type to accept
-- 'delegated_action' so autonomous actions taken under a delegation mandate
-- flow into the Living Brain WAL and feed the Section Librarians.
--
-- Without this bridge, the richest structured event stream in the system
-- (delegation_action_log — action_type, financial_impact, fiduciary_evaluation,
-- evidence_urls) is invisible to dossier compilation.
-- ============================================================================

ALTER TABLE knowledge_log
  DROP CONSTRAINT IF EXISTS knowledge_log_signal_type_check;

ALTER TABLE knowledge_log
  ADD CONSTRAINT knowledge_log_signal_type_check
  CHECK (signal_type IN (
    'message',
    'invoice',
    'calendar',
    'pattern',
    'correction',
    'decision',
    'relationship',
    'pricing',
    'fiduciary',
    'delegated_action'
  ));
