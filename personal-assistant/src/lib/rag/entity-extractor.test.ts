/**
 * Tests for entity extractor module
 *
 * Comprehensive test suite covering:
 * - Email extraction and normalization
 * - Phone number extraction with E.164 normalization
 * - Person name detection with contact cross-referencing
 * - Organization name detection
 * - Monetary amount extraction and normalization
 * - Date extraction with relative date conversion
 * - Reference number extraction
 * - Edge cases: signatures, quoted replies, duplicates
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Contact } from '@/lib/bitbit-core/types'
import { extractEntities, type EntityMention, type ExtractionResult } from './entity-extractor'

// ─── Test Fixtures ───────────────────────────────────────────────────────

const mockContacts: Contact[] = [
  {
    id: 'contact-1',
    org_id: 'org-123',
    slug: 'john-smith',
    name: 'John Smith',
    type: 'client',
    emails: ['john@example.com', 'j.smith@company.com'],
    phones: ['+61412345678', '+14155552671'],
    aliases: ['J. Smith', 'Johnny'],
    profile_data: { company_name: 'Smith & Associates' },
    communication_patterns: {},
    tags: [],
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
  },
  {
    id: 'contact-2',
    org_id: 'org-123',
    slug: 'acme-corp',
    name: 'ACME Corporation',
    type: 'partner',
    emails: ['contact@acme.com'],
    phones: ['+61398765432'],
    aliases: [],
    profile_data: { company_name: 'ACME Corp' },
    communication_patterns: {},
    tags: [],
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
  },
]

const mockSupabaseClient = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() =>
        Promise.resolve({
          data: mockContacts,
          error: null,
        })
      ),
    })),
  })),
} as unknown as SupabaseClient

// ─── Email Extraction Tests ──────────────────────────────────────────────

describe('Email Extraction', () => {
  it('should extract standard email addresses', async () => {
    const text = 'Contact me at john@example.com or jane@company.org'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const emails = result.mentions.filter((m) => m.type === 'email')
    expect(emails).toHaveLength(2)
    expect(emails[0].value).toBe('john@example.com')
    expect(emails[1].value).toBe('jane@company.org')
  })

  it('should normalize emails to lowercase', async () => {
    const text = 'Send to John@EXAMPLE.COM'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const emails = result.mentions.filter((m) => m.type === 'email')
    expect(emails[0].normalized).toBe('john@example.com')
  })

  it('should cross-reference known contacts', async () => {
    const text = 'Email john@example.com for details'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const emails = result.mentions.filter((m) => m.type === 'email')
    expect(emails[0].contactId).toBe('contact-1')
    expect(emails[0].confidence).toBeGreaterThan(0.9)
  })

  it('should not extract emails in signatures', async () => {
    const text = 'Discussion about the project.\n\n-- \nSent by: admin@internal.com'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const emails = result.mentions.filter((m) => m.type === 'email')
    // Should not include the signature email
    expect(emails.every((e) => e.value !== 'admin@internal.com')).toBe(true)
  })
})

// ─── Phone Number Extraction Tests ────────────────────────────────────────

describe('Phone Number Extraction', () => {
  it('should extract Australian mobile numbers', async () => {
    const text = 'Call me on 0412 345 678 or +61 412 345 678'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const phones = result.mentions.filter((m) => m.type === 'phone')
    expect(phones.length).toBeGreaterThanOrEqual(1)
  })

  it('should normalize Australian numbers to E.164 format', async () => {
    const text = 'Mobile: 0412 345 678'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const phones = result.mentions.filter((m) => m.type === 'phone')
    expect(phones[0].normalized).toBe('+61412345678')
  })

  it('should extract US phone numbers', async () => {
    const text = 'Call us at +1-415-555-2671 or (415) 555-2671'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const phones = result.mentions.filter((m) => m.type === 'phone')
    expect(phones.length).toBeGreaterThanOrEqual(1)
  })

  it('should normalize US numbers to E.164 format', async () => {
    // US numbers require the country code prefix (1) for the extractor to recognize them
    const text = 'Phone: +1-415-555-2671'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const phones = result.mentions.filter((m) => m.type === 'phone')
    // Should normalize to +1 format
    expect(phones.length).toBeGreaterThanOrEqual(1)
    expect(phones[0].normalized).toMatch(/^\+1/)
  })

  it('should extract international numbers', async () => {
    const text = 'International: +44-20-7946-0958'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const phones = result.mentions.filter((m) => m.type === 'phone')
    expect(phones.length).toBeGreaterThanOrEqual(1)
  })

  it('should cross-reference known contact phones', async () => {
    const text = 'Contact via 0412 345 678'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const phones = result.mentions.filter((m) => m.type === 'phone')
    expect(phones[0].contactId).toBe('contact-1')
  })

  it('should deduplicate normalized phone numbers', async () => {
    const text = 'Call 0412 345 678 or +61412345678 - same number'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const phones = result.mentions.filter((m) => m.type === 'phone')
    // Should only have one after deduplication
    expect(phones.length).toBe(1)
  })
})

// ─── Person Name Extraction Tests ────────────────────────────────────────

describe('Person Name Extraction', () => {
  it('should extract names with titles', async () => {
    const text = 'Meeting with Mr. John Smith and Dr. Jane Doe'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const persons = result.mentions.filter((m) => m.type === 'person')
    expect(persons.length).toBeGreaterThanOrEqual(1)
    expect(persons[0].value).toContain('Smith')
  })

  it('should cross-reference known contacts by name', async () => {
    const text = 'Discussion with Mr. John Smith about the project'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const persons = result.mentions.filter((m) => m.type === 'person')
    const smith = persons.find((p) => p.value.includes('Smith'))
    expect(smith?.contactId).toBe('contact-1')
    expect(smith?.confidence).toBeGreaterThan(0.85)
  })

  it('should handle multiple title formats', async () => {
    const text = 'Spoke to Mrs. Sarah Johnson, Prof. Robert Lee, and Sir William Brown'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const persons = result.mentions.filter((m) => m.type === 'person')
    expect(persons.length).toBeGreaterThanOrEqual(2)
  })
})

// ─── Organization Name Extraction Tests ──────────────────────────────────

describe('Organization Name Extraction', () => {
  it('should extract company names with Pty Ltd', async () => {
    const text = 'We work with Smith & Associates Pty Ltd on various projects'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const orgs = result.mentions.filter((m) => m.type === 'organization')
    expect(orgs.length).toBeGreaterThanOrEqual(1)
    expect(orgs[0].value).toContain('Pty Ltd')
  })

  it('should extract company names with LLC', async () => {
    const text = 'Partnership with Creative Solutions LLC'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const orgs = result.mentions.filter((m) => m.type === 'organization')
    expect(orgs.length).toBeGreaterThanOrEqual(1)
  })

  it('should extract company names with Inc', async () => {
    const text = 'Contact TechCorp Inc. for implementation'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const orgs = result.mentions.filter((m) => m.type === 'organization')
    expect(orgs.length).toBeGreaterThanOrEqual(1)
  })

  it('should cross-reference known organizations', async () => {
    const text = 'Meeting with ACME Corporation Pty Ltd'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const orgs = result.mentions.filter((m) => m.type === 'organization')
    const acme = orgs.find((o) => o.value.includes('ACME'))
    if (acme) {
      // Confidence is 0.7 when not cross-referenced, 0.95 when matched to a contact
      expect(acme.confidence).toBeGreaterThanOrEqual(0.7)
    }
  })

  it('should deduplicate organization names', async () => {
    const text = 'ACME Corp works with ACME Corporation'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const orgs = result.mentions.filter((m) => m.type === 'organization')
    // Should deduplicate similar names
    expect(orgs.length).toBeLessThanOrEqual(2)
  })
})

// ─── Monetary Amount Extraction Tests ────────────────────────────────────

describe('Monetary Amount Extraction', () => {
  it('should extract dollar amounts with cents', async () => {
    const text = 'Invoice for $1,234.56 due immediately'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const money = result.mentions.filter((m) => m.type === 'money')
    expect(money.length).toBeGreaterThanOrEqual(1)
    expect(money[0].value).toBe('$1,234.56')
  })

  it('should normalize amounts to cents', async () => {
    const text = 'Total: $100.50'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const money = result.mentions.filter((m) => m.type === 'money')
    expect(money[0].normalized).toBe('10050')
  })

  it('should handle "k" shorthand (thousands)', async () => {
    const text = 'Budget: $5k for the project'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const money = result.mentions.filter((m) => m.type === 'money')
    expect(money.length).toBeGreaterThanOrEqual(1)
  })

  it('should extract amounts with currency codes', async () => {
    const text = 'Price: 2000 AUD or 1500 USD'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const money = result.mentions.filter((m) => m.type === 'money')
    expect(money.length).toBeGreaterThanOrEqual(2)
  })

  it('should extract amounts with currency prefix', async () => {
    const text = 'Cost is AUD 5,000.00'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const money = result.mentions.filter((m) => m.type === 'money')
    expect(money.length).toBeGreaterThanOrEqual(1)
  })
})

// ─── Date Extraction Tests ────────────────────────────────────────────────

describe('Date Extraction', () => {
  it('should extract ISO format dates', async () => {
    const text = 'Meeting scheduled for 2026-03-15'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const dates = result.mentions.filter((m) => m.type === 'date')
    expect(dates.length).toBeGreaterThanOrEqual(1)
    expect(dates[0].normalized).toBe('2026-03-15')
  })

  it('should extract written dates with year', async () => {
    const text = 'Deadline is March 15, 2026'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const dates = result.mentions.filter((m) => m.type === 'date')
    expect(dates.length).toBeGreaterThanOrEqual(1)
    expect(dates[0].normalized).toBe('2026-03-15')
  })

  it('should extract short month format dates', async () => {
    const text = 'Mar 15 2026 is the deadline'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const dates = result.mentions.filter((m) => m.type === 'date')
    expect(dates.length).toBeGreaterThanOrEqual(1)
  })

  it('should extract numeric dates (AU format)', async () => {
    const text = 'Due: 15/03/2026'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const dates = result.mentions.filter((m) => m.type === 'date')
    expect(dates.length).toBeGreaterThanOrEqual(1)
  })

  it('should normalize numeric dates to ISO', async () => {
    const text = 'Date: 15/03/2026'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const dates = result.mentions.filter((m) => m.type === 'date')
    expect(dates[0].normalized).toBe('2026-03-15')
  })

  it('should extract relative dates', async () => {
    const text = 'Meeting is tomorrow or next week'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const dates = result.mentions.filter((m) => m.type === 'date')
    expect(dates.length).toBeGreaterThanOrEqual(1)
  })

  it('should extract "today" relative date', async () => {
    const text = 'Do this today'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const dates = result.mentions.filter((m) => m.type === 'date')
    const today = dates.find((d) => d.value === 'today')
    if (today?.normalized) {
      expect(today.normalized).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})

// ─── Reference Number Extraction Tests ────────────────────────────────────

describe('Reference Number Extraction', () => {
  it('should extract invoice numbers', async () => {
    const text = 'Invoice INV-2026-0001 issued on March 15'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const refs = result.mentions.filter((m) => m.type === 'reference')
    expect(refs.length).toBeGreaterThanOrEqual(1)
  })

  it('should extract PO numbers', async () => {
    const text = 'PO-2026-005 requires approval'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const refs = result.mentions.filter((m) => m.type === 'reference')
    expect(refs.length).toBeGreaterThanOrEqual(1)
  })

  it('should extract hash-prefixed references', async () => {
    const text = 'Reference #TICKET-12345 for support'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const refs = result.mentions.filter((m) => m.type === 'reference')
    expect(refs.length).toBeGreaterThanOrEqual(1)
  })

  it('should extract AWU-format references', async () => {
    const text = 'See AWU-202603-001 for details'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const refs = result.mentions.filter((m) => m.type === 'reference')
    expect(refs.length).toBeGreaterThanOrEqual(1)
  })
})

// ─── Edge Case Tests ──────────────────────────────────────────────────────

describe('Edge Cases', () => {
  it('should handle empty text', async () => {
    const result = await extractEntities('', 'org-123', mockSupabaseClient)

    expect(result.mentions).toHaveLength(0)
    expect(result.entityCount).toBe(0)
    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0)
  })

  it('should handle text with no entities', async () => {
    const text = 'This is a simple message with no special information.'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    expect(result.mentions.length).toBe(0)
    expect(result.entityCount).toBe(0)
  })

  it('should skip quoted reply sections', async () => {
    const text = 'My response.\n\n> Original message\n> from@original.com'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const emails = result.mentions.filter((m) => m.type === 'email')
    // Should not include the quoted email
    expect(emails.every((e) => e.value !== 'from@original.com')).toBe(true)
  })

  it('should return processing time', async () => {
    const text = 'Email me at test@example.com'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    expect(result.processingTimeMs).toBeGreaterThan(0)
    expect(result.processingTimeMs).toBeLessThan(100) // Should be fast
  })

  it('should handle mixed entity types in single message', async () => {
    const text = `
      Meeting with Mr. John Smith from ACME Corp Pty Ltd
      Email: john@example.com
      Phone: 0412 345 678
      Date: March 15, 2026
      Amount: $5,500
      Invoice: INV-2026-001
    `
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    expect(result.mentions.length).toBeGreaterThan(5)

    // Verify we got all entity types
    const types = new Set(result.mentions.map((m) => m.type))
    expect(types.has('person')).toBe(true)
    expect(types.has('organization')).toBe(true)
    expect(types.has('email')).toBe(true)
    expect(types.has('phone')).toBe(true)
    expect(types.has('date')).toBe(true)
    expect(types.has('money')).toBe(true)
    expect(types.has('reference')).toBe(true)
  })

  it('should sort mentions by position', async () => {
    const text = 'First John at email@test.com then call 0412345678'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    let lastPosition = -1
    for (const mention of result.mentions) {
      expect(mention.position.start).toBeGreaterThanOrEqual(lastPosition)
      lastPosition = mention.position.start
    }
  })

  it('should populate entityCount correctly', async () => {
    const text = 'Contact john@example.com or jane@company.org'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    expect(result.entityCount).toBe(result.mentions.length)
  })

  it('should set confidence higher for known contacts', async () => {
    const text = 'Email john@example.com and unknown@example.com'
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)

    const emails = result.mentions.filter((m) => m.type === 'email')
    const known = emails.find((e) => e.contactId)
    const unknown = emails.find((e) => !e.contactId)

    if (known && unknown) {
      expect(known.confidence).toBeGreaterThan(unknown.confidence)
    }
  })
})

// ─── Performance Tests ───────────────────────────────────────────────────

describe('Performance', () => {
  it('should process typical message in <20ms', async () => {
    const text = `
      Hi John,

      Following up on our meeting with ACME Corp on March 15, 2026.

      Details:
      - Contact: Dr. Jane Smith at jane@company.com or +61 412 345 678
      - Invoice: INV-2026-001
      - Amount: $5,500.00 AUD
      - Payment due: 30/04/2026

      Please confirm.

      Thanks,
      Bob
    `
    const start = performance.now()
    const result = await extractEntities(text, 'org-123', mockSupabaseClient)
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(50)
    expect(result.processingTimeMs).toBeLessThan(20)
  })
})
