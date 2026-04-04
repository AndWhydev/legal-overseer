import type { SupabaseClient } from '@supabase/supabase-js'

export interface ProceduralMemory {
  id: string
  org_id: string
  name: string
  trigger_pattern: string
  steps: string[]
  success_count: number
  last_used_at: string | null
  source: 'observed' | 'explicit' | 'consolidation'
  is_active: boolean
}

export async function matchProcedure(
  _supabase: SupabaseClient,
  _orgId: string,
  _message: string,
): Promise<ProceduralMemory | null> {
  return null
}

export async function createProcedure(
  _supabase: SupabaseClient,
  _orgId: string,
  _name: string,
  _triggerPattern: string,
  _steps: string[],
  _source: 'observed' | 'explicit' | 'consolidation' = 'explicit',
): Promise<ProceduralMemory | null> {
  return null
}

export async function incrementSuccess(
  _supabase: SupabaseClient,
  _procedureId: string,
): Promise<void> {
  // stub
}
