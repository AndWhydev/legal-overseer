'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { extractAuthCallbackPayload, resolveSafeAuthRedirect } from '@/lib/auth/callback'
import { resolveLoginErrorMessage, sanitizeLoginErrorReason } from '@/lib/auth/login-redirect'
import { resolveAuthRedirectOrigin } from '@/lib/auth/redirect-origin'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { ClawdLoginFace } from '@/components/ui/clawd-login-face'
import { ForceFieldBackground } from '@/components/ui/force-field-background'
import { OAuthProviderButtons, type OAuthProvider } from '@/components/auth/oauth-provider-buttons'
import { useIsDark } from '@/lib/hooks/use-is-dark'

type LoginStatus = 'idle' | 'loading' | 'sent' | 'error'
type LoginMethod = 'password' | OAuthProvider | null

function LoginPageContent() {
  const searchParams = useSearchParams()
  const queryError = searchParams.get('error')
  const queryReason = searchParams.get('reason')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<LoginStatus>(queryError ? 'error' : 'idle')
  const [activeMethod, setActiveMethod] = useState<LoginMethod>(null)
  const [errorMessage, setErrorMessage] = useState(
    resolveLoginErrorMessage(queryError) ?? ''
  )
  const [errorDetail, setErrorDetail] = useState(
    queryError ? sanitizeLoginErrorReason(queryReason) : ''
  )

  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null)
  const [isHoveringSubmit, setIsHoveringSubmit] = useState(false)
  const isDark = useIsDark()

  const isBusy = activeMethod !== null
  const canSubmit = email.trim().length > 3 && password.length > 0 && !isBusy

  useEffect(() => {
    const payload = extractAuthCallbackPayload(window.location.href)
    if (payload.kind === 'none') return
    const nextUrl = `/callback${window.location.search}${window.location.hash}`
    window.location.replace(nextUrl)
  }, [])

  async function handleOAuthSignIn(provider: OAuthProvider) {
    setActiveMethod(provider)
    setStatus('loading')
    setErrorMessage('')
    setErrorDetail('')

    const supabase = createClient()
    if (!supabase) {
      setStatus('error')
      setErrorMessage('Supabase is not configured for this environment')
      setActiveMethod(null)
      return
    }

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

  async function handlePasswordSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail || !password || isBusy) return

    setActiveMethod('password')
    setStatus('loading')
    setErrorMessage('')
    setErrorDetail('')

    const supabase = createClient()
    if (!supabase) {
      setStatus('error')
      setErrorMessage('Supabase is not configured for this environment')
      setActiveMethod(null)
      return
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })

    if (error) {
      setStatus('error')
      setErrorMessage(
        error.message === 'Invalid login credentials'
          ? 'Invalid email or password.'
          : error.message
      )
      setActiveMethod(null)
      return
    }

    // Honour explicit ?returnTo= (e.g. /signup?tier=growth for a logged-out
    // returning user clicking a pricing tier). Defaults to /dashboard.
    window.location.replace(
      resolveSafeAuthRedirect(searchParams.get('returnTo'), window.location.origin),
    )
  }

  const oauthProvider: OAuthProvider | null =
    activeMethod === 'google' || activeMethod === 'apple' ? activeMethod : null

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center bg-background p-6 md:p-10">
      <ForceFieldBackground
        spacing={24}
        minStroke={1}
        maxStroke={2}
        forceStrength={14}
        magnifierRadius={160}
        friction={0.88}
        restoreSpeed={0.04}
        bgColor={isDark ? '#000' : '#fafafa'}
        particleRgb={isDark ? '255,255,255' : '0,0,0'}
      />
      <div className="relative z-10 w-full max-w-sm md:max-w-4xl">
        <div className="flex flex-col gap-6">
          <Card className="overflow-hidden p-0">
            <CardContent className="grid p-0 md:grid-cols-2">
              {/* ── Left: Login form ── */}
              <form className="p-6 md:p-8" onSubmit={handlePasswordSignIn}>
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <h1 className="text-2xl font-bold">Welcome back</h1>
                    <p className="text-balance text-sm text-muted-foreground">
                      Login to your BitBit account
                    </p>
                  </div>

                  {errorMessage && (
                    <div className="rounded-md bg-destructive/10 p-3 text-center text-sm text-destructive">
                      <p>{errorMessage}</p>
                      {errorDetail && (
                        <p className="mt-1 text-xs opacity-70">{errorDetail}</p>
                      )}
                    </div>
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
                    <div className="flex items-center">
                      <Label htmlFor="password">Password</Label>
                      <a
                        href="/forgot-password"
                        className="ml-auto text-sm underline-offset-4 hover:underline"
                      >
                        Forgot your password?
                      </a>
                    </div>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Enter your password"
                      autoComplete="current-password"
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
                    {activeMethod === 'password' ? <Spinner /> : 'Login'}
                  </Button>

                  <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
                    <span className="relative z-10 bg-card px-2 text-muted-foreground">
                      Or continue with
                    </span>
                  </div>

                  <OAuthProviderButtons
                    onSelect={handleOAuthSignIn}
                    disabled={isBusy}
                    activeMethod={oauthProvider}
                  />

                  <p className="text-center text-sm text-muted-foreground">
                    Don&apos;t have an account?{' '}
                    <a href="/signup" className="underline underline-offset-4 hover:text-primary">
                      Sign up
                    </a>
                  </p>
                </div>
              </form>

              {/* ── Right: Interactive BitBit face ── */}
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
            By continuing, you agree to our{' '}
            <a href="/terms" className="underline underline-offset-4 hover:text-primary">Terms of Service</a>
            {' '}and{' '}
            <a href="/privacy" className="underline underline-offset-4 hover:text-primary">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-svh items-center justify-center bg-background">
        <Spinner />
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  )
}
