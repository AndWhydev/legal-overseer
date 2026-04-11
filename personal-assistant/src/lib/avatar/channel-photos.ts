/**
 * Channel profile photo fetcher.
 * Pulls real profile pictures from connected channels (Google, Outlook,
 * Slack, Asana) and stores them in contact_avatars with priority ranking.
 *
 * Each channel function is fire-and-forget safe — errors are caught and
 * logged, never thrown. Session-level dedup prevents redundant API calls.
 */

import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

// Session-level dedup — keyed by "channel:identifier"
const fetched = new Set<string>()

function dedup(channel: string, id: string): boolean {
  const key = `${channel}:${id.toLowerCase().trim()}`
  if (fetched.has(key)) return true
  fetched.add(key)
  return false
}

/** Priority map — lower = higher priority. Manual uploads always win. */
export const CHANNEL_PRIORITY: Record<string, number> = {
  manual: 10,
  google: 20,
  outlook: 25,
  slack: 30,
  asana: 35,
  whatsapp: 40,
  instagram: 45,
  linkedin: 50,
  facebook: 55,
  telegram: 60,
}

type Supabase = { from: (table: string) => any }

/**
 * Store a channel avatar for a contact matched by email.
 * Looks up the contact, then upserts into contact_avatars.
 */
export async function storeAvatarByEmail(
  supabase: Supabase,
  email: string,
  channel: string,
  photoUrl: string
): Promise<void> {
  const normalized = email.toLowerCase().trim()
  if (!normalized || !photoUrl) return

  const { data: contacts } = await supabase
    .from('contacts')
    .select('id')
    .contains('emails', [normalized])
    .limit(1)

  if (!contacts?.length) return

  await supabase
    .from('contact_avatars')
    .upsert(
      {
        contact_id: contacts[0].id,
        channel,
        avatar_url: photoUrl,
        priority: CHANNEL_PRIORITY[channel] ?? 50,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'contact_id,channel' }
    )
}

// ---------------------------------------------------------------------------
// Google (People API)
// ---------------------------------------------------------------------------

interface GooglePerson {
  photos?: Array<{
    url?: string
    metadata?: { primary?: boolean }
  }>
}

async function fetchGooglePhoto(accessToken: string, email: string): Promise<string | null> {
  if (dedup('google', email)) return null

  try {
    // searchContacts — finds people in Google Contacts
    const url = `https://people.googleapis.com/v1/people:searchContacts?query=${encodeURIComponent(email)}&readMask=photos&pageSize=1`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    })
    if (res.ok) {
      const data = await res.json()
      const photo = data.results?.[0]?.person?.photos?.find((p: { metadata?: { primary?: boolean } }) => p.metadata?.primary)?.url
        ?? data.results?.[0]?.person?.photos?.[0]?.url
      if (photo) return photo
    }

    // otherContacts — people you've emailed but not saved
    const otherUrl = `https://people.googleapis.com/v1/otherContacts:search?query=${encodeURIComponent(email)}&readMask=photos&pageSize=1`
    const otherRes = await fetch(otherUrl, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    })
    if (otherRes.ok) {
      const data = await otherRes.json()
      const contacts = data.otherContacts ?? data.connections ?? []
      const photo = contacts[0]?.photos?.find((p: { metadata?: { primary?: boolean } }) => p.metadata?.primary)?.url
        ?? contacts[0]?.photos?.[0]?.url
      if (photo) return photo
    }

    return null
  } catch (err) {
    logger.debug(`[channel-photos] Google fetch failed for ${email}:`, err)
    return null
  }
}

export async function fetchGooglePhotos(
  supabase: Supabase,
  accessToken: string,
  emails: string[]
): Promise<number> {
  const unique = [...new Set(emails.map(e => e.toLowerCase().trim()).filter(Boolean))]
  let stored = 0

  // Batch of 5 to respect rate limits
  for (let i = 0; i < unique.length; i += 5) {
    const batch = unique.slice(i, i + 5)
    await Promise.all(batch.map(async (email) => {
      const photo = await fetchGooglePhoto(accessToken, email)
      if (photo) {
        await storeAvatarByEmail(supabase, email, 'google', photo)
        stored++
      }
    }))
  }

  return stored
}

// ---------------------------------------------------------------------------
// Outlook (Microsoft Graph API)
// ---------------------------------------------------------------------------

/**
 * Fetch profile photo from Microsoft Graph.
 * GET /users/{email}/photo/$value returns the raw image bytes.
 * We convert to a base64 data URI for storage.
 */
async function fetchOutlookPhoto(accessToken: string, email: string): Promise<string | null> {
  if (dedup('outlook', email)) return null

  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}/photo/$value`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!res.ok) return null

    // Graph returns binary image data — convert to data URI
    const contentType = res.headers.get('Content-Type') || 'image/jpeg'
    const buffer = await res.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    return `data:${contentType};base64,${base64}`
  } catch (err) {
    logger.debug(`[channel-photos] Outlook fetch failed for ${email}:`, err)
    return null
  }
}

export async function fetchOutlookPhotos(
  supabase: Supabase,
  accessToken: string,
  emails: string[]
): Promise<number> {
  const unique = [...new Set(emails.map(e => e.toLowerCase().trim()).filter(Boolean))]
  let stored = 0

  for (let i = 0; i < unique.length; i += 5) {
    const batch = unique.slice(i, i + 5)
    await Promise.all(batch.map(async (email) => {
      const photo = await fetchOutlookPhoto(accessToken, email)
      if (photo) {
        await storeAvatarByEmail(supabase, email, 'outlook', photo)
        stored++
      }
    }))
  }

  return stored
}

// ---------------------------------------------------------------------------
// Slack (users.info → profile.image_72)
// ---------------------------------------------------------------------------

interface SlackUserInfoResponse {
  ok: boolean
  user?: {
    profile?: {
      image_72?: string
      image_192?: string
      email?: string
    }
  }
}

/**
 * Fetch Slack profile images for a set of user IDs.
 * Returns a map of userId → { email, photoUrl }.
 */
export async function fetchSlackPhotos(
  supabase: Supabase,
  botToken: string,
  userIds: string[]
): Promise<number> {
  const unique = [...new Set(userIds.filter(Boolean))]
  let stored = 0

  for (let i = 0; i < unique.length; i += 5) {
    const batch = unique.slice(i, i + 5)
    await Promise.all(batch.map(async (userId) => {
      if (dedup('slack', userId)) return

      try {
        const res = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
          headers: { Authorization: `Bearer ${botToken}`, Accept: 'application/json' },
        })
        if (!res.ok) return

        const data = (await res.json()) as SlackUserInfoResponse
        const profile = data.user?.profile
        const photoUrl = profile?.image_192 || profile?.image_72
        const email = profile?.email

        if (photoUrl && email) {
          await storeAvatarByEmail(supabase, email, 'slack', photoUrl)
          stored++
        }
      } catch (err) {
        logger.debug(`[channel-photos] Slack fetch failed for ${userId}:`, err)
      }
    }))
  }

  return stored
}

// ---------------------------------------------------------------------------
// Asana (GET /users/{gid} → photo.image_60x60)
// ---------------------------------------------------------------------------

interface AsanaUserResponse {
  data?: {
    email?: string
    photo?: {
      image_21x21?: string
      image_27x27?: string
      image_36x36?: string
      image_60x60?: string
      image_128x128?: string
    }
  }
}

export async function fetchAsanaPhotos(
  supabase: Supabase,
  accessToken: string,
  userGids: string[]
): Promise<number> {
  const unique = [...new Set(userGids.filter(Boolean))]
  let stored = 0

  for (let i = 0; i < unique.length; i += 5) {
    const batch = unique.slice(i, i + 5)
    await Promise.all(batch.map(async (gid) => {
      if (dedup('asana', gid)) return

      try {
        const res = await fetch(`https://app.asana.com/api/1.0/users/${gid}?opt_fields=email,photo`, {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        })
        if (!res.ok) return

        const data = (await res.json()) as AsanaUserResponse
        const photoUrl = data.data?.photo?.image_128x128 || data.data?.photo?.image_60x60
        const email = data.data?.email

        if (photoUrl && email) {
          await storeAvatarByEmail(supabase, email, 'asana', photoUrl)
          stored++
        }
      } catch (err) {
        logger.debug(`[channel-photos] Asana fetch failed for ${gid}:`, err)
      }
    }))
  }

  return stored
}
