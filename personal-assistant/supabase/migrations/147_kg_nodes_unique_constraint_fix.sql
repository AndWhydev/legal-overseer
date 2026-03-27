-- Fix kg_nodes unique constraint
-- The neural engine (engine.ts) uses onConflict: 'org_id,entity_id' but the unique
-- index was (org_id, node_type, entity_id). Entity IDs should be unique per org
-- regardless of node_type (a UUID contact or slugified concept won't conflict).
-- This aligns both the KnowledgeGraphClient and neural engine on the same constraint.

-- Drop the old 3-column unique index
DROP INDEX IF EXISTS idx_kg_nodes_unique;

-- Create the correct 2-column unique index
CREATE UNIQUE INDEX idx_kg_nodes_unique ON kg_nodes (org_id, entity_id);
