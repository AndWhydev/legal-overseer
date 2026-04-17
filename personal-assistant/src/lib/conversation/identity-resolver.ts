/**
 * Total Recall — Identity Resolution
 *
 * Resolves channel-specific identifiers (phone numbers, emails, Slack IDs)
 * to authenticated BitBit users. Supports a per-channel resolution cascade:
 *
 *   WhatsApp / SMS  → channel_identities → contacts.phones fallback
 *   Email           → channel_identities → contact_emails fallback
 *   Slack / iMessage → channel_identities only
 *   Web             → direct auth (userId/orgId already known)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Channel,
  ChannelIdentifier,
  ChannelIdentityRecord,
  ResolvedIdentity,
} from './types'
import { logger } from '@/lib/core/logger'

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Resolve an inbound channel identifier to a BitBit user + org.
 *
 * For `web` / `api` channels the identity is expected to be pre-authenticated
 * (userId + orgId provided in the ChannelIdentifier context). For all other
 * channels we run a resolution cascade against `channel_identities` and, where
 * applicable, fall back to the `contacts` / `contact_emails` tables.
 */
export async function resolveChannelIdentity(
  supabase: SupabaseClient,
  identifier: ChannelIdentifier,
): Promise<ResolvedIdentity | null> {
  try {
    const { channelType, channelIdentifier, context } = identifier

    // ── Web / API: direct auth ──────────────────────────────────────────
    if (channelType === 'web') {
      if (!context?.userId || !context?.orgId) {
        logger.warn('[identity-resolver] Web channel missing userId/orgId context')
        return null
      }
      return {
        userId: context.userId,
        orgId: context.orgId,
        displayName: context.displayName ?? undefined,
        isAuthenticated: true,
      }
    }

    // ── Primary lookup: channel_identities ──────────────────────────────
    const identity = await lookupChannelIdentity(
      supabase,
      channelType,
      channelIdentifier,
    )

    if (identity) {
      // Fire-and-forget touch
      touchIdentity(supabase, identity.id).catch(() => {})
      // Load timezone — Phase 51 D1. Non-fatal on error.
      let timezone: string | null = null
      try {
        const { data: userRow } = await supabase
          .from('users')
          .select('timezone')
          .eq('id', identity.user_id)
          .maybeSingle()
        timezone = (userRow?.timezone as string | null | undefined) ?? null
      } catch {
        // Ignore — timezone falls back to UTC in prompt builder.
      }
      return {
        userId: identity.user_id,
        orgId: identity.org_id,
        displayName: identity.display_name ?? undefined,
        timezone,
        isAuthenticated: identity.verified,
      }
    }

    // ── Fallback: contacts tables ───────────────────────────────────────
    if (channelType === 'whatsapp' || channelType === 'sms') {
      return resolveFromContactPhone(supabase, channelIdentifier)
    }

    if (channelType === 'email') {
      return resolveFromContactEmail(supabase, channelIdentifier)
    }

    // Slack / iMessage with no channel_identity record → unknown
    logger.info(
      `[identity-resolver] No identity found for ${channelType}:${channelIdentifier}`,
    )
    return null
  } catch (err) {
    logger.error('[identity-resolver] Resolution failed:', err)
    return null
  }
}

/**
 * Link a channel identifier to an existing user, creating or updating the
 * `channel_identities` record. This is typically called during onboarding
 * or when a user manually connects a new channel.
 */
export async function linkChannelIdentity(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  identifier: ChannelIdentifier,
  opts?: { displayName?: string; verified?: boolean },
): Promise<ChannelIdentityRecord | null> {
  try {
    const { data, error } = await supabase
      .from('channel_identities')
      .upsert(
        {
          user_id: userId,
          org_id: orgId,
          channel_type: identifier.channelType,
          channel_identifier: identifier.channelIdentifier,
          display_name: opts?.displayName ?? null,
          verified: opts?.verified ?? false,
          verified_at: opts?.verified ? new Date().toISOString() : null,
          last_used_at: new Date().toISOString(),
          metadata: identifier.context ?? {},
        },
        { onConflict: 'org_id,channel_type,channel_identifier' },
      )
      .select('*')
      .single<ChannelIdentityRecord>()

    if (error) {
      logger.error('[identity-resolver] Failed to link identity:', error.message)
      return null
    }

    logger.info(
      `[identity-resolver] Linked ${identifier.channelType}:${identifier.channelIdentifier} → user ${userId}`,
    )
    return data
  } catch (err) {
    logger.error('[identity-resolver] linkChannelIdentity error:', err)
    return null
  }
}

/**
 * Update `last_used_at` on a channel identity record.
 * Called as fire-and-forget after a successful resolution.
 */
export async function touchIdentity(
  supabase: SupabaseClient,
  identityId: string,
): Promise<void> {
  const { error } = await supabase
    .from('channel_identities')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', identityId)

  if (error) {
    logger.warn('[identity-resolver] Failed to touch identity:', error.message)
  }
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

async function lookupChannelIdentity(
  supabase: SupabaseClient,
  channelType: Exclude<Channel, 'api'>,
  channelIdentifier: string,
): Promise<ChannelIdentityRecord | null> {
  const { data, error } = await supabase
    .from('channel_identities')
    .select('*')
    .eq('channel_type', channelType)
    .eq('channel_identifier', channelIdentifier)
    .order('verified', { ascending: false })
    .order('last_used_at', { ascending: false })
    .limit(1)
    .maybeSingle<ChannelIdentityRecord>()

  if (error) {
    logger.warn('[identity-resolver] channel_identities lookup error:', error.message)
    return null
  }

  return data
}

/**
 * Fallback: look up a phone number in the `contacts.phones` array column.
 * Returns a partial identity (not fully authenticated) with the contact's
 * org_id. The user_id is the org owner (first org_member) as a best guess.
 */
async function resolveFromContactPhone(
  supabase: SupabaseClient,
  phone: string,
): Promise<ResolvedIdentity | null> {
  // contacts.phones is a text[] column — use the `cs` (contains) operator
  const { data, error } = await supabase
    .from('contacts')
    .select('id, org_id, name')
    .contains('phones', [phone])
    .limit(1)
    .maybeSingle<{ id: string; org_id: string; name: string }>()

  if (error || !data) {
    return null
  }

  // Resolve org owner as userId fallback
  const ownerId = await resolveOrgOwner(supabase, data.org_id)
  if (!ownerId) return null

  return {
    userId: ownerId,
    orgId: data.org_id,
    contactId: data.id,
    displayName: data.name,
    isAuthenticated: false,
  }
}

/**
 * Fallback: look up an email via the `contact_emails` join table.
 */
async function resolveFromContactEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<ResolvedIdentity | null> {
  const { data, error } = await supabase
    .from('contact_emails')
    .select('contact_id, contacts!inner(id, org_id, name)')
    .eq('email', email.toLowerCase())
    .limit(1)
    .maybeSingle<{
      contact_id: string
      contacts: { id: string; org_id: string; name: string }
    }>()

  if (error || !data) {
    return null
  }

  const contact = data.contacts
  const ownerId = await resolveOrgOwner(supabase, contact.org_id)
  if (!ownerId) return null

  return {
    userId: ownerId,
    orgId: contact.org_id,
    contactId: contact.id,
    displayName: contact.name,
    isAuthenticated: false,
  }
}

/**
 * Get the first profile (owner) for an org — used as the userId fallback
 * when we resolve via contacts but don't have an explicit user mapping.
 */
async function resolveOrgOwner(
  supabase: SupabaseClient,
  orgId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('org_id', orgId)
    .limit(1)
    .maybeSingle<{ id: string }>()

  if (error || !data) {
    logger.warn(`[identity-resolver] Could not resolve org owner for ${orgId}`)
    return null
  }

  return data.id
}
