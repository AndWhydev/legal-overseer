/**
 * Fetches Google profile photos for email addresses via the People API.
 * Used during Gmail message processing to populate contact_avatars.
 *
 * Requires a valid Google OAuth access token with the
 * `https://www.googleapis.com/auth/contacts.other.readonly` or
 * `profile` scope.
 */

import { logger } from '@/lib/core/logger'

interface GooglePerson {
  resourceName?: string
  photos?: Array<{
    url?: string
    metadata?: { primary?: boolean; source?: { type?: string } }
  }>
}

interface PeopleSearchResponse {
  results?: Array<{
    person?: GooglePerson
  }>
}

interface PeopleConnectionsResponse {
  otherContacts?: GooglePerson[]
  connections?: GooglePerson[]
}

// In-memory dedup — don't re-fetch the same email within a session
const fetchedThisSession = new Set<string>()

/**
 * Look up a Google profile photo by email address.
 * Tries People API searchDirectoryPeople first, falls back to otherContacts.
 * Returns the photo URL or null if not found.
 */
export async function fetchGoogleProfilePhoto(
  accessToken: string,
  email: string
): Promise<string | null> {
  const normalized = email.toLowerCase().trim()
  if (!normalized || fetchedThisSession.has(normalized)) return null
  fetchedThisSession.add(normalized)

  try {
    // Method 1: Search People API for the email
    const searchUrl = `https://people.googleapis.com/v1/people:searchContacts?query=${encodeURIComponent(normalized)}&readMask=photos&pageSize=1`
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    })

    if (searchRes.ok) {
      const data = (await searchRes.json()) as PeopleSearchResponse
      const photo = data.results?.[0]?.person?.photos?.find(p => p.metadata?.primary)?.url
        ?? data.results?.[0]?.person?.photos?.[0]?.url
      if (photo) return photo
    }

    // Method 2: Try otherContacts (people you've emailed but not explicitly added)
    const otherUrl = `https://people.googleapis.com/v1/otherContacts:search?query=${encodeURIComponent(normalized)}&readMask=photos&pageSize=1`
    const otherRes = await fetch(otherUrl, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    })

    if (otherRes.ok) {
      const otherData = (await otherRes.json()) as PeopleConnectionsResponse
      const contacts = otherData.otherContacts ?? otherData.connections ?? []
      const photo = contacts[0]?.photos?.find(p => p.metadata?.primary)?.url
        ?? contacts[0]?.photos?.[0]?.url
      if (photo) return photo
    }

    return null
  } catch (err) {
    logger.debug(`[google-photos] Failed to fetch photo for ${normalized}:`, err)
    return null
  }
}

/**
 * Batch-fetch Google profile photos for multiple email addresses.
 * Returns a map of email → photo URL (only for emails that have photos).
 */
export async function fetchGoogleProfilePhotos(
  accessToken: string,
  emails: string[]
): Promise<Map<string, string>> {
  const results = new Map<string, string>()
  const unique = [...new Set(emails.map(e => e.toLowerCase().trim()).filter(Boolean))]

  // Process in batches of 5 to avoid rate limiting
  const BATCH_SIZE = 5
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE)
    const promises = batch.map(async (email) => {
      const photo = await fetchGoogleProfilePhoto(accessToken, email)
      if (photo) results.set(email, photo)
    })
    await Promise.all(promises)
  }

  return results
}

/**
 * Store a Google profile photo in the contact_avatars table.
 * Looks up the contact by email, then upserts the avatar.
 */
export async function storeGoogleAvatarForContact(
  supabase: { from: (table: string) => any },
  email: string,
  photoUrl: string
): Promise<void> {
  const normalized = email.toLowerCase().trim()

  // Find contact by email
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id')
    .contains('emails', [normalized])
    .limit(1)

  if (!contacts?.length) return

  const contactId = contacts[0].id

  // Upsert avatar
  await supabase
    .from('contact_avatars')
    .upsert(
      {
        contact_id: contactId,
        channel: 'google',
        avatar_url: photoUrl,
        priority: 20,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'contact_id,channel' }
    )
}
