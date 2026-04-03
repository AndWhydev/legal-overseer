'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { IconCamera, IconSend, IconCheck, IconLoader2, IconX } from '@tabler/icons-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FeedbackCategory = 'bug' | 'feature' | 'ux' | 'performance' | 'other'

const CATEGORIES: { id: FeedbackCategory; label: string }[] = [
  { id: 'bug', label: 'Bug Report' },
  { id: 'feature', label: 'Feature Request' },
  { id: 'ux', label: 'UX Feedback' },
  { id: 'performance', label: 'Performance' },
  { id: 'other', label: 'Other' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface FeedbackWidgetProps {
  onClose?: () => void
}

export function FeedbackWidget({ onClose }: FeedbackWidgetProps) {
  const [category, setCategory] = useState<FeedbackCategory | null>(null)
  const [message, setMessage] = useState('')
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Focus textarea on mount
  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 100)
  }, [])

  const handleCapture = useCallback(async () => {
    setCapturing(true)
    try {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) { setCapturing(false); return }

        const reader = new FileReader()
        reader.onload = () => {
          setScreenshotUrl(reader.result as string)
          setCapturing(false)
        }
        reader.onerror = () => setCapturing(false)
        reader.readAsDataURL(file)
      }
      input.click()
    } catch {
      setCapturing(false)
    }
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!category || !message.trim() || message.trim().length < 5) {
      setError('Select a category and write at least 5 characters')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const client = createClient()
      if (!client) throw new Error('Not connected')

      const { data: { session } } = await client.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const res = await fetch('/api/beta/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          category,
          message: message.trim(),
          screenshot_url: screenshotUrl,
          page_url: window.location.pathname,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Submission failed')
      }

      setSubmitted(true)
      setTimeout(() => {
        onClose?.()
        setSubmitted(false)
        setCategory(null)
        setMessage('')
        setScreenshotUrl(null)
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }, [category, message, screenshotUrl, onClose])

  return (
    <div className="flex flex-col gap-4">
      {submitted ? (
        <div className="py-8 text-center">
          <IconCheck className="mx-auto mb-3 size-8 text-sidebar-foreground/70" />
          <p className="text-base font-medium text-foreground">
            Thanks for your feedback
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            We review every submission.
          </p>
        </div>
      ) : (
        <>
          {/* Categories */}
          <div>
            <label className="mb-2 block text-xs font-medium text-muted-foreground">
              Category
            </label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <Button
                  key={c.id}
                  variant={category === c.id ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setCategory(c.id)}
                >
                  {c.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Message */}
          <div>
            <label className="mb-2 block text-xs font-medium text-muted-foreground">
              What&apos;s on your mind?
            </label>
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe the issue or suggestion..."
              className="min-h-[100px]"
              maxLength={5000}
            />
            <div className="mt-1 text-right text-xs text-muted-foreground">
              {message.length}/5000
            </div>
          </div>

          {/* Screenshot */}
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCapture}
              disabled={capturing}
            >
              <IconCamera className="size-3.5" />
              {screenshotUrl ? 'Replace Screenshot' : 'Attach Screenshot'}
            </Button>
            {screenshotUrl && (
              <div className="relative mt-2 inline-block">
                <img
                  src={screenshotUrl}
                  alt="Screenshot preview"
                  className="max-h-[120px] max-w-full rounded-lg border border-border"
                />
                <Button
                  variant="outline"
                  size="icon-xs"
                  onClick={() => setScreenshotUrl(null)}
                  className="absolute -right-1.5 -top-1.5 rounded-full"
                >
                  <IconX className="size-3" />
                </Button>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={submitting || !category || message.trim().length < 5}
            className="self-end"
          >
            {submitting ? <IconLoader2 className="size-4 animate-spin" /> : <IconSend className="size-4" />}
            {submitting ? 'Sending...' : 'Submit'}
          </Button>
        </>
      )}
    </div>
  )
}
