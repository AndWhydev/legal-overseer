/**
 * Contact Resolver
 *
 * Cross-references extracted people and organisations against the contacts
 * table. Performs fuzzy name matching, exact email/phone matching, and flags
 * unknown entities for potential auto-creation.
 *
 * Uses a per-org LRU cache to minimise Supabase queries during batch ingestion.
 *
 * @module ingestion/contact-resolver
 */

import { logger } from '@/lib/core/logger'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EntityExtraction } from './schemas'

// ─── Types ───────────────────────────────────────────────────────────────

/** A resolved contact match */
export interface ResolvedContact {
  /** Matched contact ID from the contacts table */
  contactId: string
  /** Contact name from the database */
  contactName: string
  /** How the match was made */
  matchMethod: 'exact_email' | 'exact_phone' | 'fuzzy_name'
  /** Confidence in the match (0-1) */
  confidence: number
  /** The original extracted value that was matched */
  extractedValue: string
}

/** An unresolved entity that didn't match any existing contact */
export interface UnresolvedEntity {
  /** What type of entity this is */
  type: 'person' | 'organisation'
  /** The extracted name/value */
  value: string
  /** Additional data that could help with future matching */
  email?: string
  phone?: string
}

/** Complete result of contact resolution */
export interface ResolvedContacts {
  /** Entities that matched existing contacts */
  resolved: ResolvedContact[]
  /** Entities that did not match any existing contact */
  unresolved: UnresolvedEntity[]
  /** Total processing time in milliseconds */
  processingTimeMs: number
}

// ─── Contact Cache (LRU per org) ─────────────────────────────────────────

interface CachedContact {
  id: string
  name: string
  emails: string[]
  phones: string[]
  aliases: string[]
}

interface OrgCacheEntry {
  contacts: CachedContact[]
  loadedAt: number
}

/** LRU cache: orgId -> contacts. Max 50 orgs cached. */
const ORG_CACHE = new Map<string, OrgCacheEntry>()
const MAX_CACHE_SIZE = 50
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Evict oldest entry when cache exceeds max size (simple LRU).
 */
function evictIfNeeded(): void {
  if (ORG_CACHE.size <= MAX_CACHE_SIZE) return
  // Map iteration order is insertion order — first entry is oldest
  const oldestKey = ORG_CACHE.keys().next().value
  if (oldestKey !== undefined) {
    ORG_CACHE.delete(oldestKey)
  }
}

/**
 * Load contacts for an org from Supabase, with caching.
 */
async function loadContacts(
  orgId: string,
  supabase: SupabaseClient,
): Promise<CachedContact[]> {
  const cached = ORG_CACHE.get(orgId)
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    // Move to end of Map for LRU (delete + re-insert)
    ORG_CACHE.delete(orgId)
    ORG_CACHE.set(orgId, cached)
    return cached.contacts
  }

  const { data, error } = await supabase
    .from('contacts')
    .select('id, name, emails, phones, aliases')
    .eq('org_id', orgId)

  if (error) {
    logger.warn('[contact-resolver] Failed to load contacts', {
      orgId,
      error: error.message,
    })
    return cached?.contacts ?? []
  }

  const contacts: CachedContact[] = (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    emails: Array.isArray(row.emails) ? row.emails.map(String) : [],
    phones: Array.isArray(row.phones) ? row.phones.map(String) : [],
    aliases: Array.isArray(row.aliases) ? row.aliases.map(String) : [],
  }))

  evictIfNeeded()
  ORG_CACHE.set(orgId, { contacts, loadedAt: Date.now() })
  return contacts
}

// ─── Matching Helpers ────────────────────────────────────────────────────

/**
 * Normalize a string for fuzzy comparison:
 * lowercase, collapse whitespace, remove common titles.
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^(mr|mrs|ms|dr|prof|sir|rev|fr)\.?\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Simple fuzzy name match: checks if names match after normalization,
 * or if one name is contained in the other (handles "John" matching "John Smith").
 */
function fuzzyNameMatch(
  extracted: string,
  contact: CachedContact,
): { matched: boolean; confidence: number } {
  const a = normalizeName(extracted)
  const contactName = normalizeName(contact.name)

  // Exact match after normalization
  if (a === contactName) {
    return { matched: true, confidence: 0.95 }
  }

  // Check aliases
  for (const alias of contact.aliases) {
    if (normalizeName(alias) === a) {
      return { matched: true, confidence: 0.9 }
    }
  }

  // Partial match: extracted name is contained in contact name or vice versa
  // Only match if the extracted portion is at least 4 chars (avoid false positives)
  if (a.length >= 4 && (contactName.includes(a) || a.includes(contactName))) {
    return { matched: true, confidence: 0.7 }
  }

  return { matched: false, confidence: 0 }
}

// ─── Main Export ─────────────────────────────────────────────────────────

/**
 * Resolve extracted entities against the contacts table.
 *
 * Matching priority:
 * 1. Exact email match (highest confidence)
 * 2. Exact phone match
 * 3. Fuzzy name match (normalized, with alias support)
 *
 * @param entities - Extracted entities from the ingestion pipeline
 * @param orgId - Organisation ID for scoping the contact lookup
 * @param supabase - Supabase client
 * @returns ResolvedContacts with matched and unmatched entities
 */
export async function resolveContacts(
  entities: EntityExtraction,
  orgId: string,
  supabase: SupabaseClient,
): Promise<ResolvedContacts> {
  const startTime = performance.now()
  const resolved: ResolvedContact[] = []
  const unresolved: UnresolvedEntity[] = []

  try {
    const contacts = await loadContacts(orgId, supabase)

    // Resolve people
    for (const person of entities.people) {
      let matched = false

      // 1. Exact email match
      if (person.email) {
        const emailLower = person.email.toLowerCase()
        const contact = contacts.find((c) =>
          c.emails.some((e) => e.toLowerCase() === emailLower),
        )
        if (contact) {
          resolved.push({
            contactId: contact.id,
            contactName: contact.name,
            matchMethod: 'exact_email',
            confidence: 0.98,
            extractedValue: person.name,
          })
          matched = true
        }
      }

      // 2. Exact phone match
      if (!matched && person.phone) {
        const phoneCleaned = person.phone.replace(/[\s\-()]/g, '')
        const contact = contacts.find((c) =>
          c.phones.some((p) => p.replace(/[\s\-()]/g, '') === phoneCleaned),
        )
        if (contact) {
          resolved.push({
            contactId: contact.id,
            contactName: contact.name,
            matchMethod: 'exact_phone',
            confidence: 0.95,
            extractedValue: person.name,
          })
          matched = true
        }
      }

      // 3. Fuzzy name match
      if (!matched && person.name) {
        for (const contact of contacts) {
          const result = fuzzyNameMatch(person.name, contact)
          if (result.matched) {
            resolved.push({
              contactId: contact.id,
              contactName: contact.name,
              matchMethod: 'fuzzy_name',
              confidence: result.confidence,
              extractedValue: person.name,
            })
            matched = true
            break
          }
        }
      }

      if (!matched) {
        unresolved.push({
          type: 'person',
          value: person.name,
          email: person.email,
          phone: person.phone,
        })
      }
    }

    // Resolve organisations
    for (const org of entities.organisations) {
      const orgNameNorm = normalizeName(org.name)
      const contact = contacts.find(
        (c) =>
          normalizeName(c.name) === orgNameNorm ||
          c.aliases.some((a) => normalizeName(a) === orgNameNorm),
      )

      if (contact) {
        resolved.push({
          contactId: contact.id,
          contactName: contact.name,
          matchMethod: 'fuzzy_name',
          confidence: 0.85,
          extractedValue: org.name,
        })
      } else {
        unresolved.push({
          type: 'organisation',
          value: org.name,
        })
      }
    }
  } catch (err) {
    logger.warn('[contact-resolver] Resolution failed, returning all as unresolved', {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    })

    // Return everything as unresolved rather than crashing
    for (const person of entities.people) {
      unresolved.push({ type: 'person', value: person.name, email: person.email, phone: person.phone })
    }
    for (const org of entities.organisations) {
      unresolved.push({ type: 'organisation', value: org.name })
    }
  }

  return {
    resolved,
    unresolved,
    processingTimeMs: Math.round(performance.now() - startTime),
  }
}
