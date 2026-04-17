'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { ClawdLoginFace } from '@/components/ui/clawd-login-face'
import { ForceFieldBackground } from '@/components/ui/force-field-background'
import { OAuthProviderButtons, type OAuthProvider } from '@/components/auth/oauth-provider-buttons'
import { resolveAuthRedirectOrigin } from '@/lib/auth/redirect-origin'
import { isPaidTier, TIER_DISPLAY } from '@/lib/billing/checkout'
import { stashPendingTier } from '@/lib/billing/pending-tier'
import { startCheckoutRedirect } from '@/lib/billing/start-checkout-browser'
import { useIsDark } from '@/lib/hooks/use-is-dark'

type SignupStatus = 'idle' | 'loading' | 'verify-email' | 'error'
type SignupMethod = 'password' | OAuthProvider | null

const FORCE_FIELD_PROPS = {
  spacing: 24,
  minStroke: 1,
  maxStroke: 2,
  forceStrength: 14,
  magnifierRadius: 160,
  friction: 0.88,
  restoreSpeed: 0.04,
} as const

function SignupPageContent() {
  const searchParams = useSearchParams()
  const tierParam = searchParams.get('tier')
  const tier = isPaidTier(tierParam) ? tierParam : null
  const returnTo = searchParams.get('returnTo') ?? undefined
  // Beta invite links carry ?code=BITBIT-XYZ and optionally ?email=. Surface
  // the code as a reminder (Stripe's native promotion_codes field applies it
  // at checkout — we can't auto-apply from here) and prefill the email.
  const inviteCode = (searchParams.get('code') ?? '').trim().toUpperCase() || null
  const prefillEmail = searchParams.get('email') ?? ''

  const [email, setEmail] = useState(prefillEmail)
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<SignupStatus>('idle')
  const [activeMethod, setActiveMethod] = useState<SignupMethod>(null)
  const [errorMessage, setErrorMessage] = useState('')

  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null)
  const [isHoveringSubmit, setIsHoveringSubmit] = useState(false)
  const isDark = useIsDark()

  const selectedTier = tier ? TIER_DISPLAY[tier] : undefined
  const isBusy = activeMethod !== null
  const canSubmit = email.trim().length > 3 && password.length >= 8 && !isBusy

  // Short-circuit to checkout/onboard if the visitor already has a session.
  // Uses getSession() (local-storage only) to avoid a needless network call
  // for the overwhelmingly common fresh-visitor case.
  useEffect(() => {
    const supabase = createClient()
    if (!supabase) return
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return
      if (tier && (await startCheckoutRedirect(tier)).ok) return
      window.location.replace(returnTo ?? '/onboard')
    })
  }, [tier, returnTo])

  const oauthProvider: OAuthProvider | null =
    activeMethod === 'google' || activeMethod === 'apple' ? activeMethod : null

  async function handleOAuthSignUp(provider: OAuthProvider) {
    setActiveMethod(provider)
    setStatus('loading')
    setErrorMessage('')

    const supabase = createClient()
    if (!supabase) {
      setStatus('error')
      setErrorMessage('Supabase is not configured for this environment')
      setActiveMethod(null)
      return
    }

    // Preserve tier selection across the OAuth round-trip so /callback can
    // resume checkout once a session is established.
    if (tier) stashPendingTier(tier)

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${resolveAuthRedirectOrigin()}/callback` },
    })

    if (error) {
      setStatus('error')
      setErrorMessage(error.message)
      setActiveMethod(null)
    }
  }

  async function handlePasswordSignUp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail || password.length < 8 || isBusy) return

    setActiveMethod('password')
    setStatus('loading')
    setErrorMessage('')

    const supabase = createClient()
    if (!supabase) {
      setStatus('error')
      setErrorMessage('Supabase is not configured for this environment')
      setActiveMethod(null)
      return
    }

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: `${resolveAuthRedirectOrigin()}/callback`,
      },
    })

    if (error) {
      const friendly =
        /already registered|already exists/i.test(error.message)
          ? 'An account with that email already exists. Try logging in instead.'
          : error.message
      setStatus('error')
      setErrorMessage(friendly)
      setActiveMethod(null)
      return
    }

    // When email confirmation is required, Supabase returns a user without a
    // session — show the "check your email" state instead of proceeding.
    if (!data.session) {
      setStatus('verify-email')
      setActiveMethod(null)
      return
    }

    if (tier && (await startCheckoutRedirect(tier)).ok) return
    window.location.replace(returnTo ?? '/onboard')
  }

  if (status === 'verify-email') {
    return (
      <div className="relative flex min-h-svh flex-col items-center justify-center bg-background p-6 md:p-10">
        <ForceFieldBackground
          {...FORCE_FIELD_PROPS}
          bgColor={isDark ? '#000' : '#fafafa'}
          particleRgb={isDark ? '255,255,255' : '0,0,0'}
        />
        <Card className="relative z-10 w-full max-w-md p-8 text-center">
          <h1 className="mb-3 text-2xl font-bold">Check your email</h1>
          <p className="text-sm text-muted-foreground">
            We&apos;ve sent a confirmation link to <strong>{email}</strong>. Click it to finish
            creating your account and we&apos;ll pick up from there.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center bg-background p-6 md:p-10">
      <ForceFieldBackground
        {...FORCE_FIELD_PROPS}
        bgColor={isDark ? '#000' : '#fafafa'}
        particleRgb={isDark ? '255,255,255' : '0,0,0'}
      />
      <div className="relative z-10 flex w-full max-w-sm flex-col gap-6 md:max-w-4xl">
        <Card className="overflow-hidden p-0">
          <CardContent className="grid p-0 md:grid-cols-2">
            <form className="p-6 md:p-8" onSubmit={handlePasswordSignUp}>
              <div className="flex flex-col gap-6">
                <div className="flex flex-col items-center gap-2 text-center">
                  <h1 className="text-2xl font-bold">Create your account</h1>
                  <p className="text-balance text-sm text-muted-foreground">
                    {selectedTier
                      ? `Starting on ${selectedTier.name} (${selectedTier.priceLabel}). Apply an invite code at checkout for your first month free.`
                      : "Start your BitBit trial. Cancel anytime."}
                  </p>
                  {inviteCode && (
                    <p
                      className="mt-1 rounded-md bg-muted/60 px-3 py-1.5 font-mono text-xs tracking-wider text-foreground"
                      aria-label={`Invite code ${inviteCode}`}
                    >
                      Invite code:{' '}
                      <span className="font-semibold">{inviteCode}</span> — apply it at Stripe
                      checkout for your first month free.
                    </p>
                  )}
                </div>

                {errorMessage && (
                  <p
                    role="alert"
                    className="rounded-md bg-destructive/10 p-3 text-center text-sm text-destructive"
                  >
                    {errorMessage}
                  </p>
                )}

                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    disabled={isBusy}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    disabled={isBusy}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full"
                  onMouseEnter={() => setIsHoveringSubmit(true)}
                  onMouseLeave={() => setIsHoveringSubmit(false)}
                >
                  {activeMethod === 'password' ? (
                    <Spinner />
                  ) : selectedTier ? (
                    `Create account & continue to checkout`
                  ) : (
                    'Create account'
                  )}
                </Button>

                <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
                  <span className="relative z-10 bg-card px-2 text-muted-foreground">
                    Or continue with
                  </span>
                </div>

                <OAuthProviderButtons
                  onSelect={handleOAuthSignUp}
                  disabled={isBusy}
                  activeMethod={oauthProvider}
                />

                <p className="text-center text-sm text-muted-foreground">
                  Already have an account?{' '}
                  <a
                    href={
                      tier
                        ? `/login?returnTo=${encodeURIComponent(`/signup?tier=${tier}`)}`
                        : '/login'
                    }
                    className="underline underline-offset-4 hover:text-primary"
                  >
                    Log in
                  </a>
                </p>
              </div>
            </form>

            <div className="relative hidden min-h-[400px] overflow-hidden rounded-r-xl md:block">
              <ClawdLoginFace
                className="absolute inset-0"
                focusedField={focusedField}
                isHoveringSubmit={isHoveringSubmit}
                hasError={!!errorMessage}
                isSubmitting={isBusy}
              />
            </div>
          </CardContent>
        </Card>

        <p className="px-6 text-center text-xs text-muted-foreground">
          By creating an account, you agree to our{' '}
          <a href="/terms" className="underline underline-offset-4 hover:text-primary">Terms of Service</a>
          {' '}and{' '}
          <a href="/privacy" className="underline underline-offset-4 hover:text-primary">Privacy Policy</a>.
        </p>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center bg-background">
          <Spinner />
        </div>
      }
    >
      <SignupPageContent />
    </Suspense>
  )
}
