'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { extractAuthCallbackPayload } from '@/lib/auth/callback'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ClawdAmbient } from '@/components/ui/clawd-ambient'

type LoginStatus = 'idle' | 'loading' | 'sent' | 'error'
type LoginMethod = 'password' | 'google' | 'apple' | null
type OAuthProvider = 'google' | 'apple'

function resolveAuthRedirectOrigin(): string {
  if (typeof window === 'undefined') return 'https://app.bitbit.chat'
  const { hostname, origin } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local')) return origin
  if (hostname === 'app.bitbit.chat') return 'https://app.bitbit.chat'
  if (hostname === 'bitbit.chat' || hostname.endsWith('.bitbit.chat')) return 'https://app.bitbit.chat'
  return origin
}


function Spinner() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="animate-spin">
      <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="2" opacity={0.15} />
      <path d="M9 2a7 7 0 0 1 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function LoginPageContent() {
  const searchParams = useSearchParams()
  const queryError = searchParams.get('error')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<LoginStatus>(queryError ? 'error' : 'idle')
  const [activeMethod, setActiveMethod] = useState<LoginMethod>(null)
  const [errorMessage, setErrorMessage] = useState(
    queryError ? "Couldn't complete sign-in. Use the email linked to your BitBit invite." : ''
  )

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

    const supabase = createClient()
    if (!supabase) {
      setStatus('error')
      setErrorMessage('Supabase is not configured for this environment')
      setActiveMethod(null)
      return
    }

    const redirectOrigin = resolveAuthRedirectOrigin()
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${redirectOrigin}/callback` },
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

    // Redirect to dashboard on success
    window.location.replace('/dashboard')
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-4xl">
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
                    <p className="rounded-md bg-destructive/10 p-3 text-center text-sm text-destructive">
                      {errorMessage}
                    </p>
                  )}

                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="m@example.com"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
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
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isBusy}
                    />
                  </div>

                  <Button type="submit" disabled={!canSubmit} className="w-full">
                    {activeMethod === 'password' ? <Spinner /> : 'Login'}
                  </Button>

                  <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
                    <span className="relative z-10 bg-card px-2 text-muted-foreground">
                      Or continue with
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Button
                      variant="outline"
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleOAuthSignIn('google')}
                    >
                      {activeMethod === 'google' ? <Spinner /> : (
                        <svg viewBox="0 0 24 24" className="mr-2 h-4 w-4">
                          <path fill="#EA4335" d="M12 10.2v3.98h5.57c-.24 1.28-.97 2.37-2.05 3.11l3.32 2.58c1.93-1.78 3.04-4.39 3.04-7.49 0-.73-.07-1.44-.2-2.13H12z" />
                          <path fill="#34A853" d="M12 22c2.7 0 4.97-.89 6.63-2.41l-3.32-2.58c-.92.62-2.1.99-3.31.99-2.54 0-4.69-1.72-5.46-4.03l-3.43 2.65A10 10 0 0012 22z" />
                          <path fill="#4A90E2" d="M6.54 13.97A5.98 5.98 0 016.2 12c0-.68.12-1.34.34-1.97L3.11 7.38A10 10 0 002 12c0 1.61.38 3.14 1.11 4.62l3.43-2.65z" />
                          <path fill="#FBBC05" d="M12 6c1.47 0 2.8.51 3.84 1.5l2.88-2.88A9.95 9.95 0 0012 2a10 10 0 00-8.89 5.38l3.43 2.65C7.31 7.72 9.46 6 12 6z" />
                        </svg>
                      )}
                      {activeMethod !== 'google' && 'Google'}
                    </Button>
                    <Button
                      variant="outline"
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleOAuthSignIn('apple')}
                    >
                      {activeMethod === 'apple' ? <Spinner /> : (
                        <svg viewBox="0 0 24 24" className="mr-2 h-4 w-4" fill="currentColor">
                          <path d="M16.36 12.48c.02 2.26 1.98 3.01 2 3.02-.01.05-.31 1.06-1.03 2.11-.62.9-1.27 1.8-2.28 1.82-1 .02-1.32-.59-2.47-.59-1.14 0-1.5.57-2.45.61-1 .04-1.75-.99-2.38-1.88-1.29-1.86-2.27-5.25-.95-7.56.66-1.14 1.84-1.86 3.12-1.88.97-.02 1.89.65 2.47.65.57 0 1.66-.8 2.8-.68.48.02 1.84.2 2.72 1.48-.07.04-1.62.95-1.6 2.9zm-2.4-5.32c.52-.63.87-1.5.77-2.37-.75.03-1.65.5-2.2 1.12-.48.56-.9 1.44-.79 2.28.84.06 1.7-.43 2.22-1.03z" />
                        </svg>
                      )}
                      {activeMethod !== 'apple' && 'Apple'}
                    </Button>
                  </div>

                  <p className="text-center text-sm text-muted-foreground">
                    Don&apos;t have an account?{' '}
                    <a href="/onboard" className="underline underline-offset-4 hover:text-primary">
                      Sign up
                    </a>
                  </p>
                </div>
              </form>

              {/* ── Right: Clawd ambient animation ── */}
              <div className="relative hidden overflow-hidden md:block">
                <ClawdAmbient className="absolute inset-0" />
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
