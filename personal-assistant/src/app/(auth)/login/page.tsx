'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'magic' | 'password'>('password')
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setErrorMessage('')

    const supabase = createClient()
    if (!supabase) {
      setStatus('error')
      setErrorMessage('Supabase not configured')
      return
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/callback`,
      },
    })

    if (error) {
      setStatus('error')
      setErrorMessage(error.message)
    } else {
      setStatus('sent')
    }
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setErrorMessage('')

    const supabase = createClient()
    if (!supabase) {
      setStatus('error')
      setErrorMessage('Supabase not configured')
      return
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setStatus('error')
      setErrorMessage(error.message)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold tracking-tight">
          BitBit
        </CardTitle>
        <CardDescription>
          {mode === 'magic'
            ? 'Sign in with a magic link'
            : 'Sign in to continue'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {status === 'sent' ? (
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Check your email for a magic link to sign in.
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStatus('idle')}
            >
              Try a different email
            </Button>
          </div>
        ) : mode === 'password' ? (
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              disabled={status === 'loading'}
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={status === 'loading'}
            />
            {status === 'error' && (
              <p className="text-sm text-destructive">{errorMessage}</p>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={status === 'loading'}
            >
              {status === 'loading' ? 'Signing in…' : 'Sign in'}
            </Button>
            <div className="text-center">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => { setMode('magic'); setStatus('idle'); setErrorMessage('') }}
              >
                Use magic link instead
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleMagicLink} className="space-y-4">
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              disabled={status === 'loading'}
            />
            {status === 'error' && (
              <p className="text-sm text-destructive">{errorMessage}</p>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={status === 'loading'}
            >
              {status === 'loading' ? 'Sending…' : 'Send magic link'}
            </Button>
            <div className="text-center">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => { setMode('password'); setStatus('idle'); setErrorMessage('') }}
              >
                Use password instead
              </button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
