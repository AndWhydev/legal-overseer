import 'dotenv/config'
import { config } from 'dotenv'
config({ path: '.env.local' })

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { matchProcedure, createProcedure, incrementSuccess } from '../procedural-memory'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

let supabase: SupabaseClient
let testOrgId: string

describe('procedural memory', () => {
  let testProcedureId: string

  beforeAll(async () => {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    // Get existing org for tests (service role bypasses RLS)
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .limit(1)
      .single()

    expect(org).toBeTruthy()
    testOrgId = org!.id

    // Create a test procedure
    const proc = await createProcedure(
      supabase,
      testOrgId,
      'AWU Email Protocol',
      'email.*AWU|allwebbedup',
      [
        'Use M365 MCP as Tor@allwebbedup.com.au',
        'Never use Gmail for AWU client communication',
        'Match professional tone from contact profile',
      ],
      'explicit',
    )
    testProcedureId = proc?.id || ''
  })

  afterAll(async () => {
    if (testProcedureId) {
      await supabase.from('procedural_memories').delete().eq('id', testProcedureId)
    }
  })

  it('matches procedure by trigger pattern', async () => {
    const match = await matchProcedure(supabase, testOrgId, 'email the AWU client about the invoice')
    expect(match).not.toBeNull()
    expect(match?.name).toBe('AWU Email Protocol')
    expect(match?.steps).toHaveLength(3)
  })

  it('returns null for non-matching message', async () => {
    const match = await matchProcedure(supabase, testOrgId, 'hey how are you')
    expect(match).toBeNull()
  })

  it('increments success count', async () => {
    await incrementSuccess(supabase, testProcedureId)
    const { data } = await supabase
      .from('procedural_memories')
      .select('success_count')
      .eq('id', testProcedureId)
      .single()
    expect(data?.success_count).toBeGreaterThan(0)
  })

  it('creates procedure with observed source', async () => {
    const proc = await createProcedure(
      supabase,
      testOrgId,
      'Test Procedure',
      'test.*pattern',
      ['step 1', 'step 2'],
      'observed',
    )
    expect(proc).not.toBeNull()
    expect(proc?.source).toBe('observed')
    // Cleanup
    if (proc?.id) await supabase.from('procedural_memories').delete().eq('id', proc.id)
  })
})
