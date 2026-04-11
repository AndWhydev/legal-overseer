/**
 * Avatar resolution pipeline.
 * Priority: Gravatar → Clearbit Logo → Generated initials.
 * In-memory cache with 24-hour TTL.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AvatarResult {
  url: string | null
  type: 'contact' | 'gravatar' | 'clearbit' | 'initials'
  initials: string
  color: string
}

// ---------------------------------------------------------------------------
// Cache (in-memory, 24h TTL)
// ---------------------------------------------------------------------------

interface CacheEntry {
  result: AvatarResult
  expiresAt: number
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const cache = new Map<string, CacheEntry>()

function getCached(email: string): AvatarResult | null {
  const entry = cache.get(email.toLowerCase())
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(email.toLowerCase())
    return null
  }
  return entry.result
}

function setCache(email: string, result: AvatarResult): void {
  cache.set(email.toLowerCase(), {
    result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })
}

// ---------------------------------------------------------------------------
// Personal email domain detection
// ---------------------------------------------------------------------------

const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'me.com',
  'live.com',
  'aol.com',
  'protonmail.com',
  'fastmail.com',
])

function isPersonalEmailDomain(email: string | null): boolean {
  if (!email) return false
  const domain = email.split('@')[1]?.toLowerCase()
  return PERSONAL_EMAIL_DOMAINS.has(domain || '')
}

// ---------------------------------------------------------------------------
// MD5 hash (simple implementation for Gravatar, browser-compatible)
// ---------------------------------------------------------------------------

function md5(input: string): string {
  // Use Web Crypto or fall back to a simple hash for SSR
  // For Gravatar we need actual MD5 — use a minimal implementation
  return md5Hash(input)
}

/* Minimal MD5 — RFC 1321 compliant, no dependencies */
function md5Hash(str: string): string {
  const k: number[] = []
  for (let i = 0; i < 64; i++) {
    k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000)
  }

  let h0 = 0x67452301
  let h1 = 0xEFCDAB89
  let h2 = 0x98BADCFE
  let h3 = 0x10325476

  // Convert string to UTF-8 bytes
  const bytes: number[] = []
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    if (code < 0x80) {
      bytes.push(code)
    } else if (code < 0x800) {
      bytes.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F))
    } else {
      bytes.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F))
    }
  }

  const bitLen = bytes.length * 8
  bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)

  // Append original length in bits as 64-bit little-endian
  for (let i = 0; i < 8; i++) {
    bytes.push((bitLen >>> (i * 8)) & 0xFF)
  }

  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ]

  for (let chunk = 0; chunk < bytes.length; chunk += 64) {
    const w: number[] = []
    for (let i = 0; i < 16; i++) {
      const off = chunk + i * 4
      w[i] = bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)
    }

    let a = h0, b = h1, c = h2, d = h3

    for (let i = 0; i < 64; i++) {
      let f: number, g: number
      if (i < 16) {
        f = (b & c) | (~b & d)
        g = i
      } else if (i < 32) {
        f = (d & b) | (~d & c)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        f = b ^ c ^ d
        g = (3 * i + 5) % 16
      } else {
        f = c ^ (b | ~d)
        g = (7 * i) % 16
      }

      const temp = d
      d = c
      c = b
      const sum = (a + f + k[i] + w[g]) >>> 0
      const rotated = ((sum << s[i]) | (sum >>> (32 - s[i]))) >>> 0
      b = (b + rotated) >>> 0
      a = temp
    }

    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
  }

  function toHex(n: number): string {
    let hex = ''
    for (let i = 0; i < 4; i++) {
      hex += ((n >> (i * 8)) & 0xFF).toString(16).padStart(2, '0')
    }
    return hex
  }

  return toHex(h0) + toHex(h1) + toHex(h2) + toHex(h3)
}

// ---------------------------------------------------------------------------
// Initials + deterministic color
// ---------------------------------------------------------------------------

const AVATAR_COLORS = [
  '#6366F1', '#8B5CF6', '#A855F7', '#D946EF', '#EC4899',
  '#F43F5E', '#EF4444', '#F97316', '#F59E0B', '#EAB308',
  '#84CC16', '#22C55E', '#10B981', '#14B8A6', '#06B6D4',
  '#0EA5E9', '#3B82F6', '#2563EB',
]

function getInitials(name: string | null | undefined, email: string | null | undefined): string {
  if (name) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return parts[0][0]?.toUpperCase() || '?'
  }
  if (email) {
    const local = email.split('@')[0]
    return local[0]?.toUpperCase() || '?'
  }
  return '?'
}

function getDeterministicColor(email: string | null): string {
  const text = email?.toLowerCase() || 'default'
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

// ---------------------------------------------------------------------------
// SVG initials data URL (no network request needed)
// ---------------------------------------------------------------------------

function initialsDataUrl(initials: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">
    <rect width="40" height="40" rx="20" fill="${color}"/>
    <text x="20" y="20" text-anchor="middle" dominant-baseline="central"
      font-family="system-ui,-apple-system,sans-serif" font-size="16"
      font-weight="600" fill="white">${initials}</text>
  </svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * Resolve an avatar for a given email address.
 * Priority: Contact DB → Gravatar → Clearbit Logo (non-personal domains only) → Generated initials.
 * Results are cached in-memory for 24 hours.
 */
export async function resolveAvatar(
  senderEmail: string | null,
  senderName: string | null,
  contactAvatarUrl: string | null
): Promise<AvatarResult> {
  // Handle null cases
  if (!senderEmail && !senderName) {
    const initials = getInitials(senderName, senderEmail)
    const color = getDeterministicColor(senderEmail)
    return {
      url: initialsDataUrl(initials, color),
      type: 'initials',
      initials,
      color,
    }
  }

  const normalizedEmail = senderEmail ? senderEmail.toLowerCase().trim() : ''
  const initials = getInitials(senderName, normalizedEmail)
  const color = getDeterministicColor(normalizedEmail)

  // Check cache first
  if (normalizedEmail) {
    const cached = getCached(normalizedEmail)
    if (cached) return cached
  }

  // Tier 1: Contact DB avatar
  if (contactAvatarUrl) {
    const result: AvatarResult = {
      url: contactAvatarUrl,
      type: 'contact',
      initials,
      color,
    }
    if (normalizedEmail) setCache(normalizedEmail, result)
    return result
  }

  // Tier 2: Try Gravatar
  if (normalizedEmail) {
    try {
      const hash = md5(normalizedEmail)
      const gravatarUrl = `https://secure.gravatar.com/avatar/${hash}?s=40&d=404`
      const res = await fetch(gravatarUrl, { method: 'HEAD' })
      if (res.ok) {
        const result: AvatarResult = {
          url: gravatarUrl,
          type: 'gravatar',
          initials,
          color,
        }
        setCache(normalizedEmail, result)
        return result
      }
    } catch {
      // Gravatar unavailable — continue
    }

    // Tier 3: Try Clearbit Logo (only for non-personal email domains)
    if (!isPersonalEmailDomain(normalizedEmail)) {
      try {
        const domain = normalizedEmail.split('@')[1]
        if (domain) {
          const clearbitUrl = `https://logo.clearbit.com/${domain}?size=40`
          const res = await fetch(clearbitUrl, { method: 'HEAD' })
          if (res.ok) {
            const result: AvatarResult = {
              url: clearbitUrl,
              type: 'clearbit',
              initials,
              color,
            }
            setCache(normalizedEmail, result)
            return result
          }
        }
      } catch {
        // Clearbit unavailable — continue
      }
    }
  }

  // Tier 4: Fallback to generated initials
  const result: AvatarResult = {
    url: initialsDataUrl(initials, color),
    type: 'initials',
    initials,
    color,
  }
  if (normalizedEmail) setCache(normalizedEmail, result)
  return result
}

/**
 * Synchronous fallback — returns initials avatar immediately (no network).
 * Use this for initial render before async resolution completes.
 */
export function resolveAvatarSync(
  senderName: string | null,
  senderEmail: string | null
): AvatarResult {
  const normalizedEmail = senderEmail ? senderEmail.toLowerCase().trim() : ''

  // Check cache first
  if (normalizedEmail) {
    const cached = getCached(normalizedEmail)
    if (cached) return cached
  }

  const initials = getInitials(senderName, normalizedEmail)
  const color = getDeterministicColor(normalizedEmail)

  return {
    url: initialsDataUrl(initials, color),
    type: 'initials',
    initials,
    color,
  }
}
