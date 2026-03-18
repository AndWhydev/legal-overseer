import { createClient } from '@/lib/supabase/server'
import type { PortalContext } from './types'

/**
 * Validates portal access for the current authenticated user against an org slug.
 * Returns PortalContext if valid, null otherwise.
 *
 * This is the SINGLE security gate for all portal operations.
 * Every portal API route and page MUST call this first.
 */
export async function getPortalContext(orgSlug: string): Promise<PortalContext | null> {
  const supabase = await createClient()
  if (!supabase) return null

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Get org by slug
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, slug')
    .eq('slug', orgSlug)
    .single()

  if (!org) return null

  // Check portal access — user must have active access to this org
  const { data: access } = await supabase
    .from('portal_access')
    .select('*')
    .eq('user_id', user.id)
    .eq('org_id', org.id)
    .eq('status', 'active')
    .single()

  if (!access) return null

  // Get contact info
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, name, emails')
    .eq('id', access.contact_id)
    .single()

  if (!contact) return null

  // Get branding (optional)
  const { data: branding } = await supabase
    .from('portal_branding')
    .select('*')
    .eq('org_id', org.id)
    .single()

  // Update last login
  await supabase
    .from('portal_access')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', access.id)

  return {
    access,
    branding,
    contact: {
      id: contact.id,
      name: contact.name,
      email: contact.emails?.[0] || access.email,
    },
    org: {
      id: org.id,
      name: org.name,
      slug: org.slug,
    },
  }
}

/**
 * Validates an invite token and returns the portal access record.
 * Used during the magic link accept flow.
 */
export async function validateInviteToken(token: string) {
  const supabase = await createClient()
  if (!supabase) return null

  const { data } = await supabase
    .from('portal_access')
    .select('*, contacts(name, emails), organizations(name, slug)')
    .eq('invite_token', token)
    .eq('status', 'invited')
    .single()

  return data
}
