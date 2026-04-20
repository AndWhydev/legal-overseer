'use client'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

export type OAuthProvider = 'google' | 'apple'

const ALL_OAUTH_PROVIDERS: readonly OAuthProvider[] = ['google', 'apple'] as const

/**
 * Returns the OAuth providers currently enabled for this deployment, read
 * from the public env var `NEXT_PUBLIC_ENABLED_OAUTH_PROVIDERS`. This must
 * mirror what's actually configured in Supabase Auth — clicking a button
 * for a provider that's disabled upstream produces a confusing failure,
 * so when nothing is configured the UI hides the buttons entirely and
 * users flow through password signup/login instead.
 *
 * Accepts a comma-separated list, case-insensitive, with unknown values
 * silently dropped. Empty / unset = no providers.
 */
export function getEnabledOAuthProviders(): OAuthProvider[] {
  const raw = process.env.NEXT_PUBLIC_ENABLED_OAUTH_PROVIDERS ?? ''
  if (!raw.trim()) return []
  const requested = raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
  return ALL_OAUTH_PROVIDERS.filter((provider) => requested.includes(provider))
}

export function hasAnyEnabledOAuthProvider(): boolean {
  return getEnabledOAuthProviders().length > 0
}

interface OAuthProviderButtonsProps {
  onSelect: (provider: OAuthProvider) => void
  disabled: boolean
  /** Which provider is currently in-flight, if any. Drives the spinner. */
  activeMethod: OAuthProvider | null
  /**
   * Providers to render. Defaults to whatever getEnabledOAuthProviders()
   * reports. Pass explicitly for tests. When empty, renders nothing.
   */
  providers?: OAuthProvider[]
}

export function OAuthProviderButtons({
  onSelect,
  disabled,
  activeMethod,
  providers,
}: OAuthProviderButtonsProps) {
  const enabled = providers ?? getEnabledOAuthProviders()
  if (enabled.length === 0) return null

  // Full literal class strings so Tailwind's JIT picks both up at build time.
  // grid-cols-2 when both providers enabled, single column for a lone button
  // so it doesn't stretch across the form.
  const className =
    enabled.length === 1 ? 'grid grid-cols-1 gap-4' : 'grid grid-cols-2 gap-4'

  return (
    <div className={className}>
      {enabled.includes('google') && (
        <Button variant="outline" type="button" disabled={disabled} onClick={() => onSelect('google')}>
          {activeMethod === 'google' ? (
            <Spinner />
          ) : (
            <svg viewBox="0 0 24 24" className="mr-2 h-4 w-4">
              <path fill="#EA4335" d="M12 10.2v3.98h5.57c-.24 1.28-.97 2.37-2.05 3.11l3.32 2.58c1.93-1.78 3.04-4.39 3.04-7.49 0-.73-.07-1.44-.2-2.13H12z" />
              <path fill="#34A853" d="M12 22c2.7 0 4.97-.89 6.63-2.41l-3.32-2.58c-.92.62-2.1.99-3.31.99-2.54 0-4.69-1.72-5.46-4.03l-3.43 2.65A10 10 0 0012 22z" />
              <path fill="#4A90E2" d="M6.54 13.97A5.98 5.98 0 016.2 12c0-.68.12-1.34.34-1.97L3.11 7.38A10 10 0 002 12c0 1.61.38 3.14 1.11 4.62l3.43-2.65z" />
              <path fill="#FBBC05" d="M12 6c1.47 0 2.8.51 3.84 1.5l2.88-2.88A9.95 9.95 0 0012 2a10 10 0 00-8.89 5.38l3.43 2.65C7.31 7.72 9.46 6 12 6z" />
            </svg>
          )}
          {activeMethod !== 'google' && 'Google'}
        </Button>
      )}
      {enabled.includes('apple') && (
        <Button variant="outline" type="button" disabled={disabled} onClick={() => onSelect('apple')}>
          {activeMethod === 'apple' ? (
            <Spinner />
          ) : (
            <svg viewBox="0 0 24 24" className="mr-2 h-4 w-4" fill="currentColor">
              <path d="M16.36 12.48c.02 2.26 1.98 3.01 2 3.02-.01.05-.31 1.06-1.03 2.11-.62.9-1.27 1.8-2.28 1.82-1 .02-1.32-.59-2.47-.59-1.14 0-1.5.57-2.45.61-1 .04-1.75-.99-2.38-1.88-1.29-1.86-2.27-5.25-.95-7.56.66-1.14 1.84-1.86 3.12-1.88.97-.02 1.89.65 2.47.65.57 0 1.66-.8 2.8-.68.48.02 1.84.2 2.72 1.48-.07.04-1.62.95-1.6 2.9zm-2.4-5.32c.52-.63.87-1.5.77-2.37-.75.03-1.65.5-2.2 1.12-.48.56-.9 1.44-.79 2.28.84.06 1.7-.43 2.22-1.03z" />
            </svg>
          )}
          {activeMethod !== 'apple' && 'Apple'}
        </Button>
      )}
    </div>
  )
}
