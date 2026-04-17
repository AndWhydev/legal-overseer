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
  onSuccess?: () => void
}

/**
 * Dialog for connecting services that need user-supplied credentials.
 *
 * Copy is intentionally minimal and intent-first — we don't mention the
 * underlying integration platform or OAuth plumbing. Each field renders as
 * a single, unlabeled input with a humanized placeholder.
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
        toast('error', `Couldn't load the connection form. Try again in a moment.`)
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
      toast('error', `${humanizeFieldName(missing[0], appName)} is required`)
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
        const msg = typeof body?.error === 'string' ? body.error : `Couldn't connect ${appName}`
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
      toast('error', `Couldn't connect ${appName}`)
    } finally {
      setSubmitting(false)
    }
  }, [scheme, values, appKey, appName, toast, onOpenChange, onSuccess])

  const hasSingleField = scheme?.fields.length === 1
  const allEmpty = scheme?.fields.every((f) => !values[f.name]?.trim()) ?? true

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base font-medium">Connect {appName}</DialogTitle>
          {hasSingleField ? null : (
            <DialogDescription className="text-sm text-muted-foreground">
              Add your credentials to continue.
            </DialogDescription>
          )}
        </DialogHeader>

        {loading ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-9 w-full" />
          </div>
        ) : scheme ? (
          <div className="space-y-4 py-1">
            {scheme.fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No credentials needed — just click Connect.
              </p>
            ) : (
              scheme.fields.map((field: AuthSchemeField) => {
                const humanName = humanizeFieldName(field, appName)
                const inputId = `byok-${field.name}`
                return (
                  <div key={field.name} className="space-y-1.5">
                    <Label htmlFor={inputId} className="sr-only">
                      {humanName}
                    </Label>
                    <Input
                      id={inputId}
                      type={isSecret(field.name) ? 'password' : 'text'}
                      value={values[field.name] ?? ''}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [field.name]: e.target.value }))
                      }
                      placeholder={humanName}
                      disabled={submitting}
                      autoComplete="off"
                      autoFocus={scheme.fields[0]?.name === field.name}
                    />
                  </div>
                )
              })
            )}

            {scheme.authGuideUrl ? (
              <a
                href={scheme.authGuideUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-block text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Where do I find this?
              </a>
            ) : null}
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || loading || !scheme || allEmpty}
          >
            {submitting ? 'Connecting…' : 'Connect'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Convert Composio's internal field identifiers (e.g. "generic_api_key",
 * "api_key", "client_secret") into a clean, human-friendly placeholder.
 * Never exposes implementation details — falls back to a tidied version
 * of the provider-supplied displayName.
 */
function humanizeFieldName(field: AuthSchemeField, appName: string): string {
  const n = field.name.toLowerCase()
  if (n === 'generic_api_key' || n === 'api_key') return `${appName} API key`
  if (n === 'bearer_token' || n === 'token') return `${appName} access token`
  if (n === 'client_id') return 'Client ID'
  if (n === 'client_secret') return 'Client secret'
  if (n === 'username') return 'Username'
  if (n === 'password') return 'Password'

  // Fall back to the displayName but strip generic trailing junk.
  const d = (field.displayName || field.name)
    .replace(/^generic[_\s]+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  return d || 'Credential'
}

/** Mask values that look like secrets. */
function isSecret(name: string): boolean {
  const n = name.toLowerCase()
  return (
    n.includes('key') ||
    n.includes('secret') ||
    n.includes('token') ||
    n.includes('password')
  )
}
