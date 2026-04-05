"use client"

import { Suspense, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function Spinner() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="animate-spin">
      <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="2" opacity={0.15} />
      <path d="M9 2a7 7 0 0 1 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()
  const router = useRouter()
  const redirect = searchParams.get("redirect") || "/docs/overview"
  const unauthorizedError = searchParams.get("error") === "unauthorized"

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password || loading) return
    setError("")
    setLoading(true)

    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })

      if (authError) {
        setError(
          authError.message === "Invalid login credentials"
            ? "Invalid email or password."
            : authError.message
        )
      } else {
        router.push(redirect)
        router.refresh()
      }
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const canSubmit = email.trim().length > 3 && password.length > 0 && !loading

  return (
    <div className="w-full max-w-sm">
      <div className="flex flex-col gap-6">
        <Card className="overflow-hidden p-0">
          <CardContent className="p-6 md:p-8">
            <form onSubmit={handleSubmit}>
              <div className="flex flex-col gap-6">
                <div className="flex flex-col items-center gap-2 text-center">
                  <img
                    src="/bitbit-icon-mark-light.png"
                    alt="BitBit"
                    width={40}
                    height={40}
                    className="rounded-lg"
                  />
                  <h1 className="text-2xl font-bold">BitBit Docs</h1>
                  <p className="text-balance text-sm text-muted-foreground">
                    Internal documentation. Authorized access only.
                  </p>
                </div>

                {unauthorizedError && (
                  <p className="rounded-md bg-destructive/10 p-3 text-center text-sm text-destructive">
                    Your account does not have access to this documentation.
                  </p>
                )}

                {error && (
                  <p className="rounded-md bg-destructive/10 p-3 text-center text-sm text-destructive">
                    {error}
                  </p>
                )}

                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    autoComplete="email"
                    autoFocus
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <Button type="submit" disabled={!canSubmit} className="w-full">
                  {loading ? <Spinner /> : "Sign in"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <p className="px-6 text-center text-xs text-muted-foreground">
          This portal is restricted to authorized BitBit team members.
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background p-6 md:p-10">
      <Suspense fallback={
        <div className="flex items-center justify-center">
          <Spinner />
        </div>
      }>
        <LoginForm />
      </Suspense>
    </div>
  )
}
