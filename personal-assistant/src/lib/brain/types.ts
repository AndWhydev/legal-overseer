/**
 * Living Brain Architecture — Core type definitions.
 *
 * Types match the CHECK constraints in migration 20260411000001_knowledge_wal_dossiers.sql.
 */

// ─── Signal & Domain Types ──────────────────────────────────────────────────

export type SignalType =
  | 'message'
  | 'invoice'
  | 'calendar'
  | 'pattern'
  | 'correction'
  | 'decision'
  | 'relationship'
  | 'pricing'
  | 'fiduciary'

export type DomainType =
  | 'financial'
  | 'relational'
  | 'operational'
  | 'behavioral'

// ─── Table Row Types ────────────────────────────────────────────────────────

export interface KnowledgeLogEntry {
  id: string
  org_id: string
  entity_ids: string[]
  signal_type: SignalType
  content: string
  confidence: number
  source_memory_id: string | null
  source_thread_id: string | null
  consolidated_at: string | null
  created_at: string
}

export interface EntityDossier {
  id: string
  org_id: string
  entity_id: string
  entity_name: string
  dossier_markdown: string
  schema_json: Record<string, unknown>
  version: number
  last_compiled_at: string
  stale_since: string | null
  token_count: number
  facts_incorporated: number
  last_fact_id: string | null
  compilation_model: string | null
  created_at: string
  updated_at: string
}

export interface DomainProfile {
  id: string
  org_id: string
  domain: DomainType
  profile_markdown: string
  constituent_hashes: Record<string, string>
  version: number
  last_compiled_at: string
  token_count: number
  created_at: string
  updated_at: string
}

// ─── Worker Types ───────────────────────────────────────────────────────────

export type WorkerTier = 'intake' | 'librarian' | 'chief'

// ─── Query & Delta Types ────────────────────────────────────────────────────

export interface WALTailQuery {
  org_id: string
  limit?: number
  since?: string
}

export interface DossierDelta {
  entity_id: string
  new_facts: KnowledgeLogEntry[]
  current_dossier: EntityDossier | null
}

export interface SurpriseScore {
  fact_id: string
  score: number
  deviation_type:
    | 'contradicts_schema'
    | 'novel_dimension'
    | 'magnitude_shift'
    | 'expected'
}
