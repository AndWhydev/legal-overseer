'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { IconCheck, IconClock } from '@tabler/icons-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { logger } from '@/lib/core/logger'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NotificationPreferences {
  events: {
    new_message: boolean
    task_assigned: boolean
    task_due: boolean
    invoice_paid: boolean
    agent_action: boolean
    weekly_digest: boolean
  }
  channels: {
    email: boolean
    in_app: boolean
    push: boolean
  }
  quiet_hours: {
    enabled: boolean
    start_time: string
    end_time: string
  }
  digest_mode: 'immediate' | 'daily' | 'weekly'
}

// ─── Constants ───────────────────────────────────────────────────────────────

const EVENT_TYPES = [
  { id: 'new_message', label: 'New Messages', desc: 'Get notified about new incoming messages' },
  { id: 'task_assigned', label: 'Task Assigned', desc: 'When a task is assigned to you' },
  { id: 'task_due', label: 'Task Due Soon', desc: 'Reminders for upcoming deadlines' },
  { id: 'invoice_paid', label: 'Invoice Paid', desc: 'When invoices are marked as paid' },
  { id: 'agent_action', label: 'Agent Actions', desc: 'When agents take actions on your behalf' },
  { id: 'weekly_digest', label: 'Weekly Digest', desc: 'Summarized weekly activity report' },
] as const

const CHANNELS = [
  { id: 'email' as const, label: 'Email', desc: 'Receive notifications via email', disabled: false },
  { id: 'in_app' as const, label: 'In-App', desc: 'Receive notifications in the app', disabled: false },
  { id: 'push' as const, label: 'Push', desc: 'Receive push notifications (coming soon)', disabled: true },
]

const DIGEST_MODES = [
  { id: 'immediate', label: 'Immediate', desc: 'Get notifications right away' },
  { id: 'daily', label: 'Daily', desc: 'Receive one digest each day' },
  { id: 'weekly', label: 'Weekly', desc: 'Receive one digest each week' },
] as const

// ─── Notification Preferences Component ──────────────────────────────────────

export function NotificationPreferencesTab() {
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    events: {
      new_message: true,
      task_assigned: true,
      task_due: true,
      invoice_paid: true,
      agent_action: true,
      weekly_digest: false,
    },
    channels: {
      email: true,
      in_app: true,
      push: false,
    },
    quiet_hours: {
      enabled: false,
      start_time: '22:00',
      end_time: '08:00',
    },
    digest_mode: 'immediate',
  })

  const [isLoading, setIsLoading] = useState(true)
  const [saveIndicatorVisible, setSaveIndicatorVisible] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load preferences from API
  useEffect(() => {
    const fetchPreferences = async () => {
      try {
        setIsLoading(true)
        const res = await fetch('/api/settings/notifications')
        if (!res.ok) throw new Error('Failed to fetch preferences')
        const data = await res.json() as { preferences: NotificationPreferences }
        setPrefs(data.preferences)
      } catch (err) {
        logger.error('Failed to load notification preferences:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchPreferences()
  }, [])

  // Auto-save preferences
  const autoSave = useCallback((newPrefs: NotificationPreferences) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/settings/notifications', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newPrefs),
        })
        if (!res.ok) throw new Error('Failed to save preferences')
        setSaveIndicatorVisible(true)
        setTimeout(() => setSaveIndicatorVisible(false), 1500)
      } catch (err) {
        logger.error('Auto-save failed:', err)
      }
    }, 600)
  }, [])

  const updateEvent = (eventId: keyof typeof prefs.events, value: boolean) => {
    const newPrefs = {
      ...prefs,
      events: { ...prefs.events, [eventId]: value },
    }
    setPrefs(newPrefs)
    autoSave(newPrefs)
  }

  const updateChannel = (channelId: keyof typeof prefs.channels, value: boolean) => {
    const newPrefs = {
      ...prefs,
      channels: { ...prefs.channels, [channelId]: value },
    }
    setPrefs(newPrefs)
    autoSave(newPrefs)
  }

  const updateQuietHours = (field: keyof typeof prefs.quiet_hours, value: unknown) => {
    const newPrefs = {
      ...prefs,
      quiet_hours: { ...prefs.quiet_hours, [field]: value },
    }
    setPrefs(newPrefs)
    autoSave(newPrefs)
  }

  const updateDigestMode = (mode: typeof prefs.digest_mode) => {
    const newPrefs = { ...prefs, digest_mode: mode }
    setPrefs(newPrefs)
    autoSave(newPrefs)
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <span className="text-sm text-muted-foreground">Loading preferences...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6 overflow-auto p-6">
      {/* Save indicator */}
      {saveIndicatorVisible && (
        <div className="fixed right-6 top-20 z-50 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-500 animate-in fade-in slide-in-from-top-2">
          <IconCheck className="size-3.5" />
          Saved
        </div>
      )}

      {/* Event Types */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Event Notifications</CardTitle>
          <CardDescription>Choose which events trigger notifications</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {EVENT_TYPES.map(event => (
            <div
              key={event.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{event.label}</p>
                <p className="text-xs text-muted-foreground">{event.desc}</p>
              </div>
              <Switch
                checked={prefs.events[event.id as keyof typeof prefs.events]}
                onCheckedChange={v => updateEvent(event.id as keyof typeof prefs.events, v)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Delivery Channels */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Delivery Channels</CardTitle>
          <CardDescription>Where you want to receive notifications</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {CHANNELS.map(channel => (
            <div
              key={channel.id}
              className={`flex items-center justify-between rounded-lg border border-border bg-card p-3 ${channel.disabled ? 'opacity-50' : ''}`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{channel.label}</p>
                <p className="text-xs text-muted-foreground">{channel.desc}</p>
              </div>
              <Switch
                checked={prefs.channels[channel.id as keyof typeof prefs.channels]}
                onCheckedChange={v => updateChannel(channel.id as keyof typeof prefs.channels, v)}
                disabled={channel.disabled}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Digest Mode */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notification Batching</CardTitle>
          <CardDescription>Control how often you receive notification batches</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {DIGEST_MODES.map(mode => {
              const active = prefs.digest_mode === mode.id
              return (
                <button
                  key={mode.id}
                  onClick={() => updateDigestMode(mode.id as typeof prefs.digest_mode)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    active
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-card hover:bg-muted/50'
                  }`}
                >
                  <p className="text-sm font-medium text-foreground">{mode.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{mode.desc}</p>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Quiet Hours */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quiet Hours</CardTitle>
          <CardDescription>Pause notifications during specific times</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Enable Quiet Hours</p>
              <p className="text-xs text-muted-foreground">Notifications will be silenced during this time</p>
            </div>
            <Switch
              checked={prefs.quiet_hours.enabled}
              onCheckedChange={v => updateQuietHours('enabled', v)}
            />
          </div>

          {prefs.quiet_hours.enabled && (
            <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">From</Label>
                <Input
                  type="time"
                  value={prefs.quiet_hours.start_time}
                  onChange={e => updateQuietHours('start_time', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">To</Label>
                <Input
                  type="time"
                  value={prefs.quiet_hours.end_time}
                  onChange={e => updateQuietHours('end_time', e.target.value)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
