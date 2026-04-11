-- 064_optimal_contact_timing.sql
-- Add 'optimal_contact_timing' to entity_patterns pattern_type CHECK constraint.

-- Drop the existing CHECK and re-create with the new value
ALTER TABLE entity_patterns DROP CONSTRAINT IF EXISTS entity_patterns_pattern_type_check;
ALTER TABLE entity_patterns ADD CONSTRAINT entity_patterns_pattern_type_check
  CHECK (pattern_type IN ('payment_timing', 'response_latency', 'activity_frequency', 'channel_preference', 'optimal_contact_timing'));
