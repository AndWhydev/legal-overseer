import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveAvatar } from '@/lib/avatar/resolver'
import { getActiveOrgId } from '@/lib/tenancy'

/**
 * POST /api/contacts/resolve-avatars
 * Resolves avatars for contacts that don't have one yet.
 * Uses the existing pipeline: Gravatar → Clearbit → Initials.
 * Persists real avatar URLs (gravatar/clearbit) to contacts.avatar_url.
 *
 * Body: { contact_ids?: string[] }  (optional — if omitted, resolves all)
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getActiveOrgId(supabase, user.id)

  const body = await request.json().catch(() => ({}))
  const contactIds = body.contact_ids as string[] | undefined

  // Fetch contacts without avatars — scoped to user's org
  let query = supabase
    .from('contacts')
    .select('id, name, emails, avatar_url')
    .eq('org_id', orgId)
    .is('avatar_url', null)
    .limit(50)

  if (contactIds?.length) {
    query = query.in('id', contactIds)
  }

  const { data: contacts, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!contacts?.length) return NextResponse.json({ resolved: 0 })

  let resolved = 0

  for (const contact of contacts) {
    const email = (contact.emails as string[])?.[0]
    if (!email) continue

    const result = await resolveAvatar(email, contact.name, null)

    // Only persist real avatar URLs (gravatar/clearbit), not generated initials
    if (result.type === 'gravatar' || result.type === 'clearbit') {
      await supabase
        .from('contacts')
        .update({ avatar_url: result.url })
        .eq('id', contact.id)
      resolved++
    }
  }

  return NextResponse.json({ resolved, checked: contacts.length })
}
