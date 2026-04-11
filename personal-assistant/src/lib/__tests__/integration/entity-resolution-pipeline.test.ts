import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveEntity, resolveEntityRanked } from '@/lib/context/entity-resolver'
import { linkRelationship } from '@/lib/context/relationship-linker'
import { createClient } from '@/lib/supabase/server'

const { createClientMock, linkRelationshipMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  linkRelationshipMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('@/lib/context/relationship-linker', async () => {
  const actual = await vi.importActual<typeof import('@/lib/context/relationship-linker')>('@/lib/context/relationship-linker')
  return {
    ...actual,
    linkRelationship: linkRelationshipMock,
  }
})

type ContactLike = {
  id: string
  name: string
  type: string
  emails?: string[]
  phones?: string[]
  aliases?: string[]
}

type StepKey = 'alias' | 'email' | 'phone' | 'name' | 'phone_variant'

function createResolverSupabase(stepResults: Partial<Record<StepKey, ContactLike[]>>) {
  const insertedContacts: Record<string, unknown>[] = []
  let resolutionCall = 0

  const supabase = {
    from(table: string) {
      if (table === 'contacts') {
        const chain: Record<string, unknown> = {}
        ;(chain as any).select = vi.fn().mockReturnValue(chain)
        ;(chain as any).eq = vi.fn().mockReturnValue(chain)
        ;(chain as any).contains = vi.fn().mockReturnValue(chain)
        ;(chain as any).or = vi.fn().mockReturnValue(chain)
        ;(chain as any).ilike = vi.fn().mockReturnValue(chain)
        ;(chain as any).limit = vi.fn().mockReturnValue(chain)

        ;(chain as any).insert = vi.fn((payload: Record<string, unknown>) => {
          const record = {
            id: `contact-new-${insertedContacts.length + 1}`,
            type: 'individual',
            ...payload,
          }
          insertedContacts.push(record)

          return {
            select: () => ({
              single: () => Promise.resolve({ data: record, error: null }),
            }),
          }
        })

        ;(chain as any).single = vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } })

        ;(chain as any).then = (resolve: (value: unknown) => void) => {
          const stepOrder: StepKey[] = ['alias', 'email', 'phone', 'name', 'phone_variant']
          const step = stepOrder[Math.min(resolutionCall, stepOrder.length - 1)]
          resolutionCall += 1
          const data = stepResults[step] ?? []
          return resolve({ data, error: null })
        }

        return chain
      }

      if (table === 'entity_relationships') {
        return {
          upsert: vi.fn().mockResolvedValue({ error: null }),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }

  return {
    supabase,
    insertedContacts,
  }
}

async function resolveAndLinkEntity(input: {
  orgId: string
  sourceMessageId: string
  query: string
}) {
  const supabase = await createClient() as any
  const ranked = await resolveEntityRanked(supabase, input.query, input.orgId)

  if (ranked.length === 0) {
    const { data } = await supabase
      .from('contacts')
      .insert({
        org_id: input.orgId,
        name: input.query,
        slug: input.query.toLowerCase().replace(/\s+/g, '-'),
        emails: [],
        phones: [],
        aliases: [input.query.toLowerCase()],
      })
      .select('*')
      .single()

    await linkRelationship(
      supabase,
      input.orgId,
      { type: 'channel_message', id: input.sourceMessageId },
      { type: 'contact', id: data.id },
      'related_to',
      { source: 'entity-resolution-pipeline' },
    )

    return {
      status: 'created' as const,
      entity: data,
      confidence: 0,
    }
  }

  const sorted = [...ranked].sort((a, b) => b.matchConfidence - a.matchConfidence)
  if (
    sorted.length > 1 &&
    Math.abs(sorted[0].matchConfidence - sorted[1].matchConfidence) <= 0.05
  ) {
    return {
      status: 'ambiguous' as const,
      candidates: sorted.map((item) => item.contact.id),
    }
  }

  await linkRelationship(
    supabase,
    input.orgId,
    { type: 'channel_message', id: input.sourceMessageId },
    { type: 'contact', id: sorted[0].contact.id },
    'related_to',
    { source: 'entity-resolution-pipeline', confidence: sorted[0].matchConfidence },
  )

  return {
    status: 'resolved' as const,
    entity: sorted[0].contact,
    confidence: sorted[0].matchConfidence,
  }
}

afterEach(() => vi.restoreAllMocks())

beforeEach(() => {
  createClientMock.mockReset()
  linkRelationshipMock.mockClear()
})

describe('Entity Resolution Pipeline Integration', () => {
  it('resolves exact email match to existing contact', async () => {
    const contact = {
      id: 'contact-1',
      name: 'Steve West',
      type: 'individual',
      emails: ['steve@example.com'],
    }

    const { supabase } = createResolverSupabase({
      alias: [],
      email: [contact],
    })

    const result = await resolveEntity(supabase as any, 'steve@example.com', 'org-1')

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('contact-1')
    expect(result[0].name).toBe('Steve West')
  })

  it('resolves fuzzy name match with confidence score', async () => {
    const { supabase } = createResolverSupabase({
      alias: [],
      email: [],
      phone: [],
      name: [
        { id: 'contact-2', name: 'Stephen West', type: 'individual' },
        { id: 'contact-3', name: 'Steve Weston', type: 'individual' },
      ],
    })

    const ranked = await resolveEntityRanked(supabase as any, 'steve west', 'org-1')

    expect(ranked).toHaveLength(2)
    expect(ranked[0].matchStep).toBe('name')
    expect(ranked[0].matchConfidence).toBe(0.7)
  })

  it('creates new entity when no match found', async () => {
    const { supabase, insertedContacts } = createResolverSupabase({
      alias: [],
      email: [],
      phone: [],
      name: [],
      phone_variant: [],
    })
    createClientMock.mockResolvedValue(supabase)

    const result = await resolveAndLinkEntity({
      orgId: 'org-1',
      sourceMessageId: 'msg-1',
      query: 'New Contact Person',
    })

    expect(result.status).toBe('created')
    expect((result as any).entity.id).toBe('contact-new-1')
    expect(insertedContacts).toHaveLength(1)
    expect(insertedContacts[0].name).toBe('New Contact Person')
  })

  it('links resolved entity to source message relationship', async () => {
    const { supabase } = createResolverSupabase({
      alias: [{ id: 'contact-9', name: 'Alice', type: 'individual' }],
    })
    createClientMock.mockResolvedValue(supabase)

    const result = await resolveAndLinkEntity({
      orgId: 'org-99',
      sourceMessageId: 'msg-abc',
      query: 'alice',
    })

    expect(result.status).toBe('resolved')
    expect(linkRelationship).toHaveBeenCalledWith(
      supabase,
      'org-99',
      { type: 'channel_message', id: 'msg-abc' },
      { type: 'contact', id: 'contact-9' },
      'related_to',
      expect.objectContaining({ source: 'entity-resolution-pipeline' }),
    )
  })

  it('handles ambiguous match with multiple candidates', async () => {
    const { supabase } = createResolverSupabase({
      alias: [],
      email: [],
      phone: [],
      name: [
        { id: 'contact-a', name: 'Sam Lee', type: 'individual' },
        { id: 'contact-b', name: 'Sam Li', type: 'individual' },
      ],
    })
    createClientMock.mockResolvedValue(supabase)

    const result = await resolveAndLinkEntity({
      orgId: 'org-1',
      sourceMessageId: 'msg-2',
      query: 'sam',
    })

    expect(result).toEqual({
      status: 'ambiguous',
      candidates: ['contact-a', 'contact-b'],
    })
    expect(linkRelationship).not.toHaveBeenCalled()
  })
})
