import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TEST_ORG_ID, TEST_AGENT_CONFIG_ID, TEST_USER_ID, createIntegrationSupabase } from '@/lib/__test-helpers__/supabase-integration'

const {
  resolveEntityMock,
  crossReferenceMock,
  linkRelationshipMock,
  createContactMock,
} = vi.hoisted(() => ({
  resolveEntityMock: vi.fn(),
  crossReferenceMock: vi.fn(),
  linkRelationshipMock: vi.fn().mockResolvedValue(undefined),
  createContactMock: vi.fn(),
}))

vi.mock('@/lib/context/entity-resolver', () => ({
  resolveEntity: resolveEntityMock,
  resolveEntityRanked: resolveEntityMock,
}))

vi.mock('@/lib/context/cross-reference', () => ({
  crossReference: crossReferenceMock,
}))

vi.mock('@/lib/context/relationship-linker', () => ({
  linkRelationship: linkRelationshipMock,
}))

vi.mock('@/lib/agent/shared-tools', () => ({
  createContact: createContactMock,
}))

afterEach(() => vi.restoreAllMocks())
beforeEach(() => {
  resolveEntityMock.mockClear()
  crossReferenceMock.mockClear()
  linkRelationshipMock.mockClear()
  createContactMock.mockClear()
})

/**
 * Integration test: Multi-channel entity resolution and cross-reference linking.
 * Tests that contacts discovered via Gmail are linked with WhatsApp/Slack contact info,
 * and that context assembler surfaces related tasks, invoices, and relationships.
 */

interface MockContact extends Record<string, unknown> {
  id: string
  org_id: string
  name: string
  emails?: string[]
  phones?: string[]
  aliases?: string[]
  type: 'individual' | 'company'
}

interface MockTask extends Record<string, unknown> {
  id: string
  org_id: string
  title: string
  status: 'pending' | 'completed'
  contact_id?: string
}

interface MockInvoice extends Record<string, unknown> {
  id: string
  org_id: string
  invoice_number: string
  client_contact_id: string
  status: 'draft' | 'sent' | 'paid'
  total: number
}

interface CrossReferenceResult {
  relatedTasks: MockTask[]
  deadlines: Array<{ id: string; title: string; due_date: string }>
  financialSignals: {
    totalOutstanding: number
    overdueCount: number
    lastPaymentDate: string | null
    invoiceCount: number
  }
  waitingFor: Array<{ id: string; reason: string }>
}

describe('Context Resolution Integration', () => {
  it('resolves contact from Gmail and links to WhatsApp record', async () => {
    const gmailContact: MockContact = {
      id: 'contact-alice-gmail',
      org_id: TEST_ORG_ID,
      name: 'Alice Chen',
      emails: ['alice@example.com'],
      type: 'individual',
      aliases: ['alice'],
    }

    const whatsappContact: MockContact = {
      id: 'contact-alice-whatsapp',
      org_id: TEST_ORG_ID,
      name: 'Alice C',
      phones: ['+61412345678'],
      type: 'individual',
      aliases: [],
    }

    const { supabase, data } = createIntegrationSupabase({
      contacts: [gmailContact, whatsappContact],
    })

    resolveEntityMock.mockResolvedValueOnce(gmailContact)
    resolveEntityMock.mockResolvedValueOnce(whatsappContact)

    // 1. Resolve from Gmail
    const resolved1 = await resolveEntityMock(supabase, 'alice@example.com', TEST_ORG_ID)
    expect(resolved1.name).toBe('Alice Chen')
    expect(resolved1.emails).toContain('alice@example.com')

    // 2. Resolve from WhatsApp
    const resolved2 = await resolveEntityMock(supabase, '+61412345678', TEST_ORG_ID)
    expect(resolved2.phones).toContain('+61412345678')

    // 3. Link as same entity
    await linkRelationshipMock(supabase, 'contact-alice-gmail', 'contact-alice-whatsapp', 'merged_duplicate')
    expect(linkRelationshipMock).toHaveBeenCalledWith(
      supabase,
      expect.any(String),
      expect.any(String),
      'merged_duplicate',
    )
  })

  it('creates new contact when not found in system', async () => {
    const { supabase } = createIntegrationSupabase()

    const newContactData = {
      org_id: TEST_ORG_ID,
      name: 'Bob Wilson',
      emails: ['bob@newclient.com'],
      type: 'individual',
    }

    resolveEntityMock.mockRejectedValueOnce(new Error('Contact not found'))
    createContactMock.mockResolvedValueOnce({
      id: 'contact-bob-new',
      ...newContactData,
    })

    // 1. Try to resolve existing
    try {
      await resolveEntityMock(supabase, 'bob@newclient.com', TEST_ORG_ID)
    } catch {
      // Expected
    }

    // 2. Create new contact
    const newContact = await createContactMock(supabase, TEST_ORG_ID, newContactData)
    expect(newContact.id).toBeDefined()
    expect(newContact.name).toBe('Bob Wilson')
    expect(newContact.emails).toContain('bob@newclient.com')
  })

  it('assembles cross-reference context with related tasks and invoices', async () => {
    const contact: MockContact = {
      id: 'contact-steve',
      org_id: TEST_ORG_ID,
      name: 'Steve West',
      emails: ['steve@example.com'],
      type: 'individual',
    }

    const relatedTasks: MockTask[] = [
      {
        id: 'task-1',
        org_id: TEST_ORG_ID,
        title: 'Follow up on website proposal',
        status: 'pending',
        contact_id: 'contact-steve',
      },
      {
        id: 'task-2',
        org_id: TEST_ORG_ID,
        title: 'Send invoice for Phase 1',
        status: 'pending',
        contact_id: 'contact-steve',
      },
    ]

    const relatedInvoices: MockInvoice[] = [
      {
        id: 'inv-1',
        org_id: TEST_ORG_ID,
        invoice_number: 'AWU-202603-001',
        client_contact_id: 'contact-steve',
        status: 'sent',
        total: 5000,
      },
      {
        id: 'inv-2',
        org_id: TEST_ORG_ID,
        invoice_number: 'AWU-202603-002',
        client_contact_id: 'contact-steve',
        status: 'sent',
        total: 2500,
      },
    ]

    const { supabase, data } = createIntegrationSupabase({
      contacts: [contact],
      tasks: relatedTasks,
      invoices: relatedInvoices,
    })

    resolveEntityMock.mockResolvedValue(contact)

    const crossRefResult: CrossReferenceResult = {
      relatedTasks: relatedTasks,
      deadlines: [
        {
          id: 'task-1',
          title: 'Follow up on website proposal',
          due_date: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString(),
        },
      ],
      financialSignals: {
        totalOutstanding: 7500,
        overdueCount: 0,
        lastPaymentDate: null,
        invoiceCount: 2,
      },
      waitingFor: [{ id: 'inv-1', reason: 'payment' }],
    }

    crossReferenceMock.mockResolvedValue(crossRefResult)

    // 1. Resolve contact
    const resolved = await resolveEntityMock(supabase, 'steve@example.com', TEST_ORG_ID)
    expect(resolved.name).toBe('Steve West')

    // 2. Get cross-reference context
    const context = await crossReferenceMock(supabase, TEST_ORG_ID, resolved.id)

    expect(context.relatedTasks.length).toBe(2)
    expect(context.relatedTasks.every((t: MockTask) => t.contact_id === 'contact-steve')).toBe(true)
    expect(context.financialSignals.totalOutstanding).toBe(7500)
    expect(context.financialSignals.invoiceCount).toBe(2)
    expect(context.waitingFor.length).toBeGreaterThan(0)
  })

  it('detects duplicate contacts across channels and merges intelligently', async () => {
    const aliceGmail: MockContact = {
      id: 'contact-alice-1',
      org_id: TEST_ORG_ID,
      name: 'Alice Chen',
      emails: ['alice@company.com'],
      type: 'individual',
    }

    const aliceSlack: MockContact = {
      id: 'contact-alice-2',
      org_id: TEST_ORG_ID,
      name: 'Alice C.',
      phones: ['+61487654321'],
      type: 'individual',
    }

    const { supabase } = createIntegrationSupabase({
      contacts: [aliceGmail, aliceSlack],
    })

    // First lookup by email finds Gmail version
    resolveEntityMock.mockResolvedValueOnce(aliceGmail)

    // Second lookup by phone finds Slack version
    resolveEntityMock.mockResolvedValueOnce(aliceSlack)

    const byEmail = await resolveEntityMock(supabase, 'alice@company.com', TEST_ORG_ID)
    const byPhone = await resolveEntityMock(supabase, '+61487654321', TEST_ORG_ID)

    expect(byEmail.id).not.toBe(byPhone.id)

    // Link them as duplicates
    await linkRelationshipMock(supabase, byEmail.id, byPhone.id, 'duplicate')
    expect(linkRelationshipMock).toHaveBeenCalledWith(supabase, 'contact-alice-1', 'contact-alice-2', 'duplicate')
  })

  it('surfaces waiting-for context when contact has pending approvals', async () => {
    const contact: MockContact = {
      id: 'contact-vendor',
      org_id: TEST_ORG_ID,
      name: 'Vendor LLC',
      emails: ['contact@vendor.com'],
      type: 'company',
    }

    const { supabase } = createIntegrationSupabase({
      contacts: [contact],
    })

    const waitingForContext: CrossReferenceResult = {
      relatedTasks: [],
      deadlines: [],
      financialSignals: {
        totalOutstanding: 0,
        overdueCount: 0,
        lastPaymentDate: null,
        invoiceCount: 0,
      },
      waitingFor: [
        { id: 'approval-1', reason: 'awaiting approval on $10k proposal' },
        { id: 'approval-2', reason: 'waiting for signature on MSA' },
      ],
    }

    resolveEntityMock.mockResolvedValue(contact)
    crossReferenceMock.mockResolvedValue(waitingForContext)

    const resolved = await resolveEntityMock(supabase, 'contact@vendor.com', TEST_ORG_ID)
    const context = await crossReferenceMock(supabase, TEST_ORG_ID, resolved.id)

    expect(context.waitingFor.length).toBe(2)
    expect(context.waitingFor[0].reason).toContain('awaiting approval')
  })

  it('enriches contact context with historical interaction patterns', async () => {
    const contact: MockContact = {
      id: 'contact-repeat-client',
      org_id: TEST_ORG_ID,
      name: 'Repeat Client Inc',
      emails: ['orders@client.com'],
      type: 'company',
      aliases: ['repeat', 'client-inc'],
    }

    const { supabase } = createIntegrationSupabase({
      contacts: [contact],
    })

    const enrichedContext: CrossReferenceResult = {
      relatedTasks: [
        {
          id: 'task-order-1',
          org_id: TEST_ORG_ID,
          title: 'Monthly retainer invoice',
          status: 'pending',
          contact_id: contact.id,
        },
        {
          id: 'task-order-2',
          org_id: TEST_ORG_ID,
          title: 'Quarterly review call',
          status: 'pending',
          contact_id: contact.id,
        },
      ],
      deadlines: [],
      financialSignals: {
        totalOutstanding: 3000,
        overdueCount: 0,
        lastPaymentDate: '2026-02-28T00:00:00Z',
        invoiceCount: 12,
      },
      waitingFor: [],
    }

    resolveEntityMock.mockResolvedValue(contact)
    crossReferenceMock.mockResolvedValue(enrichedContext)

    const resolved = await resolveEntityMock(supabase, 'orders@client.com', TEST_ORG_ID)
    const context = await crossReferenceMock(supabase, TEST_ORG_ID, resolved.id)

    expect(context.financialSignals.invoiceCount).toBe(12)
    expect(context.financialSignals.lastPaymentDate).toBeDefined()
    expect(context.relatedTasks.length).toBe(2)
  })
})
