'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { IconBulb, IconX, IconArrowRight } from '@tabler/icons-react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DailyTip {
  id: string
  day_number: number
  title: string
  body: string
  cta_label: string | null
  cta_path: string | null
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DailyTipBannerProps {
  onNavigate?: (tabId: string) => void
}

export function DailyTipBanner({ onNavigate }: DailyTipBannerProps) {
  const [tip, setTip] = useState<DailyTip | null>(null)
  const [day, setDay] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    // Check if already dismissed today
    const dismissedKey = 'bb-daily-tip-dismissed'
    const lastDismissed = sessionStorage.getItem(dismissedKey)
    const today = new Date().toISOString().slice(0, 10)

    if (lastDismissed === today) {
      setDismissed(true)
      setLoaded(true)
      return
    }

    const fetchTip = async () => {
      try {
        const client = createClient()
        if (!client) { setLoaded(true); return }

        const { data: { session } } = await client.auth.getSession()
        if (!session) { setLoaded(true); return }

        const res = await fetch('/api/beta/daily-tip', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })

        if (res.ok) {
          const data = await res.json()
          if (data.tip) {
            setTip(data.tip)
            setDay(data.day)
          }
        }
      } catch {
        // Silent fail -- tip is non-critical
      } finally {
        setLoaded(true)
      }
    }

    fetchTip()
  }, [])

  const handleDismiss = useCallback(() => {
    setDismissed(true)
    const today = new Date().toISOString().slice(0, 10)
    sessionStorage.setItem('bb-daily-tip-dismissed', today)
  }, [])

  const handleCta = useCallback(() => {
    if (!tip?.cta_path) return

    // Extract tab ID from path like /dashboard/chat -> chat
    const tabId = tip.cta_path.replace('/dashboard/', '').replace('/', '-')

    if (onNavigate) {
      onNavigate(tabId)
    } else {
      // Dispatch custom nav event as fallback
      window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: tabId } }))
    }
  }, [tip, onNavigate])

  // Don't render if loading, dismissed, or no tip
  if (!loaded || dismissed || !tip) return null

  return (
    <Card className="relative flex items-start gap-3 px-5 py-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <IconBulb className="size-[18px] text-foreground" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {tip.title}
          </span>
          <Badge variant="secondary" className="text-[11px]">
            Day {day}
          </Badge>
        </div>

        <p className="mb-2 text-sm leading-relaxed text-muted-foreground">
          {tip.body}
        </p>

        {tip.cta_label && tip.cta_path && (
          <Button variant="outline" size="sm" onClick={handleCta}>
            {tip.cta_label}
            <IconArrowRight className="size-3.5" />
          </Button>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={handleDismiss}
        aria-label="Dismiss tip"
        className="absolute right-3 top-3"
      >
        <IconX className="size-4" />
      </Button>
    </Card>
  )
}
