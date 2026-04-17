'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { logger } from '@/lib/core/logger'
import type { AuthSchemeResponse, AuthSchemeField } from '@/lib/connections/catalog-types'

interface BYOKConnectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  appKey: string
  appName: string
  /** Fired after a successful connect — parent should refetch catalog. */
  onSuccess?: () => void
}

/**
 * Generic "paste your credentials" dialog for Composio toolkits that lack
 * managed OAuth (Perplexity, Firecrawl, Tavily, etc. — ~600+ API-key
 * services plus services that want user-provided OAuth app credentials).
 *
 * Flow:
 *   1. Fetch the scheme from /api/connections/composio/scheme/[appKey]
 *   2. Render one <Input> per required+optional field
 *   3. POST filled values to /api/connections/composio/connect-byok
 *   4. Close + toast + invoke onSuccess so the parent refetches
 */
export function BYOKConnectDialog({
  open,
  onOpenChange,
  appKey,
  appName,
  onSuccess,
}: BYOKConnectDialogProps) {
  const { toast } = useToast()
  const [scheme, setScheme] = useState<AuthSchemeResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) {
      setScheme(null)
      setValues({})
      return
    }
    let cancelled = false
    setLoading(true)
    fetch(`/api/connections/composio/scheme/${encodeURIComponent(appKey)}`, {
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.json()) as AuthSchemeResponse
      })
      .then((data) => {
        if (cancelled) return
        setScheme(data)
        const init: Record<string, string> = {}
        for (const f of data.fields) init[f.name] = ''
        setValues(init)
      })
      .catch((err) => {
        if (cancelled) return
        logger.error('[byok-dialog] scheme fetch failed', {
          appKey, error: err instanceof Error ? err.message : String(err),
        })
        toast('error', `Could not load ${appName} connection form.`)
        onOpenChange(false)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [open, appKey, appName, toast, onOpenChange])

  const handleSubmit = useCallback(async () => {
    if (!scheme) return
    const missing = scheme.fields.filter((f) => f.required && !values[f.name]?.trim())
    if (missing.length > 0) {
      toast('error', `${missing[0].displayName} is required`)
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/connections/composio/connect-byok', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          appKey,
          credentials: Object.fromEntries(
            Object.entries(values).filter(([, v]) => v.trim()),
          ),
          authScheme: scheme.mode,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const msg = typeof body?.error === 'string' ? body.error : `Failed to connect ${appName}`
        toast('error', msg)
        return
      }
      toast('success', `${appName} connected`)
      onSuccess?.()
      onOpenChange(false)
    } catch (err) {
      logger.error('[byok-dialog] connect failed', {
        appKey, error: err instanceof Error ? err.message : String(err),
      })
      toast('error', `Could not connect ${appName}`)
    } finally {
      setSubmitting(false)
    }
  }, [scheme, values, appKey, appName, toast, onOpenChange, onSuccess])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect {appName}</DialogTitle>
          <DialogDescription>
            {appName} doesn&apos;t support managed OAuth. Paste your credentials below
            to connect. BitBit stores them securely via Composio.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : scheme ? (
          <div className="space-y-4 py-2">
            {scheme.fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No credentials required — click Connect to proceed.
              </p>
            ) : (
              scheme.fields.map((field: AuthSchemeField) => (
                <div key={field.name} className="space-y-1.5">
                  <Label htmlFor={`byok-${field.name}`}>
                    {field.displayName}
                    {field.required ? <span className="text-destructive"> *</span> : null}
                  </Label>
                  <Input
                    id={`byok-${field.name}`}
                    type={isSecret(field.name) ? 'password' : 'text'}
                    value={values[field.name] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                    placeholder={field.description || field.displayName}
                    disabled={submitting}
                    autoComplete="off"
                  />
                  {field.description && field.description !== field.displayName ? (
                    <p className="text-xs text-muted-foreground">{field.description}</p>
                  ) : null}
                </div>
              ))
            )}

            {scheme.authGuideUrl ? (
              <a
                href={scheme.authGuideUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-block text-xs text-primary underline-offset-2 hover:underline"
              >
                Where do I find these?
              </a>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || loading || !scheme}>
            {submitting ? 'Connecting…' : 'Connect'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Heuristic: hide values for fields whose name hints at a secret. */
function isSecret(name: string): boolean {
  const n = name.toLowerCase()
  return (
    n.includes('key') ||
    n.includes('secret') ||
    n.includes('token') ||
    n.includes('password')
  )
}
