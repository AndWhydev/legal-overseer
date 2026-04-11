import { describe, it, expect, vi } from 'vitest'
import { extractDomain, checkDomainAuthorization } from '../domain-gate'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockSupabase(
  data: Record<string, unknown> | null,
  error: { message: string } | null = null,
) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data, error }),
        }),
      }),
    }),
  } as any
}

// ---------------------------------------------------------------------------
// extractDomain
// ---------------------------------------------------------------------------

describe('extractDomain', () => {
  it('extracts hostname from HTTPS URL', () => {
    expect(extractDomain('https://example.com')).toBe('example.com')
  })

  it('extracts hostname from URL with path and query', () => {
    expect(extractDomain('https://shop.example.com/cart?id=1')).toBe('shop.example.com')
  })

  it('lowercases the hostname', () => {
    expect(extractDomain('https://EXAMPLE.COM/page')).toBe('example.com')
  })

  it('returns null for invalid URL', () => {
    expect(extractDomain('not-a-url')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(extractDomain('')).toBeNull()
  })

  it('extracts hostname from HTTP URL', () => {
    expect(extractDomain('http://test.org:8080/path')).toBe('test.org')
  })
})

// ---------------------------------------------------------------------------
// checkDomainAuthorization
// ---------------------------------------------------------------------------

describe('checkDomainAuthorization', () => {
  it('allows any domain when org has no blocked_domains (open default)', async () => {
    const supabase = mockSupabase({ settings: {} })
    const result = await checkDomainAuthorization('https://example.com', 'org-1', supabase)
    expect(result.allowed).toBe(true)
  })

  it('allows domain not in blocklist', async () => {
    const supabase = mockSupabase({
      settings: { blocked_domains: ['evil.com', 'spam.net'] },
    })
    const result = await checkDomainAuthorization('https://safe.com', 'org-1', supabase)
    expect(result.allowed).toBe(true)
  })

  it('blocks domain in blocklist (exact match)', async () => {
    const supabase = mockSupabase({
      settings: { blocked_domains: ['evil.com', 'spam.net'] },
    })
    const result = await checkDomainAuthorization('https://evil.com/path', 'org-1', supabase)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('evil.com')
  })

  it('blocks subdomain of blocked domain', async () => {
    const supabase = mockSupabase({
      settings: { blocked_domains: ['evil.com'] },
    })
    const result = await checkDomainAuthorization('https://sub.evil.com', 'org-1', supabase)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('evil.com')
  })

  it('denies access when org fetch fails (fail-closed)', async () => {
    const supabase = mockSupabase(null, { message: 'connection error' })
    const result = await checkDomainAuthorization('https://example.com', 'org-1', supabase)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('fail-closed')
  })

  it('allows when settings is null (no settings row)', async () => {
    const supabase = mockSupabase({ settings: null })
    const result = await checkDomainAuthorization('https://example.com', 'org-1', supabase)
    expect(result.allowed).toBe(true)
  })

  it('denies when URL is invalid', async () => {
    const supabase = mockSupabase({ settings: {} })
    const result = await checkDomainAuthorization('not-a-url', 'org-1', supabase)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('Invalid URL')
  })

  it('allows when blocked_domains is empty array', async () => {
    const supabase = mockSupabase({
      settings: { blocked_domains: [] },
    })
    const result = await checkDomainAuthorization('https://example.com', 'org-1', supabase)
    expect(result.allowed).toBe(true)
  })
})
