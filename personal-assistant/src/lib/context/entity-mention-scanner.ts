/**
 * Lightweight entity mention scanner.
 * Pure string matching — no DB calls, no LLM calls.
 * Scans user message text against known contacts to find mentions.
 */

export interface ScanContact {
  id: string
  name: string
  emails: string[]
  phones: string[]
  aliases: string[]
}

export interface MentionMatch {
  contactId: string
  contactName: string
  matchedOn: 'name' | 'email' | 'phone' | 'alias'
  matchedValue: string
}

/**
 * Scan a user message for mentions of known contacts.
 * Returns matched contacts, ordered by match quality (name > email > phone > alias).
 * Limits results to `limit` contacts to avoid context bloat.
 */
export function scanForEntityMentions(
  message: string,
  contacts: ScanContact[],
  limit: number = 5
): MentionMatch[] {
  if (!message || contacts.length === 0) return []

  const messageLower = message.toLowerCase()
  const matches: MentionMatch[] = []
  const seenIds = new Set<string>()

  for (const contact of contacts) {
    if (matches.length >= limit) break
    if (seenIds.has(contact.id)) continue

    // Check full name (min 3 chars to avoid false positives like "Jo")
    if (contact.name && contact.name.length >= 3) {
      const nameLower = contact.name.toLowerCase()
      if (messageLower.includes(nameLower)) {
        matches.push({ contactId: contact.id, contactName: contact.name, matchedOn: 'name', matchedValue: contact.name })
        seenIds.add(contact.id)
        continue
      }

      // Check individual name parts (first name, last name) — min 3 chars each
      const nameParts = contact.name.split(/\s+/).filter(p => p.length >= 3)
      for (const part of nameParts) {
        const partLower = part.toLowerCase()
        // Match as whole word to avoid false positives ("art" in "starting")
        const wordBoundary = new RegExp(`\\b${partLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
        if (wordBoundary.test(messageLower)) {
          matches.push({ contactId: contact.id, contactName: contact.name, matchedOn: 'name', matchedValue: part })
          seenIds.add(contact.id)
          break
        }
      }
      if (seenIds.has(contact.id)) continue
    }

    // Check aliases (min 3 chars)
    for (const alias of contact.aliases) {
      if (alias.length >= 3 && messageLower.includes(alias.toLowerCase())) {
        matches.push({ contactId: contact.id, contactName: contact.name, matchedOn: 'alias', matchedValue: alias })
        seenIds.add(contact.id)
        break
      }
    }
    if (seenIds.has(contact.id)) continue

    // Check emails
    for (const email of contact.emails) {
      if (messageLower.includes(email.toLowerCase())) {
        matches.push({ contactId: contact.id, contactName: contact.name, matchedOn: 'email', matchedValue: email })
        seenIds.add(contact.id)
        break
      }
    }
    if (seenIds.has(contact.id)) continue

    // Check phone numbers (exact substring, not lowercased)
    for (const phone of contact.phones) {
      if (phone.length >= 6 && message.includes(phone)) {
        matches.push({ contactId: contact.id, contactName: contact.name, matchedOn: 'phone', matchedValue: phone })
        seenIds.add(contact.id)
        break
      }
    }
  }

  return matches
}
