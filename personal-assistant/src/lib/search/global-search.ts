import type { SupabaseClient } from '@supabase/supabase-js';

export type SearchEntityType = 'contact' | 'lead' | 'invoice' | 'proposal' | 'tender';

export interface SearchResult {
  type: SearchEntityType;
  id: string;
  title: string;
  subtitle: string;
  relevance: number;
}

export interface SearchOptions {
  types?: SearchEntityType[];
  limit?: number;
}

const ALL_TYPES: SearchEntityType[] = ['contact', 'lead', 'invoice', 'proposal', 'tender'];

interface TableConfig {
  table: string;
  titleCol: string;
  subtitleCol: string;
  ilikeCols: string[];
}

const TABLE_MAP: Record<SearchEntityType, TableConfig> = {
  contact:  { table: 'contacts',  titleCol: 'name',           subtitleCol: 'slug',         ilikeCols: ['name', 'slug'] },
  lead:     { table: 'leads',     titleCol: 'contact_name',   subtitleCol: 'company',      ilikeCols: ['contact_name', 'company', 'notes'] },
  invoice:  { table: 'invoices',  titleCol: 'invoice_number', subtitleCol: 'contact_name', ilikeCols: ['invoice_number', 'contact_name', 'description'] },
  proposal: { table: 'proposals', titleCol: 'title',          subtitleCol: 'client_name',  ilikeCols: ['title', 'client_name'] },
  tender:   { table: 'tenders',   titleCol: 'title',          subtitleCol: 'agency',       ilikeCols: ['title', 'agency', 'description'] },
};

/**
 * Global search across all entity types using tsvector full-text search
 * with ILIKE fallback when search_vector column is unavailable.
 */
export async function globalSearch(
  supabase: SupabaseClient,
  orgId: string,
  query: string,
  options: SearchOptions = {},
): Promise<SearchResult[]> {
  const types = options.types?.length ? options.types : ALL_TYPES;
  const limit = options.limit ?? 20;
  const perType = Math.max(1, Math.ceil(limit / types.length));

  const trimmed = query.trim();
  if (!trimmed) return [];

  const promises = types.map(async (type) => {
    const cfg = TABLE_MAP[type];
    try {
      return await searchWithTsvector(supabase, orgId, trimmed, type, cfg, perType);
    } catch {
      // Fallback to ILIKE if tsvector not available
      return await searchWithIlike(supabase, orgId, trimmed, type, cfg, perType);
    }
  });

  const grouped = await Promise.all(promises);
  return grouped.flat().slice(0, limit);
}

async function searchWithTsvector(
  supabase: SupabaseClient,
  orgId: string,
  query: string,
  type: SearchEntityType,
  cfg: TableConfig,
  limit: number,
): Promise<SearchResult[]> {
  // Convert user query to tsquery: split words and join with &
  const tsquery = query
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `${w}:*`)
    .join(' & ');

  const { data, error } = await supabase
    .from(cfg.table)
    .select(`id, ${cfg.titleCol}, ${cfg.subtitleCol}`)
    .eq('org_id', orgId)
    .textSearch('search_vector', tsquery)
    .limit(limit);

  if (error) throw error;

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row, i) => ({
    type,
    id: String(row.id),
    title: String(row[cfg.titleCol] ?? ''),
    subtitle: String(row[cfg.subtitleCol] ?? ''),
    relevance: 1 - i * 0.01,
  }));
}

async function searchWithIlike(
  supabase: SupabaseClient,
  orgId: string,
  query: string,
  type: SearchEntityType,
  cfg: TableConfig,
  limit: number,
): Promise<SearchResult[]> {
  const pattern = `%${query}%`;

  // Build OR filter for ILIKE across columns
  const orFilter = cfg.ilikeCols.map((col) => `${col}.ilike.${pattern}`).join(',');

  const { data, error } = await supabase
    .from(cfg.table)
    .select(`id, ${cfg.titleCol}, ${cfg.subtitleCol}`)
    .eq('org_id', orgId)
    .or(orFilter)
    .limit(limit);

  if (error) return [];

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row, i) => ({
    type,
    id: String(row.id),
    title: String(row[cfg.titleCol] ?? ''),
    subtitle: String(row[cfg.subtitleCol] ?? ''),
    relevance: 0.5 - i * 0.01,
  }));
}
