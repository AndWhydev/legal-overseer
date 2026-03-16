import { describe, it, expect } from 'vitest'
import { scanForEntityMentions, type ScanContact } from './entity-mention-scanner'

const contacts: ScanContact[] = [
  {
    id: 'c1',
    name: 'Steve West',
    emails: ['steve.west55@icloud.com'],
    phones: ['+61400111222'],
    aliases: ['Westie'],
  },
  {
    id: 'c2',
    name: 'Andy Taleb',
    emails: ['andy@allwebbedup.com.au'],
    phones: ['+61400333444'],
    aliases: ['AT'],
  },
  {
    id: 'c3',
    name: 'LegalSign',
    emails: ['noreply@legalsign.com.au'],
    phones: [],
    aliases: ['Legal Sign'],
  },
  {
    id: 'c4',
    name: 'Jo',
    emails: ['jo@example.com'],
    phones: [],
    aliases: [],
  },
]

describe('scanForEntityMentions', () => {
  it('matches contact by full name', () => {
    const result = scanForEntityMentions('Can you check on Steve West?', contacts)
    expect(result).toHaveLength(1)
    expect(result[0].contactId).toBe('c1')
    expect(result[0].matchedOn).toBe('name')
  })

  it('matches contact by email', () => {
    const result = scanForEntityMentions('Got an email from jo@example.com', contacts)
    expect(result).toHaveLength(1)
    expect(result[0].contactId).toBe('c4')
    expect(result[0].matchedOn).toBe('email')
  })

  it('matches contact by alias', () => {
    const result = scanForEntityMentions("What's Westie up to?", contacts)
    expect(result).toHaveLength(1)
    expect(result[0].contactId).toBe('c1')
    expect(result[0].matchedOn).toBe('alias')
  })

  it('matches contact by phone number', () => {
    const result = scanForEntityMentions('Call +61400111222 please', contacts)
    expect(result).toHaveLength(1)
    expect(result[0].contactId).toBe('c1')
    expect(result[0].matchedOn).toBe('phone')
  })

  it('matches multiple contacts in one message', () => {
    const result = scanForEntityMentions('Set up a meeting between Steve West and Andy Taleb', contacts)
    expect(result).toHaveLength(2)
    expect(result.map(r => r.contactName)).toEqual(['Steve West', 'Andy Taleb'])
  })

  it('is case insensitive for names', () => {
    const result = scanForEntityMentions('what about steve west?', contacts)
    expect(result).toHaveLength(1)
    expect(result[0].contactId).toBe('c1')
  })

  it('skips short names (< 3 chars) to avoid false positives', () => {
    const result = scanForEntityMentions("Jo called me", contacts)
    expect(result).toHaveLength(0)
  })

  it('returns empty for generic messages with no entity mentions', () => {
    const result = scanForEntityMentions('What time is it?', contacts)
    expect(result).toHaveLength(0)
  })

  it('returns empty for empty message', () => {
    expect(scanForEntityMentions('', contacts)).toHaveLength(0)
  })

  it('returns empty for empty contacts list', () => {
    expect(scanForEntityMentions('Steve West', [])).toHaveLength(0)
  })

  it('respects the limit parameter', () => {
    const result = scanForEntityMentions(
      'Steve West and Andy Taleb and LegalSign',
      contacts,
      2
    )
    expect(result).toHaveLength(2)
  })

  it('does not duplicate contacts', () => {
    const result = scanForEntityMentions(
      'Email steve.west55@icloud.com about Steve West project',
      contacts
    )
    expect(result).toHaveLength(1)
    expect(result[0].contactId).toBe('c1')
    // Name match comes first in priority
    expect(result[0].matchedOn).toBe('name')
  })

  it('prefers name match over alias match', () => {
    const result = scanForEntityMentions('Steve West aka Westie', contacts)
    expect(result).toHaveLength(1)
    expect(result[0].matchedOn).toBe('name')
  })

  it('matches multi-word alias', () => {
    const result = scanForEntityMentions('anything from Legal Sign?', contacts)
    expect(result).toHaveLength(1)
    expect(result[0].contactId).toBe('c3')
    expect(result[0].matchedOn).toBe('alias')
  })
})
