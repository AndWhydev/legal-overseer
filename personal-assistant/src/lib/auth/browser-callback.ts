import type { SupabaseClient } from '@supabase/supabase-js'

import { extractAuthCallbackPayload } from './callback'

type BrowserAuthLogger = {
  error: (message: string, ...args: unknown[]) => void
  warn: (message: string, ...args: unknown[]) => void
}

type BrowserAuthResult =
  | { kind: 'idle' }
  | { kind: 'redirect'; destination: string }

export async function completeBrowserAuthFromUrl(
  supabase: SupabaseClient,
  url: string,
  logger: BrowserAuthLogger,
): Promise<BrowserAuthResult> {
  const payload = extractAuthCallbackPayload(url)

  if (payload.kind === 'none') {
    return { kind: 'idle' }
  }

  let userId: string | null = null

  if (payload.kind === 'session_tokens') {
    const { error, data } = await supabase.auth.setSession({
      access_token: payload.accessToken,
      refresh_token: payload.refreshToken,
    })

    if (error || !data.user) {
      logger.error('setSession error:', error)
      return { kind: 'redirect', destination: '/login?error=auth' }
    }

    userId = data.user.id
  }

  if (payload.kind === 'exchange_code') {
    const { error, data } = await supabase.auth.exchangeCodeForSession(payload.code)

    if (error || !data.user) {
      logger.error('exchangeCodeForSession error:', error)
      return { kind: 'redirect', destination: '/login?error=auth' }
    }

    userId = data.user.id
  }

  if (payload.kind === 'verify_token_hash') {
    const { error, data } = await supabase.auth.verifyOtp({
      token_hash: payload.tokenHash,
      type: payload.type,
    })

    if (error || !data.user) {
      logger.error('verifyOtp error:', error)
      return { kind: 'redirect', destination: '/login?error=auth' }
    }

    userId = data.user.id
  }

  if (!userId) {
    return { kind: 'redirect', destination: '/login?error=auth' }
  }

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, org_id')
    .eq('id', userId)
    .maybeSingle()

  if (profileErr) {
    logger.warn('Profile check failed, going to dashboard anyway:', profileErr.message)
    return { kind: 'redirect', destination: '/dashboard' }
  }

  if (!profile?.org_id) {
    return { kind: 'redirect', destination: '/onboard' }
  }

  return { kind: 'redirect', destination: '/dashboard' }
}
