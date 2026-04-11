/**
 * Domain authorization gate for browser tasks.
 *
 * Pre-flight check that verifies a URL is not on an org's blocked domain list
 * before allowing the browser agent to navigate there.
 *
 * Policy: default OPEN — all domains allowed unless explicitly blocked.
 * Fail-closed on errors — if we can't verify, deny access.
 */

import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DomainAuthResult {
  allowed: boolean
  domain: string | null
  reason?: string
}

// ---------------------------------------------------------------------------
// Domain extraction
// ---------------------------------------------------------------------------

/**
 * Extract and lowercase the hostname from a URL string.
 * Returns null if the URL is invalid.
 */
export function extractDomain(url: string): string | null {
  try {
    if (!url) return null
    const parsed = new URL(url)
    return parsed.hostname.toLowerCase()
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Subdomain matching
// ---------------------------------------------------------------------------

/**
 * Check whether `domain` matches `blocked` exactly or is a subdomain of it.
 * e.g. "sub.evil.com" matches blocked entry "evil.com".
 */
function isDomainBlocked(domain: string, blocked: string): boolean {
  const normalizedBlocked = blocked.toLowerCase()
  if (domain === normalizedBlocked) return true
  if (domain.endsWith(`.${normalizedBlocked}`)) return true
  return false
}

// ---------------------------------------------------------------------------
// Authorization check
// ---------------------------------------------------------------------------

/**
 * Check whether a URL is authorized for browser navigation within an org.
 *
 * Looks up `organizations.settings.blocked_domains` for the given orgId.
 * Default OPEN: if no blocklist exists, all domains are allowed.
 * Fail-closed: if the org lookup fails, access is denied.
 */
export async function checkDomainAuthorization(
  url: string,
  orgId: string,
  supabase: { from: (table: string) => any },
): Promise<DomainAuthResult> {
  const domain = extractDomain(url)

  if (!domain) {
    return {
      allowed: false,
      domain: null,
      reason: 'Invalid URL — cannot extract domain',
    }
  }

  try {
    const { data, error } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', orgId)
      .single()

    if (error) {
      logger.warn('[domain-gate] Org lookup failed, fail-closed', {
        orgId,
        error: error.message,
      })
      return {
        allowed: false,
        domain,
        reason: `Domain check fail-closed: ${error.message}`,
      }
    }

    // Default OPEN: no settings or no blocked_domains means all allowed
    const blockedDomains: string[] | undefined = data?.settings?.blocked_domains
    if (!blockedDomains || !Array.isArray(blockedDomains) || blockedDomains.length === 0) {
      return { allowed: true, domain }
    }

    // Check against blocklist (exact + subdomain matching)
    const matchedBlock = blockedDomains.find((blocked) => isDomainBlocked(domain, blocked))
    if (matchedBlock) {
      logger.info('[domain-gate] Domain blocked', { domain, matchedBlock, orgId })
      return {
        allowed: false,
        domain,
        reason: `Domain "${domain}" is blocked by org policy (matches "${matchedBlock}")`,
      }
    }

    return { allowed: true, domain }
  } catch (err) {
    logger.error('[domain-gate] Unexpected error, fail-closed', {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    })
    return {
      allowed: false,
      domain,
      reason: `Domain check fail-closed: unexpected error`,
    }
  }
}
