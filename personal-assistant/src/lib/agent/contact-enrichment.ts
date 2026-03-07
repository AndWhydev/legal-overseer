import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnrichmentResult {
  company?: string
  role?: string
  timezone?: string
  phone?: string
  website?: string
  updated: boolean
}

// ---------------------------------------------------------------------------
// Extraction patterns
// ---------------------------------------------------------------------------

const ROLE_PATTERNS = [
  /(?:^|\n)\s*(CEO|CTO|CFO|COO|CMO|VP|Director|Manager|Head|Lead|Founder|Co-Founder|Owner|Partner|Principal|Consultant|Coordinator|Specialist|Analyst|Engineer|Developer|Designer)\b[^,\n]{0,40}/im,
  /(?:^|\n)\s*(?:Title|Role|Position):\s*(.+)/im,
]

const COMPANY_PATTERNS = [
  /(?:^|\n)\s*(?:Company|Organization|Organisation|Org):\s*(.+)/im,
  /(?:^|\n)\s*(.+?)\s*(?:Pty Ltd|LLC|Inc|Ltd|GmbH|Corp|Co\.|Limited)\b/im,
  /\|\s*(.+?)\s*$/m, // "Name | Company" pattern in signatures
]

const PHONE_PATTERNS = [
  /(?:(?:Tel|Phone|Mobile|Cell|M|P|Ph)[\s.:]*)?(\+?\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4})/i,
]

const WEBSITE_PATTERNS = [
  /(?:https?:\/\/)?(?:www\.)?([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:com|com\.au|net|org|io|co|dev|agency|studio|design|tech|app))/i,
]

const TIMEZONE_INDICATORS: Record<string, string> = {
  'aest': 'Australia/Sydney',
  'aedt': 'Australia/Sydney',
  'awst': 'Australia/Perth',
  'acst': 'Australia/Adelaide',
  'nzst': 'Pacific/Auckland',
  'nzdt': 'Pacific/Auckland',
  'gmt': 'Europe/London',
  'bst': 'Europe/London',
  'est': 'America/New_York',
  'edt': 'America/New_York',
  'cst': 'America/Chicago',
  'cdt': 'America/Chicago',
  'pst': 'America/Los_Angeles',
  'pdt': 'America/Los_Angeles',
  'ist': 'Asia/Kolkata',
  'sgt': 'Asia/Singapore',
  'jst': 'Asia/Tokyo',
  'cet': 'Europe/Berlin',
  'cest': 'Europe/Berlin',
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

function extractFromSignature(text: string): Partial<EnrichmentResult> {
  const result: Partial<EnrichmentResult> = {}

  // Extract from the last ~500 chars (signature area)
  const signatureArea = text.slice(-500)

  for (const pattern of ROLE_PATTERNS) {
    const match = signatureArea.match(pattern)
    if (match) {
      result.role = match[1]?.trim() || match[0]?.trim()
      break
    }
  }

  for (const pattern of COMPANY_PATTERNS) {
    const match = signatureArea.match(pattern)
    if (match) {
      result.company = match[1]?.trim()
      break
    }
  }

  for (const pattern of PHONE_PATTERNS) {
    const match = signatureArea.match(pattern)
    if (match) {
      result.phone = match[1]?.trim()
      break
    }
  }

  for (const pattern of WEBSITE_PATTERNS) {
    const match = signatureArea.match(pattern)
    if (match) {
      result.website = match[0]?.trim()
      break
    }
  }

  // Timezone from abbreviation in signature
  const lower = signatureArea.toLowerCase()
  for (const [abbr, tz] of Object.entries(TIMEZONE_INDICATORS)) {
    if (lower.includes(abbr)) {
      result.timezone = tz
      break
    }
  }

  return result
}

function extractFromEmailDomain(email: string | null | undefined): Partial<EnrichmentResult> {
  if (!email) return {}

  const domain = email.split('@')[1]
  if (!domain) return {}

  // Skip common free email providers
  const freeProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'protonmail.com', 'live.com']
  if (freeProviders.includes(domain.toLowerCase())) return {}

  // Company name from domain (naive: remove TLD, capitalize)
  const parts = domain.split('.')
  if (parts.length >= 2) {
    const companyPart = parts[0]
    const company = companyPart.charAt(0).toUpperCase() + companyPart.slice(1)
    return { company, website: domain }
  }

  return {}
}

// ---------------------------------------------------------------------------
// Main enrichment function
// ---------------------------------------------------------------------------

/**
 * Extract company, role, timezone, phone from message content and email.
 * Updates the contact record with any new information found.
 * Only fills in missing fields -- never overwrites existing data.
 */
export async function enrichContact(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string,
  messageBody: string,
  senderEmail?: string | null,
): Promise<EnrichmentResult> {
  const result: EnrichmentResult = { updated: false }

  // Get current contact data
  const { data: contact } = await supabase
    .from('contacts')
    .select('profile_data, emails, phones, communication_patterns')
    .eq('org_id', orgId)
    .eq('id', contactId)
    .single()

  if (!contact) return result

  const profileData = (contact.profile_data || {}) as Record<string, unknown>
  const commPatterns = (contact.communication_patterns || {}) as Record<string, unknown>

  // Extract from message signature
  const sigInfo = extractFromSignature(messageBody)

  // Extract from email domain
  const emailInfo = extractFromEmailDomain(senderEmail)

  // Merge (only fill missing)
  const updates: Record<string, unknown> = {}
  const profileUpdates: Record<string, unknown> = {}
  const commUpdates: Record<string, unknown> = {}

  if (!profileData.company && (sigInfo.company || emailInfo.company)) {
    profileUpdates.company = sigInfo.company || emailInfo.company
    result.company = profileUpdates.company as string
  }

  if (!profileData.role && sigInfo.role) {
    profileUpdates.role = sigInfo.role
    result.role = sigInfo.role
  }

  if (!profileData.website && (sigInfo.website || emailInfo.website)) {
    profileUpdates.website = sigInfo.website || emailInfo.website
    result.website = profileUpdates.website as string
  }

  if (!commPatterns.timezone && sigInfo.timezone) {
    commUpdates.timezone = sigInfo.timezone
    result.timezone = sigInfo.timezone
  }

  // Add phone if new
  if (sigInfo.phone) {
    const existingPhones = (contact.phones || []) as string[]
    const normalized = sigInfo.phone.replace(/[\s.-]/g, '')
    const hasPhone = existingPhones.some(p => p.replace(/[\s.-]/g, '') === normalized)
    if (!hasPhone) {
      updates.phones = [...existingPhones, sigInfo.phone]
      result.phone = sigInfo.phone
    }
  }

  // Add email if new
  if (senderEmail) {
    const existingEmails = (contact.emails || []) as string[]
    if (!existingEmails.includes(senderEmail.toLowerCase())) {
      updates.emails = [...existingEmails, senderEmail.toLowerCase()]
    }
  }

  // Apply updates
  const hasProfileUpdates = Object.keys(profileUpdates).length > 0
  const hasCommUpdates = Object.keys(commUpdates).length > 0
  const hasDirectUpdates = Object.keys(updates).length > 0

  if (hasProfileUpdates || hasCommUpdates || hasDirectUpdates) {
    const patch: Record<string, unknown> = { ...updates }
    if (hasProfileUpdates) {
      patch.profile_data = { ...profileData, ...profileUpdates }
    }
    if (hasCommUpdates) {
      patch.communication_patterns = { ...commPatterns, ...commUpdates }
    }

    const { error } = await supabase
      .from('contacts')
      .update(patch)
      .eq('org_id', orgId)
      .eq('id', contactId)

    if (error) {
      logger.warn('[contact-enrichment] Update failed:', error.message)
    } else {
      result.updated = true
    }
  }

  return result
}
